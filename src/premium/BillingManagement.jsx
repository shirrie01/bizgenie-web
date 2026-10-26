import React, { useRef, useState } from "react";
import { fetchInvoices as realFetchInvoices, openBillingPortal as realOpenPortal, requestCancellation as realCancel, requestId, requestPlanChange as realChange } from "./billingManagementClient";
import { formatMoney } from "./planCatalogueClient";

// Subscription management (BG-STUDIO-019/020-FE, workstream B2), matching the backend DRAFT in bizgenie-api PR #216 (unmounted there).
// Every action opens a Stripe-HOSTED page where the customer confirms; BizGenie never changes a plan or cancels from this screen, and nothing is
// reported as done: the subscription changes only when Stripe's webhook reaches BizGenie and the subscription read shows it. Real buttons exist only
// when the backend offers the route (build gate) and the caller is the workspace owner; otherwise the page says plainly what is not available.
// Invoices come from the draft owner-only invoice route (billing-invoices.v1, unmounted); receipts are in Stripe's portal.
const redirectDefault = (url) => window.location.assign(url);
const SUPPORT = "A support contact has not been published yet.";

export default function BillingManagement({ enabled, isOwner, session, subscription, catalogue, onRecheck, api = {}, onRedirect = redirectDefault }) {
  const invoicesApi = api.fetchInvoices || realFetchInvoices; const openPortal = api.openBillingPortal || realOpenPortal; const change = api.requestPlanChange || realChange; const cancel = api.requestCancellation || realCancel;
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState({ kind: "", text: "" });
  const [panel, setPanel] = useState(""); // "", "change", "cancel"
  const [target, setTarget] = useState("");
  const [inv, setInv] = useState({ status: "idle", list: [], skipped: 0, next: null, error: "" });
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
  const loadInvoices = async (more) => {
    if (inv.status === "loading") return; const cursor = more ? inv.next : ""; setInv((x) => ({ ...x, status: "loading", error: "" }));
    try { const r = await invoicesApi({ ...base(), cursor }); setInv((x) => ({ status: "ready", list: more ? [...x.list, ...r.invoices] : r.invoices, skipped: (more ? x.skipped : 0) + r.skipped, next: r.nextCursor, error: "" })); }
    catch (e) { setInv((x) => ({ ...x, status: x.list.length ? "ready" : "error", error: e.message })); }
  };
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
      <div className="ps-camp-actions"><button type="button" className="secondary" disabled={inv.status === "loading"} onClick={() => loadInvoices(false)}>{inv.status === "loading" && !inv.list.length ? "Loading…" : "Show invoices"}</button></div>
      {inv.status === "error" && <p className="error" role="alert">{inv.error}</p>}
      {inv.status !== "error" && inv.error && <p className="error" role="alert">{inv.error}</p>}
      {inv.status === "ready" && inv.list.length === 0 && <p>You have no invoices yet.</p>}
      {inv.list.length > 0 && (
        <div>
          <ul className="ps-invoices" aria-label="Invoices">{inv.list.map((i) => <li key={i.id}><strong>{i.number || "Invoice (no number yet)"}</strong> · {new Date(i.issuedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} · {formatMoney(i.amountMinor, i.currency)} · status from Stripe: {i.status} · {i.url ? <a href={i.url} target="_blank" rel="noopener noreferrer">View invoice</a> : "no link available"}</li>)}</ul>
          {inv.skipped > 0 && <p className="ps-hint">{inv.skipped} invoice{inv.skipped === 1 ? "" : "s"} could not be shown because the server sent {inv.skipped === 1 ? "it" : "them"} in an unreadable form.</p>}
          {inv.next && <button type="button" className="secondary" disabled={inv.status === "loading"} onClick={() => loadInvoices(true)}>{inv.status === "loading" ? "Loading…" : "Show older invoices"}</button>}
          {!inv.next && <p className="ps-hint">That is every invoice on file.</p>}
        </div>
      )}
      {onRecheck && <p><button type="button" className="secondary" onClick={onRecheck}>Check my subscription</button></p>}
      <p className="ps-hint">{SUPPORT}</p>
    </section>
  );
}
