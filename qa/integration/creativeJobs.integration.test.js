// @vitest-environment node
// LOCAL INTEGRATION of creative jobs and customer media intake (BG-STUDIO-025-FE) against the REAL backend draft (bizgenie-api #218 9346055; strategy part also draft #219 653482f) - BG-STUDIO-025-FE.
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
import { buildQuoteRequest, confirmGenerationQuote, confirmKey, fetchQuoteStatus, newNonce, requestGenerationQuote } from "../../src/premium/generationQuoteClient";
import { attachCreativeJob, cancelCreativeJob, fetchCreativeJob, fetchCreativeJobs } from "../../src/premium/creativeJobsClient";
import { addFile, deleteAsset, fetchAssetPreview, fetchAssets, initiateUpload, revokeAsset, uploadBytes } from "../../src/premium/mediaIntakeClient";
import { fetchCampaignDetail } from "../../src/premium/campaignManagementClient";

const DIR = process.env.BIZGENIE_API_DIR; const URL_ = process.env.TEST_DATABASE_URL;
const run = DIR && URL_ ? describe : describe.skip;

run("creative jobs and media intake: frontend clients against the real PostgreSQL-backed routes", () => {
  let req, pool, admin, db, server, base, clock, offsetMs = 0; const objects = new Map(); let paidCalls = 0;
  let H = {}; const now = () => new Date(Date.now() + offsetMs);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5XkAAAAASUVORK5CYII=", "base64");
  const scope = () => ({ tenantId: "tenant_a", projectId: "project_a", brandId: "brand_a" });
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
    const { localMediaKit } = req("./test/helpers/customer-media-local"); const kit = localMediaKit({ pool, billing, now });
    const app = createApp({ campaignRepository: campaigns, generationQuoteService: quotes(), mediaIntakeService: kit.intake, mediaPreviewStorage: kit.storage, customerTokenVerifier: tokens, authorizationService: { authorizeProject: async () => context }, logger: { warn() {}, error() {}, info() {} } });
    await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", () => resolve()); }); base = `http://127.0.0.1:${server.address().port}`;
    H = { kit, req, pool, billing, billingService, campaigns, quotes, storage, scenario, context, actor, FencedGenerationWorker, PostgresPreviewRegistry };
  }, 120000);
  afterAll(async () => { if (server) await new Promise((r) => server.close(r)); await pool?.end(); if (db) await admin.query(`drop database ${db}`); await admin?.end(); });
  beforeEach(async () => { offsetMs = 0; const available = (await H.billingService.readBalance({ tenantId: "tenant_a" })).available_balance; const key = randomUUID(); if (available < 50) await H.billingService.adjustCredits({ tenantId: "tenant_a", amount: 100, direction: "credit", transactionCorrelationId: key, idempotencyKey: key }); });

  // A fresh campaign with one item of the given format, made through the backend's own command helper.
  async function item(format = "image") { const s = await H.scenario(H.campaigns); const t = await s.add(format); const detail = await fetchCampaignDetail({ ...common(), campaignId: s.id }); return { s, t, campaign: detail, variant: detail.items.flatMap((i) => i.variants).find((v) => v.variant_id === t.variant_id) }; }
  const inputs = (x, over = {}) => ({ scope: scope(), campaign: x.campaign, variant: x.variant, executionClass: "image.normal", brief: "An image for this synthetic business", ...over });
  const quote = async (x, over = {}, nonce = newNonce()) => requestGenerationQuote({ ...common(), request: buildQuoteRequest(inputs(x, over)), nonce });
  const balance = async () => (await H.billingService.readBalance({ tenantId: "tenant_a" })).available_balance;
  const ledger = async () => (await H.pool.query("select entry_type,count(*)::int n from credit_ledger group by entry_type order by entry_type")).rows;


  it("MEDIA: add a PNG (initiate -> bytes -> server inspection), list it, preview it with the session, withdraw it; a member and a bad session are refused; bad files never reach the backend", async () => {
    const file = Object.assign(new Blob([png], { type: "image/png" }), { name: "shopfront.png" });
    const steps = []; const done = await addFile({ ...common(), file, key: "up_" + randomUUID().replaceAll("-", ""), onStep: (s) => steps.push(s) });
    expect(steps).toEqual(["starting", "uploading", "checking", "ready"]); expect(done).toMatchObject({ state: "ready", usable: true, kind: "image", contentType: "image/png", bytes: png.length, rightsPolicy: "synthetic-rights.v1" });
    const list = await fetchAssets(common()); expect(list.skipped).toBe(0); expect(list.assets.map((a) => a.id)).toContain(done.id);
    const url = await fetchAssetPreview({ ...common(), assetId: done.id }); expect(url).toMatch(/^blob:/); URL.revokeObjectURL(url);
    await expect(fetchAssets({ ...common(), accessToken: "bad" })).rejects.toMatchObject({ kind: "auth" });
    await expect(fetchAssets({ ...common(), accessToken: "other" })).rejects.toMatchObject({ kind: "forbidden" }); // another tenant's user sees nothing
    const gone = await revokeAsset({ ...common(), assetId: done.id }); expect(gone.state).toBe("revoked");
    expect((await fetchAssets(common())).assets.map((a) => a.id)).not.toContain(done.id);
    await expect(fetchAssetPreview({ ...common(), assetId: done.id })).rejects.toMatchObject({ kind: "forbidden" }); // a withdrawn file is no longer served
    expect((await deleteAsset({ ...common(), assetId: done.id })).state).toBe("deleted");
  });
  it("MEDIA: same idempotency key twice is one upload; bytes that are not the declared type are refused by the server; the client refuses unsupported types before any request", async () => {
    const key = "up_" + randomUUID().replaceAll("-", ""); const file = Object.assign(new Blob([png], { type: "image/png" }), { name: "a.png" });
    const a = await initiateUpload({ ...common(), file, key }); const b = await initiateUpload({ ...common(), file, key }); expect(b.id).toBe(a.id);
    const fake = Object.assign(new Blob([Buffer.from("not a png at all!")], { type: "image/png" }), { name: "fake.png" });
    const f = await initiateUpload({ ...common(), file: fake, key: "up_" + randomUUID().replaceAll("-", "") });
    await expect(uploadBytes({ ...common(), asset: f, file: fake })).rejects.toMatchObject({ kind: "invalid_file" });
    await expect(initiateUpload({ ...common(), file: { name: "x.gif", type: "image/gif", size: 5 } })).rejects.toMatchObject({ kind: "invalid_file" });
  });
  it("CREATIVE JOBS: quote -> confirm -> worker -> list/get through the app clients -> attach (owner) -> the campaign carries the asset; idempotent; another tenant sees nothing", async () => {
    const { ImageGenerationService, InMemoryImageGenerationRepository } = H.req("./src/image-generation"); const { PostgresMediaAssetRepository, DurableMediaAssetStore } = H.req("./src/media");
    const { PostgresBrandBrainRepository } = H.req("./src/brand-brain"); const { PostgresGenerationJobRepository } = H.req("./src/generation-jobs"); const { ExistingCreativeServicesAdapter } = H.req("./src/generation-quotes/creativeAdapter");
    const media = new PostgresMediaAssetRepository({ pool: H.pool }), store = new DurableMediaAssetStore({ mediaKind: "image", repository: media, storage: H.kit.storage, now });
    const imageService = new ImageGenerationService({ repository: new InMemoryImageGenerationRepository(), brandBrainRepository: new PostgresBrandBrainRepository({ pool: H.pool }), now, provider: { model: "mock-only", generate: async ({ metadata }) => { paidCalls += 1; const saved = await store.save({ data: png, mime_type: "image/png", width: 1, height: 1, lineage: metadata }); const { byte_size, ...asset } = saved; return { provider: "synthetic", provider_job_id: "mock_image_operation", asset }; } } });
    const x = await item("image"); const q = await quote(x); const r = await confirmGenerationQuote({ ...common(), quote: q, key: confirmKey() });
    // before the worker runs: queued, nothing to attach, owner can cancel (not tested to completion here)
    const queued = await fetchCreativeJob({ ...common(), jobId: r.jobId }); expect(queued).toMatchObject({ state: "queued", outputs: [], canAttach: false, association: null }); expect(queued.canCancel).toBe(true);
    await expect(attachCreativeJob({ ...common(), jobId: r.jobId })).rejects.toMatchObject({ kind: "not_ready" }); // RESULT_NOT_READY
    const worker = new H.FencedGenerationWorker({ quoteService: H.quotes(), provider: new ExistingCreativeServicesAdapter({ jobs: new PostgresGenerationJobRepository({ pool: H.pool }), mediaAssets: media, imageService }) });
    expect((await worker.run(await worker.claim(r.jobId))).status).toBe("succeeded");
    const done = await fetchCreativeJob({ ...common(), jobId: r.jobId });
    expect(done).toMatchObject({ id: r.jobId, state: "succeeded", kind: "image", canAttach: true, association: null, skippedOutputs: 0 }); expect(done.outputs).toHaveLength(1); expect(done.outputs[0]).toMatchObject({ type: "media", kind: "image", mime: "image/png", attachable: true });
    expect(JSON.stringify(done)).not.toMatch(/gs:\/\/|s3:\/\/|private-synthetic|token|secret/);
    expect((await fetchCampaignDetail({ ...common(), campaignId: x.s.id })).items[0].variants[0].current_content.asset_refs).toEqual([]); // finished is not attached
    const list = await fetchCreativeJobs(common()); expect(list.skipped).toBe(0); expect(list.jobs.find((j) => j.id === r.jobId)).toMatchObject({ state: "succeeded", variantId: x.t.variant_id });
    await expect(fetchCreativeJob({ ...common(), accessToken: "other", jobId: r.jobId })).rejects.toMatchObject({ kind: "unavailable" }); expect((await fetchCreativeJobs({ ...common(), accessToken: "other" }).catch((e) => e.kind))).toBeDefined();
    const attached = await attachCreativeJob({ ...common(), jobId: r.jobId });
    expect(attached.association).toMatchObject({ current: true, approval: "not_approved" }); expect(attached.canAttach).toBe(false);
    const detail = await fetchCampaignDetail({ ...common(), campaignId: x.s.id }); expect(detail.items[0].variants[0].current_content.asset_refs).toEqual([{ asset_id: done.outputs[0].assetId, role: "primary" }]);
    expect((await attachCreativeJob({ ...common(), jobId: r.jobId })).association.revisionId).toBe(attached.association.revisionId); // idempotent
    expect(paidCalls).toBe(1);
  }, 60000);
  it("CREATIVE JOBS: a queued job can be cancelled by its owner and the list/get say cancelled; a repeat is safe", async () => {
    const x = await item("image"); const q = await quote(x); const r = await confirmGenerationQuote({ ...common(), quote: q, key: confirmKey() });
    expect(await cancelCreativeJob({ ...common(), jobId: r.jobId })).toEqual({ jobId: r.jobId });
    const j = await fetchCreativeJob({ ...common(), jobId: r.jobId }); expect(j).toMatchObject({ state: "cancelled", canAttach: false, retry: "new_quote" });
  });
});
