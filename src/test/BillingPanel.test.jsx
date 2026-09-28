import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import BillingPanel from "../BillingPanel";

const readySession = {
  status: "ready",
  accessToken: "customer-token",
  tenantId: "tenant-from-trusted-app-metadata",
  projectId: "project-1",
  brandId: "brand-1",
};

beforeEach(() => {
  global.fetch = vi.fn();
});

describe("paid beta checkout surface", () => {
  it("does not offer checkout to an unauthenticated customer", () => {
    render(<BillingPanel session={{ status: "signed-out" }} pathname="/" />);
    expect(screen.queryByRole("button", { name: /secure checkout/i })).not.toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("starts only the Standard checkout using authenticated session scope and no browser Price authority", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ checkout_session_id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/test" }),
    });
    const redirect = vi.fn();

    render(<BillingPanel session={readySession} pathname="/" onCheckoutRedirect={redirect} />);
    fireEvent.click(screen.getByRole("button", { name: /secure checkout/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain("/billing/stripe/checkout");
    expect(options.headers.authorization).toBe("Bearer customer-token");
    const body = JSON.parse(options.body);
    expect(body.tenant_id).toBe("tenant-from-trusted-app-metadata");
    expect(body.plan_code).toBe("standard");
    expect(body.request_id).toMatch(/^checkout_/);
    expect(body.price_id).toBeUndefined();
    expect(body.stripe_price_id).toBeUndefined();
    expect(body.policy_id).toBeUndefined();
    expect(Object.keys(body).sort()).toEqual(["plan_code", "request_id", "tenant_id"]);
    await waitFor(() => expect(redirect).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/test"));
    expect(screen.queryByText(/Pro/)).not.toBeInTheDocument();
  });

  it("handles owner authorization denial without claiming checkout success", async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 404 });
    render(<BillingPanel session={readySession} pathname="/" onCheckoutRedirect={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /secure checkout/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/not available for this account/i);
    expect(screen.queryByText(/payment confirmed/i)).not.toBeInTheDocument();
  });

  it("re-reads authenticated backend authority on the success return before showing entitlement", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: "ready",
        subscription: {
          plan_code: "standard",
          entitlement_status: "active",
          included_monthly_credit_grant: 60,
        },
        available_credits: 60,
      }),
    });

    render(<BillingPanel session={readySession} pathname="/billing/checkout/success" />);

    expect(screen.getByText(/returning from Stripe does not prove payment/i)).toBeInTheDocument();
    await screen.findByLabelText(/authoritative billing status/i);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain("/customer/billing/subscription");
    expect(options.headers.authorization).toBe("Bearer customer-token");
    expect(screen.getAllByText("60", { selector: "p" })).toHaveLength(2);
  });

  it("does not synthesize paid state when success return has no canonical subscription", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: "not_subscribed", subscription: null }),
    });

    render(<BillingPanel session={readySession} pathname="/billing/checkout/success?session_id=fake" />);

    // Exact route matching means query-derived state cannot become authority.
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.queryByText(/included monthly credits:/i)).not.toBeInTheDocument();
  });

  it("shows an unconfirmed state when the authoritative read reports no subscription", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: "not_subscribed", subscription: null }),
    });

    render(<BillingPanel session={readySession} pathname="/billing/checkout/success" />);
    expect(await screen.findByText(/payment is not confirmed yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/included monthly credits:/i)).not.toBeInTheDocument();
  });

  it("cancel return performs no billing mutation or entitlement read", () => {
    render(<BillingPanel session={readySession} pathname="/billing/checkout/cancel" />);
    expect(screen.getByRole("heading", { name: /checkout was not completed/i })).toBeInTheDocument();
    expect(screen.getByText(/no subscription or credits are granted/i)).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("keeps backend failure truthful and recoverable", async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 503 });
    render(<BillingPanel session={readySession} pathname="/" onCheckoutRedirect={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /secure checkout/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be started/i);
    expect(screen.getByRole("button", { name: /secure checkout/i })).toBeEnabled();
  });

  it("identifies unresolved customer policy instead of inventing cancellation or refund terms", () => {
    render(<BillingPanel session={readySession} pathname="/" />);
    expect(screen.getByText(/support, cancellation and refund terms must be approved/i)).toBeInTheDocument();
    expect(screen.queryByText(/Pro/)).not.toBeInTheDocument();
  });
});
