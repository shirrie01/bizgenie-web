// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { BillingManagementError, isBillingManagementApiEnabled, openBillingPortal, requestCancellation, requestPlanChange } from "./billingManagementClient";

// MOCKED CONTRACT TESTS against the UNMOUNTED backend draft (bizgenie-api PR #216 f8d81bf, src/billing/stripe/managementDraft.js).
const OK = { status: "confirmation_required", portal_url: "https://billing.stripe.com/p/session/test_abc", entitlement_confirmed: false };
const reply = (status, body) => vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }));
const base = { apiBaseUrl: "http://api.test", accessToken: "tok", tenantId: "t1" };

describe("gate", () => { it.each([[undefined, false], ["1", false], ["true", true], [" TRUE ", true]])("%s -> %s", (v, e) => expect(isBillingManagementApiEnabled({ VITE_BILLING_MANAGEMENT_API: v })).toBe(e)); });

describe("requests match the draft's strict bodies", () => {
  it("portal: POST /customer/billing/management/portal-session?tenant_id with only request_id", async () => {
    const f = reply(201, OK); const r = await openBillingPortal({ ...base, fetchImpl: f, id: "r1" });
    expect(f.mock.calls[0][0]).toBe("http://api.test/customer/billing/management/portal-session?tenant_id=t1");
    expect(f.mock.calls[0][1].method).toBe("POST"); expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ request_id: "r1" }); expect(f.mock.calls[0][1].headers.authorization).toBe("Bearer tok");
    expect(r.url).toBe("https://billing.stripe.com/p/session/test_abc");
  });
  it("change: request_id and plan_code only — never a price, redirect or tenant in the body", async () => {
    const f = reply(201, OK); await requestPlanChange({ ...base, planCode: "pro", fetchImpl: f, id: "r2" });
    expect(f.mock.calls[0][0]).toContain("/subscription/change"); expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ request_id: "r2", plan_code: "pro" });
  });
  it("cancel: request_id only", async () => {
    const f = reply(201, OK); await requestCancellation({ ...base, fetchImpl: f, id: "r3" });
    expect(f.mock.calls[0][0]).toContain("/subscription/cancel"); expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ request_id: "r3" });
  });
  it("refuses a malformed plan code without a request", async () => { const f = vi.fn(); await expect(requestPlanChange({ ...base, planCode: "Bad Code", fetchImpl: f })).rejects.toMatchObject({ kind: "invalid" }); expect(f).not.toHaveBeenCalled(); });
  it("generates a different request id each time by default, so a repeat is a deliberate choice", async () => {
    const f = reply(201, OK); await openBillingPortal({ ...base, fetchImpl: f }); await openBillingPortal({ ...base, fetchImpl: f });
    expect(JSON.parse(f.mock.calls[0][1].body).request_id).not.toBe(JSON.parse(f.mock.calls[1][1].body).request_id);
  });
});

describe("responses are trusted only when they are exactly what the draft promises", () => {
  it.each([
    ["not confirmation_required", { ...OK, status: "ok" }], ["claims entitlement confirmed", { ...OK, entitlement_confirmed: true }], ["a non-Stripe host", { ...OK, portal_url: "https://evil.example.test/p" }],
    ["plain http", { ...OK, portal_url: "http://billing.stripe.com/p" }], ["a credentialed url", { ...OK, portal_url: "https://u:p@billing.stripe.com/p" }], ["a port", { ...OK, portal_url: "https://billing.stripe.com:8443/p" }], ["no url", { status: "confirmation_required", entitlement_confirmed: false }],
  ])("%s is refused", async (_l, body) => { await expect(openBillingPortal({ ...base, fetchImpl: reply(201, body) })).rejects.toMatchObject({ kind: "invalid" }); });
});

describe("errors say what happened, and never imply success", () => {
  it.each([
    [401, {}, "auth", /session has ended/], [404, { error: { code: "RESOURCE_NOT_AVAILABLE" } }, "forbidden", /Only the workspace owner/], [404, { error: { code: "STRIPE_BILLING_RESOURCE_NOT_AVAILABLE" } }, "unavailable", /no billing account/],
    [403, {}, "forbidden", /Only the workspace owner/], [400, {}, "invalid", /Nothing was changed/], [409, { error: { code: "STRIPE_BILLING_CONFLICT" } }, "conflict", /changed or is already being updated/],
    [503, { error: { code: "STRIPE_BILLING_NOT_CONFIGURED" } }, "unavailable", /not available right now/], [502, {}, "unconfirmed", /may or may not/],
  ])("%s", async (status, body, kind, text) => { await expect(openBillingPortal({ ...base, fetchImpl: reply(status, body) })).rejects.toMatchObject({ kind, message: expect.stringMatching(text) }); });
  it("a dropped connection is unconfirmed, not 'not done'", async () => { await expect(requestCancellation({ ...base, fetchImpl: vi.fn().mockRejectedValue(new Error("x")) })).rejects.toMatchObject({ kind: "unconfirmed" }); });
  it("errors are typed", async () => { await expect(openBillingPortal({ ...base, fetchImpl: reply(401, {}) })).rejects.toBeInstanceOf(BillingManagementError); });
});

import { fetchInvoices } from "./billingManagementClient";
describe("invoices (billing-invoices.v1 draft, unmounted)", () => {
  const inv = (o = {}) => ({ invoice_id: "in_abc1", number: "FX-0001", issued_at: "2026-10-01T00:00:00Z", amount_minor: 500, currency: "GBP", status: "paid", hosted_invoice_url: "https://invoice.stripe.com/i/abc", receipt_url: null, ...o });
  const page = (invoices, next = null) => reply(200, { contract_version: "billing-invoices.v1", invoices, next_cursor: next });
  it("asks for one bounded page with the owner's token and follows the cursor on request", async () => {
    const f = page([inv()], "in_abc1"); const r = await fetchInvoices({ ...base, cursor: "in_prev", limit: 500, fetchImpl: f });
    const u = new URL(f.mock.calls[0][0]); expect(u.pathname).toBe("/customer/billing/invoices"); expect(Object.fromEntries(u.searchParams)).toEqual({ tenant_id: "t1", limit: "50", cursor: "in_prev" }); expect(f.mock.calls[0][1].headers.authorization).toBe("Bearer tok");
    expect(r.nextCursor).toBe("in_abc1");
  });
  it("shows a missing number or link as missing, never invents either, and refuses non-Stripe links", async () => {
    const r = await fetchInvoices({ ...base, fetchImpl: page([inv({ number: null, hosted_invoice_url: null }), inv({ invoice_id: "in_abc2", hosted_invoice_url: "https://evil.test/i" }), inv({ invoice_id: "in_abc3", status: "weird" }), inv({ invoice_id: "x" })]) });
    expect(r.invoices.map((i) => [i.id, i.number, i.url])).toEqual([["in_abc1", "", ""], ["in_abc2", "FX-0001", ""]]); expect(r.skipped).toBe(2);
  });
  it.each([[401, "auth"], [404, "forbidden"], [503, "unavailable"], [500, "error"]])("status %s", async (s, kind) => { await expect(fetchInvoices({ ...base, fetchImpl: reply(s, {}) })).rejects.toMatchObject({ kind }); });
  it("a wrong contract or a dropped connection is an error, not an empty list", async () => {
    await expect(fetchInvoices({ ...base, fetchImpl: reply(200, { invoices: [] }) })).rejects.toMatchObject({ kind: "invalid" });
    await expect(fetchInvoices({ ...base, fetchImpl: vi.fn().mockRejectedValue(new Error("x")) })).rejects.toMatchObject({ kind: "network" });
  });
});
