// @vitest-environment node
// LOCAL INTEGRATION of the durable quote/confirm flow against the REAL backend draft (bizgenie-api PR #217, head 23f4903) - BG-STUDIO-021-FE.
// The backend's own Express routers and PostgreSQL services run in this process against a DISPOSABLE local PostgreSQL database that is created and dropped
// here; the identity layer is the backend's test fixture, the providers and storage are the backend's mocks. This proves request/response compatibility and
// the reliability rules (idempotency, expiry, changed intent, cancellation, fencing, private delivery). It is NOT staging: no Supabase, Stripe, provider or
// deployed service, and no money moves.
// Skipped unless both are set:
//   BIZGENIE_API_DIR=/path/to/bizgenie-api (with node_modules)   TEST_DATABASE_URL=postgres://user:pass@127.0.0.1:5432/postgres (a superuser on a throwaway server)
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildQuoteRequest, cancelGenerationQuote, confirmGenerationQuote, confirmKey, fetchQuoteStatus, newNonce, requestGenerationQuote } from "../../src/premium/generationQuoteClient";
import { addContentItem, fetchCampaignDetail, renameCampaign } from "../../src/premium/campaignManagementClient";

const DIR = process.env.BIZGENIE_API_DIR; const URL_ = process.env.TEST_DATABASE_URL;
const run = DIR && URL_ ? describe : describe.skip;

