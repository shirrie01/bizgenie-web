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
import { addContentItem, fetchCampaignDetail } from "../../src/premium/campaignManagementClient";

const DIR = process.env.BIZGENIE_API_DIR; const URL_ = process.env.TEST_DATABASE_URL;
const run = DIR && URL_ ? describe : describe.skip;

run("launch destinations: which platform x format pairs can be priced, previewed and approved on the real backend", () => {
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


  // The matrix below is what the backend ACTUALLY does today for the four mandatory launch platforms x text/image/video (feed placement). It is a measurement, not a wish:
  // a pair is "previewable" only if an ACTIVE preview profile exists for platform + placement + format; without one the quote is refused (PREVIEW_VERSION_UNAVAILABLE) so the
  // item can never be reviewed, approved, scheduled or published.
  const PLATFORMS = ["instagram", "facebook", "linkedin", "tiktok"], FORMATS = ["text", "image", "video"];
  it("MATRIX: previewable platform x format pairs (feed) match the active preview profiles; every other mandatory pair is refused before any credit is reserved", async () => {
    const s = await H.scenario(H.campaigns); const out = {};
    for (const platform of PLATFORMS) for (const format of FORMATS) {
      const base0 = await fetchCampaignDetail({ ...common(), campaignId: s.id });
      const updated = await addContentItem({ ...common(), campaign: base0, name: `${platform} ${format}`, format, platform, placement: "feed", destinationLabel: `${platform} account` }).catch((e) => ({ error: e.code || e.kind }));
      if (updated.error) { out[`${platform}.${format}`] = "add:" + updated.error; continue; }
      const detail = await fetchCampaignDetail({ ...common(), campaignId: s.id }); const item = detail.items.find((i) => i.name === `${platform} ${format}`); const v = item.variants[0];
      const cls = format === "text" ? "text.standard" : format === "image" ? "image.normal" : "video.normal";
      let code = "quoted"; try { await requestGenerationQuote({ ...common(), request: buildQuoteRequest({ scope: scope(), campaign: detail, variant: v, executionClass: cls, brief: "A synthetic brief" }), nonce: newNonce() }); } catch (e) { code = e.code || e.kind || "refused"; }
      out[`${platform}.${format}`] = code;
    }
    console.log("PREVIEWABLE_MATRIX " + JSON.stringify(out));
    const ok = Object.entries(out).filter(([, c]) => c === "quoted").map(([k]) => k).sort();
    expect(ok).toEqual(["facebook.text", "instagram.image", "instagram.text", "linkedin.text", "tiktok.video"]); // today's truth: everything else is a gap to close before launch
  }, 60000);
});
