import React, { useEffect, useState } from "react";
import BillingPanel from "../BillingPanel";
import { startStandardCheckout } from "../billingClient";
import BillingManagement from "./BillingManagement";
import PlanCatalogue from "./PlanCatalogue";
import { fetchPlanCatalogue, isPlanCatalogueApiEnabled } from "./planCatalogueClient";
import { isBillingManagementApiEnabled } from "./billingManagementClient";

// Plan and billing for the Premium Studio (BG-STUDIO-019-FE, A + B2). The current subscription still comes from BillingPanel (the existing
// backend read); plans, prices and terms come ONLY from the server catalogue when VITE_PLAN_CATALOGUE_API=true, and management actions only when
// VITE_BILLING_MANAGEMENT_API=true. With both gates off this renders what it did before: the subscription panel and Stripe-hosted checkout.
const ENTITLED = ["active", "grace", "cancel_pending"];
const API = () => import.meta.env.VITE_BIZGENIE_API_URL || "http://localhost:8080";
const redirectDefault = (url) => window.location.assign(url);

export default function PremiumBilling({ session, isOwner, api = {}, onRedirect = redirectDefault, env = import.meta.env }) {
  const catalogueOn = isPlanCatalogueApiEnabled(env); const manageOn = isBillingManagementApiEnabled(env);
  const [cat, setCat] = useState({ status: "idle", catalogue: null, error: "" });
  const [billing, setBilling] = useState({ status: "idle", data: null });
  const [tick, setTick] = useState(0);
  const [choosing, setChoosing] = useState(""); const [notice, setNotice] = useState("");
  const load = api.fetchPlanCatalogue || fetchPlanCatalogue; const checkout = api.startCheckout || startStandardCheckout;

  useEffect(() => {
    if (!catalogueOn || session.status !== "ready") return undefined;
    let live = true; setCat({ status: "loading", catalogue: null, error: "" });
    load({ apiBaseUrl: API(), accessToken: session.accessToken, tenantId: session.tenantId })
      .then((catalogue) => { if (live) setCat({ status: "ready", catalogue, error: "" }); })
      .catch((e) => { if (live) setCat({ status: "error", catalogue: null, error: e.message }); });
    return () => { live = false; };
  }, [catalogueOn, session.status, session.accessToken, session.tenantId, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const subscription = billing.status === "ready" && billing.data ? billing.data.subscription || null : null;
  const entitled = Boolean(subscription) && ENTITLED.includes(subscription.entitlement_status);
  const showCatalogue = catalogueOn && cat.status === "ready";
  const choose = async (plan) => {
    if (choosing) return; setChoosing(plan.planCode); setNotice("");
    try { const r = await checkout({ accessToken: session.accessToken, tenantId: session.tenantId, planCode: plan.planCode }); onRedirect(r.url); }
    catch (e) { setNotice(e.message); setChoosing(""); }
  };

  return (
    <div className="ps-billing">
      <BillingPanel session={session} showCheckout={!catalogueOn} showTermsNotice={!showCatalogue} onBillingChange={setBilling} refreshKey={tick} />
      {catalogueOn && cat.status === "loading" && <p role="status">Loading plans and prices…</p>}
      {catalogueOn && cat.status === "error" && (
        <section className="ps-plans" aria-label="Plans and prices"><p className="error" role="alert">{cat.error}</p><button type="button" className="secondary" onClick={() => setTick((n) => n + 1)}>Try again</button></section>
      )}
      {!catalogueOn && <section className="ps-plans" aria-label="Plans and prices"><h3>Plans and prices</h3><p>BizGenie has not published plans, prices and terms in the app yet, so none are shown. Stripe shows the price before you pay.</p></section>}
      {showCatalogue && <PlanCatalogue catalogue={cat.catalogue} canChoose={Boolean(isOwner) && !entitled} onChoose={entitled ? undefined : choose} choosing={choosing} notice={notice} />}
      <BillingManagement enabled={manageOn} isOwner={Boolean(isOwner)} session={session} subscription={subscription} catalogue={cat.catalogue} onRecheck={() => setTick((n) => n + 1)} api={api} onRedirect={onRedirect} />
    </div>
  );
}
