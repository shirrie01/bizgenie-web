// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { CONTRACT_VERSION, QuoteError, buildQuoteRequest, cancelGenerationQuote, confirmGenerationQuote, confirmKey, describeGenerateRefusal, fetchQuoteStatus, isGenerationQuoteApiEnabled, newNonce, normaliseQuote, quoteKey, requestFingerprint, requestGenerationQuote } from "./generationQuoteClient";

// MOCKED CONTRACT TESTS against `generation-quote.v1` (bizgenie-api PR #217, 23f4903). Fixture numbers are not prices. The same shapes are exercised
// against the real PostgreSQL-backed router in qa/integration/quoteConfirm.integration.test.js.
const C = "11111111-1111-4111-8111-111111111111", V = "22222222-2222-4222-8222-222222222222", A1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", A2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", Q = "33333333-3333-4333-8333-333333333333";
const scope = { tenantId: "t1", projectId: "p1" }; const campaign = { campaign_id: C, version: 4 }; const variant = { variant_id: V };
const base = { scope, campaign, variant, executionClass: "image.normal", brief: "A calm product shot" };
const NOW = Date.parse("2026-10-26T12:00:00Z");
const body = (o = {}) => ({ contract_version: CONTRACT_VERSION, quote_id: Q, execution_class: "image.normal", credits: 3, kind: "fixed", max_credits: 3, available_credits: 10, sufficient: true, expires_at: "2026-10-26T12:01:00Z", policy_version: "pol:1", state: "quoted", ...o });
const reply = (status, b) => vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => b }));

describe("gate", () => { it.each([[undefined, false], ["1", false], ["true", true]])("%s -> %s", (v, e) => expect(isGenerationQuoteApiEnabled({ VITE_GENERATION_QUOTE_API: v })).toBe(e)); });

