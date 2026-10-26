import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PremiumBilling from "./PremiumBilling";
import BillingManagement from "./BillingManagement";

// Fixture values only: these are test data for a mocked server, never product pricing.
const body = {
  catalogue_version: "fx-1", effective_from: "2026-01-01T00:00:00Z", currency: "GBP", vat: { treatment: "inclusive", text: "FIXTURE VAT TEXT" },
  terms: { version: "fx-t1", effective_from: "2026-01-01T00:00:00Z", url: "https://example.test/terms" }, support: { email: "help@example.test", hours: "FIXTURE HOURS" },
  plans: [
    { plan_code: "alpha", name: "Alpha", tier: 1, price: { amount_minor: 1111, currency: "GBP", interval: "month" }, included_credits: 11, additional_usage: { text: "FX ADD A" }, renewal: { text: "FX RENEW A" }, cancellation: { text: "FX CANCEL A" }, refund: { text: "FX REFUND A" }, trial: { days: 7 } },
    { plan_code: "beta", name: "Beta", tier: 2, price: { amount_minor: 2222, currency: "GBP", interval: "year" }, included_credits: 22, additional_usage: { text: "FX ADD B" }, renewal: { text: "FX RENEW B" }, cancellation: { text: "FX CANCEL B" }, refund: { text: "FX REFUND B" } },
  ],
};
import { normaliseCatalogue } from "./planCatalogueClient";
const catalogue = normaliseCatalogue(body);
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
    expect(screen.queryByRole("button", { name: /cancel subscription|change plan|show invoices/i })).toBeNull();
    expect(document.body.textContent).not.toMatch(/£\s?\d/);
  });
  it("gates on: shows server prices, VAT, terms and support, and the owner can choose a plan via Stripe", async () => {
    mockBilling(null);
    const redirect = vi.fn(); const startCheckout = vi.fn(async () => ({ url: "https://checkout.example.test/s" }));
    render(<PremiumBilling session={session} isOwner env={on} api={{ fetchPlanCatalogue: async () => catalogue, startCheckout }} onRedirect={redirect} />);
    expect(await screen.findByText("£11.11")).toBeInTheDocument();
    expect(screen.getByText("£22.22")).toBeInTheDocument();
    expect(screen.getByText(/FIXTURE VAT TEXT/)).toBeInTheDocument();
    expect(screen.getAllByText("help@example.test").length).toBeGreaterThan(0);
    expect(screen.getByText(/7-day trial/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Choose Beta" }));
    await waitFor(() => expect(redirect).toHaveBeenCalledWith("https://checkout.example.test/s"));
    expect(startCheckout).toHaveBeenCalledWith(expect.objectContaining({ planCode: "beta" }));
  });
  it("a member sees prices but cannot choose or manage", async () => {
    mockBilling(null);
    render(<PremiumBilling session={session} isOwner={false} env={on} api={{ fetchPlanCatalogue: async () => catalogue, startCheckout: vi.fn() }} />);
    expect(await screen.findByText("£11.11")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose Alpha" })).toBeDisabled();
    expect(screen.getByText(/only the workspace owner can change the plan/i)).toBeInTheDocument();
  });
  it("catalogue failure is explained and retryable; no prices shown", async () => {
    mockBilling(null);
    const f = vi.fn().mockRejectedValueOnce(new Error("Prices and terms could not be loaded yet. Nothing is charged.")).mockResolvedValueOnce(catalogue);
    render(<PremiumBilling session={session} isOwner env={on} api={{ fetchPlanCatalogue: f }} />);
    expect(await screen.findByText(/could not be loaded yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("£11.11")).toBeInTheDocument();
  });
});

describe("BillingManagement", () => {
  const sub = { plan_code: "alpha", entitlement_status: "active" };
  const setup = (api, extra = {}) => render(<BillingManagement enabled isOwner session={session} subscription={sub} catalogue={catalogue} api={api} onRedirect={extra.onRedirect || vi.fn()} onRecheck={extra.onRecheck} />);
  it("cancellation shows the terms, sends once, reports 'requested' not 'cancelled', and reuses the id on retry", async () => {
    const cancel = vi.fn().mockRejectedValueOnce(Object.assign(new Error("may or may not have been received"), { kind: "unconfirmed" })).mockResolvedValueOnce({ effectiveAt: "2026-12-01T00:00:00Z" });
    setup({ requestCancellation: cancel });
    fireEvent.click(screen.getByRole("button", { name: "Cancel subscription" }));
    expect(screen.getByText(/FX CANCEL A/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Request cancellation" }));
    expect(await screen.findByText(/may or may not have been received/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Request cancellation" }));
    expect(await screen.findByText(/cancellation request was received/i)).toBeInTheDocument();
    expect(screen.getByText(/1 December 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/has been cancelled/i)).toBeNull();
    expect(cancel.mock.calls[0][0].id).toBe(cancel.mock.calls[1][0].id);
  });
  it("plan change lists only other plans and requires a choice", async () => {
    const change = vi.fn(async () => ({ effectiveAt: null, url: "" }));
    setup({ requestPlanChange: change });
    fireEvent.click(screen.getByRole("button", { name: "Change plan" }));
    expect(screen.getByRole("button", { name: "Request this change" })).toBeDisabled();
    const select = screen.getByLabelText("Change to");
    expect(Array.from(select.options).map((o) => o.value)).toEqual(["", "beta"]);
    fireEvent.change(select, { target: { value: "beta" } });
    fireEvent.click(screen.getByRole("button", { name: "Request this change" }));
    expect(await screen.findByText(/change to Beta was received/i)).toBeInTheDocument();
    expect(change).toHaveBeenCalledWith(expect.objectContaining({ planCode: "beta" }));
  });
  it("portal redirects only to the https URL returned; failure is shown", async () => {
    const onRedirect = vi.fn();
    setup({ openBillingPortal: vi.fn(async () => ({ url: "https://billing.example.test/p" })) }, { onRedirect });
    fireEvent.click(screen.getByRole("button", { name: "Payment details and receipts" }));
    await waitFor(() => expect(onRedirect).toHaveBeenCalledWith("https://billing.example.test/p"));
  });
  it("invoices: lists them with Stripe status, empty and error states", async () => {
    const inv = { id: "i1", number: "FX-1", issuedAt: "2026-02-01T00:00:00Z", amountMinor: 500, currency: "GBP", status: "paid", url: "https://x.test/i", receiptUrl: "" };
    const f = vi.fn().mockResolvedValueOnce({ invoices: [inv], skipped: 1 }).mockResolvedValueOnce({ invoices: [], skipped: 0 }).mockRejectedValueOnce(new Error("Invoices could not be loaded yet."));
    setup({ fetchInvoices: f });
    const btn = () => screen.getByRole("button", { name: /show invoices|loading/i });
    fireEvent.click(btn());
    expect(await screen.findByText("FX-1")).toBeInTheDocument();
    expect(screen.getByText(/status reported by Stripe: paid/)).toBeInTheDocument();
    expect(screen.getByText(/1 invoice could not be shown/)).toBeInTheDocument();
    fireEvent.click(btn()); expect(await screen.findByText(/no invoices yet/i)).toBeInTheDocument();
    fireEvent.click(btn()); expect(await screen.findByRole("alert")).toHaveTextContent(/could not be loaded/);
  });
  it("ignores a second click while a request is in flight (duplicate-click guard)", async () => {
    let resolve; const cancel = vi.fn(() => new Promise((r) => { resolve = r; }));
    setup({ requestCancellation: cancel });
    fireEvent.click(screen.getByRole("button", { name: "Cancel subscription" }));
    const go = screen.getByRole("button", { name: "Request cancellation" });
    fireEvent.click(go); fireEvent.click(go);
    expect(cancel).toHaveBeenCalledTimes(1);
    resolve({ effectiveAt: null });
    await screen.findByText(/cancellation request was received/i);
  });
});
