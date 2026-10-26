// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { BILLING_UNAVAILABLE_TEXT, CREDITS_UNAVAILABLE_TEXT, EXECUTION_CLASSES, QuoteError, describeGenerateRefusal, isGenerationQuoteApiEnabled, normaliseQuote, quoteFields, quoteKey, requestGenerationQuote } from "./generationQuoteClient";

// MOCKED CONTRACT TESTS: POST /customer/generation-quotes does not exist in the backend yet. Values are TEST fixtures, not prices.
const NOW = Date.parse("2026-10-26T12:00:00.000Z");
const Q = (over = {}) => ({ quote_id: "q-1", execution_class: "text.standard", credits: 7, kind: "fixed", max_credits: null, available_credits: 30, sufficient: true, expires_at: "2026-10-26T12:10:00.000Z", policy_version: "policy-v1", ...over });
const SCOPE = { tenantId: "t1", projectId: "p1" }; const CAMP = { campaign_id: "c1", version: 4 }; const VAR = { variant_id: "v1" };
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const ask = (r, over = {}) => requestGenerationQuote({ apiBaseUrl: "http://api.test", accessToken: "tok", scope: SCOPE, campaign: CAMP, variant: VAR, fetchImpl: vi.fn().mockResolvedValue(r), ...over });

describe("quote normalisation fails closed", () => {
  it("accepts a complete quote and reports the authorised maximum", () => {
    expect(normaliseQuote(Q(), NOW)).toMatchObject({ quoteId: "q-1", credits: 7, kind: "fixed", authorisedCredits: 7, availableCredits: 30, sufficient: true, expired: false });
    expect(normaliseQuote(Q({ kind: "estimate", credits: 5, max_credits: 9 }), NOW)).toMatchObject({ kind: "estimate", credits: 5, maxCredits: 9, authorisedCredits: 9 });
  });
  it.each([
    ["not an object", null], ["no quote id", Q({ quote_id: "" })], ["unknown execution class", Q({ execution_class: "audio.fast" })], ["negative credits", Q({ credits: -1 })], ["fractional credits", Q({ credits: 1.5 })],
    ["unknown kind", Q({ kind: "approx" })], ["maximum below the price", Q({ max_credits: 3 })], ["an estimate with no maximum", Q({ kind: "estimate" })], ["bad balance", Q({ available_credits: "30" })],
    ["no sufficiency", Q({ sufficient: undefined })], ["bad expiry", Q({ expires_at: "soon" })], ["no policy version", Q({ policy_version: "" })],
  ])("refuses %s", (_label, body) => { expect(() => normaliseQuote(body, NOW)).toThrow(QuoteError); });
  it("never claims more credits than the numbers allow, even if the server says 'sufficient'", () => {
    expect(normaliseQuote(Q({ credits: 7, available_credits: 5, sufficient: true }), NOW).sufficient).toBe(false);
    expect(normaliseQuote(Q({ kind: "estimate", credits: 5, max_credits: 9, available_credits: 8, sufficient: true }), NOW).sufficient).toBe(false); // the MAXIMUM must be covered
    expect(normaliseQuote(Q({ available_credits: null, sufficient: true }), NOW).sufficient).toBe(true);
    expect(normaliseQuote(Q({ sufficient: false }), NOW).sufficient).toBe(false);
  });
  it("marks an expired quote", () => { expect(normaliseQuote(Q({ expires_at: "2026-10-26T11:59:59.000Z" }), NOW).expired).toBe(true); });
});

