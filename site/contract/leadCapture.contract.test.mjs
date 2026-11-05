// @vitest-environment node
// CONTRACT TESTS for the PROPOSED public lead-capture and site-events routes (docs/website/BG_WEB_001_LEAD_CAPTURE_CONTRACT.md).
// By default they run against the in-memory reference stub (site/dev/lead-stub.mjs). To check a real implementation (e.g. a bizgenie-api draft) run:
//   CONTRACT_BASE_URL=http://127.0.0.1:8080 CONTRACT_ORIGIN=https://getbizgenie.com npx vitest run site/contract
// They only use public behaviour; the stub-only checks are skipped against a real URL. Never point them at production.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EVENTS_PATH, LEAD_PATH, createLeadStub, funnel, toCsv } from "../dev/lead-stub.mjs";

const REAL = process.env.CONTRACT_BASE_URL || "";
const ORIGIN = process.env.CONTRACT_ORIGIN || "http://127.0.0.1:4300";
const stubOnly = REAL ? it.skip : it;
let base = REAL; let stub = null;
const H = "a".repeat(64);
const lead = (over = {}) => ({
  contract_version: "early-access-interest.v1", submission_id: `t-${Math.random().toString(36).slice(2)}`, name: "Ada Lovelace", work_email: `ada.${Math.random().toString(36).slice(2)}@example.com`,
  business_name: "Analytical Engines Ltd", industry: "agency", intention: "early_access", marketing_priorities: ["performance"], privacy_contact_consent: true, marketing_consent: false,
  consent: { version: "early-access-contact-v1", contact_text_sha256: H, marketing_text_sha256: H, shown_at: new Date().toISOString() }, source: { landing_path: "/" }, client: { elapsed_ms: 12000 }, ...over,
});
const post = (body, path = LEAD_PATH, headers = {}) => fetch(base + path, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

beforeAll(async () => { if (!REAL) { stub = createLeadStub({ allowedOrigin: ORIGIN, rateLimit: { max: 1000, windowMs: 1000 } }); base = `http://127.0.0.1:${await stub.listen(0)}`; } });
afterAll(async () => { if (stub) await stub.close(); });

describe("early-access-interest.v1", () => {
  it("accepts a valid registration with 202 {status:'received', reference_id}", async () => {
    const r = await post(lead()); expect(r.status).toBe(202); const b = await r.json(); expect(b).toMatchObject({ status: "received" }); expect(b.reference_id).toMatch(/^[A-Za-z0-9_-]{6,}$/);
    expect(r.headers.get("cache-control")).toMatch(/no-store/);
  });
  it("accepts both intentions and the optional fields as absent", async () => {
    for (const intention of ["early_access", "founding_customer"]) expect((await post(lead({ intention }))).status).toBe(202);
    const { marketing_priorities, ...rest } = lead(); expect((await post({ ...rest, marketing_priorities: [] })).status).toBe(202);
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
    ["unknown field", { extra: 1 }], ["consent not true", { privacy_contact_consent: false }], ["bad email", { work_email: "nope" }], ["bad industry", { industry: "x" }], ["bad intention", { intention: "x" }],
    ["unknown consent version", { consent: { version: "v0", contact_text_sha256: H, marketing_text_sha256: H, shown_at: new Date().toISOString() } }], ["priority not allowed", { marketing_priorities: ["x"] }],
    ["notes too long", { notes: "x".repeat(501) }], ["source key not allowed", { source: { email: "a@b.c" } }], ["wrong version", { contract_version: "v2" }], ["missing name", { name: "" }],
  ])("rejects %s with 400 VALIDATION_ERROR and details", async (_n, over) => {
    const r = await post(lead(over)); expect(r.status).toBe(400); const b = await r.json(); expect(b.error.code).toBe("VALIDATION_ERROR"); expect(Array.isArray(b.error.details)).toBe(true);
    expect(JSON.stringify(b)).not.toContain("example.com"); // errors never echo submitted personal data
  });
  it("rejects malformed JSON and a non-JSON content type", async () => {
    expect((await post("{not json")).status).toBe(400);
    expect((await fetch(base + LEAD_PATH, { method: "POST", headers: { "content-type": "text/plain" }, body: "x" })).status).toBe(415);
  });
  it("is write-only: no public list, lookup, update or delete", async () => {
    for (const method of ["GET", "PUT", "PATCH", "DELETE"]) { const r = await fetch(base + LEAD_PATH, { method }); expect([404, 405]).toContain(r.status); }
    for (const p of [`${LEAD_PATH}/ea_x`, "/public/early-access-interests", "/public/leads", "/admin/leads"]) expect([404, 405]).toContain((await fetch(base + p)).status);
  });
  it("refuses an oversized body", async () => { expect([400, 413]).toContain((await post(JSON.stringify({ ...lead(), notes: "x".repeat(40000) }))).status); });
  it("answers the CORS preflight for the site origin only", async () => {
    const r = await fetch(base + LEAD_PATH, { method: "OPTIONS", headers: { origin: ORIGIN, "access-control-request-method": "POST", "access-control-request-headers": "content-type" } });
    expect([200, 204]).toContain(r.status); expect(r.headers.get("access-control-allow-origin")).toBe(ORIGIN); expect(r.headers.get("access-control-allow-origin")).not.toBe("*");
  });
  stubOnly("rate limits repeated attempts with 429 and Retry-After (reference stub, low limit)", async () => {
    const s = createLeadStub({ allowedOrigin: ORIGIN, rateLimit: { max: 3, windowMs: 60000 } }); const port = await s.listen(0); const u = `http://127.0.0.1:${port}${LEAD_PATH}`;
    const codes = []; for (let i = 0; i < 5; i++) codes.push((await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(lead()) })).status);
    expect(codes).toEqual([202, 202, 202, 429, 429]); const r = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); expect(r.headers.get("retry-after")).toBeTruthy(); await s.close();
  });
  stubOnly("keeps one canonical record per email, raises intention to founding_customer, and never stores a raw IP", async () => {
    const e = `canon.${Math.random().toString(36).slice(2)}@example.com`; await post(lead({ work_email: e, intention: "early_access" })); await post(lead({ work_email: e, intention: "founding_customer" }));
    const rec = stub.records.filter((x) => x.work_email === e); expect(rec).toHaveLength(1); expect(rec[0].intention).toBe("founding_customer"); expect(rec[0].receipts).toHaveLength(2);
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
    const csv = toCsv([{ reference_id: "ea_1", name: '=HYPERLINK("http://x")', work_email: "a@b.com", business_name: "+SUM(1)", marketing_priorities: ["a", "b"], marketing_consent: true }]);
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`); expect(csv).toContain(`"'+SUM(1)"`); expect(csv).toContain('"a;b"'); expect(csv.split("\n")[0]).toMatch(/^reference_id,received_at,intention,name,work_email/);
  });
});
