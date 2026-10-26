// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { CatalogueError, fetchPlanCatalogue, formatMoney, isPlanCatalogueApiEnabled, normaliseCatalogue } from "./planCatalogueClient";

// MOCKED CONTRACT TESTS. GET /billing/plans does not exist and no approved pricing source has been found. Every figure below is a
// TEST FIXTURE chosen to prove formatting and validation; none is a real, approved or proposed price.
const PLAN = (over = {}) => ({ plan_code: "alpha", name: "Fixture Alpha", tier: 1, summary: "Fixture summary", price: { amount_minor: 1234, currency: "GBP", interval: "month" }, included_credits: 17, additional_usage: { text: "Fixture additional-usage rule." }, trial: null, renewal: { text: "Fixture renewal rule." }, cancellation: { text: "Fixture cancellation rule." }, refund: { text: "Fixture refund rule." }, current: false, ...over });
const CAT = (over = {}) => ({ catalogue_version: "fx-1", effective_from: "2026-11-01T00:00:00.000Z", currency: "GBP", vat: { treatment: "inclusive", text: "Fixture VAT statement." }, terms: { version: "terms-fx-1", effective_from: "2026-11-01T00:00:00.000Z", url: "https://example.test/terms" }, support: { email: "support@example.test", hours: "Fixture hours" }, plans: [PLAN({ plan_code: "beta", name: "Fixture Beta", tier: 2, price: { amount_minor: 5600, currency: "GBP", interval: "month" } }), PLAN()], ...over });

describe("catalogue validation fails closed", () => {
  it("accepts a complete catalogue, orders plans by tier and keeps the server's words", () => {
    const c = normaliseCatalogue(CAT());
    expect(c.plans.map((p) => p.planCode)).toEqual(["alpha", "beta"]); expect(c.vat).toEqual({ treatment: "inclusive", text: "Fixture VAT statement." });
    expect(c.terms).toEqual({ version: "terms-fx-1", effectiveFrom: "2026-11-01T00:00:00.000Z", url: "https://example.test/terms" }); expect(c.plans[0].refund).toBe("Fixture refund rule.");
  });
  it.each([
    ["no catalogue version", { catalogue_version: "" }], ["no effective date", { effective_from: "x" }], ["bad currency", { currency: "pounds" }], ["no VAT treatment", { vat: { text: "x" } }], ["unknown VAT treatment", { vat: { treatment: "maybe", text: "x" } }],
    ["no terms version", { terms: { version: "", effective_from: "2026-11-01T00:00:00Z", url: "https://example.test/t" } }], ["terms link not https", { terms: { version: "v", effective_from: "2026-11-01T00:00:00Z", url: "http://example.test/t" } }],
    ["no support contact", { support: { hours: "9-5" } }], ["no plans", { plans: [] }], ["not an object", null],
  ])("shows nothing when there is %s", (_l, over) => { expect(() => normaliseCatalogue(over === null ? null : CAT(over))).toThrow(CatalogueError); });
  it.each([
    ["a plan with no name", { name: "" }], ["a fractional price", { price: { amount_minor: 12.5, currency: "GBP", interval: "month" } }], ["a price in another currency", { price: { amount_minor: 1, currency: "USD", interval: "month" } }],
    ["an unknown billing frequency", { price: { amount_minor: 1, currency: "GBP", interval: "fortnight" } }], ["missing included credits", { included_credits: -1 }], ["no refund terms", { refund: null }],
    ["no cancellation terms", { cancellation: { text: " " } }], ["no renewal terms", { renewal: undefined }], ["no additional-usage rule", { additional_usage: null }], ["a malformed trial", { trial: { days: "7" } }],
    ["a bad plan code", { plan_code: "Has Space" }],
  ])("shows nothing when there is %s", (_l, over) => { expect(() => normaliseCatalogue(CAT({ plans: [PLAN(over)] }))).toThrow(/cannot be shown right now/i); });
  it("rejects duplicate plan codes", () => { expect(() => normaliseCatalogue(CAT({ plans: [PLAN(), PLAN()] }))).toThrow(CatalogueError); });
  it("keeps a trial only when the server stated one, with its conditions", () => {
    expect(normaliseCatalogue(CAT({ plans: [PLAN({ trial: { days: 14, conditions: "Fixture trial rule." } })] })).plans[0].trial).toEqual({ days: 14, conditions: "Fixture trial rule." });
    expect(normaliseCatalogue(CAT()).plans[0].trial).toBeNull();
  });
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
    expect(f.mock.calls[0][0]).toBe("http://api.test/billing/plans?tenant_id=t1"); expect(f.mock.calls[0][1].headers.authorization).toBe("Bearer tok"); expect(c.version).toBe("fx-1");
  });
  it.each([[401, "auth"], [403, "unavailable"], [404, "unavailable"], [500, "error"], [503, "error"]])("status %s is a typed error, never an empty catalogue", async (status, kind) => {
    await expect(fetchPlanCatalogue({ apiBaseUrl: "x", accessToken: "t", tenantId: "t1", fetchImpl: vi.fn().mockResolvedValue({ ok: false, status, json: async () => ({}) }) })).rejects.toMatchObject({ kind });
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
