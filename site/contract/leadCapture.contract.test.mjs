// @vitest-environment node
// CONTRACT TESTS: the EXISTING bizgenie-api paid-beta route (POST /public/paid-beta-interest) and the still-PROPOSED site-events route.
// By default they run against the in-memory reference stub (site/dev/lead-stub.mjs). To check a real implementation (e.g. a bizgenie-api draft) run:
//   CONTRACT_BASE_URL=http://127.0.0.1:8080 CONTRACT_ORIGIN=https://getbizgenie.com npx vitest run site/contract
// They only use public behaviour; the stub-only checks are skipped against a real URL. Never point them at production.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EVENTS_PATH, LEAD_PATH, createLeadStub, funnel, toCsv } from "../dev/lead-stub.mjs";

const REAL = process.env.CONTRACT_BASE_URL || "";
const ORIGIN = process.env.CONTRACT_ORIGIN || "http://127.0.0.1:4300";
const stubOnly = REAL ? it.skip : it;
let base = REAL; let stub = null;
const lead = (over = {}) => ({
  name: "Ada Lovelace", work_email: `ada.${Math.random().toString(36).slice(2)}@example.com`, business_name: "Analytical Engines Ltd", website_or_social_profile: "https://example.com/ada",
  business_stage: "250k-1m", primary_marketing_challenge: "Keeping launch campaigns consistent.", privacy_contact_consent: true, source: "website-early-access", submission_id: `t-${Math.random().toString(36).slice(2)}`, ...over,
});
const post = (body, path = LEAD_PATH, headers = {}) => fetch(base + path, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

beforeAll(async () => { if (!REAL) { stub = createLeadStub({ allowedOrigin: ORIGIN, rateLimit: { max: 1000, windowMs: 1000 } }); base = `http://127.0.0.1:${await stub.listen(0)}`; } });
afterAll(async () => { if (stub) await stub.close(); });

describe("paid-beta-interest (existing API contract)", () => {
  it("accepts a valid registration with 202 {status:'received', reference_id}", async () => {
    const r = await post(lead()); expect(r.status).toBe(202); const b = await r.json(); expect(b).toMatchObject({ status: "received" }); expect(b.reference_id).toMatch(/^pbi_[A-Za-z0-9_-]{6,}$/);
  });
  it("accepts both registration labels and every stage", async () => {
    for (const source of ["website-early-access", "website-founding-customer"]) expect((await post(lead({ source }))).status).toBe(202);
    for (const business_stage of ["pre-revenue", "under-250k", "250k-1m", "1m-5m", "5m-plus"]) expect((await post(lead({ business_stage }))).status).toBe(202);
  });
  it("replays the same submission id and payload with the same reference; a changed payload under that id is a conflict", async () => {
    const body = lead(); const a = await (await post(body)).json(); const b = await post(body); expect(b.status).toBe(202); expect((await b.json()).reference_id).toBe(a.reference_id);
    const c = await post({ ...body, name: "Someone Else" }); expect(c.status).toBe(409); expect((await c.json()).error.code).toBe("IDEMPOTENCY_KEY_CONFLICT");
  });
  it("treats a repeat email under a new submission as success without disclosing the earlier record", async () => {
    const first = lead({ work_email: "dupe@example.com" }); await post(first); const again = await post({ ...first, submission_id: "t-new-" + Math.random().toString(36).slice(2) });
    expect(again.status).toBe(202); const b = await again.json(); expect(Object.keys(b).sort()).toEqual(["reference_id", "status"]); expect(JSON.stringify(b)).not.toMatch(/already|duplicate|exists/i);
  });
  it.each([
    ["an unknown field (the old proposed fields are refused)", { industry: "agency" }], ["a marketing consent field (the API records none)", { marketing_consent: false }], ["consent not true", { privacy_contact_consent: false }],
    ["consent missing", { privacy_contact_consent: undefined }], ["bad email", { work_email: "nope" }], ["website without a scheme", { website_or_social_profile: "example.com" }],
    ["website with credentials", { website_or_social_profile: "https://user:pass@example.com" }], ["bad stage", { business_stage: "x" }], ["missing challenge", { primary_marketing_challenge: "" }],
    ["challenge too long", { primary_marketing_challenge: "x".repeat(1001) }], ["source with spaces", { source: "has spaces" }], ["missing name", { name: "" }], ["bad submission id", { submission_id: "bad id!" }],
  ])("rejects %s with 400 VALIDATION_ERROR and details", async (_n, over) => {
    const r = await post(lead(over)); expect(r.status).toBe(400); const b = await r.json(); expect(b.error.code).toBe("VALIDATION_ERROR"); expect(Array.isArray(b.error.details)).toBe(true);
    expect(JSON.stringify(b)).not.toContain("example.com"); // errors never echo submitted personal data
  });
  it("rejects malformed JSON", async () => { expect((await post("{not json")).status).toBe(400); });
  it("is write-only: no public list, lookup, update or delete", async () => {
    for (const method of ["GET", "PUT", "PATCH", "DELETE"]) { const r = await fetch(base + LEAD_PATH, { method }); expect([404, 405]).toContain(r.status); }
    for (const p of [`${LEAD_PATH}/pbi_x`, "/public/leads", "/admin/leads"]) expect([404, 405]).toContain((await fetch(base + p)).status);
  });
  it("refuses an oversized body", async () => { expect([400, 413]).toContain((await post(JSON.stringify({ ...lead(), primary_marketing_challenge: "x".repeat(40000) }))).status); });
  it("answers the CORS preflight for the site origin only", async () => {
    const r = await fetch(base + LEAD_PATH, { method: "OPTIONS", headers: { origin: ORIGIN, "access-control-request-method": "POST", "access-control-request-headers": "content-type" } });
    expect([200, 204]).toContain(r.status); expect(r.headers.get("access-control-allow-origin")).toBe(ORIGIN); expect(r.headers.get("access-control-allow-origin")).not.toBe("*");
  });
  stubOnly("rate limits repeated attempts with 429 PAID_BETA_RATE_LIMITED (reference stub, low limit)", async () => {
    const s = createLeadStub({ allowedOrigin: ORIGIN, rateLimit: { max: 3, windowMs: 60000 } }); const port = await s.listen(0); const u = `http://127.0.0.1:${port}${LEAD_PATH}`;
    const codes = []; for (let i = 0; i < 5; i++) codes.push((await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(lead()) })).status);
    expect(codes).toEqual([202, 202, 202, 429, 429]); const r = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); expect((await r.json()).error.code).toBe("PAID_BETA_RATE_LIMITED"); await s.close();
  });
  stubOnly("keeps one canonical record per email, never overwrites the first, records consent evidence per receipt and never stores a raw IP", async () => {
    const e = `canon.${Math.random().toString(36).slice(2)}@example.com`; await post(lead({ work_email: e, name: "First Name" })); await post(lead({ work_email: e, name: "Second Name" }));
    const rec = stub.records.filter((x) => x.work_email === e); expect(rec).toHaveLength(1); expect(rec[0].name).toBe("First Name"); expect(rec[0].receipts).toHaveLength(2);
    expect(rec[0].receipts[0]).toMatchObject({ consent_version: "paid-beta-contact-v1", consent_wording: "I agree that BizGenie may use these details to contact me about the paid beta." });
    expect(JSON.stringify(rec[0])).not.toMatch(/127\.0\.0\.1|::1/);
  });
});

