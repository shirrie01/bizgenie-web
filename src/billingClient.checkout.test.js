// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// BG-017C-05: one request_id per checkout intent, reused after an unclear outcome (MOCKED fetch; no network, no Stripe).
const ok = (body, status = 201) => ({ ok: status < 300, status, clone() { return this; }, json: async () => body });
const refused = (status, code) => ok({ error: { code } }, status);
const SESSION = { url: "https://checkout.stripe.test/c/pay/cs_test_1", checkout_session_id: "cs_test_1" };
const args = (o = {}) => ({ accessToken: "tok", tenantId: "tenant_a", planCode: "standard", ...o });
const ids = (fetchMock) => fetchMock.mock.calls.map(([, o]) => JSON.parse(o.body).request_id);
let client;
async function load() { vi.resetModules(); client = await import("./billingClient"); }
beforeEach(async () => { sessionStorage.clear(); vi.unstubAllEnvs(); await load(); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("checkout request id (same intent -> same id)", () => {
  it("sends exactly {tenant_id, plan_code, request_id}: no price, URL or user id", async () => {
    const f = vi.fn().mockResolvedValue(ok(SESSION)); vi.stubGlobal("fetch", f);
    await client.startStandardCheckout(args());
    const [url, o] = f.mock.calls[0]; expect(url).toMatch(/\/billing\/stripe\/checkout$/); expect(o.method).toBe("POST");
    expect(Object.keys(JSON.parse(o.body)).sort()).toEqual(["plan_code", "request_id", "tenant_id"]);
    expect(JSON.parse(o.body).request_id).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
  });
  it.each([["no answer (network failure/timeout)", () => Promise.reject(new TypeError("Failed to fetch"))], ["502", () => Promise.resolve(refused(502, "PRIVATE_API_UNAVAILABLE"))],
    ["504", () => Promise.resolve(refused(504, "STUDIO_BRIDGE_TIMEOUT"))], ["500", () => Promise.resolve(refused(500, "STRIPE_BILLING_INTERNAL_ERROR"))],
    ["429", () => Promise.resolve(refused(429, "BRIDGE_RATE_LIMITED"))], ["401 (sign-in ended)", () => Promise.resolve(refused(401, "AUTHENTICATION_REQUIRED"))],
    ["unreadable success body", () => Promise.resolve({ ok: true, status: 201, clone() { return this; }, json: async () => { throw new Error("bad json"); } })]])(
    "reuses the SAME id after %s, and a success afterwards ends the intent", async (_n, first) => {
      const f = vi.fn().mockImplementationOnce(first).mockResolvedValueOnce(ok(SESSION)).mockResolvedValueOnce(ok(SESSION)); vi.stubGlobal("fetch", f);
      await expect(client.startStandardCheckout(args())).rejects.toThrow();
      const r = await client.startStandardCheckout(args()); expect(r.url).toBe(SESSION.url);
      const [a, b] = ids(f); expect(b).toBe(a);
      await client.startStandardCheckout(args()); expect(ids(f)[2]).not.toBe(a); // resolved -> the next intent is new
    });
  it("keeps the id across a page refresh (new module instance, same tab storage)", async () => {
    const f = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue(ok(SESSION)); vi.stubGlobal("fetch", f);
    await expect(client.startStandardCheckout(args())).rejects.toThrow(); await load();
    await client.startStandardCheckout(args()); const [a, b] = ids(f); expect(b).toBe(a);
  });
  it("still reuses the id when sessionStorage is unavailable (memory copy)", async () => {
    const f = vi.fn().mockRejectedValueOnce(new TypeError("x")).mockResolvedValue(ok(SESSION)); vi.stubGlobal("fetch", f);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); }); vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    await expect(client.startStandardCheckout(args())).rejects.toThrow(); await client.startStandardCheckout(args()); const [a, b] = ids(f); expect(b).toBe(a); vi.restoreAllMocks();
  });
  it("a double click shares the running request: one POST, one id", async () => {
    let release; const f = vi.fn(() => new Promise((res) => { release = () => res(ok(SESSION)); })); vi.stubGlobal("fetch", f);
    const p1 = client.startStandardCheckout(args()), p2 = client.startStandardCheckout(args()); release(); await Promise.all([p1, p2]); expect(f).toHaveBeenCalledTimes(1);
  });
  it("a definitive refusal (400, 403 closed gate, 404) ends the intent: the next attempt is a new intent", async () => {
    for (const [status, code] of [[400, "STRIPE_BILLING_VALIDATION_ERROR"], [403, "STRIPE_CHECKOUT_DISABLED"], [404, "RESOURCE_NOT_AVAILABLE"]]) {
      sessionStorage.clear(); await load();
      const f = vi.fn().mockResolvedValueOnce(refused(status, code)).mockResolvedValueOnce(ok(SESSION)); vi.stubGlobal("fetch", f);
      await expect(client.startStandardCheckout(args())).rejects.toThrow(); await client.startStandardCheckout(args()); const [a, b] = ids(f); expect(b, String(status)).not.toBe(a);
    }
  });
  it("never shares an id across tenants or plans (cross-tenant), and each keeps its own", async () => {
    const f = vi.fn().mockRejectedValue(new TypeError("x")); vi.stubGlobal("fetch", f);
    for (const a of [args(), args({ tenantId: "tenant_b" }), args({ planCode: "pro" }), args()]) await expect(client.startStandardCheckout(a)).rejects.toThrow();
    const [a1, b, p, a2] = ids(f); expect(new Set([a1, b, p]).size).toBe(3); expect(a2).toBe(a1);
    expect(JSON.parse(f.mock.calls[1][1].body).tenant_id).toBe("tenant_b");
  });
  it("an id older than the retention window is replaced", async () => {
    const t0 = 1_000_000; const a = client.checkoutRequestIdFor("t", "standard", t0);
    expect(client.checkoutRequestIdFor("t", "standard", t0 + 60_000)).toBe(a); expect(client.checkoutRequestIdFor("t", "standard", t0 + 13 * 3600_000)).not.toBe(a);
  });
});

