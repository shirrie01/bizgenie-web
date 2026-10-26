// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { CatalogueError, fetchPlanCatalogue, formatMoney, isPlanCatalogueApiEnabled, normaliseCatalogue, planLabel } from "./planCatalogueClient";

// MOCKED CONTRACT TESTS against `commercial-catalog.v1` (backend draft, bizgenie-api PR #216 f8d81bf). No approved pricing source exists; every figure
// below is a TEST FIXTURE chosen to prove formatting and validation, not a real, approved or proposed price.
const PLAN = (over = {}) => ({ plan_code: "standard", plan_version: 1, amount_minor: 1234, currency: "GBP", billing_cadence: "month", tax: { presentation: "inclusive", jurisdiction: "Fixtureland", wording: "Fixture tax wording." }, credit_grant_cadence: "month", included_credits: 17, policy_id: "pol-fx", entitlement_codes: ["generation"], effective_from: "2026-01-01T00:00:00.000Z", effective_to: null, terms: { version: "terms-fx-1", url: "https://example.test/terms", cancellation_url: "https://example.test/cancel", refund_url: "https://example.test/refund" }, approval: { decision: "DEC-FX", source: "https://example.test/decision", approved_at: "2026-01-01T00:00:00.000Z" }, ...over });
const CAT = (over = {}) => ({ contract_version: "commercial-catalog.v1", plans: [PLAN(), PLAN({ plan_code: "pro", amount_minor: 5600, included_credits: 99 })], ...over });

describe("catalogue validation fails closed", () => {
  it("accepts a complete catalogue, orders plans by price and keeps the server's words and links", () => {
    const c = normaliseCatalogue(CAT());
    expect(c.plans.map((p) => p.planCode)).toEqual(["standard", "pro"]);
    expect(c.plans[0]).toMatchObject({ name: "Standard", priceMinor: 1234, interval: "month", includedCredits: 17, tax: { presentation: "inclusive", jurisdiction: "Fixtureland", wording: "Fixture tax wording." }, terms: { cancellationUrl: "https://example.test/cancel", refundUrl: "https://example.test/refund" } });
  });
  it.each([["no contract version", { contract_version: undefined }], ["a different contract version", { contract_version: "commercial-catalog.v2" }], ["no plans", { plans: [] }], ["not an object", null]])("shows nothing when there is %s", (_l, over) => { expect(() => normaliseCatalogue(over === null ? null : CAT(over))).toThrow(CatalogueError); });
  it.each([
    ["a fractional price", { amount_minor: 12.5 }], ["a negative price", { amount_minor: -1 }], ["a bad currency", { currency: "pounds" }], ["an unknown cadence", { billing_cadence: "fortnight" }],
    ["no tax statement", { tax: undefined }], ["unknown tax presentation", { tax: { presentation: "none", jurisdiction: "x", wording: "x" } }], ["blank tax wording", { tax: { presentation: "inclusive", jurisdiction: "x", wording: " " } }],
    ["a credit grant that is not monthly", { credit_grant_cadence: "year" }], ["missing included credits", { included_credits: undefined }],
    ["terms link not https", { terms: { version: "v", url: "http://example.test/t", cancellation_url: "https://e.test/c", refund_url: "https://e.test/r" } }],
    ["no cancellation link", { terms: { version: "v", url: "https://e.test/t", cancellation_url: "", refund_url: "https://e.test/r" } }], ["no refund link", { terms: { version: "v", url: "https://e.test/t", cancellation_url: "https://e.test/c" } }],
    ["no approval record", { approval: undefined }], ["approval source not https", { approval: { decision: "d", source: "http://x.test", approved_at: "2026-01-01T00:00:00Z" } }],
    ["a bad effective date", { effective_from: "soon" }], ["no entitlement codes", { entitlement_codes: [] }], ["a bad plan code", { plan_code: "Has Space" }], ["a bad plan version", { plan_version: 0 }],
  ])("shows nothing when there is %s", (_l, over) => { expect(() => normaliseCatalogue(CAT({ plans: [PLAN(over)] }))).toThrow(/cannot be shown right now/i); });
  it("rejects duplicate plan codes", () => { expect(() => normaliseCatalogue(CAT({ plans: [PLAN(), PLAN()] }))).toThrow(CatalogueError); });
  it("derives a label from the plan code only, never inventing a marketing name", () => { expect(planLabel("pro")).toBe("Pro"); expect(planLabel("")).toBe("Plan"); });
});