describe("site-events.v1", () => {
  const ev = (events, over = {}) => ({ contract_version: "site-events.v1", visit: "11111111-1111-4111-8111-111111111111", source: { utm_source: "x" }, events, ...over });
  it("accepts fixed event types", async () => { expect((await post(ev([{ type: "page_view", page: "/" }, { type: "field_error", page: "/", field: "email", code: "invalid", intention: "early_access" }]), EVENTS_PATH)).status).toBe(202); });
  it.each([["an unknown type", [{ type: "keylog", page: "/" }]], ["a typed value", [{ type: "field_error", page: "/", field: "email", code: "invalid", value: "a@b.c" }]], ["free text in code", [{ type: "field_error", page: "/", field: "email", code: "has spaces and @" }]], ["no events", []]])("refuses %s", async (_n, events) => {
    expect((await post(ev(events), EVENTS_PATH)).status).toBe(400);
  });
  stubOnly("counts real events and reports null (not 0) conversion without a denominator", async () => {
    expect(funnel({}).visit_to_registration).toBeNull();
    const s = createLeadStub({ allowedOrigin: ORIGIN }); const port = await s.listen(0);
    for (const t of ["page_view", "page_view", "form_start", "submit_success"]) await fetch(`http://127.0.0.1:${port}${EVENTS_PATH}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ev([{ type: t, page: "/" }])) });
    expect(funnel(s.counters)).toMatchObject({ page_views: 2, form_starts: 1, submit_successes: 1, visit_to_registration: 0.5, start_to_registration: 1 }); await s.close();
  });
});

describe("operator export", () => {
  it("neutralises spreadsheet formulas and quotes cells", () => {
    const csv = toCsv([{ reference_id: "pbi_1", name: '=HYPERLINK("http://x")', work_email: "a@b.com", business_name: "+SUM(1)", primary_marketing_challenge: "a;b" }]);
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`); expect(csv).toContain(`"'+SUM(1)"`); expect(csv.split("\n")[0]).toMatch(/^reference_id,received_at,name,work_email/);
  });
});
