// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { PreviewError, isCreditPreviewApiEnabled, normalisePreview, requestCreditPreview } from "./creditPreviewClient";

// MOCKED CONTRACT TESTS against `execution-cost-preview.v1` (backend draft bizgenie-api PR #216 f8d81bf). Fixture numbers are not prices.
const NOW = Date.parse("2026-10-26T12:00:00Z"); const scope = { tenantId: "t1", projectId: "p1", brandId: "b1" };
const body = (o = {}) => ({ contract_version: "execution-cost-preview.v1", tenant_id: "t1", project_id: "p1", brand_id: "b1", execution_class: "text.standard", credit_cost: 3, policy_id: "pol", entitlement_id: "ent", available_credits: 10, spend_cap: Number.MAX_SAFE_INTEGER, affordability: "within_limit", observed_at: "2026-10-26T11:59:30Z", expires_at: "2026-10-26T12:00:30Z", reserved: false, execution_authorized: false, confirmation_supported: false, ...o });
const reply = (status, b) => vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => b }));
const run = (f, o = {}) => requestCreditPreview({ apiBaseUrl: "http://api.test", accessToken: "tok", scope, fetchImpl: f, now: NOW, ...o });

describe("gate", () => { it.each([[undefined, false], ["yes", false], ["true", true]])("%s -> %s", (v, e) => expect(isCreditPreviewApiEnabled({ VITE_CREDIT_PREVIEW_API: v })).toBe(e)); });
describe("request", () => {
  it("sends scope, class and the largest spend cap the contract accepts, with the bearer token", async () => {
    const f = reply(200, body()); await run(f);
    const u = new URL(f.mock.calls[0][0]);
    expect(u.pathname).toBe("/customer/billing/credit-preview"); expect(Object.fromEntries(u.searchParams)).toEqual({ tenant_id: "t1", project_id: "p1", brand_id: "b1", execution_class: "text.standard", spend_cap: String(Number.MAX_SAFE_INTEGER) });
    expect(f.mock.calls[0][1].headers.authorization).toBe("Bearer tok");
  });
  it("needs a brand: no request without one", async () => { const f = vi.fn(); await expect(run(f, { scope: { tenantId: "t", projectId: "p" } })).rejects.toMatchObject({ kind: "invalid" }); expect(f).not.toHaveBeenCalled(); });
});
describe("normalisation is honest that this is not a quote", () => {
  it("returns a non-binding, id-less price", () => { const p = normalisePreview(body(), { executionClass: "text.standard", ...scope }, NOW); expect(p).toMatchObject({ binding: false, quoteId: null, authorisedCredits: null, credits: 3, availableCredits: 10, sufficient: true }); });
  it.each([["insufficient_credits", false], ["spend_cap_exceeded", false], ["within_limit", true]])("%s -> sufficient %s", (a, ok) => { expect(normalisePreview(body({ affordability: a }), { executionClass: "text.standard", ...scope }, NOW).sufficient).toBe(ok); });
  it.each([
    ["claims it reserved credits", { reserved: true }], ["claims execution is authorised", { execution_authorized: true }], ["claims confirmation is supported", { confirmation_supported: true }],
    ["wrong contract version", { contract_version: "x" }], ["other execution class", { execution_class: "video.normal" }], ["other tenant", { tenant_id: "t2" }], ["other brand", { brand_id: "b2" }],
    ["fractional cost", { credit_cost: 1.5 }], ["negative balance", { available_credits: -1 }], ["unknown affordability", { affordability: "maybe" }], ["no expiry", { expires_at: "x" }],
  ])("refuses a preview that %s", (_l, over) => { expect(() => normalisePreview(body(over), { executionClass: "text.standard", ...scope }, NOW)).toThrow(PreviewError); });
  it("refuses one that has already expired", () => { expect(() => normalisePreview(body({ expires_at: "2026-10-26T11:59:00Z" }), { executionClass: "text.standard", ...scope }, NOW)).toThrow(/out of date/); });
});
describe("errors", () => {
  it.each([[401, "auth", /session has ended/], [404, "unavailable", /not available to you/], [503, "unavailable", /Credits cannot be checked/], [500, "error", /could not be checked yet/]])("%s", async (s, kind, text) => { await expect(run(reply(s, {}))).rejects.toMatchObject({ kind, message: expect.stringMatching(text) }); });
  it("a dropped connection says nothing was started", async () => { await expect(run(vi.fn().mockRejectedValue(new Error("x")))).rejects.toThrow(/Nothing was started or charged/); });
});
