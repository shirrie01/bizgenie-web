// @vitest-environment node
// LOCAL INTEGRATION (BG-STUDIO-023-FE) against bizgenie-api draft PR #218 (BG-STUDIO-021-BE, head 9346055): the routes and response shapes that PR adds
// beyond #217 - nested campaign facts (R1), campaign discovery, creative jobs, social OAuth/dispatch/calendar (R11), persisted learning (R12) and the
// default-off behaviour of every optional mount. It uses the backend's own Express routers, a throwaway PostgreSQL database, and the backend's own
// synthetic fixtures (identity, connector, platform). It is NOT staging, uses no real OAuth or provider, and proves SHAPES and AUTHORITY, not product
// acceptance. The calls are plain HTTP so the matrix records what the backend actually returns; where a frontend adapter exists it is also run.
// Needs BIZGENIE_API_DIR (a #218 checkout with node_modules) and TEST_DATABASE_URL (a superuser on a throwaway server).
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchCampaignDetail } from "../../src/premium/campaignManagementClient";
import { readRecommendation, readSnapshot } from "../../src/intel/performanceEvidence";

const DIR = process.env.BIZGENIE_API_DIR; const URL_ = process.env.TEST_DATABASE_URL;
const run = DIR && URL_ ? describe : describe.skip;

