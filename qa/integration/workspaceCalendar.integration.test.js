// @vitest-environment node
// LOCAL INTEGRATION (BG-STUDIO-023/024-FE) against bizgenie-api draft PR #218 (head 9346055); the R11 social OAuth part needs #220 (e653ed3): the routes and response shapes that PR adds
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
import { fetchPublishingCalendar } from "../../src/premium/socialClient";
import { fetchWorkspaceCalendarFromApi } from "../../src/premium/workspaceCalendarApiClient";
import { applyDeliveryOverlay, fetchDeliveryOverlay } from "../../src/premium/calendarOverlay";

const DIR = process.env.BIZGENIE_API_DIR; const URL_ = process.env.TEST_DATABASE_URL;
const run = DIR && URL_ ? describe : describe.skip;

run("workspace calendar: frontend client against the real routes of #220", () => {
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

  const fe = () => ({ apiBaseUrl: base, accessToken: "ok", scope: { tenantId: SC.tenant_id, projectId: SC.project_id, brandId: SC.brand_id } });
  const win = () => ({ from: new Date(Date.now() - 2 * 86400000).toISOString(), to: new Date(Date.now() + 3 * 86400000).toISOString() });

  it("F3: scheduled item -> queued delivery overlay -> published by the platform path: one entry throughout, never double-counted, provenance from the server", async () => {
    const f = H.social; const w = win();
    // scheduled (the fixture schedules a post one minute ahead)
    const cal1 = await fetchWorkspaceCalendarFromApi({ ...fe(), from: w.from, to: w.to });
    const mine1 = cal1.items.filter((i) => i.variantId === f.target.variant_id); expect(mine1).toHaveLength(1); expect(mine1[0]).toMatchObject({ occurrenceKind: "scheduled", platformVerified: false }); expect(mine1[0].scheduleId).toBe(f.input.schedule_id); expect(mine1[0].publicationId).toBeNull();
    // queue it for delivery (owner confirms publishing)
    const queued = await call("POST", "/customer/social/dispatches", { ...SC, ...f.input }); expect(queued.status).toBe(200);
    const ov = await fetchDeliveryOverlay({ ...fe(), from: w.from, to: w.to }); expect(ov.skipped).toBe(0);
    const joined = applyDeliveryOverlay(mine1, ov.entries.map((e) => e)); expect(joined.items[0].delivery).toMatchObject({ state: "queued", dispatchId: queued.body.dispatch_id }); expect(joined.dropped).toBe(0);
    // run it with the backend's own synthetic connector at the due time
    offsetMs += 3 * 60000; const published = await f.service.run(await f.service.claim(queued.body.dispatch_id)); expect(published.state).toBe("published");
    const cal2 = await fetchWorkspaceCalendarFromApi({ ...fe(), from: w.from, to: w.to });
    const mine2 = cal2.items.filter((i) => i.variantId === f.target.variant_id); expect(mine2).toHaveLength(1); // the schedule is replaced by the publication, not added to
    expect(mine2[0]).toMatchObject({ occurrenceKind: "published", workflow: "published", platformVerified: true, evidenceKind: "platform_api", scheduleId: null }); expect(mine2[0].publicationId).toBe(queued.body.dispatch_id); expect(mine2[0].providerPublicationId).toEqual(expect.any(String));
    const ov2 = await fetchDeliveryOverlay({ ...fe(), from: new Date(Date.now() + offsetMs - 86400000).toISOString(), to: new Date(Date.now() + offsetMs + 86400000).toISOString() });
    const joined2 = applyDeliveryOverlay(mine2, ov2.entries); expect(joined2.items[0].delivery).toBeUndefined(); expect(joined2.dropped).toBe(0); // a published row is never given a second claim
  });
  it("F3: windows over 93 days are split into consecutive requests of at most 93 days; the cursor is followed; a bad session is refused", async () => {
    const urls = []; const spy = async (u, o) => { urls.push(new URL(u)); return fetch(u, o); };
    const from = new Date(Date.now() - 10 * 86400000).toISOString(), to = new Date(Date.now() + 200 * 86400000).toISOString();
    const r = await fetchWorkspaceCalendarFromApi({ ...fe(), from, to, limit: 1, fetchImpl: spy });
    expect(urls.every((u) => u.pathname === "/customer/calendar" && Date.parse(u.searchParams.get("to")) - Date.parse(u.searchParams.get("from")) <= 93 * 86400000 && u.searchParams.get("limit") === "1")).toBe(true);
    expect(new Set(urls.map((u) => u.searchParams.get("from"))).size).toBeGreaterThanOrEqual(3); expect(r.failures).toEqual([]); expect(r.items.length).toBeGreaterThan(0);
    // NOTE: tenant isolation of GET /customer/calendar is NOT asserted here: this harness injects an authorization service that admits every authenticated user
    // (authorizeProject -> context), exactly like backend218.integration. The social overlay below enforces membership inside its own service, so that part is asserted.
    await expect(fetchWorkspaceCalendarFromApi({ ...fe(), accessToken: "bad", from, to })).rejects.toMatchObject({ kind: "auth" });
  });
  it("F3: the social overlay needs the brand scope and refuses a window over 93 days, a bad session and another user", async () => {
    const w = win(); await expect(fetchPublishingCalendar({ ...fe(), accessToken: "bad", ...w })).rejects.toMatchObject({ kind: "auth" });
    await expect(fetchPublishingCalendar({ ...fe(), accessToken: "other", ...w })).rejects.toMatchObject({ kind: "unavailable" });
    await expect(fetchPublishingCalendar({ ...fe(), from: w.from, to: new Date(Date.now() + 200 * 86400000).toISOString() })).rejects.toMatchObject({ kind: "error" });
  });
});
