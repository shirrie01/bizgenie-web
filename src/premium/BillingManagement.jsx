import React, { useRef, useState } from "react";
import { openBillingPortal as realOpenPortal, requestCancellation as realCancel, requestId, requestPlanChange as realChange } from "./billingManagementClient";
import { formatMoney } from "./planCatalogueClient";

// Subscription management (BG-STUDIO-019/020-FE, workstream B2), matching the backend DRAFT in bizgenie-api PR #216 (unmounted there).
// Every action opens a Stripe-HOSTED page where the customer confirms; BizGenie never changes a plan or cancels from this screen, and nothing is
// reported as done: the subscription changes only when Stripe's webhook reaches BizGenie and the subscription read shows it. Real buttons exist only
// when the backend offers the route (build gate) and the caller is the workspace owner; otherwise the page says plainly what is not available.
// There is no invoices endpoint: invoices and receipts are in Stripe's portal.
const redirectDefault = (url) => window.location.assign(url);
const SUPPORT = "A support contact has not been published yet.";

export default function BillingManagement({ enabled, isOwner, session, subscription, catalogue, onRecheck, api = {}, onRedirect = redirectDefault }) {
  const openPortal = api.openBillingPortal || realOpenPortal; const change = api.requestPlanChange || realChange; const cancel = api.requestCancellation || realCancel;
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState({ kind: "", text: "" });
  const [panel, setPanel] = useState(""); // "", "change", "cancel"
  const [target, setTarget] = useState("");
  const reqIds = useRef({ portal: null, change: null, cancel: null }).current; // a retry of the SAME request reuses its id
  const base = () => ({ apiBaseUrl: import.meta.env.VITE_BIZGENIE_API_URL || "http://localhost:8080", accessToken: session.accessToken, tenantId: session.tenantId });
  const run = async (name, work) => {
    if (busy) return; setBusy(name); setMsg({ kind: "", text: "" });
    try { await work(); } catch (error) { setMsg({ kind: error.kind === "unconfirmed" ? "warn" : "error", text: error.message }); } finally { setBusy(""); }
  };

  if (!enabled) {
    return (
      <section className="ps-manage" aria-labelledby="pbm-h">
        <h3 id="pbm-h">Manage your subscription</h3>
        <p>Changing plan, cancelling, updating payment details and viewing invoices are not available in BizGenie yet. {SUPPORT}</p>
      </section>
    );
  }
  if (!isOwner) {
    return (
      <section className="ps-manage" aria-labelledby="pbm-h">
        <h3 id="pbm-h">Manage your subscription</h3>
        <p>Only the workspace owner can change the plan, cancel, update payment details or see invoices. {SUPPORT}</p>
      </section>
    );
  }
  const current = subscription && subscription.plan_code;
  const others = (catalogue ? catalogue.plans : []).filter((p) => p.planCode !== current);
  const chosen = others.find((p) => p.planCode === target);
  const currentPlan = catalogue && catalogue.plans.find((p) => p.planCode === current);
  const toStripe = (key, work) => run(key, async () => { reqIds[key] = reqIds[key] || requestId(key); const r = await work(reqIds[key]); reqIds[key] = null; setPanel(""); setMsg({ kind: "ok", text: "Taking you to Stripe to confirm. Nothing changes until you confirm there and BizGenie receives Stripe's confirmation." }); onRedirect(r.url); });

  return (
    <section className="ps-manage" aria-labelledby="pbm-h">
      <h3 id="pbm-h">Manage your subscription</h3>
      <p className="ps-hint">Each of these opens a Stripe page where you confirm. Your plan changes only when Stripe confirms it to BizGenie.</p>
      {msg.text && <p className={msg.kind === "error" ? "error" : msg.kind === "warn" ? "ps-warn" : ""} role={msg.kind === "ok" ? "status" : "alert"}>{msg.text}</p>}
      <div className="ps-camp-actions">
        <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => toStripe("portal", (id) => openPortal({ ...base(), id }))}>{busy === "portal" ? "Opening…" : "Payment details, invoices and receipts"}</button>
        {subscription && others.length > 0 && <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => { setPanel(panel === "change" ? "" : "change"); setMsg({ kind: "", text: "" }); }} aria-expanded={panel === "change"}>Change plan</button>}
        {subscription && <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => { setPanel(panel === "cancel" ? "" : "cancel"); setMsg({ kind: "", text: "" }); }} aria-expanded={panel === "cancel"}>Cancel subscription</button>}
      </div>

      {panel === "change" && (
        <div role="group" aria-label="Change plan" className="ps-camp-edit">
          <label htmlFor="pbm-target">Change to</label>
          <select id="pbm-target" value={target} onChange={(e) => setTarget(e.target.value)}><option value="">Choose a plan</option>{others.map((p) => <option key={p.planCode} value={p.planCode}>{p.name} ({formatMoney(p.priceMinor, p.currency)} {p.interval === "month" ? "per month" : "per year"})</option>)}</select>
          {chosen && <p className="ps-hint">Read the <a href={chosen.terms.url} target="_blank" rel="noopener noreferrer">terms</a>, <a href={chosen.terms.cancellationUrl} target="_blank" rel="noopener noreferrer">cancellation</a> and <a href={chosen.terms.refundUrl} target="_blank" rel="noopener noreferrer">refund</a> rules first. Stripe shows what will change and when before you confirm.</p>}
          <div className="ps-camp-actions"><button type="button" className="ps-primary" disabled={!chosen || Boolean(busy)} onClick={() => toStripe("change", (id) => change({ ...base(), planCode: chosen.planCode, id }))}>{busy === "change" ? "Opening…" : "Continue to Stripe"}</button><button type="button" className="secondary" onClick={() => setPanel("")} disabled={Boolean(busy)}>Keep my plan</button></div>
        </div>
      )}
      {panel === "cancel" && (
        <div role="group" aria-label="Cancel subscription" className="ps-camp-edit">
          {currentPlan ? <p>Read the <a href={currentPlan.terms.cancellationUrl} target="_blank" rel="noopener noreferrer">cancellation rules</a> and the <a href={currentPlan.terms.refundUrl} target="_blank" rel="noopener noreferrer">refund rules</a> first.</p> : <p>The approved cancellation terms are not available here yet.</p>}
          <p className="ps-hint">Stripe shows when your access would end before you confirm. The date shown on your subscription here is the one that counts once Stripe has confirmed.</p>
          <div className="ps-camp-actions"><button type="button" className="ps-primary" disabled={Boolean(busy)} onClick={() => toStripe("cancel", (id) => cancel({ ...base(), id }))}>{busy === "cancel" ? "Opening…" : "Continue to Stripe"}</button><button type="button" className="secondary" onClick={() => setPanel("")} disabled={Boolean(busy)}>Keep my subscription</button></div>
        </div>
      )}
      {onRecheck && <p><button type="button" className="secondary" onClick={onRecheck}>Check my subscription</button></p>}
      <p className="ps-hint">{SUPPORT}</p>
    </section>
  );
}
