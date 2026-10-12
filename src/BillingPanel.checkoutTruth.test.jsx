// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import React from "react";
import BillingPanel from "./BillingPanel";

vi.mock("./billingClient", () => ({
  readCustomerBillingState: vi.fn(),
  startStandardCheckout: vi.fn(),
}));
import { readCustomerBillingState } from "./billingClient";

const session = { status: "ready", accessToken: "fake-test-token", tenantId: "test-tenant" };
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe("checkout return billing truth", () => {
  it("does not claim a payment succeeded when an existing entitlement is unlinked", async () => {
    readCustomerBillingState.mockResolvedValue({
      status: "ready",
      subscription: { plan_code: "standard", entitlement_status: "active", included_monthly_credit_grant: 60 },
      available_credits: 60,
    });
    render(<BillingPanel session={session} pathname="/billing/checkout/success" />);
    await waitFor(() => expect(screen.getByText(/Access entitlement found — payment not verified/i)).toBeTruthy());
    expect(screen.getByText(/does not by itself confirm a successful Stripe payment/i)).toBeTruthy();
    expect(screen.getAllByText("60", { exact: true })).toBeTruthy();
  });
  it("does not claim payment or grant when no entitlement exists", async () => {
    readCustomerBillingState.mockResolvedValue({ status: "not_subscribed", subscription: null });
    render(<BillingPanel session={session} pathname="/billing/checkout/success" />);
    await waitFor(() => expect(screen.getByText("Payment is not confirmed yet.")).toBeTruthy());
    expect(screen.queryByText(/Access entitlement found/i)).toBeNull();
  });
});
