// @vitest-environment node
// LOCAL INTEGRATION of creative jobs and customer media intake (BG-STUDIO-025-FE) against the REAL backend draft (bizgenie-api #218 9346055; strategy part also draft #219 653482f) - BG-STUDIO-025-FE.
// The backend's own Express routers and PostgreSQL services run in this process against a DISPOSABLE local PostgreSQL database that is created and dropped
// here; the identity layer is the backend's test fixture, the providers and storage are the backend's mocks. This proves request/response compatibility and
// the reliability rules (idempotency, expiry, changed intent, cancellation, fencing, private delivery). It is NOT staging: no Supabase, Stripe, provider or
// deployed service, and no money moves.
// Skipped unless both are set:
//   BIZGENIE_API_DIR_219=/path/to/bizgenie-api (with node_modules)   TEST_DATABASE_URL=postgres://user:pass@127.0.0.1:5432/postgres (a superuser on a throwaway server)
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildQuoteRequest, confirmGenerationQuote, confirmKey, fetchQuoteStatus, newNonce, requestGenerationQuote } from "../../src/premium/generationQuoteClient";
import { attachCreativeJob, cancelCreativeJob, fetchCreativeJob, fetchCreativeJobs } from "../../src/premium/creativeJobsClient";
import { fetchCampaignDetail } from "../../src/premium/campaignManagementClient";

const DIR = process.env.BIZGENIE_API_DIR_219; const URL_ = process.env.TEST_DATABASE_URL;
const run = DIR && URL_ ? describe : describe.skip;

run("staged strategy jobs: frontend clients against the real draft #219 routes", () => {
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
    const { strategyKit } = req("./test/helpers/strategy-stage-local"); const k = await strategyKit({ pool, billing, now }); const { localMediaKit } = req("./test/helpers/customer-media-local"); const kit = localMediaKit({ pool, billing, now });
    const app = createApp({ campaignRepository: campaigns, generationQuoteService: k.q, mediaIntakeService: kit.intake, mediaPreviewStorage: kit.storage, customerTokenVerifier: tokens, authorizationService: { authorizeProject: async () => context }, logger: { warn() {}, error() {}, info() {} } });
    await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", () => resolve()); }); base = `http://127.0.0.1:${server.address().port}`;
    H = { k, kit, req, pool, billing, billingService, campaigns, quotes, storage, scenario, context, actor, FencedGenerationWorker, PostgresPreviewRegistry };
  }, 120000);
  afterAll(async () => { if (server) await new Promise((r) => server.close(r)); await pool?.end(); if (db) await admin.query(`drop database ${db}`); await admin?.end(); });
  beforeEach(async () => { offsetMs = 0; const available = (await H.billingService.readBalance({ tenantId: "tenant_a" })).available_balance; const key = randomUUID(); if (available < 50) await H.billingService.adjustCredits({ tenantId: "tenant_a", amount: 100, direction: "credit", transactionCorrelationId: key, idempotencyKey: key }); });

  // A fresh campaign with one item of the given format, made through the backend's own command helper.
  async function item(format = "image") { const s = await H.scenario(H.campaigns); const t = await s.add(format); const detail = await fetchCampaignDetail({ ...common(), campaignId: s.id }); return { s, t, campaign: detail, variant: detail.items.flatMap((i) => i.variants).find((v) => v.variant_id === t.variant_id) }; }
  const inputs = (x, over = {}) => ({ scope: scope(), campaign: x.campaign, variant: x.variant, executionClass: "image.normal", brief: "An image for this synthetic business", ...over });
  const quote = async (x, over = {}, nonce = newNonce()) => requestGenerationQuote({ ...common(), request: buildQuoteRequest(inputs(x, over)), nonce });
  const balance = async () => (await H.billingService.readBalance({ tenantId: "tenant_a" })).available_balance;
  const ledger = async () => (await H.pool.query("select entry_type,count(*)::int n from credit_ledger group by entry_type order by entry_type")).rows;


  it("STRATEGY: a finished strategy stage reads as a strategy plan, is not attachable (client and server agree), and only the final draft attaches", async () => {
    const x = await item("text"); const scopeB = { tenant_id: "tenant_a", project_id: "project_a", brand_id: "brand_a" };
    const request = { tenant_id: "tenant_a", project_id: "project_a", campaign_id: x.s.id, variant_id: x.t.variant_id, expected_campaign_version: x.campaign.version, execution_class: "text.standard", execution_mode: "ai", supplied_assets: [], idempotency_key: randomUUID() };
    const { FencedGenerationWorker } = H; const k = H.k; const body = () => ({ idempotency_key: randomUUID(), max_credits: 2, confirmed: true });
    const wf = await k.workflow.create(H.actor, scopeB, { request, max_total_credits: 4, idempotency_key: randomUUID() });
    const worker = new FencedGenerationWorker({ quoteService: k.q, provider: k.adapter, executionPolicy: k.policy });
    const sq = await k.workflow.quote(H.actor, scopeB, wf.workflow_id, { stage: "strategy", quote_attempt: 1 }); const sj = await k.q.confirm(H.actor, sq.quote_id, body());
    expect((await worker.run(await worker.claim(sj.job_id))).status).toBe("succeeded");
    const plan = await fetchCreativeJob({ ...common(), jobId: sj.job_id });
    expect(plan.state).toBe("succeeded"); expect(plan.outputs).toHaveLength(1); expect(plan.outputs[0]).toMatchObject({ type: "strategy_plan", attachable: false }); expect(plan.outputs[0].angle).toEqual(expect.any(String)); expect(plan.outputs[0]).not.toHaveProperty("assetId");
    expect(plan.canAttach).toBe(false); expect(plan.association).toBeNull();
    await expect(attachCreativeJob({ ...common(), jobId: sj.job_id })).rejects.toMatchObject({ kind: "stage", code: "STAGE_NOT_ATTACHABLE" });
    expect((await fetchCampaignDetail({ ...common(), campaignId: x.s.id })).items[0].variants[0].current_content.asset_refs).toEqual([]);
    const dq = await k.workflow.quote(H.actor, scopeB, wf.workflow_id, { stage: "draft", quote_attempt: 1 }); const dj = await k.q.confirm(H.actor, dq.quote_id, body());
    expect((await worker.run(await worker.claim(dj.job_id))).status).toBe("succeeded");
    const draft = await fetchCreativeJob({ ...common(), jobId: dj.job_id }); expect(draft.outputs[0]).toMatchObject({ type: "text", attachable: true }); expect(draft.canAttach).toBe(true);
    const attached = await attachCreativeJob({ ...common(), jobId: dj.job_id }); expect(attached.association).toMatchObject({ current: true, approval: "not_approved" });
    const list = await fetchCreativeJobs(common()); expect(list.skipped).toBe(0); expect(list.jobs.map((j) => j.id)).toEqual(expect.arrayContaining([sj.job_id, dj.job_id]));
  }, 60000);
});
