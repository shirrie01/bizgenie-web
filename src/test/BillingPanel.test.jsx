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
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: "not_subscribed", subscription: null }),
    });
    global.fetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ checkout_session_id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/test" }),
    });
    const redirect = vi.fn();

    render(<BillingPanel session={readySession} pathname="/" onCheckoutRedirect={redirect} />);
    fireEvent.click(await screen.findByRole("button", { name: /secure checkout/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    expect(global.fetch.mock.calls[0][0]).toContain("/customer/billing/subscription");
    const [url, options] = global.fetch.mock.calls[1];
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
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: "not_subscribed", subscription: null }),
    });
    global.fetch.mockResolvedValue({ ok: false, status: 404 });
    render(<BillingPanel session={readySession} pathname="/" onCheckoutRedirect={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: /secure checkout/i }));
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

    expect(screen.getByText(/does not by itself confirm a payment/i)).toBeInTheDocument();
    await screen.findByLabelText(/your plan/i);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain("/customer/billing/subscription");
    expect(options.headers.authorization).toBe("Bearer customer-token");
    expect(screen.getByText("Credits included each month")).toBeInTheDocument();
    expect(screen.getByText("Credits available now")).toBeInTheDocument();
    expect(screen.getAllByText("60", { selector: "dd" })).toHaveLength(2);
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
    expect(await screen.findByText(/your plan is not active yet/i)).toBeInTheDocument();
    expect(screen.getByText(/has not received confirmation from stripe/i)).toBeInTheDocument();
    expect(screen.queryByText(/included monthly credits:/i)).not.toBeInTheDocument();
  });

  it("cancel return performs no billing mutation or entitlement read", () => {
    render(<BillingPanel session={readySession} pathname="/billing/checkout/cancel" />);
    expect(screen.getByRole("heading", { name: /checkout was not completed/i })).toBeInTheDocument();
    expect(screen.getByText(/no plan access or credits were added by this visit/i)).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("keeps backend failure truthful and recoverable", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: "not_subscribed", subscription: null }),
    });
    global.fetch.mockResolvedValue({ ok: false, status: 503 });
    render(<BillingPanel session={readySession} pathname="/" onCheckoutRedirect={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: /secure checkout/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be started/i);
    expect(screen.getByRole("button", { name: /secure checkout/i })).toBeEnabled();
  });

  it("identifies unresolved customer policy instead of inventing cancellation or refund terms", () => {
    render(<BillingPanel session={readySession} pathname="/" />);
    expect(screen.getByText(/not yet published customer support, cancellation and refund terms/i)).toBeInTheDocument();
    expect(screen.queryByText(/Pro/)).not.toBeInTheDocument();
  });

  // ---- BG-STUDIO-017-FE (DEC-023): billing driven by the API's entitlement, no invented price or credit allowance ----
  const sub = (over = {}, extra = {}) => ({ ok: true, status: 200, json: async () => ({ status: "ready", subscription: { plan_code: "standard", entitlement_status: "active", included_monthly_credit_grant: 125, reference_period_start: "2026-10-01T00:00:00.000Z", reference_period_end: "2026-11-01T00:00:00.000Z", ...over }, available_credits: 90, ...extra }) });

  it("shows plan, credits and period from the API only: the allowance is not hard-coded", async () => {
    global.fetch.mockResolvedValue(sub());
    render(<BillingPanel session={readySession} pathname="/" />);
    expect(await screen.findByText(/standard plan · active/i)).toBeInTheDocument();
    expect(screen.getByText("125", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText("90", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText(/1 October 2026 to 1 November 2026/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\b60\b/);
    expect(screen.queryByRole("button", { name: /secure checkout/i })).toBeNull(); // already entitled: never a second checkout
  });

  it("never states a price or a payment result: no currency amount, and an active plan is not called a payment", async () => {
    global.fetch.mockResolvedValue(sub());
    render(<BillingPanel session={readySession} pathname="/" />);
    await screen.findByText(/standard plan · active/i);
    const text = document.body.textContent;
    expect(text).not.toMatch(/[£$€]\s?\d|\d\s?(per|a|\/)\s?(month|year)/i);
    expect(text).not.toMatch(/payment (was )?(confirmed|successful|received)|thank you for your payment|you have paid|payment verified/i);
    expect(screen.getByText(/not a payment receipt/i)).toBeInTheDocument();
  });

  it.each([
    ["grace", { grace_ends_at: "2026-11-05T00:00:00.000Z" }, "Grace period", /until 5 November 2026/, false],
    ["cancel_pending", { cancellation_effective_at: "2026-11-01T00:00:00.000Z" }, "Ending", /access ends on 1 November 2026/, false],
    ["cancelled", {}, "Ended", /your plan has ended/i, true],
    ["inactive", {}, "Not active", /^your plan access is not active\.$/i, true],
  ])("says what a %s entitlement means, and offers checkout only when no access remains", async (status, extra, label, text, offersCheckout) => {
    global.fetch.mockResolvedValue(sub({ entitlement_status: status, ...extra }));
    render(<BillingPanel session={readySession} pathname="/" />);
    expect(await screen.findByText(`Standard plan · ${label}`, { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(Boolean(screen.queryByRole("button", { name: /secure checkout/i }))).toBe(offersCheckout);
  });

  it("success return without confirmation offers 'Check again', which re-reads the authority and then shows the plan", async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ status: "not_subscribed", subscription: null, available_credits: null }) });
    global.fetch.mockResolvedValueOnce(sub());
    render(<BillingPanel session={readySession} pathname="/billing/checkout/success" />);
    await screen.findByText(/your plan is not active yet/i);
    expect(screen.getByText(/do not pay again/i)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/payment (was )?(confirmed|successful|received)/i);
    fireEvent.click(screen.getByRole("button", { name: /^check again$/i }));
    await screen.findByText(/standard plan · active/i);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
