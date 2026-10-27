// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { SocialError, cancelDispatch, completeConnect, disconnect, enqueueDispatch, fetchConnections, fetchDispatches, fetchPublishingCalendar, isSocialApiEnabled, newPkce, normaliseCalendar, normaliseConnections, normaliseDispatches, startConnect } from "./socialClient";

// FIXTURE tests of the adapter against the #218 /customer/social shapes; the same shapes are asserted against the real backend in qa/integration/backend218.
const scope = { tenantId: "t1", projectId: "p1", brandId: "b1" };
const reply = (status, body) => vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }));
const conn = (o = {}) => ({ connection_id: "c1", platform: "instagram", account_id: "acct", status: "active", expires_at: "2026-12-01T00:00:00Z", version: 1, ...o });
const dsp = (o = {}) => ({ dispatch_id: "d1", campaign_id: "k1", variant_id: "v1", revision_id: "r1", state: "published", scheduled_for: "2026-11-01T10:00:00Z", publication_id: "p", publication_url: "https://example.test/post/1", published_at: "2026-11-01T10:01:00Z", evidence_kind: "platform_api", ...o });

describe("gate", () => { it.each([[undefined, false], ["1", false], ["true", true]])("%s -> %s", (v, e) => expect(isSocialApiEnabled({ VITE_SOCIAL_ACCOUNTS_API: v })).toBe(e)); });
describe("connections", () => {
  it("accepts well-formed rows, maps backend status words, counts unreadable rows instead of hiding them", () => {
    const r = normaliseConnections({ connections: [conn(), conn({ connection_id: "c2", status: "expired" }), conn({ connection_id: "c3", platform: "myspace" }), { connection_id: "c4" }], next_cursor: "n" });
    expect(r.connections.map((c) => [c.id, c.status])).toEqual([["c1", "connected"], ["c2", "needs_reauth"]]); expect(r.skipped).toBe(2); expect(r.nextCursor).toBe("n");
  });
  it.each([[null], [{}], [{ connections: "x" }]])("refuses %j", (b) => expect(() => normaliseConnections(b)).toThrow(SocialError));
  it("requests the real route with scope and bearer", async () => { const f = reply(200, { connections: [], next_cursor: null }); await fetchConnections({ apiBaseUrl: "http://a", accessToken: "tk", scope, fetchImpl: f }); expect(f.mock.calls[0][0]).toBe("http://a/customer/social/connections?tenant_id=t1&project_id=p1&brand_id=b1"); expect(f.mock.calls[0][1].headers.authorization).toBe("Bearer tk"); });
  it.each([[401, "auth"], [404, "unavailable"], [503, "unavailable"], [500, "error"]])("status %s is a typed error, not an empty list", async (s, kind) => { await expect(fetchConnections({ apiBaseUrl: "h", accessToken: "t", scope, fetchImpl: reply(s, {}) })).rejects.toMatchObject({ kind }); });
});
describe("dispatches and calendar", () => {
  it("platform-verified only with state published, platform_api evidence and an https link", () => {
    const r = normaliseDispatches({ dispatches: [dsp(), dsp({ dispatch_id: "d2", evidence_kind: null }), dsp({ dispatch_id: "d3", publication_url: "http://x.test" }), dsp({ dispatch_id: "d4", state: "failed", publication_url: null, evidence_kind: null }), dsp({ dispatch_id: "d5", state: "weird" })], next_cursor: null });
    expect(r.items.map((i) => [i.id, i.platformVerified])).toEqual([["d1", true], ["d2", false], ["d3", false], ["d4", false]]); expect(r.skipped).toBe(1);
    expect(r.items[1].postUrl).toBe("");
  });
  it("calendar needs its contract version and a delivery_state per entry", () => {
    expect(() => normaliseCalendar({ contract_version: "x", entries: [] })).toThrow(SocialError);
    const r = normaliseCalendar({ contract_version: "publishing-calendar.v1", entries: [{ ...dsp(), delivery_state: "published" }, dsp({ dispatch_id: "d9" })], next_cursor: null });
    expect(r.entries).toHaveLength(1); expect(r.entries[0].deliveryState).toBe("published"); expect(r.skipped).toBe(1);
  });
  it("requests list and calendar routes", async () => {
    const f = reply(200, { dispatches: [], next_cursor: null }); await fetchDispatches({ apiBaseUrl: "http://a", accessToken: "t", scope, fetchImpl: f }); expect(f.mock.calls[0][0]).toBe("http://a/customer/social/dispatches?tenant_id=t1&project_id=p1&brand_id=b1");
    const g = reply(200, { contract_version: "publishing-calendar.v1", entries: [], next_cursor: null }); await fetchPublishingCalendar({ apiBaseUrl: "http://a", accessToken: "t", scope, from: "2026-11-01T00:00:00Z", to: "2026-11-30T00:00:00Z", fetchImpl: g });
    expect(g.mock.calls[0][0]).toContain("/customer/social/calendar?"); expect(g.mock.calls[0][0]).toContain("from=2026-11-01T00%3A00%3A00Z");
  });
  it("enqueue sends the backend's exact body with explicit publishing confirmation; cancel needs the cancelled state", async () => {
    const f = reply(200, dsp({ state: "queued", publication_url: null, evidence_kind: null }));
    const d = await enqueueDispatch({ apiBaseUrl: "http://a", accessToken: "t", scope, connectionId: "c1", campaignId: "k1", variantId: "v1", scheduleId: "s1", expectedCampaignVersion: 3, fetchImpl: f });
    expect(d.state).toBe("queued"); expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ tenant_id: "t1", project_id: "p1", brand_id: "b1", connection_id: "c1", campaign_id: "k1", variant_id: "v1", schedule_id: "s1", expected_campaign_version: 3, publishing_confirmed: true });
    await expect(cancelDispatch({ apiBaseUrl: "h", accessToken: "t", scope, dispatchId: "d1", fetchImpl: reply(200, dsp({ state: "queued", publication_url: null })) })).rejects.toMatchObject({ kind: "unconfirmed" });
    await expect(cancelDispatch({ apiBaseUrl: "h", accessToken: "t", scope, dispatchId: "d1", fetchImpl: reply(409, { error: { code: "PUBLICATION_ALREADY_STARTED" } }) })).rejects.toMatchObject({ kind: "conflict", code: "PUBLICATION_ALREADY_STARTED" });
  });
});
describe("connect", () => {
  it("PKCE challenge is base64url(sha256(verifier)) and has the length the backend requires", async () => {
    const { verifier, challenge } = await newPkce(); expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/); expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const { createHash } = await import("node:crypto"); expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
  });
  it("sends platform and challenge only (never the verifier), follows only an https authorize_url, and refuses honestly while the backend supplies none", async () => {
    const pkce = { verifier: "v".repeat(43), challenge: "c".repeat(43) };
    const ok = reply(200, { intent_id: "i1", state: "s".repeat(43), expires_at: "2026-10-27T12:05:00Z", authorize_url: "https://provider.example.test/oauth" });
    const r = await startConnect({ apiBaseUrl: "http://a", accessToken: "t", scope, provider: "instagram", pkce, fetchImpl: ok });
    expect(r.url).toBe("https://provider.example.test/oauth"); expect(r.pending).toMatchObject({ intentId: "i1", verifier: pkce.verifier, provider: "instagram" });
    expect(ok.mock.calls[0][0]).toBe("http://a/customer/social/oauth-intents"); expect(JSON.parse(ok.mock.calls[0][1].body)).toEqual({ tenant_id: "t1", project_id: "p1", brand_id: "b1", platform: "instagram", pkce_challenge: pkce.challenge }); expect(ok.mock.calls[0][1].body).not.toContain(pkce.verifier);
    const noUrl = reply(200, { intent_id: "i1", state: "s".repeat(43), expires_at: "2026-10-27T12:05:00Z" });
    await expect(startConnect({ apiBaseUrl: "h", accessToken: "t", scope, provider: "instagram", pkce, fetchImpl: noUrl })).rejects.toMatchObject({ kind: "unavailable", code: "AUTHORIZE_URL_MISSING" });
    await expect(startConnect({ apiBaseUrl: "h", accessToken: "t", scope, provider: "instagram", pkce, fetchImpl: reply(200, { intent_id: "i", state: "s".repeat(43), authorize_url: "http://insecure.test" }) })).rejects.toMatchObject({ code: "AUTHORIZE_URL_MISSING" });
    await expect(startConnect({ apiBaseUrl: "h", accessToken: "t", scope, provider: "myspace", fetchImpl: vi.fn() })).rejects.toMatchObject({ kind: "invalid" });
    await expect(startConnect({ apiBaseUrl: "h", accessToken: "t", scope, provider: "instagram", pkce, fetchImpl: reply(503, { error: { code: "SOCIAL_NOT_CONFIGURED" } }) })).rejects.toMatchObject({ kind: "unavailable" });
  });
  it("complete requires the state this browser started and sends intent, state, code and verifier", async () => {
    const pending = { intentId: "i1", state: "s1", verifier: "v".repeat(43), provider: "instagram" };
    await expect(completeConnect({ apiBaseUrl: "h", accessToken: "t", scope, pending, code: "abc", state: "other", fetchImpl: vi.fn() })).rejects.toMatchObject({ code: "STATE_MISMATCH" });
    await expect(completeConnect({ apiBaseUrl: "h", accessToken: "t", scope, pending: null, code: "abc", state: "s1", fetchImpl: vi.fn() })).rejects.toMatchObject({ code: "STATE_MISMATCH" });
    const f = reply(200, conn()); const c = await completeConnect({ apiBaseUrl: "http://a", accessToken: "t", scope, pending, code: "abc", state: "s1", fetchImpl: f });
    expect(c).toMatchObject({ id: "c1", status: "connected" }); expect(JSON.parse(f.mock.calls[0][1].body)).toMatchObject({ intent_id: "i1", state: "s1", code: "abc", code_verifier: pending.verifier });
    expect(f.mock.calls[0][0]).toBe("http://a/customer/social/oauth-complete");
  });
  it("disconnect: owner-only 404, lost response and wrong status are explained honestly", async () => {
    await expect(disconnect({ apiBaseUrl: "h", accessToken: "t", scope, connectionId: "c1", fetchImpl: reply(404, {}) })).rejects.toMatchObject({ kind: "forbidden" });
    await expect(disconnect({ apiBaseUrl: "h", accessToken: "t", scope, connectionId: "c1", fetchImpl: vi.fn().mockRejectedValue(new Error("x")) })).rejects.toMatchObject({ kind: "unconfirmed" });
    await expect(disconnect({ apiBaseUrl: "h", accessToken: "t", scope, connectionId: "c1", fetchImpl: reply(200, conn()) })).rejects.toMatchObject({ kind: "unconfirmed" });
    const f = reply(200, conn({ status: "revoked" })); expect(await disconnect({ apiBaseUrl: "http://a", accessToken: "t", scope, connectionId: "c1", fetchImpl: f })).toEqual({ connectionId: "c1" });
    expect(f.mock.calls[0][0]).toBe("http://a/customer/social/connections/c1/disconnect");
  });
});
