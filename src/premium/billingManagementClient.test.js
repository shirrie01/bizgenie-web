// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { BillingManagementError, fetchInvoices, isBillingManagementApiEnabled, openBillingPortal, requestCancellation, requestPlanChange } from "./billingManagementClient";

// MOCKED CONTRACT TESTS: none of these endpoints exists in the backend yet. Amounts are test fixtures.
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const base = (extra = {}) => ({ apiBaseUrl: "http://api.test", accessToken: "tok", tenantId: "t1", ...extra });
const sent = (f) => ({ url: f.mock.calls[0][0], ...f.mock.calls[0][1], body: f.mock.calls[0][1].body ? JSON.parse(f.mock.calls[0][1].body) : null });

describe("portal session", () => {
  it("is off unless the build says the backend has the endpoints", () => { expect(isBillingManagementApiEnabled({})).toBe(false); expect(isBillingManagementApiEnabled({ VITE_BILLING_MANAGEMENT_API: "true" })).toBe(true); });
  it("asks the backend (never Stripe) for a hosted https address and sends no secret, price or customer id", async () => {
    const f = vi.fn().mockResolvedValue(res(201, { url: "https://billing.stripe.com/p/session/test_fixture" }));
    const r = await openBillingPortal(base({ fetchImpl: f, id: "portal_fixture" }));
    const s = sent(f); expect(s.url).toBe("http://api.test/billing/portal-session"); expect(s.method).toBe("POST"); expect(s.headers.authorization).toBe("Bearer tok");
    expect(s.body).toEqual({ tenant_id: "t1", request_id: "portal_fixture" }); expect(r.url).toBe("https://billing.stripe.com/p/session/test_fixture");
  });
  it("refuses an address that is not https, or missing", async () => {
    await expect(openBillingPortal(base({ fetchImpl: vi.fn().mockResolvedValue(res(201, { url: "http://evil.test" })) }))).rejects.toMatchObject({ kind: "invalid" });
    await expect(openBillingPortal(base({ fetchImpl: vi.fn().mockResolvedValue(res(201, {})) }))).rejects.toMatchObject({ kind: "invalid" });
    await expect(openBillingPortal(base({ fetchImpl: vi.fn().mockResolvedValue(res(201, { url: "javascript:alert(1)" })) }))).rejects.toMatchObject({ kind: "invalid" });
  });
});

