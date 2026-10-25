import { useEffect, useState } from "react";
import { readCustomerBillingState, startStandardCheckout } from "./billingClient";

const SUCCESS_PATH = "/billing/checkout/success";
const CANCEL_PATH = "/billing/checkout/cancel";

function defaultRedirect(url) {
  window.location.assign(url);
}

// BG-STUDIO-017-FE (DEC-023). Everything shown here comes from GET /customer/billing/subscription. No price, credit
// allowance or term is written in this file: the backend and the Stripe Price own them, and no pricing/terms canon exists in
// either repository to quote. The price is shown by Stripe's hosted checkout before payment.
// Statuses that still carry access: a new checkout is not offered (it would charge twice). "cancelled"/"inactive" may subscribe again.
const ENTITLED = ["active", "grace", "cancel_pending"];
const dateOf = (value) => {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "";
};
const planName = (code) => (typeof code === "string" && code ? code.charAt(0).toUpperCase() + code.slice(1) : "Your plan");

// Wording for each entitlement status the backend can return. "Active" describes access, never a payment.
function accessSummary(subscription) {
  const status = subscription.entitlement_status;
  const ends = dateOf(subscription.cancellation_effective_at || subscription.ends_at);
  const grace = dateOf(subscription.grace_ends_at);
  if (status === "active") return { label: "Active", text: "Your plan access is active." };
  if (status === "grace") return { label: "Grace period", text: `Your plan access continues for a short time${grace ? `, until ${grace}` : ""}. Check your payment details with Stripe so it is not interrupted.` };
  if (status === "cancel_pending") return { label: "Ending", text: `Your plan has been cancelled and access ends${ends ? ` on ${ends}` : " at the end of the current period"}.` };
  if (status === "cancelled") return { label: "Ended", text: "Your plan has ended." };
  return { label: "Not active", text: "Your plan access is not active." };
}

function BillingState({ state, onRecheck }) {
  if (state.status === "loading") return <p role="status">Checking your BizGenie billing status…</p>;
  if (state.status === "error") return <p className="error" role="alert">{state.error}</p>;
  if (state.status !== "ready") return null;

  const subscription = state.data?.subscription;
  if (!subscription) {
    return (
      <div className="billing-status" role="status">
        <strong>Your plan is not active yet.</strong>
        <p>BizGenie has not received confirmation from Stripe for this account, so no plan access or credits are shown. Confirmation can take a minute after you pay.</p>
        <p>If you have just paid, press <em>Check again</em>. If your plan still does not appear, do not pay again: look for the receipt Stripe emailed you.</p>
        {onRecheck && <button type="button" className="secondary" onClick={onRecheck}>Check again</button>}
      </div>
    );
  }

  const summary = accessSummary(subscription);
  const start = dateOf(subscription.reference_period_start);
  const end = dateOf(subscription.reference_period_end);
  return (
    <div className="billing-status" aria-label="Your plan">
      <p><strong>{planName(subscription.plan_code)} plan · {summary.label}</strong></p>
      <p>{summary.text}</p>
      <dl className="billing-facts">
        {Number.isFinite(subscription.included_monthly_credit_grant) && (<><dt>Credits included each month</dt><dd>{subscription.included_monthly_credit_grant}</dd></>)}
        {Number.isFinite(state.data?.available_credits) && (<><dt>Credits available now</dt><dd>{state.data.available_credits}</dd></>)}
        {start && end && (<><dt>Current period</dt><dd>{start} to {end}</dd></>)}
      </dl>
      <p className="notice">This shows your BizGenie plan access and credits. It is not a payment receipt: payments, receipts and card details are handled by Stripe.</p>
    </div>
  );
}

