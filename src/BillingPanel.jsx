import { useEffect, useState } from "react";
import { readCustomerBillingState, startStandardCheckout } from "./billingClient";

const SUCCESS_PATH = "/billing/checkout/success";
const CANCEL_PATH = "/billing/checkout/cancel";

function defaultRedirect(url) {
  window.location.assign(url);
}

function BillingState({ state }) {
  if (state.status === "loading") return <p role="status">Checking your BizGenie billing status…</p>;
  if (state.status === "error") return <p className="error" role="alert">{state.error}</p>;
  if (state.status !== "ready") return null;

  const subscription = state.data?.subscription;
  if (!subscription) {
    return (
      <div className="billing-status" role="status">
        <strong>Payment is not confirmed yet.</strong>
        <p>BizGenie has not received authoritative subscription entitlement for this account. No paid access or credits are being claimed from this return alone.</p>
      </div>
    );
  }

  return (
    <div className="billing-status" aria-label="Authoritative billing status">
      <p><strong>Plan:</strong> {subscription.plan_code || "Standard"}</p>
      <p><strong>Entitlement:</strong> {subscription.entitlement_status || "Not active"}</p>
      {Number.isFinite(subscription.included_monthly_credit_grant) && (
        <p><strong>Included monthly credits:</strong> {subscription.included_monthly_credit_grant}</p>
      )}
      {Number.isFinite(state.data?.available_credits) && (
        <p><strong>Available credits:</strong> {state.data.available_credits}</p>
      )}
    </div>
  );
}

export default function BillingPanel({ session, pathname = window.location.pathname, onCheckoutRedirect = defaultRedirect }) {
  const [checkout, setCheckout] = useState({ status: "idle", error: "" });
  const [billing, setBilling] = useState({ status: "idle", data: null, error: "" });
  const isSuccess = pathname === SUCCESS_PATH;
  const isCancel = pathname === CANCEL_PATH;

  useEffect(() => {
    let active = true;
    if (!isSuccess || session.status !== "ready") return () => { active = false; };

    setBilling({ status: "loading", data: null, error: "" });
    readCustomerBillingState({ accessToken: session.accessToken })
      .then((data) => {
        if (active) setBilling({ status: "ready", data, error: "" });
      })
      .catch((error) => {
        if (active) setBilling({ status: "error", data: null, error: error.message });
      });
    return () => { active = false; };
  }, [isSuccess, session.status, session.accessToken]);

  async function beginCheckout() {
    if (session.status !== "ready" || checkout.status === "loading") return;
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
        <p>No subscription or credits are granted by this cancelled return. You can continue using your workspace or choose to start checkout again later.</p>
        <a className="text-link" href="/">Return to BizGenie</a>
      </section>
    );
  }

  if (isSuccess) {
    return (
      <section className="recommendation" aria-label="Checkout return">
        <p className="eyebrow">Paid beta</p>
        <h2>Checking your subscription</h2>
        <p>Returning from Stripe does not prove payment. BizGenie checks its authenticated billing authority before showing paid access or credits.</p>
        {session.status !== "ready" ? (
          <p role="status">Sign in to this BizGenie account to verify the subscription.</p>
        ) : (
          <BillingState state={billing} />
        )}
        <a className="text-link" href="/">Continue to workspace</a>
      </section>
    );
  }

  if (session.status !== "ready") return null;

  return (
    <section className="recommendation" aria-label="Paid beta plan">
      <div className="recommendation-header">
        <div><p className="eyebrow">Paid beta</p><h2>BizGenie Standard</h2></div>
        <span className="pill">Standard</span>
      </div>
      <p>Standard includes <strong>60 credits each month</strong>. Checkout is hosted securely by Stripe; BizGenie activates entitlement only after verified billing evidence reaches the backend.</p>
      <button type="button" onClick={beginCheckout} disabled={checkout.status === "loading" || checkout.status === "redirecting"}>
        {checkout.status === "loading" ? "Starting checkout…" : checkout.status === "redirecting" ? "Opening checkout…" : "Continue to secure checkout"}
      </button>
      {checkout.status === "error" && <p className="error" role="alert">{checkout.error}</p>}
      <p className="notice"><strong>Launch policy notice:</strong> customer support, cancellation and refund terms must be approved before paid activation. BizGenie does not invent or imply terms that are not yet canonical.</p>
    </section>
  );
}

export { CANCEL_PATH, SUCCESS_PATH };
