// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import React from "react";
import BillingPanel from "./BillingPanel";

vi.mock("./billingClient", () => ({ readCustomerBillingState: vi.fn(), startStandardCheckout: vi.fn() }));
import { readCustomerBillingState, startStandardCheckout } from "./billingClient";
const session = { status: "ready", accessToken: "t", tenantId: "tenant_a" };
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const notSubscribed = () => readCustomerBillingState.mockResolvedValue({ status: "not_subscribed", subscription: null });

describe("checkout button (BG-017C-05)", () => {
  it("a double click starts one checkout", async () => {
    notSubscribed(); let release; startStandardCheckout.mockImplementation(() => new Promise((r) => { release = () => r({ url: "https://checkout.stripe.test/x" }); }));
    const go = vi.fn(); render(<BillingPanel session={session} pathname="/" onCheckoutRedirect={go} />);
    const b = await screen.findByRole("button", { name: /continue to secure checkout/i }); fireEvent.click(b); fireEvent.click(b);
    expect(startStandardCheckout).toHaveBeenCalledTimes(1); release(); await waitFor(() => expect(go).toHaveBeenCalledWith("https://checkout.stripe.test/x"));
  });
  it("an unclear outcome shows the truthful message, re-reads plan status, and lets the customer retry", async () => {
    notSubscribed(); startStandardCheckout.mockRejectedValueOnce(Object.assign(new Error("We couldn't confirm whether checkout started. Nothing is shown as charged."), { kind: "ambiguous" })).mockResolvedValueOnce({ url: "https://checkout.stripe.test/x" });
    const go = vi.fn(); render(<BillingPanel session={session} pathname="/" onCheckoutRedirect={go} />);
    fireEvent.click(await screen.findByRole("button", { name: /continue to secure checkout/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't confirm/i);
    await waitFor(() => expect(readCustomerBillingState).toHaveBeenCalledTimes(2));
    fireEvent.click(await screen.findByRole("button", { name: /continue to secure checkout/i })); await waitFor(() => expect(go).toHaveBeenCalled());
    expect(startStandardCheckout).toHaveBeenCalledTimes(2);
  });
  it("no checkout is offered once the plan is active (a retry cannot start a second subscription)", async () => {
    readCustomerBillingState.mockResolvedValue({ status: "ready", subscription: { plan_code: "standard", entitlement_status: "active" } });
    render(<BillingPanel session={session} pathname="/" />); await waitFor(() => expect(readCustomerBillingState).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /continue to secure checkout/i })).toBeNull();
  });
});