export default function BillingPanel({ session, pathname = window.location.pathname, onCheckoutRedirect = defaultRedirect }) {
  const [checkout, setCheckout] = useState({ status: "idle", error: "" });
  const [billing, setBilling] = useState({ status: "idle", data: null, error: "" });
  const [recheckTick, setRecheckTick] = useState(0);
  const recheck = () => setRecheckTick((n) => n + 1);
  const isSuccess = pathname === SUCCESS_PATH;
  const isCancel = pathname === CANCEL_PATH;

  useEffect(() => {
    let active = true;
    if (session.status !== "ready" || isCancel || pathname.startsWith(SUCCESS_PATH + "?")) {
      setBilling({ status: "idle", data: null, error: "" });
      return () => { active = false; };
    }

    setBilling({ status: "loading", data: null, error: "" });
    readCustomerBillingState({ accessToken: session.accessToken, tenantId: session.tenantId })
      .then((data) => {
        if (active) setBilling({ status: "ready", data, error: "" });
      })
      .catch((error) => {
        if (active) setBilling({ status: "error", data: null, error: error.message });
      });
    return () => { active = false; };
  }, [session.status, session.accessToken, isCancel, pathname, recheckTick]);

  const activeEntitlement =
    billing.status === "ready" &&
    ENTITLED.includes(billing.data?.subscription?.entitlement_status);

  const checkoutBlocked =
    billing.status !== "ready" ||
    activeEntitlement ||
    checkout.status === "loading" ||
    checkout.status === "redirecting";

  async function beginCheckout() {
    if (session.status !== "ready" || checkoutBlocked) return;
    setCheckout({ status: "loading", error: "" });
    try {
      const result = await startStandardCheckout({
        accessToken: session.accessToken,
        tenantId: session.tenantId,
      });
      setCheckout({ status: "redirecting", error: "" });
      onCheckoutRedirect(result.url);
    } catch (error) {
      setCheckout({ status: "error", error: error.message });
    }
  }

  if (isCancel) {
    return (
      <section className="recommendation" aria-label="Checkout cancelled">
        <p className="eyebrow">Paid beta</p>
        <h2>Checkout was not completed</h2>
        <p>You left checkout, so no plan access or credits were added by this visit. You can keep using your workspace or start checkout again later.</p>
        <a className="text-link" href="/">Return to BizGenie</a>
      </section>
    );
  }

  if (isSuccess) {
    return (
      <section className="recommendation" aria-label="Checkout return">
        <p className="eyebrow">Paid beta</p>
        <h2>Confirming your subscription</h2>
        <p>Coming back from Stripe does not by itself confirm a payment, so BizGenie checks your account before showing any plan access or credits.</p>
        {session.status !== "ready" ? (
          <p role="status">Sign in to this BizGenie account to verify the subscription.</p>
        ) : (
          <BillingState state={billing} onRecheck={recheck} />
        )}
        <a className="text-link" href="/">Continue to workspace</a>
      </section>
    );
  }

  if (session.status !== "ready") return null;

  return (
    <section className="recommendation" aria-label="Paid beta plan">
      <div className="recommendation-header">
        <div><p className="eyebrow">Paid beta</p><h2>Your BizGenie plan</h2></div>
        {!activeEntitlement && <span className="pill">Standard</span>}
      </div>
      <p>Checkout is hosted securely by Stripe, which shows the price and billing terms before you pay. Your plan access starts only after BizGenie receives confirmation from Stripe.</p>
      {billing.status === "loading" && (
        <p role="status">Checking your existing subscription…</p>
      )}
      {billing.status === "error" && (
        <p className="error" role="alert">
          {billing.error} Checkout is unavailable until your account can be checked.
        </p>
      )}
      {billing.status === "ready" && billing.data?.subscription && <BillingState state={billing} />}
      {billing.status === "ready" && !activeEntitlement ? (
        <button type="button" onClick={beginCheckout} disabled={checkoutBlocked}>
          {checkout.status === "loading" ? "Starting checkout…" : checkout.status === "redirecting" ? "Opening checkout…" : "Continue to secure checkout"}
        </button>
      ) : null}
      {checkout.status === "error" && <p className="error" role="alert">{checkout.error}</p>}
      <p className="notice"><strong>Terms:</strong> BizGenie has not yet published customer support, cancellation and refund terms in the app, so none are shown here.</p>
    </section>
  );
}

export { CANCEL_PATH, SUCCESS_PATH };
