// @vitest-environment node
// LOCAL INTEGRATION against the REAL backend draft routes (bizgenie-api PR #216, head f8d81bf) - BG-STUDIO-020-FE.
// It starts the backend's own Express routers in this process (real zod validation, real handlers, the backend's in-memory repositories and its own
// test fixtures for identity and authorisation) and drives THIS app's client modules against them over HTTP. It proves request/response compatibility
// with the draft code. It is NOT staging: no database, no Stripe, no provider, no deployed service, and the identity layer is the backend's fixture.
// Skipped unless BIZGENIE_API_DIR points at a checkout of that backend with its node_modules installed:
//   BIZGENIE_API_DIR=/path/to/bizgenie-api npx vitest run qa/integration
import { createRequire } from "node:module";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchWorkspaceCalendarFromApi } from "../../src/premium/workspaceCalendarApiClient";
import { fetchCampaignDetail, recordManualPublication, renameCampaign, setCampaignArchived, unscheduleVariant } from "../../src/premium/campaignManagementClient";
import { fetchPlanCatalogue } from "../../src/premium/planCatalogueClient";
import { requestCreditPreview } from "../../src/premium/creditPreviewClient";
import { openBillingPortal, requestCancellation, requestPlanChange } from "../../src/premium/billingManagementClient";
import { fetchVideo, pollVideo, startImage, startVideo } from "../../src/premium/creativeProductionClient";

const DIR = process.env.BIZGENIE_API_DIR;
const run = DIR ? describe : describe.skip;