describe("money and fetching", () => {
  it("formats minor units in the server's currency using that currency's own decimals", () => {
    expect(formatMoney(1234, "GBP")).toBe("£12.34"); expect(formatMoney(5600, "GBP")).toBe("£56.00"); expect(formatMoney(1200, "JPY")).toBe("JP¥1,200"); expect(formatMoney(0, "GBP")).toBe("£0.00");
  });
  it("is off unless the build says the backend has the endpoint", () => {
    expect(isPlanCatalogueApiEnabled({})).toBe(false); expect(isPlanCatalogueApiEnabled({ VITE_PLAN_CATALOGUE_API: "true" })).toBe(true);
  });
  it("sends the workspace and a bearer token, and returns the validated catalogue", async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => CAT() });
    const c = await fetchPlanCatalogue({ apiBaseUrl: "http://api.test", accessToken: "tok", tenantId: "t1", fetchImpl: f });
    expect(f.mock.calls[0][0]).toBe("http://api.test/customer/billing/plans?tenant_id=t1"); expect(f.mock.calls[0][1].headers.authorization).toBe("Bearer tok"); expect(c.version).toBe("commercial-catalog.v1");
  });
  it.each([[401, "auth"], [403, "unavailable"], [404, "unavailable"], [500, "error"], [503, "unavailable"]])("status %s is a typed error, never an empty catalogue", async (status, kind) => {
    await expect(fetchPlanCatalogue({ apiBaseUrl: "x", accessToken: "t", tenantId: "t1", fetchImpl: vi.fn().mockResolvedValue({ ok: false, status, json: async () => ({}) }) })).rejects.toMatchObject({ kind });
  });
  it("503 says approved plans are not published, rather than showing an empty or invented list", async () => {
    await expect(fetchPlanCatalogue({ apiBaseUrl: "x", accessToken: "t", tenantId: "t1", fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ status: "unavailable", error: { code: "COMMERCIAL_CATALOG_UNAVAILABLE" } }) }) })).rejects.toThrow(/not been published yet/i);
  });
  it("a dropped connection and an invalid body are errors that say nothing is charged", async () => {
    await expect(fetchPlanCatalogue({ apiBaseUrl: "x", accessToken: "t", tenantId: "t1", fetchImpl: vi.fn().mockRejectedValue(new Error("x")) })).rejects.toThrow(/nothing is charged/i);
    await expect(fetchPlanCatalogue({ apiBaseUrl: "x", accessToken: "t", tenantId: "t1", fetchImpl: vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ plans: [] }) }) })).rejects.toMatchObject({ kind: "invalid" });
  });
});

describe("no commercial figure is written in the application source", () => {
  it("contains no currency amount, price, per-month figure or credit allowance outside tests and fixtures", async () => {
    const fs = await import("node:fs"); const path = await import("node:path");
    const root = path.resolve(__dirname, ".."); const hits = [];
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => { const f = path.join(d, e.name); if (e.isDirectory()) return walk(f); if (!/\.(jsx?|css)$/.test(e.name) || /\.test\./.test(e.name) || /\.stories\./.test(e.name) || f.includes("studio-preview") || e.name === "Founding100Panel.jsx") return; /* its options are the lead's own business revenue bands, not BizGenie prices */ const t = fs.readFileSync(f, "utf8"); for (const re of [/[£$€]\s?\d/, /\b\d+\s?(?:p|pence)\s?(?:\/|per)\s?(?:mo|month)/i, /\bper (?:month|year)\b.{0,40}\d/i, /\b\d+\s+credits? (?:each|per|a) month/i]) if (re.test(t)) hits.push(`${path.relative(root, f)}: ${re}`); });
    walk(root);
    expect(hits).toEqual([]);
  });
});