describe("checkout wording and the gate", () => {
  it("is truthful: an unclear outcome says it is unconfirmed, nothing shown as charged, and a retry will not double-charge", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const e = await client.startStandardCheckout(args()).catch((x) => x); expect(e.kind).toBe("ambiguous"); expect(e.message).toMatch(/couldn't confirm/i); expect(e.message).toMatch(/won't be charged twice/i); expect(e.message).not.toMatch(/failed to fetch|cloud run|iam|bridge/i);
  });
  it("closed bridge gate and expired sign-in are explained plainly", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(refused(403, "STRIPE_CHECKOUT_DISABLED")).mockResolvedValueOnce(refused(401, "AUTHENTICATION_REQUIRED")));
    expect((await client.startStandardCheckout(args()).catch((x) => x)).message).toBe("Subscribing isn't switched on in this test environment yet. Nothing was charged.");
    expect((await client.startStandardCheckout(args()).catch((x) => x)).message).toMatch(/Sign in again.*Nothing was charged/);
  });
  it("a bridge-marked build keeps the Studio gate OFF: no request at all", async () => {
    vi.stubEnv("VITE_API_ROUTE_LIMITS", "bridge-v1"); await load(); const f = vi.fn(); vi.stubGlobal("fetch", f);
    const e = await client.startStandardCheckout(args()).catch((x) => x); expect(e.kind).toBe("not_available_here"); expect(f).not.toHaveBeenCalled();
  });
  it("refuses an unsafe checkout URL as an unconfirmed outcome and keeps the id", async () => {
    const f = vi.fn().mockResolvedValueOnce(ok({ url: "http://evil.test/x", checkout_session_id: "cs" })).mockResolvedValueOnce(ok(SESSION)); vi.stubGlobal("fetch", f);
    await expect(client.startStandardCheckout(args())).rejects.toThrow(); await client.startStandardCheckout(args()); const [a, b] = ids(f); expect(b).toBe(a);
  });
});