describe("buildQuoteRequest mirrors the backend's strict schema", () => {
  it("normalises assets (sorted, roles defaulted) and omits the key", () => {
    const r = buildQuoteRequest({ ...base, executionMode: "hybrid", suppliedAssets: [{ asset_id: A2 }, { asset_id: A1, role: "supporting" }] });
    expect(r).toEqual({ tenant_id: "t1", project_id: "p1", campaign_id: C, variant_id: V, expected_campaign_version: 4, execution_class: "image.normal", execution_mode: "hybrid", execution_brief: "A calm product shot", supplied_assets: [{ asset_id: A1, role: "supporting" }, { asset_id: A2, role: "primary" }] });
    expect(r).not.toHaveProperty("idempotency_key");
  });
  it.each([
    ["an unknown class", { executionClass: "image.premium" }], ["no brief for an image", { brief: "  " }], ["a brief over 4000", { brief: "x".repeat(4001) }], ["a bad campaign id", { campaign: { campaign_id: "nope", version: 4 } }],
    ["no campaign version", { campaign: { campaign_id: C } }], ["hybrid without media", { executionMode: "hybrid" }], ["media without hybrid", { suppliedAssets: [{ asset_id: A1 }] }],
    ["duplicate media", { executionMode: "hybrid", suppliedAssets: [{ asset_id: A1 }, { asset_id: A1 }] }], ["a non-uuid asset", { executionMode: "hybrid", suppliedAssets: [{ asset_id: "x" }] }],
    ["more than 10 assets", { executionMode: "hybrid", suppliedAssets: Array.from({ length: 11 }, (_, i) => ({ asset_id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}` })) }],
  ])("refuses %s before any request", (_l, over) => { expect(() => buildQuoteRequest({ ...base, ...over })).toThrow(QuoteError); });
  it("text needs no brief", () => { expect(buildQuoteRequest({ ...base, executionClass: "text.standard", brief: "" })).not.toHaveProperty("execution_brief"); });
});

describe("the idempotency key tracks the whole request", () => {
  it("the same request and nonce give the same key; a different brief or a new nonce does not", async () => {
    const a = buildQuoteRequest(base), b = buildQuoteRequest({ ...base, brief: "Something else" });
    const fa = await requestFingerprint(a); expect(fa).toBe(await requestFingerprint(buildQuoteRequest(base)));
    expect(quoteKey(fa, "n1")).toBe(quoteKey(fa, "n1")); expect(quoteKey(fa, "n1")).not.toBe(quoteKey(fa, "n2")); expect(quoteKey(await requestFingerprint(b), "n1")).not.toBe(quoteKey(fa, "n1"));
    expect(quoteKey(fa, newNonce())).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
  });
  it("a changed campaign version or class changes the fingerprint", async () => {
    const f = await requestFingerprint(buildQuoteRequest(base));
    expect(await requestFingerprint(buildQuoteRequest({ ...base, campaign: { ...campaign, version: 5 } }))).not.toBe(f); expect(await requestFingerprint(buildQuoteRequest({ ...base, executionClass: "video.normal" }))).not.toBe(f);
  });
  it("confirmation keys are fresh and valid", () => { expect(confirmKey()).not.toBe(confirmKey()); expect(confirmKey()).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/); });
});

describe("normaliseQuote fails closed", () => {
  it("accepts a complete fixed quote", () => { expect(normaliseQuote(body(), NOW)).toMatchObject({ binding: true, quoteId: Q, credits: 3, authorisedCredits: 3, availableCredits: 10, sufficient: true, expired: false, state: "quoted" }); });
  it("marks an expired quote", () => { expect(normaliseQuote(body({ expires_at: "2026-10-26T11:59:00Z" }), NOW).expired).toBe(true); });
  it("never calls a short balance sufficient, whatever the server flag says", () => { expect(normaliseQuote(body({ available_credits: 2, sufficient: true }), NOW).sufficient).toBe(false); });
  it.each([
    ["wrong version", { contract_version: "x" }], ["bad id", { quote_id: "q" }], ["unknown class", { execution_class: "image.premium" }], ["zero credits", { credits: 0, max_credits: 0 }], ["an estimate", { kind: "estimate" }],
    ["a maximum above the price", { max_credits: 9 }], ["fractional balance", { available_credits: 1.5 }], ["no sufficiency flag", { sufficient: undefined }], ["no expiry", { expires_at: "soon" }], ["no policy version", { policy_version: "" }], ["unknown state", { state: "paid" }],
  ])("shows no price for %s", (_l, over) => { expect(() => normaliseQuote(body(over), NOW)).toThrow(/could not be confirmed/); });
  it("shows no price for a non-object", () => { expect(() => normaliseQuote(null)).toThrow(QuoteError); });
});

describe("requestGenerationQuote", () => {
  it("posts the request with the derived key and bearer, and returns the validated quote", async () => {
    const f = reply(201, body()); const request = buildQuoteRequest(base);
    const q = await requestGenerationQuote({ apiBaseUrl: "http://api.test", accessToken: "tok", request, nonce: "n1", fetchImpl: f, now: NOW });
    expect(f.mock.calls[0][0]).toBe("http://api.test/customer/generation-quotes"); expect(f.mock.calls[0][1].headers.authorization).toBe("Bearer tok");
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ ...request, idempotency_key: quoteKey(await requestFingerprint(request), "n1") }); expect(q.quoteId).toBe(Q);
  });
  it.each([
    [401, {}, "auth"], [404, {}, "unavailable"], [402, {}, "insufficient"], [409, { error: { code: "VERSION_CONFLICT" } }, "conflict"], [409, { error: { code: "IDEMPOTENCY_KEY_CONFLICT" } }, "key_conflict"],
    [409, { error: { code: "PREVIEW_VERSION_UNAVAILABLE" } }, "unsupported"], [422, { error: { code: "OPERATION_UNSUPPORTED" } }, "unsupported"], [422, { error: { code: "CREATIVE_BRIEF_REQUIRED" } }, "invalid"],
    [400, { error: { code: "VALIDATION_ERROR" } }, "invalid"], [503, { error: { code: "QUOTE_UNAVAILABLE" } }, "unavailable"], [503, { error: { code: "GENERATION_BILLING_UNAVAILABLE" } }, "unavailable"], [500, {}, "error"],
  ])("status %s %j -> %s, and says nothing was charged", async (status, b, kind) => {
    await expect(requestGenerationQuote({ apiBaseUrl: "h", accessToken: "t", request: buildQuoteRequest(base), nonce: "n", fetchImpl: reply(status, b) })).rejects.toMatchObject({ kind, message: expect.stringMatching(/charged|Nothing|credits|Sign in|changed|expired|settings|Describe|already/i) });
  });
  it("a dropped connection while quoting is a plain network error (a quote costs nothing)", async () => { await expect(requestGenerationQuote({ apiBaseUrl: "h", accessToken: "t", request: buildQuoteRequest(base), nonce: "n", fetchImpl: vi.fn().mockRejectedValue(new Error("x")) })).rejects.toMatchObject({ kind: "network" }); });
});

describe("confirmGenerationQuote", () => {
  const quote = normaliseQuote(body(), NOW);
  it("sends the exact quoted maximum, explicit confirmation and the caller's key", async () => {
    const f = reply(202, { status: "queued", job_id: "quoted:abc", quote_id: Q, reserved_credits: 3, replay: false });
    const r = await confirmGenerationQuote({ apiBaseUrl: "http://api.test", accessToken: "tok", quote, key: "c:k1", fetchImpl: f });
    expect(f.mock.calls[0][0]).toBe(`http://api.test/customer/generation-quotes/${Q}/confirm`); expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ idempotency_key: "c:k1", max_credits: 3, confirmed: true });
    expect(r).toEqual({ jobId: "quoted:abc", quoteId: Q, reservedCredits: 3, status: "queued", replay: false });
  });
  it("refuses without a usable quote or a valid key, before any request", async () => {
    const f = vi.fn();
    await expect(confirmGenerationQuote({ apiBaseUrl: "h", accessToken: "t", quote: { ...quote, sufficient: false }, key: "c:k", fetchImpl: f })).rejects.toMatchObject({ kind: "invalid" });
    await expect(confirmGenerationQuote({ apiBaseUrl: "h", accessToken: "t", quote, key: "bad key!", fetchImpl: f })).rejects.toMatchObject({ kind: "invalid" }); expect(f).not.toHaveBeenCalled();
  });
  it("a lost connection or a server error after sending is UNCERTAIN, never 'not started'", async () => {
    await expect(confirmGenerationQuote({ apiBaseUrl: "h", accessToken: "t", quote, key: "c:k", fetchImpl: vi.fn().mockRejectedValue(new Error("x")) })).rejects.toMatchObject({ kind: "uncertain" });
    await expect(confirmGenerationQuote({ apiBaseUrl: "h", accessToken: "t", quote, key: "c:k", fetchImpl: reply(500, {}) })).rejects.toMatchObject({ kind: "uncertain" });
    await expect(confirmGenerationQuote({ apiBaseUrl: "h", accessToken: "t", quote, key: "c:k", fetchImpl: reply(503, {}) })).rejects.toMatchObject({ kind: "uncertain" });
  });
  it("a 202 that does not match the quote is uncertain, not accepted", async () => {
    await expect(confirmGenerationQuote({ apiBaseUrl: "h", accessToken: "t", quote, key: "c:k", fetchImpl: reply(202, { status: "queued", job_id: "j", quote_id: "other", reserved_credits: 3 }) })).rejects.toMatchObject({ kind: "uncertain" });
  });
  it.each([[409, "QUOTE_EXPIRED", "expired"], [409, "QUOTE_CHANGED", "changed"], [409, "QUOTE_CANCELLED", "cancelled"], [409, "IDEMPOTENCY_KEY_CONFLICT", "key_conflict"], [402, "GENERATION_CREDITS_UNAVAILABLE", "insufficient"], [404, "RESOURCE_NOT_AVAILABLE", "unavailable"]])("%s %s is %s", async (status, code, kind) => {
    await expect(confirmGenerationQuote({ apiBaseUrl: "h", accessToken: "t", quote, key: "c:k", fetchImpl: reply(status, { error: { code } }) })).rejects.toMatchObject({ kind });
  });
});

describe("status and cancel", () => {
  it("reads worker state without implying approval or publication", async () => {
    const f = reply(200, { quote_id: Q, job_id: "quoted:abc", state: "calling", execution_class: "image.normal", reserved_credits: 3, reservation_state: "held" });
    expect(await fetchQuoteStatus({ apiBaseUrl: "http://api.test", accessToken: "t", quoteId: Q, fetchImpl: f })).toEqual({ quoteId: Q, jobId: "quoted:abc", state: "calling", executionClass: "image.normal", reservedCredits: 3, reservation: "held" });
    expect(f.mock.calls[0][0]).toBe(`http://api.test/customer/generation-quotes/${Q}`);
  });
  it.each([null, { quote_id: "other", state: "queued", execution_class: "image.normal", reserved_credits: 0 }, { quote_id: Q, state: "approved", execution_class: "image.normal", reserved_credits: 0 }])("refuses an unreadable status %j", async (b) => { await expect(fetchQuoteStatus({ apiBaseUrl: "h", accessToken: "t", quoteId: Q, fetchImpl: reply(200, b) })).rejects.toMatchObject({ kind: "invalid" }); });
  it("cancel needs the exact 'cancelled, not charged' answer; a started job refuses", async () => {
    expect(await cancelGenerationQuote({ apiBaseUrl: "h", accessToken: "t", quoteId: Q, fetchImpl: reply(200, { quote_id: Q, status: "cancelled", charged: false }) })).toEqual({ quoteId: Q, charged: false });
    await expect(cancelGenerationQuote({ apiBaseUrl: "h", accessToken: "t", quoteId: Q, fetchImpl: reply(200, { quote_id: Q, status: "cancelled", charged: true }) })).rejects.toMatchObject({ kind: "uncertain" });
    await expect(cancelGenerationQuote({ apiBaseUrl: "h", accessToken: "t", quoteId: Q, fetchImpl: reply(409, { error: { code: "EXECUTION_ALREADY_STARTED" } }) })).rejects.toMatchObject({ kind: "started" });
  });
});

describe("legacy text-generate refusals", () => {
  it("explains 402 and billing outages", () => { expect(describeGenerateRefusal(402, "")).toMatchObject({ kind: "insufficient" }); expect(describeGenerateRefusal(503, "GENERATION_BILLING_UNAVAILABLE")).toMatchObject({ kind: "billing_unavailable" }); expect(describeGenerateRefusal(500, "")).toBeNull(); });
});