describe("plan change and cancellation are requests, never results", () => {
  it("a change posts the chosen plan code with a request id, and returns 'requested' with the date the server gave", async () => {
    const f = vi.fn().mockResolvedValue(res(200, { status: "requested", effective_at: "2026-12-01T00:00:00.000Z" }));
    const r = await requestPlanChange(base({ planCode: "beta", fetchImpl: f, id: "change_fx" }));
    expect(sent(f).url).toBe("http://api.test/billing/subscription/change"); expect(sent(f).body).toEqual({ tenant_id: "t1", plan_code: "beta", request_id: "change_fx" });
    expect(r).toEqual({ effectiveAt: "2026-12-01T00:00:00.000Z", url: "" });
  });
  it("a change may carry a Stripe-hosted confirmation address, accepted only if https", async () => {
    expect((await requestPlanChange(base({ planCode: "beta", fetchImpl: vi.fn().mockResolvedValue(res(200, { status: "requested", url: "https://checkout.stripe.com/c/pay/fx" })) }))).url).toBe("https://checkout.stripe.com/c/pay/fx");
    expect((await requestPlanChange(base({ planCode: "beta", fetchImpl: vi.fn().mockResolvedValue(res(200, { status: "requested", url: "http://x.test" })) }))).url).toBe("");
  });
  it("refuses an unusable plan code before any request, and an answer that is not 'requested'", async () => {
    const f = vi.fn(); await expect(requestPlanChange(base({ planCode: "Not Valid!", fetchImpl: f }))).rejects.toMatchObject({ kind: "invalid" }); expect(f).not.toHaveBeenCalled();
    await expect(requestPlanChange(base({ planCode: "beta", fetchImpl: vi.fn().mockResolvedValue(res(200, { status: "done" })) }))).rejects.toMatchObject({ kind: "unconfirmed" });
    await expect(requestCancellation(base({ fetchImpl: vi.fn().mockResolvedValue(res(200, {})) }))).rejects.toMatchObject({ kind: "unconfirmed" });
  });
  it("a cancellation posts only the workspace and a request id, and returns the date the server gave (or null)", async () => {
    const f = vi.fn().mockResolvedValue(res(200, { status: "requested", cancellation_effective_at: "2026-12-01T00:00:00.000Z" }));
    expect(await requestCancellation(base({ fetchImpl: f, id: "cancel_fx" }))).toEqual({ effectiveAt: "2026-12-01T00:00:00.000Z" });
    expect(sent(f).body).toEqual({ tenant_id: "t1", request_id: "cancel_fx" });
    expect(await requestCancellation(base({ fetchImpl: vi.fn().mockResolvedValue(res(200, { status: "requested" })) }))).toEqual({ effectiveAt: null });
  });
  it.each([
    [401, "auth", /session has ended.*nothing was changed/i], [403, "forbidden", /only the workspace owner/i], [404, "forbidden", /only the workspace owner/i],
    [409, "conflict", /changed or is already being updated/i], [500, "unconfirmed", /may or may not have been received/i], [503, "unconfirmed", /temporarily unavailable/i], [418, "error", /nothing was changed/i],
  ])("status %s", async (status, kind, text) => {
    const p = requestCancellation(base({ fetchImpl: vi.fn().mockResolvedValue(res(status, {})) }));
    await expect(p).rejects.toMatchObject({ kind }); await expect(requestCancellation(base({ fetchImpl: vi.fn().mockResolvedValue(res(status, {})) }))).rejects.toThrow(text);
  });
  it("a dropped connection is 'unconfirmed' and says a repeat will not charge twice", async () => {
    await expect(requestPlanChange(base({ planCode: "beta", fetchImpl: vi.fn().mockRejectedValue(new Error("x")) }))).rejects.toThrow(/not be charged twice for one request/i);
  });
  it("a request id is reused by the caller on retry (idempotency)", async () => {
    const f = vi.fn().mockResolvedValue(res(200, { status: "requested" }));
    await requestPlanChange(base({ planCode: "beta", fetchImpl: f, id: "same" })); await requestPlanChange(base({ planCode: "beta", fetchImpl: f, id: "same" }));
    expect(JSON.parse(f.mock.calls[0][1].body).request_id).toBe(JSON.parse(f.mock.calls[1][1].body).request_id);
  });
});

describe("invoices", () => {
  const INV = (n, over = {}) => ({ invoice_id: `in_${n}`, number: `FX-000${n}`, issued_at: `2026-10-0${n}T09:00:00.000Z`, amount_minor: 1234, currency: "GBP", status: "paid", hosted_invoice_url: `https://invoice.stripe.com/i/fx${n}`, receipt_url: null, ...over });
  it("returns newest first, links only to https Stripe-hosted pages, and counts rows it could not read instead of hiding them", async () => {
    const f = vi.fn().mockResolvedValue(res(200, { invoices: [INV(1), INV(3, { receipt_url: "https://pay.stripe.com/receipts/fx3" }), INV(2, { hosted_invoice_url: "http://insecure.test" }), { invoice_id: "x" }] }));
    const r = await fetchInvoices(base({ fetchImpl: f }));
    expect(f.mock.calls[0][0]).toBe("http://api.test/customer/billing/invoices?tenant_id=t1");
    expect(r.invoices.map((i) => i.number)).toEqual(["FX-0003", "FX-0001"]); expect(r.skipped).toBe(2); expect(r.invoices[0].receiptUrl).toBe("https://pay.stripe.com/receipts/fx3"); expect(r.invoices[1].receiptUrl).toBe("");
  });
  it.each([[401, "auth"], [403, "forbidden"], [404, "forbidden"], [500, "error"]])("status %s is a typed error, not an empty list", async (status, kind) => {
    await expect(fetchInvoices(base({ fetchImpl: vi.fn().mockResolvedValue(res(status, {})) }))).rejects.toMatchObject({ kind });
  });
  it("a wrong shape or a dropped connection is an error", async () => {
    await expect(fetchInvoices(base({ fetchImpl: vi.fn().mockResolvedValue(res(200, { invoices: "none" })) }))).rejects.toBeInstanceOf(BillingManagementError);
    await expect(fetchInvoices(base({ fetchImpl: vi.fn().mockRejectedValue(new Error("x")) }))).rejects.toMatchObject({ kind: "network" });
  });
});
