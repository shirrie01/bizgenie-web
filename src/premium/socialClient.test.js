// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { SocialError, disconnect, fetchAccounts, fetchQueue, isSocialApiEnabled, normaliseAccounts, normaliseQueue, startConnect } from "./socialClient";

// FIXTURE TESTS for a PROPOSED contract. The backend has no social module; nothing here proves any real connection.
const scope = { tenantId: "t1", projectId: "p1", brandId: "b1" };
const reply = (status, body) => vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }));
const acct = (o = {}) => ({ account_id: "a1", provider: "instagram", display_name: "Test Account", status: "connected", scopes_granted: ["publish"], connected_at: "2026-10-01T00:00:00Z", token_expires_at: "2026-12-01T00:00:00Z", last_verified_at: "2026-10-25T00:00:00Z", ...o });
const item = (o = {}) => ({ publication_id: "pub1", campaign_id: "c1", variant_id: "v1", account_id: "a1", scheduled_for: "2026-11-01T10:00:00Z", status: "published", attempts: 1, last_error_code: null, platform_post_url: "https://example.test/post/1", verified_by: "platform", ...o });

describe("gate", () => { it.each([[undefined, false], ["1", false], ["true", true]])("%s -> %s", (v, e) => expect(isSocialApiEnabled({ VITE_SOCIAL_ACCOUNTS_API: v })).toBe(e)); });
describe("accounts", () => {
  it("accepts well-formed accounts and counts unreadable ones instead of hiding them", () => {
    const r = normaliseAccounts({ contract_version: "social-accounts.v1", accounts: [acct(), acct({ account_id: "a2", provider: "myspace" }), { account_id: "a3" }] });
    expect(r.accounts).toHaveLength(1); expect(r.skipped).toBe(2); expect(r.accounts[0]).toMatchObject({ provider: "instagram", status: "connected", tokenExpiresAt: "2026-12-01T00:00:00Z" });
  });
  it.each([[null], [{ contract_version: "x", accounts: [] }], [{ contract_version: "social-accounts.v1" }]])("refuses %j", (b) => expect(() => normaliseAccounts(b)).toThrow(SocialError));
  it("requests with scope and bearer", async () => { const f = reply(200, { contract_version: "social-accounts.v1", accounts: [] }); await fetchAccounts({ apiBaseUrl: "http://a", accessToken: "tk", scope, fetchImpl: f }); expect(f.mock.calls[0][0]).toBe("http://a/customer/social-accounts?tenant_id=t1&project_id=p1&brand_id=b1"); expect(f.mock.calls[0][1].headers.authorization).toBe("Bearer tk"); });
  it.each([[401, "auth"], [404, "unavailable"], [503, "unavailable"], [500, "error"]])("status %s is a typed error, not an empty list", async (s, kind) => { await expect(fetchAccounts({ apiBaseUrl: "h", accessToken: "t", scope, fetchImpl: reply(s, {}) })).rejects.toMatchObject({ kind }); });
});
describe("publishing queue", () => {
  it("platform-verified only when the platform said so and gave an https post", () => {
    const r = normaliseQueue({ contract_version: "publishing-queue.v1", items: [item(), item({ publication_id: "p2", verified_by: null }), item({ publication_id: "p3", platform_post_url: "http://x.test" }), item({ publication_id: "p4", status: "failed", last_error_code: "TOKEN_EXPIRED", platform_post_url: null, verified_by: null }), item({ publication_id: "p5", status: "weird" })], next_cursor: "n" });
    expect(r.items.map((i) => [i.id, i.platformVerified])).toEqual([["pub1", true], ["p2", false], ["p3", false], ["p4", false]]); expect(r.items[3].errorCode).toBe("TOKEN_EXPIRED"); expect(r.skipped).toBe(1); expect(r.nextCursor).toBe("n");
  });
  it("a failed or unverified item never exposes a post link", () => { const r = normaliseQueue({ contract_version: "publishing-queue.v1", items: [item({ verified_by: null })] }); expect(r.items[0].postUrl).toBe(""); });
});
describe("connect and disconnect", () => {
  it("connect sends provider and a request id, and only follows an https sign-in url", async () => {
    const f = reply(201, { authorize_url: "https://provider.example.test/oauth", state_expires_at: "2026-10-26T12:10:00Z" });
    expect((await startConnect({ apiBaseUrl: "http://a", accessToken: "t", scope, provider: "linkedin", id: "r1", fetchImpl: f })).url).toBe("https://provider.example.test/oauth");
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ tenant_id: "t1", project_id: "p1", brand_id: "b1", provider: "linkedin", request_id: "r1" });
    await expect(startConnect({ apiBaseUrl: "h", accessToken: "t", scope, provider: "linkedin", fetchImpl: reply(201, { authorize_url: "http://insecure.test" }) })).rejects.toMatchObject({ kind: "invalid" });
    await expect(startConnect({ apiBaseUrl: "h", accessToken: "t", scope, provider: "myspace", fetchImpl: vi.fn() })).rejects.toMatchObject({ kind: "invalid" });
  });
  it("owner-only, conflicts and lost responses are explained honestly", async () => {
    await expect(disconnect({ apiBaseUrl: "h", accessToken: "t", scope, accountId: "a1", fetchImpl: reply(404, {}) })).rejects.toMatchObject({ kind: "forbidden" });
    await expect(disconnect({ apiBaseUrl: "h", accessToken: "t", scope, accountId: "a1", fetchImpl: reply(409, {}) })).rejects.toMatchObject({ kind: "conflict" });
    await expect(disconnect({ apiBaseUrl: "h", accessToken: "t", scope, accountId: "a1", fetchImpl: vi.fn().mockRejectedValue(new Error("x")) })).rejects.toMatchObject({ kind: "unconfirmed" });
    await expect(disconnect({ apiBaseUrl: "h", accessToken: "t", scope, accountId: "a1", fetchImpl: reply(200, { status: "ok" }) })).rejects.toMatchObject({ kind: "unconfirmed" });
    expect(await disconnect({ apiBaseUrl: "h", accessToken: "t", scope, accountId: "a1", fetchImpl: reply(200, { account_id: "a1", status: "revoked" }) })).toEqual({ accountId: "a1" });
  });
});
