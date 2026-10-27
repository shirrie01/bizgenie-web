// @vitest-environment node
// BG-STUDIO-027-FE (F5): the real insights client + canonical readers over real HTTP against bizgenie-api #220 (e653ed3) on a throwaway local PostgreSQL. Synthetic connector and
// observations only; ingestion is done by the backend service itself because THERE IS NO PUBLIC INGESTION ROUTE. Not staging; no real platform data.
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
import { buildFeedback, readRecommendation, readSnapshot } from "../../src/intel/performanceEvidence";
import { makeInsightsApi } from "../../src/premium/insightsClient";

const DIR = process.env.BIZGENIE_API_DIR; const URL_ = process.env.TEST_DATABASE_URL;
const run = DIR && URL_ ? describe : describe.skip;

run("learning: frontend insights client against the real routes of #220", () => {
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

  const fe = { accessToken: "ok", scope: { tenantId: SC.tenant_id, projectId: SC.project_id, brandId: SC.brand_id } };
  it("F5: objective -> (backend-side ingestion) -> owner refresh -> compare -> shared suggestion -> decision with the server's version -> replay -> conflict; members and strangers are refused", async () => {
    const api = makeInsightsApi({ apiBaseUrl: base }); const L = H.learning;
    const f2 = await H.socialFixtureAgain(); const queued = await f2.service.enqueue(H.actor, f2.scope, f2.input); offsetMs += 120000; const published = await f2.service.run(await f2.service.claim(queued.dispatch_id)); expect(published.state).toBe("published");
    await api.configureObjective({ ...fe, body: { campaign_id: f2.s.id, objective: "traffic", metric: "clicks", expected_version: 0, idempotency_key: "obj-" + randomUUID() } });
    const start = Date.now() + offsetMs; offsetMs += 240000;
    const ob = (n, value) => ({ observation_id: randomUUID(), ...SC, campaign_id: f2.s.id, variant_id: f2.target.variant_id, publication_id: published.dispatch_id, objective: "traffic", platform: "instagram", attribution: "organic", metric: "clicks", unit: "count", value, period: { from: new Date(start + (n - 1) * 60000).toISOString(), to: new Date(start + n * 60000).toISOString() }, observed_at: new Date(start + n * 60000).toISOString(), source: { kind: "platform_api", source_id: "synthetic.connector", account_id: f2.connection.account_id, record_id: randomUUID() } });
    const a = ob(1, 10), b = ob(2, 20); await L.ingest(f2.connection.connection_id, a); await L.ingest(f2.connection.connection_id, b);
    expect(await api.fetchRecommendations(fe).then((l) => l.length)).toBeGreaterThanOrEqual(0); // reading needs no snapshot
    const body = await api.refreshSnapshot(fe); const snap = readSnapshot(body);
    expect(snap).toMatchObject({ state: "available", snapshotId: body.snapshot_id }); expect(snap.observations.map((o) => o.id)).toEqual(expect.arrayContaining([a.observation_id, b.observation_id])); expect(body.observations.every((r) => r.contract_version === "performance-observation.v1")).toBe(true); // canonical rows for new snapshots
    const rec = await api.createRecommendation({ ...fe, snapshotId: snap.snapshotId, previousId: a.observation_id, currentId: b.observation_id }); expect(readRecommendation(rec)).toMatchObject({ direction: "up", change: 10 });
    const listed = (await api.fetchRecommendations(fe)).map(readRecommendation); const mine = listed.find((r) => r.id === rec.recommendation_id);
    expect(mine).toMatchObject({ evidenceState: "current", decision: null, feedbackVersion: 0 });
    // a member/stranger cannot write, and cannot read this workspace's suggestions
    const other = { ...fe, accessToken: "other" };
    await expect(api.refreshSnapshot(other)).rejects.toMatchObject({ kind: "forbidden" }); await expect(api.fetchRecommendations(other)).rejects.toMatchObject({ kind: "forbidden" });
    await expect(api.fetchRecommendations({ ...fe, accessToken: "bad" })).rejects.toMatchObject({ kind: "auth" });
    const key = "fb-" + randomUUID(); const fb = buildFeedback(mine.id, "accepted", { expectedVersion: 0, idempotencyKey: key });
    expect(await api.sendFeedback({ ...fe, body: fb })).toMatchObject({ decision: "accepted", version: 1 });
    expect(await api.sendFeedback({ ...fe, body: fb })).toMatchObject({ replay: true }); // a lost response retried with the same key is one decision
    expect((await api.fetchRecommendations(fe)).map(readRecommendation).find((r) => r.id === mine.id)).toMatchObject({ decision: "accepted", feedbackVersion: 1 });
    await expect(api.sendFeedback({ ...fe, body: buildFeedback(mine.id, "rejected", { expectedVersion: 0, idempotencyKey: "fb-" + randomUUID() }) })).rejects.toMatchObject({ kind: "conflict" }); // stale version
    await expect(api.sendFeedback({ ...fe, body: { ...fb, decision: "rejected" } })).rejects.toMatchObject({ kind: "key_conflict" }); // same key, different decision
    await expect(api.sendFeedback({ ...fe, body: { ...fb, recommendation_id: "00000000-0000-4000-8000-000000000000", idempotency_key: "fb-" + randomUUID() } })).rejects.toMatchObject({ kind: "forbidden" });
    // FAIL CLOSED: revoke the connection locally. Existing suggestions stop being current, the decision no longer applies, new decisions are refused and a new snapshot excludes the source.
    const gone = await call("POST", `/customer/social/connections/${f2.connection.connection_id}/disconnect`, SC); expect(gone.status).toBe(200);
    const after = (await api.fetchRecommendations(fe)).map(readRecommendation).find((r) => r.id === mine.id); expect(after).toMatchObject({ evidenceState: "unavailable", decision: "invalidated" });
    await expect(api.sendFeedback({ ...fe, body: buildFeedback(mine.id, "rejected", { expectedVersion: 1, idempotencyKey: "fb-" + randomUUID() }) })).rejects.toMatchObject({ kind: "evidence" });
    const snap2 = readSnapshot(await api.refreshSnapshot(fe)); expect(snap2.observations.map((o) => o.id)).not.toContain(a.observation_id); expect(snap2.state === "unavailable" ? ["source_unavailable", "missing_or_retracted", "stale"] : ["available"]).toContain(snap2.state === "unavailable" ? snap2.reason : "available");
  }, 60000);
  it("F5: with learning not composed the client says so and nothing is shown (default-off backend)", async () => {
    const off = makeInsightsApi({ apiBaseUrl: base2 }); await expect(off.fetchRecommendations(fe)).rejects.toMatchObject({ kind: "unavailable" }); await expect(off.refreshSnapshot(fe)).rejects.toMatchObject({ kind: "unavailable" });
  });
});