describe("requesting a quote", () => {
  it("is off unless the build says the backend has the endpoint", () => {
    expect(isGenerationQuoteApiEnabled({})).toBe(false); expect(isGenerationQuoteApiEnabled({ VITE_GENERATION_QUOTE_API: "1" })).toBe(false); expect(isGenerationQuoteApiEnabled({ VITE_GENERATION_QUOTE_API: "true" })).toBe(true);
  });
  it("POSTs the scope, campaign, version and class with a compliant key; it contains no price and no amount from the browser", async () => {
    const f = vi.fn().mockResolvedValue(res(201, Q()));
    const q = await requestGenerationQuote({ apiBaseUrl: "http://api.test", accessToken: "tok", scope: SCOPE, campaign: CAMP, variant: VAR, executionClass: "image.normal", executionMode: "ai", fetchImpl: f });
    const [url, o] = f.mock.calls[0]; const b = JSON.parse(o.body);
    expect(url).toBe("http://api.test/customer/generation-quotes"); expect(o.method).toBe("POST"); expect(o.headers.authorization).toBe("Bearer tok");
    expect(b).toMatchObject({ tenant_id: "t1", project_id: "p1", campaign_id: "c1", variant_id: "v1", expected_campaign_version: 4, execution_class: "image.normal", execution_mode: "ai", supplied_assets: [] });
    expect(b.idempotency_key).toMatch(/^(?=.{1,128}$)[A-Za-z0-9][A-Za-z0-9._:-]*$/);
    expect(Object.keys(b).some((k) => /credit|price|amount|cost/i.test(k))).toBe(false);
    expect(q.credits).toBe(7);
  });
  it("the same request reuses its key; a different class or version does not", async () => {
    expect(await quoteKey(CAMP, VAR, "text.standard", "ai")).toBe(await quoteKey(CAMP, VAR, "text.standard", "ai"));
    expect(await quoteKey(CAMP, VAR, "text.standard", "ai")).not.toBe(await quoteKey(CAMP, VAR, "image.normal", "ai"));
    expect(await quoteKey(CAMP, VAR, "text.standard", "ai")).not.toBe(await quoteKey({ ...CAMP, version: 5 }, VAR, "text.standard", "ai"));
  });
  it("refuses a class it cannot price before any request", async () => {
    const f = vi.fn(); await expect(requestGenerationQuote({ apiBaseUrl: "x", accessToken: "t", scope: SCOPE, campaign: CAMP, variant: VAR, executionClass: "audio.fast", fetchImpl: f })).rejects.toMatchObject({ kind: "invalid" }); expect(f).not.toHaveBeenCalled();
  });
  it.each([
    [401, "AUTHENTICATION_REQUIRED", "auth", /session has ended.*nothing was started or charged/i],
    [403, "", "unavailable", /not available to you any more/i], [404, "RESOURCE_NOT_AVAILABLE", "unavailable", /not available to you any more/i],
    [409, "VERSION_CONFLICT", "conflict", /campaign changed.*nothing was started or charged/i],
    [503, "GENERATION_BILLING_UNAVAILABLE", "unavailable", new RegExp(BILLING_UNAVAILABLE_TEXT.slice(0, 30))],
    [500, "", "error", /could not be checked yet.*nothing was started or charged/i],
  ])("status %s %s says nothing was charged", async (status, code, kind, text) => {
    const r = ask(res(status, { error: { code } }));
    await expect(r).rejects.toMatchObject({ kind }); await expect(ask(res(status, { error: { code } }))).rejects.toThrow(text);
  });
  it("a dropped connection and a malformed 'success' are errors, never a price", async () => {
    await expect(ask(null, { fetchImpl: vi.fn().mockRejectedValue(new Error("offline")) })).rejects.toMatchObject({ kind: "network" });
    await expect(ask(res(201, { quote_id: "q" }))).rejects.toMatchObject({ kind: "invalid" });
  });
});

describe("what the generate request carries and how refusals read", () => {
  it("carries the quote id and the maximum authorised spend only when a quote was confirmed", () => {
    expect(quoteFields(null)).toEqual({}); expect(quoteFields(normaliseQuote(Q({ kind: "estimate", credits: 5, max_credits: 9 }), NOW))).toEqual({ quote_id: "q-1", max_credits: 9 });
  });
  it("explains 402, 503, expired and changed quotes, and says nothing was charged", () => {
    expect(describeGenerateRefusal(402, "GENERATION_CREDITS_UNAVAILABLE")).toEqual({ kind: "insufficient", text: CREDITS_UNAVAILABLE_TEXT });
    expect(describeGenerateRefusal(503, "GENERATION_BILLING_UNAVAILABLE").kind).toBe("billing_unavailable");
    expect(describeGenerateRefusal(409, "QUOTE_EXPIRED").text).toMatch(/expired.*nothing was charged/i);
    expect(describeGenerateRefusal(409, "QUOTE_CHANGED").text).toMatch(/price changed.*nothing was started or charged/i);
    expect(describeGenerateRefusal(500, "")).toBeNull();
    expect(EXECUTION_CLASSES).toEqual(["text.standard", "image.normal", "image.premium", "video.normal", "video.premium"]);
  });
});

describe("quoteFields never sends quote fields for a read-only preview (the backend's generate body is strict)", () => {
  it("adds nothing for a preview or no quote, and the ids for a real quote", async () => {
    const { quoteFields } = await import("./generationQuoteClient");
    expect(quoteFields(null)).toEqual({}); expect(quoteFields({ binding: false, quoteId: null, authorisedCredits: null })).toEqual({});
    expect(quoteFields({ quoteId: "q1", authorisedCredits: 5 })).toEqual({ quote_id: "q1", max_credits: 5 });
  });
});

