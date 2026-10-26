import React, { useRef, useState } from "react";
import { fetchInvoices as realFetchInvoices, openBillingPortal as realOpenPortal, requestCancellation as realCancel, requestId, requestPlanChange as realChange } from "./billingManagementClient";
import { formatMoney } from "./planCatalogueClient";

// Subscription management (BG-STUDIO-019-FE, workstream B2). Real buttons exist only when the backend can do the thing (build gate) and the
// caller is the workspace owner; otherwise the page says plainly what is not available, with no inert controls. Requests are never reported
// as results: a change or cancellation is "requested", and the plan changes only when the subscription the backend reports changes.
const dateOf = (iso) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "");
const redirectDefault = (url) => window.location.assign(url);

export default function BillingManagement({ enabled, isOwner, session, subscription, catalogue, onRecheck, api = {}, onRedirect = redirectDefault }) {
  const openPortal = api.openBillingPortal || realOpenPortal; const change = api.requestPlanChange || realChange; const cancel = api.requestCancellation || realCancel; const invoicesApi = api.fetchInvoices || realFetchInvoices;
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState({ kind: "", text: "" });
  const [panel, setPanel] = useState(""); // "", "change", "cancel"
  const [target, setTarget] = useState("");
  const [invoices, setInvoices] = useState(null); // { invoices, skipped } | { error }
  const reqIds = useRef({ change: null, cancel: null }).current; // a retry of the SAME request reuses its id, so it can never act twice
  const support = catalogue ? catalogue.support : null;
  const helpLine = support ? <>Questions: {support.email && <a href={`mailto:${support.email}`}>{support.email}</a>}{support.email && support.url && " · "}{support.url && <a href={support.url} target="_blank" rel="noopener noreferrer">support page</a>}.</> : "A support contact has not been published yet.";
  const base = () => ({ apiBaseUrl: import.meta.env.VITE_BIZGENIE_API_URL || "http://localhost:8080", accessToken: session.accessToken, tenantId: session.tenantId });
  const run = async (name, work) => {
    if (busy) return; setBusy(name); setMsg({ kind: "", text: "" });
    try { await work(); } catch (error) { setMsg({ kind: error.kind === "unconfirmed" ? "warn" : "error", text: error.message }); } finally { setBusy(""); }
  };

  if (!enabled) {
    return (
      <section className="ps-manage" aria-labelledby="pbm-h">
        <h3 id="pbm-h">Manage your subscription</h3>
        <p>Changing plan, cancelling, updating payment details and downloading invoices are not available in BizGenie yet. {helpLine}</p>
      </section>
    );
  }
  if (!isOwner) {
    return (
      <section className="ps-manage" aria-labelledby="pbm-h">
        <h3 id="pbm-h">Manage your subscription</h3>
        <p>Only the workspace owner can change the plan, cancel, update payment details or see invoices. {helpLine}</p>
      </section>
    );
  }
  const current = subscription && subscription.plan_code;
  const others = (catalogue ? catalogue.plans : []).filter((p) => p.planCode !== current);
  const chosen = others.find((p) => p.planCode === target);
  const currentPlan = catalogue && catalogue.plans.find((p) => p.planCode === current);

  return (
    <section className="ps-manage" aria-labelledby="pbm-h">
      <h3 id="pbm-h">Manage your subscription</h3>
      {msg.text && <p className={msg.kind === "error" ? "error" : msg.kind === "warn" ? "ps-warn" : ""} role={msg.kind === "ok" ? "status" : "alert"}>{msg.text}</p>}
      <div className="ps-camp-actions">
        <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => run("portal", async () => { const r = await openPortal({ ...base() }); onRedirect(r.url); })}>{busy === "portal" ? "Opening…" : "Payment details and receipts"}</button>
        {subscription && others.length > 0 && <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => { setPanel(panel === "change" ? "" : "change"); setMsg({ kind: "", text: "" }); }} aria-expanded={panel === "change"}>Change plan</button>}
        {subscription && <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => { setPanel(panel === "cancel" ? "" : "cancel"); setMsg({ kind: "", text: "" }); }} aria-expanded={panel === "cancel"}>Cancel subscription</button>}
        <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => run("invoices", async () => { try { setInvoices(await invoicesApi({ ...base() })); } catch (e) { setInvoices({ error: e.message }); } })}>{busy === "invoices" ? "Loading…" : "Show invoices"}</button>
      </div>

      {panel === "change" && (
        <div role="group" aria-label="Change plan" className="ps-camp-edit">
          <label htmlFor="pbm-target">Change to</label>
          <select id="pbm-target" value={target} onChange={(e) => setTarget(e.target.value)}><option value="">Choose a plan</option>{others.map((p) => <option key={p.planCode} value={p.planCode}>{p.name} ({formatMoney(p.priceMinor, p.currency)} {p.interval === "month" ? "per month" : "per year"})</option>)}</select>
          {chosen && <p className="ps-hint">{chosen.renewal} {chosen.refund} The change takes effect when BizGenie receives confirmation from Stripe, not when you press the button.</p>}
          <div className="ps-camp-actions"><button type="button" className="ps-primary" disabled={!chosen || Boolean(busy)} onClick={() => run("change", async () => { if (!reqIds.change || reqIds.change.plan !== chosen.planCode) reqIds.change = { plan: chosen.planCode, id: requestId("change") }; const r = await change({ ...base(), planCode: chosen.planCode, id: reqIds.change.id }); reqIds.change = null; setPanel(""); setMsg({ kind: "ok", text: r.url ? "Your request was received. Continue on Stripe to confirm it." : `Your request to change to ${chosen.name} was received${r.effectiveAt ? `, to take effect on ${dateOf(r.effectiveAt)}` : ""}. Your plan changes only when Stripe confirms it. Check your subscription to see the result.` }); if (r.url) onRedirect(r.url); })}>{busy === "change" ? "Sending…" : "Request this change"}</button><button type="button" className="secondary" onClick={() => setPanel("")} disabled={Boolean(busy)}>Keep my plan</button></div>
        </div>
      )}
      {panel === "cancel" && (
        <div role="group" aria-label="Cancel subscription" className="ps-camp-edit">
          <p>{currentPlan ? currentPlan.cancellation : "The approved cancellation terms are not available here yet."} {currentPlan && currentPlan.refund}</p>
          <p className="ps-hint">The date your access ends is the one your subscription shows after Stripe confirms the cancellation.</p>
          <div className="ps-camp-actions"><button type="button" className="ps-primary" disabled={Boolean(busy)} onClick={() => run("cancel", async () => { reqIds.cancel = reqIds.cancel || requestId("cancel"); const r = await cancel({ ...base(), id: reqIds.cancel }); reqIds.cancel = null; setPanel(""); setMsg({ kind: "ok", text: `Your cancellation request was received${r.effectiveAt ? `. Access is expected to end on ${dateOf(r.effectiveAt)}` : ""}. It is final only when Stripe confirms it. Check your subscription to see the result.` }); })}>{busy === "cancel" ? "Sending…" : "Request cancellation"}</button><button type="button" className="secondary" onClick={() => setPanel("")} disabled={Boolean(busy)}>Keep my subscription</button></div>
        </div>
      )}
      {(msg.kind === "ok" || msg.kind === "warn") && onRecheck && <p><button type="button" className="secondary" onClick={onRecheck}>Check my subscription</button></p>}

      {invoices && invoices.error && <p className="error" role="alert">{invoices.error}</p>}
      {invoices && invoices.invoices && (invoices.invoices.length === 0 ? <p>You have no invoices yet.</p> : (
        <div>
          <ul className="ps-invoices" aria-label="Invoices">{invoices.invoices.map((i) => <li key={i.id}><strong>{i.number}</strong> · {dateOf(i.issuedAt)} · {formatMoney(i.amountMinor, i.currency)} · status reported by Stripe: {i.status} · <a href={i.url} target="_blank" rel="noopener noreferrer">View invoice</a>{i.receiptUrl && <> · <a href={i.receiptUrl} target="_blank" rel="noopener noreferrer">Receipt</a></>}</li>)}</ul>
          {invoices.skipped > 0 && <p className="ps-hint">{invoices.skipped} invoice{invoices.skipped === 1 ? "" : "s"} could not be shown because the server sent {invoices.skipped === 1 ? "it" : "them"} in an unreadable form.</p>}
        </div>
      ))}
      <p className="ps-hint">{helpLine}</p>
    </section>
  );
}
