// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { MESSAGES, buildPayload, messageFor, readAttribution, sha256Hex, submitLead, validate } from "../assets/form-model.js";
import { validateLead } from "../dev/lead-stub.mjs";
import { CONSENT_CONTACT, CONSENT_MARKETING } from "../content.mjs";

const good = () => ({ name: "  Ada   Lovelace ", email: " Ada@Example.COM ", company: "Analytical Engines Ltd", industry: "agency", intention: "founding_customer", priorities: ["performance", "bogus"], notes: " hello ", contactConsent: true, marketingConsent: false });
const res = (status, body = {}, headers = {}) => ({ status, json: async () => body, headers: { get: (k) => headers[k.toLowerCase()] } });

describe("validate", () => {
  it("accepts a complete registration and normalises it", () => {
    const r = validate(good()); expect(r.ok).toBe(true);
    expect(r.values).toMatchObject({ name: "Ada Lovelace", email: "ada@example.com", priorities: ["performance"], notes: "hello", marketingConsent: false });
  });
  it("requires each mandatory field, with a code per field", () => {
    const r = validate({}); expect(r.ok).toBe(false);
    expect(r.errors).toEqual({ name: "required", email: "required", company: "required", industry: "required", intention: "required", contactConsent: "required" });
  });
  it("rejects bad email, unknown industry/intention, over-long values and consent that is not explicitly true", () => {
    expect(validate({ ...good(), email: "not-an-email" }).errors.email).toBe("invalid");
    expect(validate({ ...good(), email: "a@b" }).errors.email).toBe("invalid");
    expect(validate({ ...good(), industry: "crypto" }).errors.industry).toBe("required");
    expect(validate({ ...good(), intention: "buy_now" }).errors.intention).toBe("required");
    expect(validate({ ...good(), name: "x".repeat(121) }).errors.name).toBe("too_long");
    expect(validate({ ...good(), company: "x".repeat(161) }).errors.company).toBe("too_long");
    expect(validate({ ...good(), contactConsent: "on" }).errors.contactConsent).toBe("required");
  });
  it("marketing consent is optional and only ever true when explicitly given", () => {
    expect(validate({ ...good(), marketingConsent: undefined }).values.marketingConsent).toBe(false);
    expect(validate({ ...good(), marketingConsent: true }).values.marketingConsent).toBe(true);
  });
  it("every error code has a plain-language message", () => {
    for (const [field, codes] of Object.entries(MESSAGES)) for (const code of Object.keys(codes)) expect(messageFor(field, code).length).toBeGreaterThan(8);
  });
});

describe("attribution (memory only, allow-listed)", () => {
  it("keeps only known keys, lower-cased and safe", () => {
    expect(readAttribution("?utm_source=Linkedin&utm_medium=cpc&utm_campaign=Launch%20X&x=1&email=a@b.c", "https://www.example.org/page?token=abc", "/")).toEqual({ utm_source: "linkedin", utm_medium: "cpc", utm_campaign: "launchx", referrer_host: "www.example.org", landing_path: "/" });
    expect(readAttribution("", "", "/privacy/")).toEqual({ landing_path: "/privacy/" });
    expect(readAttribution("?utm_source=<script>", "not a url", "/")).toEqual({ utm_source: "script", landing_path: "/" });
  });
  it("never carries the referrer path or query (could hold personal data)", () => { expect(JSON.stringify(readAttribution("", "https://a.test/secret?id=1", "/"))).not.toMatch(/secret|id=1/); });
});

describe("payload", () => {
  it("is exactly the contract, passes the contract validator, and carries the consent evidence", async () => {
    const values = validate(good()).values;
    const p = await buildPayload({ values, attribution: { utm_source: "x" }, submissionId: "ws-1", elapsedMs: 4321.7, consentContactText: CONSENT_CONTACT, consentMarketingText: CONSENT_MARKETING });
    expect(Object.keys(p).sort()).toEqual(["client", "consent", "contract_version", "industry", "intention", "marketing_consent", "marketing_priorities", "name", "notes", "privacy_contact_consent", "source", "submission_id", "work_email", "business_name"].sort());
    expect(p).toMatchObject({ privacy_contact_consent: true, marketing_consent: false, work_email: "ada@example.com", client: { elapsed_ms: 4322 }, consent: { version: "early-access-contact-v1" } });
    expect(p.consent.contact_text_sha256).toBe(await sha256Hex(CONSENT_CONTACT));
    expect(validateLead(p).errors).toBeUndefined(); // client and (reference) server agree
  });
  it("omits notes when empty and contains no credential-like or device fields", async () => {
    const p = await buildPayload({ values: validate({ ...good(), notes: "" }).values, attribution: {}, submissionId: "ws-2", elapsedMs: 10, consentContactText: "a", consentMarketingText: "b" });
    expect(p).not.toHaveProperty("notes"); expect(JSON.stringify(p)).not.toMatch(/token|password|secret|cookie|user.?agent|fingerprint/i);
  });
});

describe("submitLead", () => {
  const p = { a: 1 };
  it("is closed (no request) without a URL", async () => { const f = vi.fn(); expect(await submitLead({ url: "", payload: p, fetchImpl: f })).toEqual({ kind: "closed" }); expect(f).not.toHaveBeenCalled(); });
  it("sends JSON with no credentials and no referrer", async () => {
    const f = vi.fn().mockResolvedValue(res(202, { reference_id: "ea_1" })); const r = await submitLead({ url: "https://api.test/x", payload: p, fetchImpl: f });
    expect(r).toEqual({ kind: "received", reference: "ea_1" });
    expect(f.mock.calls[0][1]).toMatchObject({ method: "POST", credentials: "omit", referrerPolicy: "no-referrer", headers: { "content-type": "application/json" } });
  });
  it.each([[429, "rate_limited", true], [400, "invalid", false], [422, "invalid", false], [409, "conflict", false], [500, "unavailable", true], [503, "unavailable", true]])("maps %i to %s (retryable %s)", async (status, kind, retryable) => {
    const r = await submitLead({ url: "u", payload: p, fetchImpl: async () => res(status, { error: { details: [{ path: "x" }] } }, { "retry-after": "900" }) });
    expect(r.kind).toBe(kind); expect(Boolean(r.retryable)).toBe(retryable);
  });
  it("reports a network failure and a timeout as retryable, never as success", async () => {
    expect(await submitLead({ url: "u", payload: p, fetchImpl: async () => { throw new TypeError("net"); } })).toEqual({ kind: "network", retryable: true });
    const slow = (_u, o) => new Promise((_, rej) => o.signal.addEventListener("abort", () => rej(new Error("aborted"))));
    expect((await submitLead({ url: "u", payload: p, fetchImpl: slow, timeoutMs: 20 })).kind).toBe("network");
  });
});
