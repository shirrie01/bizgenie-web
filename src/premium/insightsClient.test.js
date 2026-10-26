// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { InsightsError, SOURCE_LABEL, decideInsight, fetchInsights, fetchResults, isAnalyticsApiEnabled, normaliseInsights, normaliseResults } from "./insightsClient";

// FIXTURE TESTS for a PROPOSED contract. The backend stores only customer attestations; no number here is real or measured.
const scope = { tenantId: "t1", projectId: "p1", brandId: "b1" };
const reply = (status, body) => vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }));
const metric = (o = {}) => ({ metric: "clicks", value: 12, unit: "count", observed_at: "2026-10-20T00:00:00Z", source: "customer_entered", method: null, fresh_as_of: "2026-10-21T00:00:00Z", ...o });
const insight = (o = {}) => ({ insight_id: "i1", statement: "FIXTURE: shorter posts got more clicks.", confidence: "low", status: "proposed", generated_by: "ai", created_at: "2026-10-22T00:00:00Z", evidence: [{ source: "customer_entered", metric: "clicks", period_from: "2026-10-01T00:00:00Z", period_to: "2026-10-20T00:00:00Z", sample_size: 3 }], ...o });

describe("gate and labels", () => { it.each([[undefined, false], ["true", true]])("%s -> %s", (v, e) => expect(isAnalyticsApiEnabled({ VITE_ANALYTICS_API: v })).toBe(e)); it("has four distinct labels", () => expect(new Set(Object.values(SOURCE_LABEL)).size).toBe(4)); });
describe("results never show an unlabelled number", () => {
  it("keeps only metrics with a known source, in newest-first order, and counts the rest", () => {
    const r = normaliseResults({ contract_version: "campaign-results.v1", metrics: [metric(), metric({ metric: "reach", observed_at: "2026-10-22T00:00:00Z", source: "platform_measured" }), metric({ source: "magic" }), metric({ source: undefined }), metric({ value: -1 }), metric({ metric: "vibes" })] });
    expect(r.metrics.map((m) => m.source)).toEqual(["platform_measured", "customer_entered"]); expect(r.skipped).toBe(4);
  });
  it("refuses the wrong contract", () => { expect(() => normaliseResults({ contract_version: "x", metrics: [] })).toThrow(InsightsError); expect(() => normaliseResults(null)).toThrow(); });
  it("requests by campaign with scope", async () => { const f = reply(200, { contract_version: "campaign-results.v1", metrics: [] }); await fetchResults({ apiBaseUrl: "http://a", accessToken: "t", scope, campaignId: "c 1", fetchImpl: f }); expect(f.mock.calls[0][0]).toBe("http://a/customer/campaigns/c%201/results?tenant_id=t1&project_id=p1"); });
});
describe("insights need evidence and an AI origin", () => {
  it("shows a suggestion only with usable evidence", () => {
    const r = normaliseInsights({ contract_version: "learning-insights.v1", insights: [insight(), insight({ insight_id: "i2", evidence: [] }), insight({ insight_id: "i3", evidence: [{ source: "platform_measured", metric: "clicks", period_from: "x", period_to: "y", sample_size: 3 }] }), insight({ insight_id: "i4", generated_by: "system" }), insight({ insight_id: "i5", confidence: "certain" })] });
    expect(r.insights.map((i) => i.id)).toEqual(["i1"]); expect(r.skipped).toBe(4); expect(r.insights[0].evidence[0]).toMatchObject({ sampleSize: 3 });
  });
  it.each([[401, "auth"], [404, "unavailable"], [503, "unavailable"], [500, "error"]])("status %s", async (s, kind) => { await expect(fetchInsights({ apiBaseUrl: "h", accessToken: "t", scope, fetchImpl: reply(s, {}) })).rejects.toMatchObject({ kind }); });
});
describe("decisions", () => {
  it("sends a decision with a request id and accepts only the matching confirmation", async () => {
    const f = reply(200, { insight_id: "i1", status: "accepted" }); expect(await decideInsight({ apiBaseUrl: "h", accessToken: "t", scope, insightId: "i1", decision: "accept", id: "r1", fetchImpl: f })).toEqual({ insightId: "i1", status: "accepted" });
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ tenant_id: "t1", decision: "accept", request_id: "r1" });
    await expect(decideInsight({ apiBaseUrl: "h", accessToken: "t", scope, insightId: "i1", decision: "accept", fetchImpl: reply(200, { insight_id: "i1", status: "rejected" }) })).rejects.toMatchObject({ kind: "unconfirmed" });
  });
  it("explains owner-only, already decided and lost responses", async () => {
    await expect(decideInsight({ apiBaseUrl: "h", accessToken: "t", scope, insightId: "i1", decision: "reject", fetchImpl: reply(404, {}) })).rejects.toMatchObject({ kind: "forbidden" });
    await expect(decideInsight({ apiBaseUrl: "h", accessToken: "t", scope, insightId: "i1", decision: "reject", fetchImpl: reply(409, {}) })).rejects.toMatchObject({ kind: "conflict" });
    await expect(decideInsight({ apiBaseUrl: "h", accessToken: "t", scope, insightId: "i1", decision: "reject", fetchImpl: vi.fn().mockRejectedValue(new Error("x")) })).rejects.toMatchObject({ kind: "unconfirmed" });
    await expect(decideInsight({ apiBaseUrl: "h", accessToken: "t", scope, insightId: "i1", decision: "maybe", fetchImpl: vi.fn() })).rejects.toMatchObject({ kind: "invalid" });
  });
});
