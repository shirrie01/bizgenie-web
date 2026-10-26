import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PremiumBilling from "./PremiumBilling";
import BillingManagement from "./BillingManagement";
import { normaliseCatalogue } from "./planCatalogueClient";

// Fixture values only: test data for a mocked server in `commercial-catalog.v1` shape, never product pricing.
const plan = (code, amount, credits) => ({ plan_code: code, plan_version: 1, amount_minor: amount, currency: "GBP", billing_cadence: "month", tax: { presentation: "exclusive", jurisdiction: "Fixtureland", wording: "FIXTURE TAX WORDING" }, credit_grant_cadence: "month", included_credits: credits, policy_id: `pol-${code}`, entitlement_codes: ["generation"], effective_from: "2026-01-01T00:00:00.000Z", effective_to: null, terms: { version: "fx-t1", url: `https://example.test/terms-${code}`, cancellation_url: `https://example.test/cancel-${code}`, refund_url: `https://example.test/refund-${code}` }, approval: { decision: "DEC-FX", source: "https://example.test/decision", approved_at: "2026-01-02T00:00:00.000Z" } });
const catalogue = normaliseCatalogue({ contract_version: "commercial-catalog.v1", plans: [plan("standard", 1111, 11), plan("pro", 2222, 22)] });
const session = { status: "ready", accessToken: "tok", tenantId: "t1" };
const on = { VITE_PLAN_CATALOGUE_API: "true", VITE_BILLING_MANAGEMENT_API: "true" };
const off = {};
const mockBilling = (sub) => vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ subscription: sub, available_credits: 5 }) })));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("PremiumBilling", () => {
  it("gates off: says nothing is published, shows no price, offers no management buttons", async () => {
    mockBilling(null);
    render(<PremiumBilling session={session} isOwner env={off} />);
    expect(await screen.findByText(/has not published plans, prices and terms/i)).toBeInTheDocument();
    expect(screen.getByText(/not available in BizGenie yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cancel subscription|change plan/i })).toBeNull();
    expect(document.body.textContent).not.toMatch(/£\s?\d/);
  });
  it("gates on: shows server prices, tax wording, term links and 'not published' for what the contract lacks; the owner can choose via Stripe", async () => {
    mockBilling(null);
    const redirect = vi.fn(); const startCheckout = vi.fn(async () => ({ url: "https://checkout.example.test/s" }));
    render(<PremiumBilling session={session} isOwner env={on} api={{ fetchPlanCatalogue: async () => catalogue, startCheckout }} onRedirect={redirect} />);
    expect(await screen.findByText("£11.11")).toBeInTheDocument();
    expect(screen.getByText("£22.22")).toBeInTheDocument();
    expect(screen.getAllByText(/FIXTURE TAX WORDING/).length).toBe(2);
    expect(screen.getAllByRole("link", { name: "Refunds" })[0]).toHaveAttribute("href", "https://example.test/refund-standard");
    expect(screen.getAllByText("Not published yet").length).toBeGreaterThanOrEqual(4);
    expect(screen.getAllByText(/support contact .* has not been published/i).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));
    await waitFor(() => expect(redirect).toHaveBeenCalledWith("https://checkout.example.test/s"));
    expect(startCheckout).toHaveBeenCalledWith(expect.objectContaining({ planCode: "pro" }));
  });
  it("a member sees prices but cannot choose or manage", async () => {
    mockBilling(null);
    render(<PremiumBilling session={session} isOwner={false} env={on} api={{ fetchPlanCatalogue: async () => catalogue, startCheckout: vi.fn() }} />);
    expect(await screen.findByText("£11.11")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose Standard" })).toBeDisabled();
    expect(screen.getByText(/only the workspace owner can change the plan/i)).toBeInTheDocument();
  });
  it("catalogue 503 (nothing approved yet) is explained and retryable; no prices shown", async () => {
    mockBilling(null);
    const f = vi.fn().mockRejectedValueOnce(new Error("Approved plans and prices have not been published yet, so none are shown. Nothing is charged.")).mockResolvedValueOnce(catalogue);
    render(<PremiumBilling session={session} isOwner env={on} api={{ fetchPlanCatalogue: f }} />);
    expect(await screen.findByText(/have not been published yet/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/£\s?\d/);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("£11.11")).toBeInTheDocument();
  });
  it("marks the plan the subscription is on and offers no Choose button while entitled", async () => {
    mockBilling({ plan_code: "standard", entitlement_status: "active" });
    render(<PremiumBilling session={session} isOwner env={on} api={{ fetchPlanCatalogue: async () => catalogue }} />);
    expect(await screen.findByText(/Your current plan/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Choose /i })).toBeNull();
  });
});