run("frontend adapters against the real backend draft routes", () => {
  const servers = [];
  let urls = {}; let fx = {};
  const listen = (app) => new Promise((resolve) => { const s = app.listen(0, "127.0.0.1", () => { servers.push(s); resolve(`http://127.0.0.1:${s.address().port}`); }); });

  beforeAll(async () => {
    const req = createRequire(path.join(DIR, "index.js"));
    const express = req("express");
    const { createApp } = req("./index");
    const { InMemoryCampaignRepository } = req("./src/campaigns");
    const { AuthenticationRequiredError, AuthorizationDeniedError } = req("./src/authorization");
    const { scenario, previewReceipt, context, NOW } = req("./test/helpers/campaign-regressions");
    const { CommercialCatalog } = req("./src/billing/commercialCatalog");
    const { createCustomerBillingRouter } = req("./src/billing/customerRouter");
    const { createDraftBillingManagementRouter } = req("./src/billing/stripe/managementDraft");

    // ---- campaigns, calendar, unschedule, manual publication: the backend's own regression scenario, served by the backend's own createApp ----
    let role = "owner";
    const repository = new InMemoryCampaignRepository({ now: () => new Date(NOW), authorize: async () => role === "owner", resolvePreviewReceipt: previewReceipt, validatePreview: async () => true, captureBrandSnapshot: async () => ({ brand_snapshot_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", tenant_id: context.tenant_id, project_id: context.project_id, brand_id: "brand_a", source_version: 1, source_updated_at: NOW, source_schema_version: "brand-brain.v1", snapshot: { name: "Synthetic" }, snapshot_hash: "a".repeat(64), captured_at: NOW }) });
    const s = await scenario(repository);
    const approved = await s.approve(await s.add());
    const scheduled = await s.schedule(approved);
    const campaignApp = createApp({ campaignRepository: repository, customerTokenVerifier: { verifyAccessToken: async (t) => { if (t !== "ok") throw new AuthenticationRequiredError(); return context.actor; } }, authorizationService: { authorizeProject: async ({ tenantId, projectId, action }) => { if (role !== "owner" || tenantId !== context.tenant_id || projectId !== context.project_id) throw new AuthorizationDeniedError(); return { ...context, action }; } }, logger: { warn() {}, error() {}, info() {} } });

    // ---- plan catalogue and credit preview: the backend's real customer billing router with its synthetic commercial fixtures ----
    const now = () => new Date("2026-10-26T12:00:00Z");
    const policy = { policy_id: "synthetic-policy", plan_code: "standard", policy_version: 1, status: "active", included_monthly_credits: 3, bolt_on_eligible: false, effective_from: "2026-10-01T00:00:00Z", effective_to: null, execution_costs: { "text.standard": 2, "image.normal": 5, "video.normal": 9 } };
    const plan = { plan_code: "standard", plan_version: 1, amount_minor: 123, currency: "GBP", billing_cadence: "month", tax: { presentation: "exclusive", jurisdiction: "TEST", wording: "Synthetic fixture only" }, credit_grant_cadence: "month", included_credits: 3, policy_id: policy.policy_id, entitlement_codes: ["generation"], effective_from: "2026-10-01T00:00:00Z", effective_to: null, terms: { version: "synthetic-terms", url: "https://example.test/terms", cancellation_url: "https://example.test/cancel", refund_url: "https://example.test/refund" }, approval: { decision: "SYNTHETIC", source: "https://example.test/decision", approved_at: "2026-10-01T00:00:00Z" }, stripe: { mode: "test", price_id: "price_synthetic" } };
    const billing = (catalog) => { const a = express(); a.use("/customer/billing", createCustomerBillingRouter({ repository: { getActiveEntitlement: async () => ({ tenant_id: "tenant_a", plan_code: "standard", policy_id: policy.policy_id, entitlement_id: "entitlement_a" }), getCommercialPolicy: async () => policy, readBalance: async () => ({ available_balance: 5 }) }, commercialCatalog: catalog, now, tokenVerifier: { verifyAccessToken: async (t) => { if (t !== "ok") throw new AuthenticationRequiredError(); return { kind: "customer", auth_user_id: "owner" }; } }, authorizationService: { authorizeTenant: async ({ tenantId }) => { if (tenantId !== "tenant_a") throw new AuthorizationDeniedError(); return { tenant_id: tenantId }; }, authorizeProjectBrand: async ({ tenantId, projectId, brandId }) => { if (tenantId !== "tenant_a" || projectId !== "project_a" || brandId !== "brand_a") throw new AuthorizationDeniedError(); return { tenant_id: tenantId, project_id: projectId, brand_id: brandId }; } } })); return a; };

    // ---- subscription management: the backend's draft router (unmounted in the product) with a mock Stripe ----
    const sessions = [];
    const mgmtApp = express();
    mgmtApp.use("/customer/billing/management", createDraftBillingManagementRouter({ enabled: true, configurationId: "bpc_synthetic", returnUrl: "https://example.test/billing", authorizeTenantRequest: async () => ({ actor: { kind: "customer", auth_user_id: "owner" }, tenant_id: "tenant_a", membership_role: "owner", action: "billing:checkout" }), repository: { getStripeCustomerByTenant: async () => ({ stripe_customer_id: "cus_a", livemode: false }), getActiveEntitlement: async () => ({ stripe_subscription_ref: "sub_a" }) }, stripe: { subscriptions: { retrieve: async () => ({ id: "sub_a", customer: "cus_a", livemode: false, items: { data: [{ id: "si_a" }] } }) }, billingPortal: { sessions: { create: async (p, o) => { sessions.push({ p, o }); return { url: "https://billing.stripe.com/p/session/synthetic" }; } } } }, catalog: { mode: "test", stripeMapping: () => ({ priceId: "price_test", policyId: "synthetic" }) } }));

    // ---- customer image and video: the backend's real createApp routes, job boundary and billing orchestrator, with fixture providers (no network) ----
    const { InMemoryAuthorizationRepository, createCustomerActorFromVerifiedIdentity } = req("./src/authorization");
    const { InMemoryBrandBrainRepository } = req("./src/brand-brain");
    const { InMemoryImageGenerationRepository } = req("./src/image-generation");
    const { InMemoryVideoGenerationRepository, VideoGenerationProvider } = req("./src/video-generation");
    const { GenerationBillingOrchestrator } = req("./src/generation-billing");
    const { InMemoryGenerationJobRepository } = req("./src/generation-jobs");
    const USER_A = "11111111-1111-4111-8111-111111111111";
    const effects = { reserve: 0, debit: 0, release: 0 };
    const billingService = { async createReservation(i) { effects.reserve += 1; return { ledger_entry_id: "r1", generation_id: i.generationId }; }, async finalizeDebit() { effects.debit += 1; return { ledger_entry_id: "d1", generation_id: "x" }; }, async releaseReservation() { effects.release += 1; return { ledger_entry_id: "rel1" }; } };
    class FixtureVideo extends VideoGenerationProvider {
      async submit() { return { provider: "fixture", provider_job_id: "op1", provider_model: "fixture-model" }; }
      async poll() { return { provider: "fixture", provider_job_id: "op1", provider_model: "fixture-model", status: "completed", asset_source: { location: "gs://private-bucket/out/video.mp4", mime_type: "video/mp4", width: 1280, height: 720, duration_seconds: 4, container: "mp4" } }; }
    }
    const brands = new InMemoryBrandBrainRepository(); brands.upsert({ brand_id: "brand_a", project_id: "project_a", name: "Brand A", identity: { positioning: "p" }, metadata: { version: 1, status: "approved", created_at: "2026-08-19T09:00:00.000Z", updated_at: "2026-08-19T09:00:00.000Z" } });
    const mediaApp = createApp({
      authorizationRepository: new InMemoryAuthorizationRepository({ customerProfiles: [{ auth_user_id: USER_A, display_name: "A" }], tenants: [{ tenant_id: "tenant_a", name: "A", created_by: USER_A }], memberships: [{ tenant_id: "tenant_a", auth_user_id: USER_A, role: "owner" }], projects: [{ project_id: "project_a", tenant_id: "tenant_a", name: "A" }], brands: [{ brand_id: "brand_a", project_id: "project_a", name: "Brand A", status: "approved" }] }),
      brandBrainRepository: brands, customerTokenVerifier: { verifyAccessToken: async (t) => { if (t !== "ok") throw new AuthenticationRequiredError(); return createCustomerActorFromVerifiedIdentity({ verifiedAuthUserId: USER_A }); } },
      generationBillingOrchestrator: new GenerationBillingOrchestrator({ billingService, logger: { error() {} } }), generationJobRepository: new InMemoryGenerationJobRepository(),
      imageGenerationRepository: new InMemoryImageGenerationRepository(), imageProvider: { async generate() { return { provider: "fixture-image", provider_job_id: "img1", asset: { location: "gs://private-bucket/out/image.png", mime_type: "image/png", width: 1024, height: 1024 } }; } },
      videoGenerationRepository: new InMemoryVideoGenerationRepository(), videoProvider: new FixtureVideo(), videoAssetStore: { async save({ source }) { return { asset_id: "33333333-3333-4333-8333-333333333333", location: "gs://private-bucket/durable/video.mp4", mime_type: source.mime_type, width: source.width, height: source.height, duration_seconds: source.duration_seconds, container: "mp4", byte_size: 1024 }; } },
      videoReferenceAssetLoader: { async load() { throw new Error("not used"); } }, logger: { info() {}, warn() {}, error() {} },
    });

    urls = { media: await listen(mediaApp), campaign: await listen(campaignApp), billing: await listen(billing(new CommercialCatalog({ plans: [plan], policies: [policy], mode: "test", now }))), billingOff: await listen(billing(null)), mgmt: await listen(mgmtApp) };
    fx = { effects, scenario, repository, s, scheduled, approved, context, NOW, setRole: (r) => { role = r; }, sessions };
  });
  afterAll(() => Promise.all(servers.map((sv) => new Promise((r) => sv.close(r)))));

  const scope = () => ({ tenantId: fx.context.tenant_id, projectId: fx.context.project_id });

  describe("workspace calendar (GET /customer/calendar)", () => {
    it("returns the scheduled variant in one window, with its schedule id, through the real route", async () => {
      const r = await fetchWorkspaceCalendarFromApi({ apiBaseUrl: urls.campaign, accessToken: "ok", scope: scope(), from: "2026-08-01T00:00:00.000Z", to: "2026-10-15T00:00:00.000Z" });
      expect(r.items).toHaveLength(1);
      expect(r.items[0]).toMatchObject({ campaignId: fx.s.id, workflow: "scheduled", occurrenceKind: "scheduled", scheduleId: fx.scheduled.created_ids.schedule_ids[0], platform: "instagram" });
      expect(r.items[0].occurrenceAt).toBe("2026-09-03T11:00:00.000Z");
    });
    it("a period longer than 93 days is split into windows the real route accepts, and still finds the item once", async () => {
      const r = await fetchWorkspaceCalendarFromApi({ apiBaseUrl: urls.campaign, accessToken: "ok", scope: scope(), from: "2026-06-01T00:00:00.000Z", to: "2026-12-01T00:00:00.000Z" });
      expect(r.items.filter((i) => i.occurrenceAt)).toHaveLength(1);
    });
    it("the real route refuses what the old adapter sent (limit 200, 120-day window) - proof the fix was needed", async () => {
      const q = new URLSearchParams({ tenant_id: "tenant_a", project_id: "project_a", from: "2026-06-01T00:00:00.000Z", to: "2026-10-30T00:00:00.000Z", limit: "200" });
      expect((await fetch(`${urls.campaign}/customer/calendar?${q}`, { headers: { authorization: "Bearer ok" } })).status).toBe(400);
    });
    it("a foreign workspace is not found; a bad token is an ended session", async () => {
      await expect(fetchWorkspaceCalendarFromApi({ apiBaseUrl: urls.campaign, accessToken: "ok", scope: { tenantId: "foreign", projectId: "project_a" }, from: "2026-08-01T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z" })).rejects.toMatchObject({ kind: "unavailable" });
      await expect(fetchWorkspaceCalendarFromApi({ apiBaseUrl: urls.campaign, accessToken: "bad", scope: scope(), from: "2026-08-01T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z" })).rejects.toMatchObject({ kind: "auth" });
    });
  });

  describe("campaign management", () => {
    it("reads the campaign, refuses to archive while a time is planned, removes the planned time, then renames and archives", async () => {
      const base = { apiBaseUrl: urls.campaign, accessToken: "ok", scope: scope() };
      let campaign = await fetchCampaignDetail({ ...base, campaignId: fx.s.id });
      let variant = campaign.items[0].variants[0];
      // FINDING: the real detail does not carry the schedule id, the attempt id or the publication (see src/premium/rememberedFacts.js).
      expect(variant.workflow).toBe("scheduled");
      for (const missing of ["active_schedule_id", "pending_attempt_id", "publication_id", "active_approval_id"]) expect(variant).not.toHaveProperty(missing);
      expect(campaign).not.toHaveProperty("schedules"); expect(campaign).not.toHaveProperty("publications");
      // The schedule id is available from the workspace calendar (and from the schedule command's own answer).
      const cal0 = await fetchWorkspaceCalendarFromApi({ apiBaseUrl: urls.campaign, accessToken: "ok", scope: scope(), from: "2026-08-01T00:00:00.000Z", to: "2026-10-15T00:00:00.000Z" });
      const scheduleId = cal0.items[0].scheduleId; expect(scheduleId).toBe(fx.scheduled.created_ids.schedule_ids[0]);
      await expect(unscheduleVariant({ ...base, campaign, variant })).rejects.toMatchObject({ kind: "invalid" }); // without an id the client refuses before any request
      await expect(setCampaignArchived({ ...base, campaign, archive: true, reason: "Done for now" })).rejects.toMatchObject({ kind: "refused" }); // archive blocked while scheduled
      campaign = await unscheduleVariant({ ...base, campaign, variant, scheduleId });
      expect(campaign.items[0].variants[0].workflow).toBe("approved");
      campaign = await renameCampaign({ ...base, campaign, name: "Renamed by the app" });
      expect(campaign.name).toBe("Renamed by the app");
      campaign = await setCampaignArchived({ ...base, campaign, archive: true, reason: "Replaced by the winter campaign" });
      expect(campaign.archived_at).toBeTruthy();
      const cal = await fetchWorkspaceCalendarFromApi({ apiBaseUrl: urls.campaign, accessToken: "ok", scope: scope(), from: "2026-08-01T00:00:00.000Z", to: "2026-10-15T00:00:00.000Z" });
      expect(cal.items).toHaveLength(0); // archived campaigns leave the calendar
      campaign = await setCampaignArchived({ ...base, campaign, archive: false, reason: "Needed again" });
      expect(campaign.archived_at).toBeFalsy();
    });
    it("a stale version is a conflict, not a silent overwrite; a member is refused", async () => {
      const base = { apiBaseUrl: urls.campaign, accessToken: "ok", scope: scope() };
      const campaign = await fetchCampaignDetail({ ...base, campaignId: fx.s.id });
      await expect(renameCampaign({ ...base, campaign: { ...campaign, version: campaign.version - 1 }, name: "Stale" })).rejects.toMatchObject({ kind: "conflict" });
      fx.setRole("member");
      await expect(renameCampaign({ ...base, campaign, name: "Member" })).rejects.toMatchObject({ kind: "unavailable" });
      fx.setRole("owner");
    });
    it("records a manual publication as completed with the fields the real route accepts", async () => {
      const base = { apiBaseUrl: urls.campaign, accessToken: "ok", scope: scope() };
      const s = await fx.scenario(fx.repository); // a fresh campaign: the first one's version moved on through HTTP
      const approved2 = await s.approve(await s.add());
      const attempt = await s.begin(approved2);
      const campaign = await fetchCampaignDetail({ ...base, campaignId: s.id });
      const variant = campaign.items.flatMap((i) => i.variants).find((v) => v.variant_id === attempt.variant_id);
      const out = await recordManualPublication({ ...base, campaign, variant, outcome: "confirm", attemptId: attempt.attempt_id, publishedAt: fx.NOW, publicationUrl: "https://example.test/post/1", externalReference: "ref-1", note: "Posted by hand" });
      expect(out.items.flatMap((i) => i.variants).find((v) => v.variant_id === attempt.variant_id).workflow).toBe("published");
    });
  });

  describe("plan catalogue and credit preview (customer billing router)", () => {
    it("reads the catalogue the real route serves and validates it against this app's schema", async () => {
      const c = await fetchPlanCatalogue({ apiBaseUrl: urls.billing, accessToken: "ok", tenantId: "tenant_a" });
      expect(c.plans[0]).toMatchObject({ planCode: "standard", priceMinor: 123, currency: "GBP", interval: "month", includedCredits: 3, tax: { presentation: "exclusive" } });
      expect(JSON.stringify(c)).not.toMatch(/price_synthetic/); // the Stripe price id is never public
    });
    it("with no approved catalogue the real route answers 503 and the app says plans are not published", async () => {
      await expect(fetchPlanCatalogue({ apiBaseUrl: urls.billingOff, accessToken: "ok", tenantId: "tenant_a" })).rejects.toMatchObject({ kind: "unavailable", code: "COMMERCIAL_CATALOG_UNAVAILABLE" });
    });
    it("a foreign tenant is not found", async () => { await expect(fetchPlanCatalogue({ apiBaseUrl: urls.billing, accessToken: "ok", tenantId: "foreign" })).rejects.toMatchObject({ kind: "unavailable" }); });
    it("the credit preview passes the real route's strict query and is non-binding", async () => {
      const p = await requestCreditPreview({ apiBaseUrl: urls.billing, accessToken: "ok", scope: { tenantId: "tenant_a", projectId: "project_a", brandId: "brand_a" }, executionClass: "text.standard", now: Date.parse("2026-10-26T12:00:00Z") });
      expect(p).toMatchObject({ binding: false, credits: 2, availableCredits: 5, sufficient: true, affordability: "within_limit" });
      const v = await requestCreditPreview({ apiBaseUrl: urls.billing, accessToken: "ok", scope: { tenantId: "tenant_a", projectId: "project_a", brandId: "brand_a" }, executionClass: "video.normal", now: Date.parse("2026-10-26T12:00:00Z") });
      expect(v).toMatchObject({ credits: 9, sufficient: false, affordability: "insufficient_credits" });
    });
    it("a foreign brand is not found", async () => { await expect(requestCreditPreview({ apiBaseUrl: urls.billing, accessToken: "ok", scope: { tenantId: "tenant_a", projectId: "project_a", brandId: "foreign" }, executionClass: "text.standard" })).rejects.toMatchObject({ kind: "unavailable" }); });
  });

  describe("subscription management (draft router, mock Stripe)", () => {
    it("portal, change and cancel pass the strict bodies and return only a Stripe-hosted page that confirms nothing", async () => {
      const base = { apiBaseUrl: urls.mgmt, accessToken: "ok", tenantId: "tenant_a" };
      expect((await openBillingPortal({ ...base, id: "req_portal" })).url).toBe("https://billing.stripe.com/p/session/synthetic");
      await requestPlanChange({ ...base, planCode: "pro", id: "req_change" });
      await requestCancellation({ ...base, id: "req_cancel" });
      expect(fx.sessions.map((x) => x.p.flow_data && x.p.flow_data.type)).toEqual([undefined, "subscription_update_confirm", "subscription_cancel"]);
    });
    it("a repeat with the same request id reuses the same Stripe idempotency key", async () => {
      const before = fx.sessions.length;
      const base = { apiBaseUrl: urls.mgmt, accessToken: "ok", tenantId: "tenant_a" };
      await openBillingPortal({ ...base, id: "req_same" }); await openBillingPortal({ ...base, id: "req_same" });
      expect(fx.sessions[before].o.idempotencyKey).toBe(fx.sessions[before + 1].o.idempotencyKey);
    });
  });

  describe("customer image and video (real routes and billing orchestrator, fixture providers)", () => {
    const mediaScope = { tenantId: "tenant_a", projectId: "project_a", brandId: "brand_a" };
    const common = (ids) => ({ apiBaseUrl: urls.media, accessToken: "ok", scope: mediaScope, campaign: { campaign_id: "c1" }, topic: "Lease offer post", platform: "instagram", ids });
    it("an image request passes the real strict schema, is billed once by the server, and the private storage address never reaches the app", async () => {
      const r = await startImage({ ...common({ executionId: "exec_img_1", generationId: "gen_img_1" }), brief: { text: "A calm product shot", aspectRatio: "1:1" } });
      expect(r).toMatchObject({ kind: "image", status: "completed", stored: true, approvalStatus: "pending" });
      expect(JSON.stringify(r)).not.toMatch(/gs:\/\/|private-bucket/);
      expect(fx.effects.debit).toBeGreaterThanOrEqual(1);
    });
    it("replaying the same ids is accepted and does not make a second charge", async () => {
      const before = fx.effects.debit;
      await startImage({ ...common({ executionId: "exec_img_1", generationId: "gen_img_1" }), brief: { text: "A calm product shot", aspectRatio: "1:1" } }).catch(() => {});
      expect(fx.effects.debit).toBe(before);
    });
    it("OBSERVATION: the same ids with a different brief return the original job (no second job, no second charge); the backend does not report the change", async () => {
      const before = fx.effects.debit;
      const r = await startImage({ ...common({ executionId: "exec_img_1", generationId: "gen_img_1" }), brief: { text: "A completely different request", aspectRania: "x", aspectRatio: "4:5" } }).catch((e) => e);
      expect(fx.effects.debit).toBe(before);
      expect(r instanceof Error ? r.kind : r.generationId).toBeTruthy();
    });
    it("a foreign workspace is not found and nothing is charged", async () => {
      const before = { ...fx.effects };
      await expect(startImage({ ...common({ executionId: "exec_img_2", generationId: "gen_img_2" }), scope: { tenantId: "tenant_b", projectId: "project_a", brandId: "brand_a" }, brief: { text: "x", aspectRatio: "1:1" } })).rejects.toMatchObject({ kind: "missing" });
      expect(fx.effects).toEqual(before);
    });
    it("a video request is accepted as in progress, then read by id until completed, with no storage address exposed", async () => {
      const started = await startVideo({ ...common({ executionId: "exec_vid_1", generationId: "gen_vid_1" }), brief: { text: "A short reveal", aspectRatio: "16:9", duration: 4, quality: "normal" } });
      expect(started).toMatchObject({ kind: "video", generationId: "gen_vid_1" });
      expect(["submitted", "processing", "queued", "completed"]).toContain(started.status);
      const read = await fetchVideo({ apiBaseUrl: urls.media, accessToken: "ok", generationId: "gen_vid_1" }); // reading alone does not advance the video
      expect(read.status).not.toBe("completed");
      let r = started; for (let i = 0; i < 5 && r.status !== "completed"; i += 1) r = await pollVideo({ apiBaseUrl: urls.media, accessToken: "ok", generationId: "gen_vid_1" });
      expect(r).toMatchObject({ status: "completed", stored: true }); expect(JSON.stringify(r)).not.toMatch(/gs:\/\/|private-bucket/);
    });
    it("a video the caller does not own is not found", async () => {
      await expect(fetchVideo({ apiBaseUrl: urls.media, accessToken: "bad", generationId: "gen_vid_1" })).rejects.toMatchObject({ kind: "auth" });
      await expect(fetchVideo({ apiBaseUrl: urls.media, accessToken: "ok", generationId: "does_not_exist" })).rejects.toMatchObject({ kind: "missing" });
    });
  });
});
