// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { MESSAGES, SOURCE_BY_INTENTION, STAGES, buildPayload, messageFor, readAttribution, submitLead, validate } from "../assets/form-model.js";
import { validateLead } from "../dev/lead-stub.mjs";
import { CONSENT_CONTACT, CONSENT_VERSION, businessStages } from "../content.mjs";

const good = () => ({ name: "  Ada   Lovelace ", email: " Ada@Example.COM ", company: "Analytical Engines Ltd", website: " example.com/ada ", stage: "250k-1m", challenge: "  Keeping launch campaigns consistent. ", intention: "founding_customer", contactConsent: true });
const res = (status, body = {}, headers = {}) => ({ status, json: async () => body, headers: { get: (k) => headers[k.toLowerCase()] } });

describe("validate (existing paid-beta contract)", () => {
  it("accepts a complete registration and normalises it", () => {
    const r = validate(good()); expect(r.ok).toBe(true);
    expect(r.values).toMatchObject({ name: "Ada Lovelace", email: "ada@example.com", website: "https://example.com/ada", stage: "250k-1m", challenge: "Keeping launch campaigns consistent." });
  });
  it("requires each mandatory field, with a code per field", () => {
    const r = validate({}); expect(r.ok).toBe(false);
    expect(r.errors).toEqual({ name: "required", email: "required", company: "required", website: "required", stage: "required", challenge: "required", intention: "required", contactConsent: "required" });
  });
  it("rejects bad email, bad address, unknown stage/intention, over-long values and consent that is not explicitly true", () => {
    expect(validate({ ...good(), email: "not-an-email" }).errors.email).toBe("invalid");
    expect(validate({ ...good(), website: "https://user:pass@example.com" }).errors.website).toBe("invalid");
    expect(validate({ ...good(), website: "ftp://example.com" }).errors.website).toBe("invalid");
    expect(validate({ ...good(), website: "not a url" }).errors.website).toBe("invalid");
    expect(validate({ ...good(), website: "https://e.com/" + "x".repeat(2100) }).errors.website).toBe("invalid");
    expect(validate({ ...good(), stage: "huge" }).errors.stage).toBe("required");
    expect(validate({ ...good(), intention: "buy_now" }).errors.intention).toBe("required");
    expect(validate({ ...good(), name: "x".repeat(121) }).errors.name).toBe("too_long");
    expect(validate({ ...good(), company: "x".repeat(161) }).errors.company).toBe("too_long");
    expect(validate({ ...good(), challenge: "x".repeat(1001) }).errors.challenge).toBe("too_long");
    expect(validate({ ...good(), contactConsent: "on" }).errors.contactConsent).toBe("required");
  });
  it("offers exactly the five stages the API accepts, and the form lists the same values", () => {
    expect(STAGES).toEqual(["pre-revenue", "under-250k", "250k-1m", "1m-5m", "5m-plus"]);
    expect(businessStages.map(([v]) => v).filter(Boolean)).toEqual(STAGES);
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
  it("is exactly the nine fields of the existing contract and passes the contract validator", () => {
    const values = validate(good()).values;
    const p = buildPayload({ values, submissionId: "ws-1" });
    expect(Object.keys(p).sort()).toEqual(["business_name", "business_stage", "name", "primary_marketing_challenge", "privacy_contact_consent", "source", "submission_id", "website_or_social_profile", "work_email"]);
    expect(p).toMatchObject({ privacy_contact_consent: true, work_email: "ada@example.com", business_stage: "250k-1m", source: "website-founding-customer", submission_id: "ws-1" });
    expect(validateLead(p).errors).toBeUndefined(); // client and (reference) server agree
  });
  it("maps each registration choice to a safe source label and carries no marketing, attribution, device or credential data", () => {
    for (const intention of ["early_access", "founding_customer"]) { const p = buildPayload({ values: validate({ ...good(), intention }).values, submissionId: "ws-2" }); expect(p.source).toBe(SOURCE_BY_INTENTION[intention]); expect(p.source).toMatch(/^[a-z0-9][a-z0-9._:-]{0,63}$/); }
    expect(JSON.stringify(buildPayload({ values: validate(good()).values, submissionId: "ws-3" }))).not.toMatch(/marketing_consent|utm_|referrer|token|password|secret|cookie|user.?agent|fingerprint|industry/i);
  });
  it("shows the consent wording the server records, word for word", () => {
    expect(CONSENT_CONTACT).toBe("I agree that BizGenie may use these details to contact me about the paid beta."); // src/paid-beta/config.js PAID_BETA_CONSENT_WORDING
    expect(CONSENT_VERSION).toBe("paid-beta-contact-v1");
  });
});

describe("submitLead", () => {
  const p = { a: 1 };
  it("is closed (no request) without a URL", async () => { const f = vi.fn(); expect(await submitLead({ url: "", payload: p, fetchImpl: f })).toEqual({ kind: "closed" }); expect(f).not.toHaveBeenCalled(); });
  it("sends JSON with no credentials and no referrer", async () => {
    const f = vi.fn().mockResolvedValue(res(202, { reference_id: "pbi_1" })); const r = await submitLead({ url: "https://api.test/x", payload: p, fetchImpl: f });
    expect(r).toEqual({ kind: "received", reference: "pbi_1" });
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