run("bizgenie-api #218 routes and shapes", () => {
  let req, pool, admin, db, server, server2, base, base2, offsetMs = 0; let H = {}; const now = () => new Date(Date.now() + offsetMs);
  const SC = { tenant_id: "tenant_a", project_id: "project_a", brand_id: "brand_a" };
  const q = (o) => new URLSearchParams(o).toString();
  const call = async (method, p, body, token = "ok", b = base) => { const r = await fetch(`${b}${p}`, { method, headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch { /* none */ } return { status: r.status, body: j, headers: r.headers }; };

  beforeAll(async () => {
    req = createRequire(path.join(DIR, "index.js"));
    const { Pool } = req("pg"); const { createApp } = req("./index");
    const { PostgresBillingRepository, BillingService } = req("./src/billing");
    const { PostgresGenerationQuoteService } = req("./src/generation-quotes/service"); const { FencedGenerationWorker } = req("./src/generation-quotes/worker");
    const { PostgresCampaignRepository, PostgresPreviewRegistry } = req("./src/campaigns");
    const { scenario, previewReceipt, context } = req("./test/helpers/campaign-regressions"); const { socialFixture } = req("./test/helpers/social-local"); const { DurableLearningService } = req("./src/learning-persistence/service");
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
    const social = await socialFixture({ billing, pool, campaigns, now: () => now() }); const learning = new DurableLearningService({ billingRepository: billing, socialService: social.service, enabled: true, maxAgeMs: 600000, now: () => now(), connectors: { instagram: { requiredScopes: ["synthetic.read"], verifyObservation: async ({ connection, observation }) => connection.account_id === observation.source.account_id && observation.source.source_id === "synthetic.connector" } } });
    const app = createApp({ campaignRepository: campaigns, socialPublishingService: social.service, learningService: learning, generationQuoteService: quotes(), mediaPreviewStorage: storage, customerTokenVerifier: tokens, authorizationService: { authorizeProject: async () => context }, logger: { warn() {}, error() {}, info() {} } });
    await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", () => resolve()); }); base = `http://127.0.0.1:${server.address().port}`;
    H = { socialFixtureAgain: () => socialFixture({ billing, pool, campaigns, now: () => now() }), social, learning, req, pool, billing, billingService, campaigns, quotes, storage, scenario, context, actor, FencedGenerationWorker, PostgresPreviewRegistry };
    // A second app with NO optional services: every optional mount must be unavailable by default.
    const bare = createApp({ campaignRepository: campaigns, customerTokenVerifier: tokens, authorizationService: { authorizeProject: async () => context }, logger: { warn() {}, error() {}, info() {} } });
    await new Promise((resolve) => { server2 = bare.listen(0, "127.0.0.1", () => resolve()); }); base2 = `http://127.0.0.1:${server2.address().port}`;
  }, 120000);
  afterAll(async () => { for (const s of [server, server2]) if (s) await new Promise((r) => s.close(r)); await pool?.end(); if (db) await admin.query(`drop database ${db}`); await admin?.end(); });

  const D = (id) => `/customer/campaigns/${id}?${q({ tenant_id: SC.tenant_id, project_id: SC.project_id })}`;

  it("R1: campaign detail now carries nested per-variant facts (current_schedule, manual_publication, publication); the old pointer names are still absent", async () => {
    const f = H.social; const body = (await call("GET", D(f.s.id))).body; const detail = body.campaign || body;
    const v = detail.items.flatMap((i) => i.variants).find((x) => x.variant_id === f.target.variant_id);
    expect(v.current_schedule).toMatchObject({ schedule_id: expect.any(String), revision_id: v.current_revision_id, timezone: "UTC" }); expect(Date.parse(v.current_schedule.scheduled_for)).toBeGreaterThan(0);
    expect(v).toHaveProperty("manual_publication", null); expect(v).toHaveProperty("publication", null);
    for (const old of ["active_schedule_id", "schedules", "pending_attempt_id", "publication_id", "publications"]) expect(v).not.toHaveProperty(old);
    // the frontend adapter passes the server's detail through unchanged, so adopting the new names is a mapping change in App, not a client change
    const viaClient = await fetchCampaignDetail({ apiBaseUrl: base, accessToken: "ok", scope: { tenantId: SC.tenant_id, projectId: SC.project_id }, campaignId: f.s.id });
    expect(viaClient.items.flatMap((i) => i.variants).find((x) => x.variant_id === v.variant_id).current_schedule).toEqual(v.current_schedule);
  });

  it("campaign-discovery.v1: bounded summaries with a cursor, active by default", async () => {
    const r = await call("GET", `/customer/campaigns/discovery?${q({ tenant_id: SC.tenant_id, project_id: SC.project_id, limit: 1 })}`);
    expect(r.status).toBe(200); expect(r.body.contract_version).toBe("campaign-discovery.v1"); expect(Array.isArray(r.body.campaigns)).toBe(true); expect(r.body).toHaveProperty("next_cursor");
    expect(r.body.campaigns[0]).toMatchObject({ campaign_id: expect.any(String), name: expect.any(String), status: expect.any(String), version: expect.any(Number) });
    expect((await call("GET", `/customer/campaigns/discovery?${q({ tenant_id: SC.tenant_id, project_id: SC.project_id, limit: 500 })}`)).status).toBe(400);
  });

  it("every optional mount is unavailable by default (503) and never falls back to a legacy or frontend-guessed route", async () => {
    const want = [["GET", `/customer/social/connections?${q(SC)}`, "SOCIAL_NOT_CONFIGURED"], ["GET", `/customer/insights/recommendations?${q(SC)}`, "LEARNING_UNAVAILABLE"], ["GET", `/customer/assets?${q(SC)}`, "MEDIA_INTAKE_UNAVAILABLE"], ["GET", `/customer/creative-jobs?${q(SC)}`, "CREATIVE_JOBS_UNAVAILABLE"]];
    for (const [m, p, code] of want) { const r = await call(m, p, null, "ok", base2); expect([r.status, r.body.error.code]).toEqual([503, code]); }
    expect((await call("POST", "/customer/generation-quotes", { ...SC }, "ok", base2)).status).toBe(503);
    for (const guessed of ["/customer/social-accounts", "/customer/publishing-queue", "/customer/learning/insights", `/customer/campaigns/${H.social.s.id}/results`]) expect([404, 401]).toContain((await call("GET", `${guessed}?${q(SC)}`)).status);
  });

  it("R11 social: connections, dispatch, list and the publishing calendar match the contract; nothing is 'published' without a platform result", async () => {
    const f = H.social;
    const conns = await call("GET", `/customer/social/connections?${q(SC)}`);
    expect(conns.body.connections[0]).toMatchObject({ connection_id: expect.any(String), platform: "instagram", status: "active", version: 1 });
    expect(JSON.stringify(conns.body)).not.toMatch(/token|secret|refresh/i);
    expect((await call("GET", `/customer/social/connections?${q(SC)}`, null, "other")).status).toBe(404);
    const enq = await call("POST", "/customer/social/dispatches", { ...SC, ...f.input });
    expect(enq.status).toBe(200); expect(enq.body).toMatchObject({ state: "queued", publication_id: null, publication_url: null, published_at: null, evidence_kind: null });
    const again = await call("POST", "/customer/social/dispatches", { ...SC, ...f.input }); expect(again.body.dispatch_id).toBe(enq.body.dispatch_id);
    const bad = await call("POST", "/customer/social/dispatches", { ...SC, ...f.input, publishing_confirmed: false }); expect([400, 422]).toContain(bad.status);
    const from = new Date(Date.now() - 86400000).toISOString(), to = new Date(Date.now() + 2 * 86400000).toISOString();
    const cal = await call("GET", `/customer/social/calendar?${q({ ...SC, from, to })}`);
    expect(cal.body.contract_version).toBe("publishing-calendar.v1"); expect(cal.body.entries.find((e) => e.dispatch_id === enq.body.dispatch_id)).toMatchObject({ state: "queued", evidence_kind: null });
    expect((await call("GET", `/customer/social/calendar?${q({ ...SC, from, to: new Date(Date.now() + 200 * 86400000).toISOString() })}`)).status).toBe(400); // window over 93 days
    const cancel = await call("POST", `/customer/social/dispatches/${enq.body.dispatch_id}/cancel`, SC); expect(cancel.status).toBe(200); expect(cancel.body.state).toBe("cancelled");
  });

  it("R12 learning: objective -> snapshot -> recommendation -> feedback by recommendation_id (no client-side hash); the frontend validators accept the persisted shapes", async () => {
    const f = H.social; const L = H.learning;
    // a fresh scheduled post on the same connection, published by the backend's own synthetic worker
    const f2 = await H.socialFixtureAgain();
    const queued = await f2.service.enqueue(H.actor, f2.scope, f2.input); offsetMs += 120000; const published = await f2.service.run(await f2.service.claim(queued.dispatch_id));
    expect(published.state).toBe("published");
    const obj = { campaign_id: f2.s.id, objective: "traffic", metric: "clicks", expected_version: 0, idempotency_key: randomUUID() };
    const o1 = await call("POST", "/customer/insights/objectives", { ...SC, ...obj }); expect(o1.status).toBe(200);
    expect((await call("POST", "/customer/insights/objectives", { ...SC, ...obj })).status).toBe(200); // same key replays
    const start = Date.now() + offsetMs; offsetMs += 240000;
    const ob = (n, value) => ({ observation_id: randomUUID(), ...SC, campaign_id: f2.s.id, variant_id: f2.target.variant_id, publication_id: published.dispatch_id, objective: "traffic", platform: "instagram", attribution: "organic", metric: "clicks", unit: "count", value, period: { from: new Date(start + (n - 1) * 60000).toISOString(), to: new Date(start + n * 60000).toISOString() }, observed_at: new Date(start + n * 60000).toISOString(), source: { kind: "platform_api", source_id: "synthetic.connector", account_id: f2.connection.account_id, record_id: randomUUID() } });
    const a = ob(1, 10), b = ob(2, 20); await L.ingest(f2.connection.connection_id, a); await L.ingest(f2.connection.connection_id, b); // there is NO public ingestion route
    expect((await call("POST", "/customer/insights/ingest", { ...SC, ...a })).status).toBe(404);
    const snap = await call("POST", "/customer/insights/snapshots", SC); expect(snap.status).toBe(200);
    expect(snap.body).toMatchObject({ snapshot_id: expect.any(String), contract_version: "performance-snapshot.v1", state: "available" });
    const read = readSnapshot(snap.body); expect(read.state).toBe("available"); expect(read.observations.length).toBeGreaterThanOrEqual(2);
    const rec = await call("POST", "/customer/insights/recommendations", { ...SC, snapshot_id: snap.body.snapshot_id, previous_id: a.observation_id, current_id: b.observation_id });
    expect(rec.status).toBe(200); expect(rec.body).toMatchObject({ recommendation_id: expect.any(String), causal_claim: false, requires_customer_acceptance: true, confidence: "observed_change_only", absolute_change: 10 });
    expect(readRecommendation(rec.body)).toMatchObject({ direction: "up", change: 10 });
    const listed = await call("GET", `/customer/insights/recommendations?${q(SC)}`); const mine = listed.body.recommendations.find((r) => r.recommendation_id === rec.body.recommendation_id);
    expect(mine.evidence_state).toBe("current"); expect(readRecommendation(mine).metric).toBe("clicks");
    const fb = { ...SC, recommendation_id: rec.body.recommendation_id, decision: "accepted", expected_version: 0, idempotency_key: randomUUID() };
    expect((await call("POST", "/customer/insights/feedback", fb)).status).toBe(200);
    expect((await call("POST", "/customer/insights/feedback", fb)).body.replay).toBe(true);
    const conflict = await call("POST", "/customer/insights/feedback", { ...fb, idempotency_key: randomUUID() }); expect([409]).toContain(conflict.status);
    // The reference contract's recommendation_hash plays no part: an extra hash is ignored by the route, so this is judged only on recommendation_id/version (already decided -> conflict)
    expect((await call("POST", "/customer/insights/feedback", { ...fb, recommendation_hash: "a".repeat(64), idempotency_key: randomUUID() })).status).toBe(409);
  });

  it("R3 creative jobs: a confirmed quote appears in the job list and detail as queued (never completed), with no storage address and the exact pinned scope", async () => {
    { const key = randomUUID(); await H.billingService.adjustCredits({ tenantId: "tenant_a", amount: 100, direction: "credit", transactionCorrelationId: key, idempotencyKey: key }); }
    const sc = await H.scenario(H.campaigns); const t = await sc.add("image"); const body = (await call("GET", D(sc.id))).body; const camp = body.campaign || body;
    const qr = await call("POST", "/customer/generation-quotes", { tenant_id: SC.tenant_id, project_id: SC.project_id, campaign_id: sc.id, variant_id: t.variant_id, expected_campaign_version: camp.version, execution_class: "image.normal", execution_mode: "ai", execution_brief: "A synthetic image", supplied_assets: [], idempotency_key: "q-" + randomUUID() });
    expect(qr.status).toBe(201); expect(qr.body).toMatchObject({ contract_version: "generation-quote.v1", execution_class: "image.normal", kind: "fixed", sufficient: true });
    const cf = await call("POST", `/customer/generation-quotes/${qr.body.quote_id}/confirm`, { idempotency_key: "c-" + randomUUID(), max_credits: qr.body.max_credits, confirmed: true });
    expect(cf.status).toBe(202); expect(cf.body.status).toBe("queued");
    const list = await call("GET", `/customer/creative-jobs?${q({ ...SC, limit: 25 })}`);
    expect(list.body.contract_version).toBe("creative-job-list.v1"); const job = list.body.jobs.find((j) => j.job_id === cf.body.job_id); expect(job).toBeTruthy();
    const detail = await call("GET", `/customer/creative-jobs/${encodeURIComponent(cf.body.job_id)}?${q(SC)}`);
    expect(detail.status).toBe(200); expect(detail.body).toMatchObject({ contract_version: "creative-job.v1", state: "queued" });
    expect(JSON.stringify(detail.body)).not.toMatch(/gs:\/\/|s3:\/\/|claim_token|bucket/i);
    expect((await call("GET", `/customer/creative-jobs/${encodeURIComponent(cf.body.job_id)}?${q(SC)}`, null, "other")).status).toBe(404);
    const att = await call("POST", `/customer/creative-jobs/${encodeURIComponent(cf.body.job_id)}/attach`, SC); expect(att.status).toBeGreaterThanOrEqual(400); // nothing to attach until the job has succeeded
  });
});
