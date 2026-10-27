// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { InsightsError, isAnalyticsApiEnabled, makeInsightsApi } from "./insightsClient";

// FIXTURE tests of the adapter against the #220 /customer/insights routes; qa/integration/learning runs the same client over real HTTP against the backend.
const scope = { tenantId: "t1", projectId: "p1", brandId: "b1" };
const reply = (status, body) => vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }));
const api = (f) => makeInsightsApi({ apiBaseUrl: "http://a", fetchImpl: f });

describe("insights api", () => {
  it.each([[undefined, false], ["1", false], ["true", true]])("gate %s -> %s", (v, e) => expect(isAnalyticsApiEnabled({ VITE_ANALYTICS_API: v })).toBe(e));
  it("refresh posts only the scope to /snapshots; recommendations post the three ids; feedback posts the exact backend body with the scope", async () => {
    const f = reply(200, { snapshot_id: "s" }); await api(f).refreshSnapshot({ accessToken: "t", scope });
    expect(f.mock.calls[0][0]).toBe("http://a/customer/insights/snapshots"); expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ tenant_id: "t1", project_id: "p1", brand_id: "b1" });
    const g = reply(200, {}); await api(g).createRecommendation({ accessToken: "t", scope, snapshotId: "s", previousId: "a", currentId: "b" }); expect(JSON.parse(g.mock.calls[0][1].body)).toEqual({ tenant_id: "t1", project_id: "p1", brand_id: "b1", snapshot_id: "s", previous_id: "a", current_id: "b" });
    const h = reply(200, {}); await api(h).sendFeedback({ accessToken: "t", scope, body: { recommendation_id: "r", decision: "accepted", expected_version: 0, idempotency_key: "k" } });
    expect(JSON.parse(h.mock.calls[0][1].body)).toEqual({ tenant_id: "t1", project_id: "p1", brand_id: "b1", recommendation_id: "r", decision: "accepted", expected_version: 0, idempotency_key: "k" });
  });
  it("lists every page with the scope and bearer, refuses a truncated list, and a malformed body", async () => {
    const f = vi.fn().mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ recommendations: [{ a: 1 }], next_cursor: "n" }) }).mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ recommendations: [{ a: 2 }], next_cursor: null }) });
    expect(await api(f).fetchRecommendations({ accessToken: "tk", scope })).toEqual([{ a: 1 }, { a: 2 }]); expect(f.mock.calls[0][0]).toContain("/customer/insights/recommendations?tenant_id=t1&project_id=p1&brand_id=b1&limit=50"); expect(f.mock.calls[1][0]).toContain("cursor=n"); expect(f.mock.calls[0][1].headers.authorization).toBe("Bearer tk");
    await expect(api(reply(200, { recommendations: [], next_cursor: "more" })).fetchRecommendations({ accessToken: "t", scope, maxPages: 2 })).rejects.toBeInstanceOf(InsightsError);
    await expect(api(reply(200, {})).fetchRecommendations({ accessToken: "t", scope })).rejects.toMatchObject({ code: "BAD_RESPONSE" });
  });
  it.each([[401, {}, "auth"], [404, { error: { code: "RESOURCE_NOT_AVAILABLE" } }, "forbidden"], [503, { error: { code: "LEARNING_UNAVAILABLE" } }, "unavailable"], [409, { error: { code: "EVIDENCE_UNAVAILABLE" } }, "evidence"], [409, { error: { code: "VERSION_CONFLICT" } }, "conflict"], [409, { error: { code: "IDEMPOTENCY_KEY_CONFLICT" } }, "key_conflict"], [500, {}, "unconfirmed"], [503, {}, "unconfirmed"]])("write %s %j -> %s", async (s, b, kind) => {
    await expect(api(reply(s, b)).sendFeedback({ accessToken: "t", scope, body: {} })).rejects.toMatchObject({ kind });
  });
  it("a read that fails is a read error, not 'unconfirmed'; a lost connection on a write never says 'nothing happened'", async () => {
    await expect(api(reply(503, {})).fetchRecommendations({ accessToken: "t", scope })).rejects.toMatchObject({ kind: "unavailable" });
    const lost = vi.fn().mockRejectedValue(new Error("x")); const e = await api(lost).sendFeedback({ accessToken: "t", scope, body: {} }).catch((x) => x); expect(e.kind).toBe("unconfirmed"); expect(e.message).not.toMatch(/Nothing was/);
    await expect(api(lost).fetchRecommendations({ accessToken: "t", scope })).rejects.toMatchObject({ kind: "network" });
  });
});