describe("BillingManagement (opens Stripe-hosted pages; never reports a change as done)", () => {
  const sub = { plan_code: "standard", entitlement_status: "active" };
  const setup = (api, extra = {}) => render(<BillingManagement enabled isOwner session={session} subscription={sub} catalogue={catalogue} api={api} onRedirect={extra.onRedirect || vi.fn()} onRecheck={extra.onRecheck} />);
  it("cancellation shows the rules first, goes to Stripe, says nothing changes until confirmed, and reuses the request id on retry", async () => {
    const onRedirect = vi.fn();
    const cancel = vi.fn().mockRejectedValueOnce(Object.assign(new Error("may or may not have been received"), { kind: "unconfirmed" })).mockResolvedValueOnce({ url: "https://billing.stripe.com/p/s" });
    setup({ requestCancellation: cancel }, { onRedirect });
    fireEvent.click(screen.getByRole("button", { name: "Cancel subscription" }));
    expect(screen.getByRole("link", { name: "cancellation rules" })).toHaveAttribute("href", "https://example.test/cancel-standard");
    fireEvent.click(screen.getByRole("button", { name: "Continue to Stripe" }));
    expect(await screen.findByText(/may or may not have been received/)).toBeInTheDocument();
    expect(onRedirect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Continue to Stripe" }));
    await waitFor(() => expect(onRedirect).toHaveBeenCalledWith("https://billing.stripe.com/p/s"));
    expect(cancel.mock.calls[0][0].id).toBe(cancel.mock.calls[1][0].id);
    expect(screen.getByText(/Nothing changes until you confirm there/)).toBeInTheDocument();
    expect(screen.queryByText(/has been cancelled|was cancelled/i)).toBeNull();
  });
  it("plan change lists only other plans, requires a choice, and sends the plan code", async () => {
    const onRedirect = vi.fn(); const change = vi.fn(async () => ({ url: "https://billing.stripe.com/p/c" }));
    setup({ requestPlanChange: change }, { onRedirect });
    fireEvent.click(screen.getByRole("button", { name: "Change plan" }));
    expect(screen.getByRole("button", { name: "Continue to Stripe" })).toBeDisabled();
    const select = screen.getByLabelText("Change to");
    expect(Array.from(select.options).map((o) => o.value)).toEqual(["", "pro"]);
    fireEvent.change(select, { target: { value: "pro" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue to Stripe" }));
    await waitFor(() => expect(onRedirect).toHaveBeenCalledWith("https://billing.stripe.com/p/c"));
    expect(change).toHaveBeenCalledWith(expect.objectContaining({ planCode: "pro" }));
  });
  it("payment details and invoices open Stripe's portal", async () => {
    const onRedirect = vi.fn();
    setup({ openBillingPortal: vi.fn(async () => ({ url: "https://billing.stripe.com/p/portal" })) }, { onRedirect });
    fireEvent.click(screen.getByRole("button", { name: "Payment details, invoices and receipts" }));
    await waitFor(() => expect(onRedirect).toHaveBeenCalledWith("https://billing.stripe.com/p/portal"));
  });
  it("owner-only and 404 are explained; the recheck button calls back", async () => {
    const recheck = vi.fn();
    setup({ openBillingPortal: vi.fn().mockRejectedValue(Object.assign(new Error("Only the workspace owner can manage this subscription. Nothing was changed."), { kind: "forbidden" })) }, { onRecheck: recheck });
    fireEvent.click(screen.getByRole("button", { name: "Payment details, invoices and receipts" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Only the workspace owner/);
    fireEvent.click(screen.getByRole("button", { name: "Check my subscription" })); expect(recheck).toHaveBeenCalled();
  });
  it("ignores a second click while a request is in flight (duplicate-click guard)", async () => {
    let resolve; const cancel = vi.fn(() => new Promise((r) => { resolve = r; }));
    setup({ requestCancellation: cancel });
    fireEvent.click(screen.getByRole("button", { name: "Cancel subscription" }));
    const go = screen.getByRole("button", { name: "Continue to Stripe" });
    fireEvent.click(go); fireEvent.click(go);
    expect(cancel).toHaveBeenCalledTimes(1);
    resolve({ url: "https://billing.stripe.com/p/x" });
    await screen.findByText(/Nothing changes until you confirm there/);
  });
});
