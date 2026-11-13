// @vitest-environment node
// BG-WEB-LAUNCH-CLOSURE-18: a feature that is not deployed (a 404 with no API error code, as for an unmounted route) must never be reported as the customer's access being
// removed; a real authorisation refusal (a 404 that carries an API error code) keeps its access wording. Fixtures are local; no network.
import { describe, expect, it, vi } from "vitest";
import { NOT_DEPLOYED_CODE, NOT_DEPLOYED_TEXT, looksNotDeployed } from "./routeAbsent";
import { cancelGenerationQuote, fetchQuoteStatus, requestGenerationQuote } from "./generationQuoteClient";
import { fetchCreativeJobs } from "./creativeJobsClient";
import { fetchAssets } from "./mediaIntakeClient";
import { fetchConnections, fetchDispatches } from "./socialClient";
import { makeInsightsApi } from "./insightsClient";
import { fetchWorkspaceCalendarFromApi } from "./workspaceCalendarApiClient";
import { fetchPlanCatalogue } from "./planCatalogueClient";
import { requestCreditPreview } from "./creditPreviewClient";
import { fetchInvoices } from "./billingManagementClient";

const scope = { tenantId: "t1", projectId: "p1", brandId: "b1" };
const base = { apiBaseUrl: "http://a", accessToken: "t" };
const html404 = () => vi.fn(async () => ({ ok: false, status: 404, headers: new Headers(), json: async () => { throw new SyntaxError("Unexpected token < in JSON"); } }));
const coded404 = (code = "RESOURCE_NOT_AVAILABLE") => vi.fn(async () => ({ ok: false, status: 404, headers: new Headers(), json: async () => ({ error: { code } }) }));
const blaming = /not available to you|only the workspace owner|no longer available|any more/i;
const request = { tenant_id: "t1", project_id: "p1", brand_id: "b1", campaign_id: "22222222-2222-4222-8222-222222222222", variant_id: "33333333-3333-4333-8333-333333333333", expected_campaign_version: 1, execution_class: "text.standard", execution_mode: "ai" };
const quote = { quoteId: "11111111-1111-4111-8111-111111111111" };

const calls = {
  "quote request": (f) => requestGenerationQuote({ ...base, request, nonce: "n1", fetchImpl: f }),
  "quote status": (f) => fetchQuoteStatus({ ...base, quoteId: quote.quoteId, fetchImpl: f }),
  "quote cancel": (f) => cancelGenerationQuote({ ...base, quoteId: quote.quoteId, fetchImpl: f }),
  "creative jobs": (f) => fetchCreativeJobs({ ...base, scope, fetchImpl: f }),
  "media intake": (f) => fetchAssets({ ...base, scope, fetchImpl: f }),
  "social connections": (f) => fetchConnections({ ...base, scope, fetchImpl: f }),
  "social dispatches": (f) => fetchDispatches({ ...base, scope, fetchImpl: f }),
  "insights": (f) => makeInsightsApi({ apiBaseUrl: "http://a", fetchImpl: f }).fetchRecommendations({ accessToken: "t", scope }),
  "workspace calendar": (f) => fetchWorkspaceCalendarFromApi({ ...base, scope, from: "2026-12-01T00:00:00Z", to: "2026-12-08T00:00:00Z", fetchImpl: f }),
  "plan catalogue": (f) => fetchPlanCatalogue({ ...base, tenantId: "t1", fetchImpl: f }),
  "credit preview": (f) => requestCreditPreview({ ...base, scope, fetchImpl: f }),
  "invoices": (f) => fetchInvoices({ ...base, tenantId: "t1", fetchImpl: f }),
};

describe("looksNotDeployed", () => {
  it("only a 404 without an API error code qualifies", () => {
    expect(looksNotDeployed(404, null)).toBe(true); expect(looksNotDeployed(404, {})).toBe(true); expect(looksNotDeployed(404, { error: {} })).toBe(true); expect(looksNotDeployed(404, { error: { code: "" } })).toBe(true);
    expect(looksNotDeployed(404, { error: { code: "RESOURCE_NOT_AVAILABLE" } })).toBe(false);
    for (const s of [200, 401, 403, 500, 503]) expect(looksNotDeployed(s, null)).toBe(false);
  });
});

describe.each(Object.entries(calls))("%s", (_name, run) => {
  it("a route that is not deployed (uncoded 404) says so, with a stable code, and never mentions access, ownership or removal", async () => {
    const e = await run(html404()).then(() => null, (x) => x);
    expect(e, "must throw").toBeTruthy();
    expect(e.code).toBe(NOT_DEPLOYED_CODE); expect(e.kind).toBe("unavailable"); expect(e.status).toBe(404);
    expect(e.message).not.toMatch(blaming);
    expect(e.message).toMatch(/isn't available in this version yet|not available in this version yet/i);
  });
  it("a genuine authorisation refusal (coded 404) keeps its access wording and is NOT reported as not deployed", async () => {
    const e = await run(coded404()).then(() => null, (x) => x);
    expect(e, "must throw").toBeTruthy();
    expect(e.code).not.toBe(NOT_DEPLOYED_CODE); expect(e.message).not.toBe(NOT_DEPLOYED_TEXT);
  });
});

describe("what a deployed-but-disabled service says is unchanged", () => {
  it("503 stays a temporary/not-switched-on message, not an access message", async () => {
    const f = vi.fn(async () => ({ ok: false, status: 503, headers: new Headers(), json: async () => ({ error: { code: "GENERATION_BILLING_UNAVAILABLE" } }) }));
    const e = await calls["quote status"](f).then(() => null, (x) => x);
    expect(e.kind === "unavailable" || e.kind === "uncertain").toBe(true); expect(e.message).not.toMatch(/access|owner|removed/i);
  });
});