run("quote -> confirm -> status -> private delivery, frontend clients against the real PostgreSQL-backed routes", () => {
  let req, pool, admin, db, server, base, clock, offsetMs = 0; const objects = new Map(); let paidCalls = 0;
  let H = {}; const now = () => new Date(Date.now() + offsetMs);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5XkAAAAASUVORK5CYII=", "base64");
  const scope = () => ({ tenantId: "tenant_a", projectId: "project_a" });
  const common = () => ({ apiBaseUrl: base, accessToken: "ok", scope: scope() });

  beforeAll(async () => {
    req = createRequire(path.join(DIR, "index.js"));
    const { Pool } = req("pg"); const { createApp } = req("./index");
    const { PostgresBillingRepository, BillingService } = req("./src/billing");
    const { PostgresGenerationQuoteService } = req("./src/generation-quotes/service"); const { FencedGenerationWorker } = req("./src/generation-quotes/worker");
    const { PostgresCampaignRepository, PostgresPreviewRegistry } = req("./src/campaigns");
    const { scenario, previewReceipt, context } = req("./test/helpers/campaign-regressions");
    const { AuthenticationRequiredError } = req("./src/authorization");
    const actor = context.actor;
    admin = new Pool({ connectionString: URL_ });
    const c = await admin.connect();
    try { await c.query("select pg_advisory_lock(734921)"); await c.query("do $$ begin if not exists(select 1 from pg_roles where rolname='anon')then create role anon nologin;end if;if not exists(select 1 from pg_roles where rolname='authenticated')then create role authenticated nologin;end if;if not exists(select 1 from pg_roles where rolname='service_role')then create role service_role nologin;end if;end $$"); } finally { await c.query("select pg_advisory_unlock(734921)"); c.release(); }
    db = "fe_quote_proof_" + randomUUID().replaceAll("-", ""); await admin.query(`create database ${db}`);
    const local = new URL(URL_); local.pathname = "/" + db; pool = new Pool({ connectionString: local.toString(), max: 12 });
    await pool.query("create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable set search_path='' as 'select null::uuid'");
    const mig = path.join(DIR, "supabase/migrations"); for (const f of fs.readdirSync(mig).filter((x) => x.endsWith(".sql")).sort()) await pool.query(fs.readFileSync(path.join(mig, f), "utf8"));
    await pool.query("insert into auth.users values($1)", [actor.auth_user_id]); await pool.query("insert into customer_profiles(auth_user_id) values($1)", [actor.auth_user_id]);
    await pool.query("insert into tenants(tenant_id,name,created_by) values('tenant_a','Synthetic',$1)", [actor.auth_user_id]); await pool.query("insert into tenant_memberships(tenant_id,auth_user_id,role) values('tenant_a',$1,'owner')", [actor.auth_user_id]);
    await pool.query("insert into projects(project_id,tenant_id,name) values('project_a','tenant_a','Synthetic')"); await pool.query("insert into brand_brains(brand_id,project_id,name,version,status,created_at,updated_at) values('brand_a','project_a','Synthetic',1,'approved',now(),now())");
    await pool.query("insert into commercial_policies(policy_id,plan_code,policy_version,status,included_monthly_credits,bolt_on_eligible,effective_from)values('synthetic_policy','standard',999,'draft',100,true,'2026-01-01')");
    await pool.query("insert into commercial_execution_prices(policy_id,execution_class,credit_cost)values('synthetic_policy','text.standard',2),('synthetic_policy','image.normal',2),('synthetic_policy','video.normal',6),('synthetic_policy','video.premium',9)");
    await pool.query("update commercial_policies set status='active' where policy_id='synthetic_policy'");
    await pool.query("insert into tenant_entitlements(entitlement_id,tenant_id,policy_id,plan_code,status,starts_at,reference_period_start,reference_period_end,included_monthly_credit_grant)values('synthetic_entitlement','tenant_a','synthetic_policy','standard','active','2026-01-01','2026-10-01','2027-12-01',100)");
    await pool.query("insert into credit_accounts(account_id,tenant_id)values('synthetic_account','tenant_a')");
    const billing = new PostgresBillingRepository({ pool, now }); const billingService = new BillingService({ repository: billing, now });
    const campaigns = new PostgresCampaignRepository({ pool, now, resolvePreviewReceipt: previewReceipt, validatePreview: async () => true });
    const profiles = { "image.normal": { id: "synthetic.image", version: 1, provider_model: "mock-only", aspect_ratio: "1:1" }, "text.standard": { id: "synthetic.text", version: 1, provider_model: "mock-only" }, "video.normal": { id: "synthetic.video", version: 1, provider_model: "mock-only", aspect_ratio: "9:16", duration_seconds: 4 } };
    const quotes = (o = {}) => new PostgresGenerationQuoteService({ billingRepository: billing, profiles, now, ...o });
    const storage = { bucket: "private-synthetic-test", putObject: async ({ key, data }) => { objects.set(key, Buffer.from(data)); return { byteSize: data.length }; }, delete: async () => {}, statPreview: async ({ key }) => ({ size: objects.get(key).length, mimeType: "image/png", generation: "123" }), openPreview: async ({ key }) => new Response(objects.get(key), { headers: { "content-type": "image/png", "content-length": String(objects.get(key).length) } }) };
    const tokens = { verifyAccessToken: async (t) => { if (t === "ok") return actor; if (t === "other") return { kind: "customer", auth_user_id: "99999999-9999-4999-8999-999999999999" }; throw new AuthenticationRequiredError(); } };
    const app = createApp({ campaignRepository: campaigns, generationQuoteService: quotes(), mediaPreviewStorage: storage, customerTokenVerifier: tokens, authorizationService: { authorizeProject: async () => context }, logger: { warn() {}, error() {}, info() {} } });
    await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", () => resolve()); }); base = `http://127.0.0.1:${server.address().port}`;
    H = { req, pool, billing, billingService, campaigns, quotes, storage, scenario, context, actor, FencedGenerationWorker, PostgresPreviewRegistry };
  }, 120000);
  afterAll(async () => { if (server) await new Promise((r) => server.close(r)); await pool?.end(); if (db) await admin.query(`drop database ${db}`); await admin?.end(); });
  beforeEach(async () => { offsetMs = 0; const available = (await H.billingService.readBalance({ tenantId: "tenant_a" })).available_balance; const key = randomUUID(); if (available < 50) await H.billingService.adjustCredits({ tenantId: "tenant_a", amount: 100, direction: "credit", transactionCorrelationId: key, idempotencyKey: key }); });

  // A fresh campaign with one item of the given format, made through the backend's own command helper.
  async function item(format = "image") { const s = await H.scenario(H.campaigns); const t = await s.add(format); const detail = await fetchCampaignDetail({ ...common(), campaignId: s.id }); return { s, t, campaign: detail, variant: detail.items.flatMap((i) => i.variants).find((v) => v.variant_id === t.variant_id) }; }
  const inputs = (x, over = {}) => ({ scope: scope(), campaign: x.campaign, variant: x.variant, executionClass: "image.normal", brief: "An image for this synthetic business", ...over });
  const quote = async (x, over = {}, nonce = newNonce()) => requestGenerationQuote({ ...common(), request: buildQuoteRequest(inputs(x, over)), nonce });
  const balance = async () => (await H.billingService.readBalance({ tenantId: "tenant_a" })).available_balance;
  const ledger = async () => (await H.pool.query("select entry_type,count(*)::int n from credit_ledger group by entry_type order by entry_type")).rows;

  it("a quote is read-only: the real route prices the image, reserves nothing and calls no provider; replay returns the same quote", async () => {
    const x = await item(); const before = await ledger(); const nonce = newNonce();
    const q = await quote(x, {}, nonce);
    expect(q).toMatchObject({ binding: true, executionClass: "image.normal", credits: 2, authorisedCredits: 2, sufficient: true, state: "quoted", expired: false });
    expect(q.availableCredits).toBeGreaterThanOrEqual(2); expect(await ledger()).toEqual(before);
    expect((await quote(x, {}, nonce)).quoteId).toBe(q.quoteId); // same request + same nonce = the same quote (a safe network retry)
    expect((await quote(x, {}, newNonce())).quoteId).not.toBe(q.quoteId); // a fresh nonce is a fresh quote
  });
  it("the same key with a different request is refused by the real route - which is why the app derives the key from the whole request", async () => {
    const x = await item(); const nonce = newNonce(); const q1 = buildQuoteRequest(inputs(x)); const q2 = buildQuoteRequest(inputs(x, { brief: "A different brief" }));
    const key = "fixed-key-for-this-test";
    const post = (body) => fetch(`${base}/customer/generation-quotes`, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer ok" }, body: JSON.stringify(body) });
    expect((await post({ ...q1, idempotency_key: key })).status).toBe(201);
    const clash = await post({ ...q2, idempotency_key: key }); expect(clash.status).toBe(409); expect((await clash.json()).error.code).toBe("IDEMPOTENCY_KEY_CONFLICT");
    await expect(quote(x, { brief: "A different brief" }, nonce)).resolves.toMatchObject({ binding: true }); // the app's own derivation never collides
  });
  it("confirmation reserves credits and queues a job - it does not generate: one reservation, no debit, replay returns the same job", async () => {
    const x = await item(); const q = await quote(x); const before = await balance(); const key = confirmKey();
    const r = await confirmGenerationQuote({ ...common(), quote: q, key });
    expect(r).toMatchObject({ quoteId: q.quoteId, reservedCredits: 2, status: "queued", replay: false }); expect(r.jobId).toMatch(/^quoted:/);
    expect(await balance()).toBe(before - 2); // set aside, not yet spent
    const st = await fetchQuoteStatus({ ...common(), quoteId: q.quoteId }); expect(st).toMatchObject({ jobId: r.jobId, state: "queued", reservedCredits: 2, reservation: "held" });
    const again = await confirmGenerationQuote({ ...common(), quote: q, key }); expect(again).toMatchObject({ jobId: r.jobId, replay: true }); expect(await balance()).toBe(before - 2); // a lost-response retry is free
    await expect(confirmGenerationQuote({ ...common(), quote: q, key: confirmKey() })).rejects.toMatchObject({ kind: "key_conflict" }); // a NEW key on a confirmed quote is refused
    expect((await ledger()).filter((e) => e.entry_type === "debit")).toEqual([]);
  });
  it("cancelling a queued job releases the reservation exactly once; a repeated confirmation then reports cancelled", async () => {
    const x = await item(); const q = await quote(x); const start = await balance(); const key = confirmKey();
    await confirmGenerationQuote({ ...common(), quote: q, key }); expect(await balance()).toBe(start - 2);
    expect(await cancelGenerationQuote({ ...common(), quoteId: q.quoteId })).toEqual({ quoteId: q.quoteId, charged: false });
    expect(await balance()).toBe(start); expect(await cancelGenerationQuote({ ...common(), quoteId: q.quoteId })).toEqual({ quoteId: q.quoteId, charged: false }); expect(await balance()).toBe(start);
    expect((await fetchQuoteStatus({ ...common(), quoteId: q.quoteId })).state).toBe("cancelled");
    expect(await confirmGenerationQuote({ ...common(), quote: q, key })).toMatchObject({ status: "cancelled" });
  });
  it("an expired quote cannot be confirmed (QUOTE_EXPIRED) and nothing is reserved", async () => {
    const x = await item(); const q = await quote(x); const before = await balance(); offsetMs = 61000;
    await expect(confirmGenerationQuote({ ...common(), quote: q, key: confirmKey() })).rejects.toMatchObject({ kind: "expired" }); expect(await balance()).toBe(before);
  });
  it("a campaign that moved on (version conflict) cannot be confirmed against the old price", async () => {
    const x = await item(); const q = await quote(x);
    await renameCampaign({ ...common(), campaign: x.campaign, name: "Renamed after the price was shown" });
    await expect(confirmGenerationQuote({ ...common(), quote: q, key: confirmKey() })).rejects.toMatchObject({ kind: expect.stringMatching(/conflict|changed/) });
  });
  it("insufficient credits: the quote says so, the app refuses to confirm, and the real route would too", async () => {
    const x = await item(); const available = await balance(); const key = randomUUID();
    await H.billingService.adjustCredits({ tenantId: "tenant_a", amount: available - 1, direction: "debit", transactionCorrelationId: key, idempotencyKey: key });
    const q = await quote(x); expect(q).toMatchObject({ sufficient: false, availableCredits: 1 });
    await expect(confirmGenerationQuote({ ...common(), quote: q, key: confirmKey() })).rejects.toMatchObject({ kind: "invalid" });
    const raw = await fetch(`${base}/customer/generation-quotes/${q.quoteId}/confirm`, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer ok" }, body: JSON.stringify({ idempotency_key: confirmKey(), max_credits: 2, confirmed: true }) });
    expect(raw.status).toBe(402);
  });
  it("another member's quote is not found; a bad token is an ended session", async () => {
    const x = await item(); const q = await quote(x);
    await expect(fetchQuoteStatus({ ...common(), accessToken: "other", quoteId: q.quoteId })).rejects.toMatchObject({ kind: "unavailable" });
    await expect(fetchQuoteStatus({ ...common(), accessToken: "bad", quoteId: q.quoteId })).rejects.toMatchObject({ kind: "auth" });
  });
  it("a text item cannot be priced as an image, an image needs a brief, and an unprovisioned video destination cannot be sold", async () => {
    const text = await item("text"); await expect(quote(text)).rejects.toMatchObject({ kind: "unsupported" });
    const img = await item("image"); await expect(requestGenerationQuote({ ...common(), request: { ...buildQuoteRequest(inputs(img)), execution_brief: undefined }, nonce: newNonce() })).rejects.toMatchObject({ kind: "invalid" });
    const vid = await item("video"); await expect(quote(vid, { executionClass: "video.normal" })).rejects.toMatchObject({ kind: "unsupported" });
  });
  it("the app can add an image item through the real content-items route, and it can be priced straight away", async () => {
    const x = await item("text"); const updated = await addContentItem({ ...common(), campaign: x.campaign, name: "Added by the app", format: "image", platform: "instagram", placement: "feed", destinationLabel: "Brand page" });
    const added = updated.items.find((i) => i.name === "Added by the app"); expect(added.format).toBe("image");
    const q = await requestGenerationQuote({ ...common(), request: buildQuoteRequest({ scope: scope(), campaign: updated, variant: added.variants[0], executionClass: "image.normal", brief: "An image for the added item" }), nonce: newNonce() });
    expect(q.credits).toBe(2);
  });

  it("video: a TikTok-feed video item (which has an approved preview profile) can be priced as video.normal, confirmed and cancelled; premium has no server profile and says so", async () => {
    const x = await item("text"); const updated = await addContentItem({ ...common(), campaign: x.campaign, name: "Reveal video", format: "video", platform: "tiktok", placement: "feed", destinationLabel: "Brand account" });
    const added = updated.items.find((i) => i.name === "Reveal video"); const variant = added.variants[0];
    const q = await requestGenerationQuote({ ...common(), request: buildQuoteRequest({ scope: scope(), campaign: updated, variant, executionClass: "video.normal", brief: "A short reveal" }), nonce: newNonce() });
    expect(q).toMatchObject({ executionClass: "video.normal", credits: 6, sufficient: true });
    const start = await balance(); const r = await confirmGenerationQuote({ ...common(), quote: q, key: confirmKey() }); expect(r.status).toBe("queued"); expect(await balance()).toBe(start - 6);
    await cancelGenerationQuote({ ...common(), quoteId: q.quoteId }); expect(await balance()).toBe(start);
    await expect(requestGenerationQuote({ ...common(), request: buildQuoteRequest({ scope: scope(), campaign: updated, variant, executionClass: "video.premium", brief: "A short reveal" }), nonce: newNonce() })).rejects.toMatchObject({ kind: "unsupported" });
  });
  it("an Instagram-feed video item is refused at the price step because that destination has no approved preview, and nothing is charged", async () => {
    const x = await item("text"); const updated = await addContentItem({ ...common(), campaign: x.campaign, name: "IG video", format: "video", platform: "instagram", placement: "feed", destinationLabel: "Brand page" });
    const variant = updated.items.find((i) => i.name === "IG video").variants[0]; const before = await ledger();
    await expect(requestGenerationQuote({ ...common(), request: buildQuoteRequest({ scope: scope(), campaign: updated, variant, executionClass: "video.normal", brief: "x" }), nonce: newNonce() })).rejects.toMatchObject({ kind: "unsupported", message: expect.stringMatching(/cannot be previewed or approved yet/) }); expect(await ledger()).toEqual(before);
  });
  it("FULL LOCAL LIFECYCLE (mock provider): quote -> confirm -> worker -> Finished -> attach -> approval -> authenticated private delivery -> revocation", async () => {
    const { ImageGenerationService, InMemoryImageGenerationRepository } = req("./src/image-generation"); const { PostgresMediaAssetRepository, DurableMediaAssetStore } = req("./src/media");
    const { PostgresBrandBrainRepository } = req("./src/brand-brain"); const { PostgresGenerationJobRepository } = req("./src/generation-jobs"); const { ExistingCreativeServicesAdapter } = req("./src/generation-quotes/creativeAdapter");
    const media = new PostgresMediaAssetRepository({ pool: H.pool }), store = new DurableMediaAssetStore({ mediaKind: "image", repository: media, storage: H.storage, now });
    const imageService = new ImageGenerationService({ repository: new InMemoryImageGenerationRepository(), brandBrainRepository: new PostgresBrandBrainRepository({ pool: H.pool }), now, provider: { model: "mock-only", generate: async ({ metadata }) => { paidCalls += 1; const saved = await store.save({ data: png, mime_type: "image/png", width: 1, height: 1, lineage: metadata }); const { byte_size, ...asset } = saved; return { provider: "synthetic", provider_job_id: "mock_image_operation", asset }; } } });
    const x = await item("image"); const before = await balance();
    const q = await quote(x); const key = confirmKey(); const r = await confirmGenerationQuote({ ...common(), quote: q, key });
    // The worker is the backend's, run here by hand (no worker dispatch exists in the product yet).
    const worker = new H.FencedGenerationWorker({ quoteService: H.quotes(), provider: new ExistingCreativeServicesAdapter({ jobs: new PostgresGenerationJobRepository({ pool: H.pool }), mediaAssets: media, imageService }) });
    const claim = await worker.claim(r.jobId); expect((await fetchQuoteStatus({ ...common(), quoteId: q.quoteId })).state).toBe("claimed");
    expect((await worker.run(claim)).status).toBe("succeeded"); expect(paidCalls).toBe(1);
    const done = await fetchQuoteStatus({ ...common(), quoteId: q.quoteId }); expect(done).toMatchObject({ state: "succeeded", reservedCredits: 0, reservation: "settled" }); expect(JSON.stringify(done)).not.toMatch(/gs:\/\/|s3:\/\/|private-synthetic-test/);
    expect(await balance()).toBe(before - 2); // spent exactly the quoted price, once
    // Finished is not approved: the campaign does not carry the result until the (not yet built) attach step; here the backend helper does it.
    const outcome = (await H.pool.query("select result from generation_execution_claims where job_id=$1", [r.jobId])).rows[0].result; const assetId = outcome.result.asset_id;
    expect(outcome.result.provenance.origin).toBe("ai_generated");
    expect((await fetchCampaignDetail({ ...common(), campaignId: x.s.id })).items[0].variants[0].current_content.asset_refs).toEqual([]);
    const revision = await x.s.cmd("save_revision", { variant_id: x.t.variant_id, content: { title: null, body: "Customer-approved copy", caption: null, alt_text: "Synthetic test image", asset_refs: [{ asset_id: assetId, role: "primary" }] }, change_reason: "Attach quoted private creative" });
    const revisionId = revision.created_ids.revision_ids[0]; await x.s.cmd("submit_review", { variant_id: x.t.variant_id, revision_id: revisionId });
    const registry = new H.PostgresPreviewRegistry({ pool: H.pool, now }); H.campaigns.resolvePreviewReceipt = registry.resolvePreviewReceipt.bind(registry); H.campaigns.validatePreview = registry.validatePreview.bind(registry);
    const rendered = await registry.renderPreview(H.context, await x.s.get(), { variant_id: x.t.variant_id, revision_id: revisionId, idempotency_key: randomUUID() });
    const ack = await x.s.cmd("acknowledge_preview", { variant_id: x.t.variant_id, revision_id: revisionId, render_receipt_id: rendered.render_receipt_id, acknowledged: true });
    await x.s.cmd("approve", { variant_id: x.t.variant_id, revision_id: revisionId, preview_id: ack.created_ids.preview_ids[0], approved: true });
    const detail = await fetchCampaignDetail({ ...common(), campaignId: x.s.id }); const v = detail.items[0].variants[0];
    expect(v.workflow).toBe("approved"); expect(v.current_content.asset_refs).toEqual([{ asset_id: assetId, role: "primary" }]);
    // Authenticated delivery with the app's own media client; the URL carries no token and no storage address.
    vi.stubEnv("VITE_SUPABASE_URL", "http://supabase.test"); vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "placeholder");
    const { fetchMediaPreview, mediaPreviewUrl } = await import("../../src/mediaPreviewClient");
    const session = { accessToken: "ok", tenantId: "tenant_a", projectId: "project_a" };
    const url = mediaPreviewUrl({ apiBaseUrl: base, session, campaign: detail, variant: v, assetId }); expect(url).not.toMatch(/ok|gs:|s3:|private-synthetic/);
    const shown = await fetchMediaPreview({ apiBaseUrl: base, session, campaign: detail, variant: v, media: { id: assetId, kind: "image" } });
    expect(shown.mime).toBe("image/png"); expect(Buffer.from(await shown.blob.arrayBuffer())).toEqual(png);
    await expect(fetchMediaPreview({ apiBaseUrl: base, session: { ...session, accessToken: "bad" }, campaign: detail, variant: v, media: { id: assetId, kind: "image" } })).rejects.toMatchObject({ code: expect.stringMatching(/auth|missing/) });
    await H.pool.query("update media_assets set status='revoked' where asset_id=$1", [assetId]);
    await expect(fetchMediaPreview({ apiBaseUrl: base, session, campaign: detail, variant: v, media: { id: assetId, kind: "image" } })).rejects.toMatchObject({ code: "missing" }); // revoked = gone, before any storage read
    expect(paidCalls).toBe(1);
  }, 60000);

  it("a pre-call cancellation fences the worker: the provider is never called and the reservation is released once", async () => {
    const x = await item("image"); const q = await quote(x); const r = await confirmGenerationQuote({ ...common(), quote: q, key: confirmKey() }); const start = await balance();
    let calls = 0; const worker = new H.FencedGenerationWorker({ quoteService: H.quotes(), provider: { submit: async () => { calls += 1; } } }); const claim = await worker.claim(r.jobId);
    await cancelGenerationQuote({ ...common(), quoteId: q.quoteId }); await expect(worker.run(claim)).rejects.toMatchObject({ code: "EXECUTION_FENCE_STALE" });
    expect(calls).toBe(0); expect(await balance()).toBe(start + 2);
  });
  it("an uncertain provider outcome leaves the job in recovery with the reservation held, and the app shows it as 'being checked', never as failed or finished", async () => {
    const x = await item("image"); const q = await quote(x); const r = await confirmGenerationQuote({ ...common(), quote: q, key: confirmKey() });
    const worker = new H.FencedGenerationWorker({ quoteService: H.quotes(), provider: { submit: async () => { throw new Error("provider timeout"); } } }); const claim = await worker.claim(r.jobId);
    await expect(worker.run(claim)).rejects.toBeTruthy();
    const st = await fetchQuoteStatus({ ...common(), quoteId: q.quoteId }); expect(st).toMatchObject({ state: "recovery_required", reservation: "held" });
    await expect(cancelGenerationQuote({ ...common(), quoteId: q.quoteId })).rejects.toMatchObject({ kind: "started" }); // uncertain work is never cancelled or released by guesswork
  });
  // Last on purpose: retiring the pricing policy is irreversible for this throwaway database (prices are immutable by design).
  it("a retired pricing policy cannot be confirmed (QUOTE_CHANGED): nothing is reserved", async () => {
    const x = await item(); const q = await quote(x); const before = await balance();
    await H.pool.query("update commercial_policies set status='retired' where policy_id='synthetic_policy'");
    await expect(confirmGenerationQuote({ ...common(), quote: q, key: confirmKey() })).rejects.toMatchObject({ kind: "changed" }); expect(await balance()).toBe(before);
  });
});
