import React from "react";
import { formatMoney } from "./planCatalogueClient";

// Approved plans, prices and terms, exactly as the server sent them (BG-STUDIO-019/020-FE). Nothing here is a constant: every price, credit
// allowance, tax statement and term link is read from the validated `commercial-catalog.v1` response. The contract does not carry a trial, an
// additional-usage price, renewal wording, a support contact or a marketing name, so those rows say "not published" instead of being invented.
// A "Choose" button exists only when the caller can really act on it (the workspace owner, and a checkout the backend offers).
const per = { month: "per month", year: "per year" };
const date = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const credits = (n) => `${n} credit${n === 1 ? "" : "s"}`;
const NOT_PUBLISHED = "Not published yet";

export default function PlanCatalogue({ catalogue, currentPlanCode = "", canChoose = false, onChoose, choosing = "", notice = "" }) {
  const { plans } = catalogue;
  return (
    <section className="ps-plans" aria-labelledby="ppl-h">
      <h3 id="ppl-h">Plans and prices</h3>
      <p className="ps-hint">These plans, prices and terms were approved by BizGenie and are shown exactly as published.</p>
      {!canChoose && <p className="ps-hint">Only the workspace owner can start or change a subscription.</p>}
      {notice && <p role="status">{notice}</p>}
      <div className="ps-plans-scroll" role="region" aria-label="Compare plans" tabIndex={0}>
        <table className="ps-plans-table">
          <caption className="visually-hidden">Compare plans</caption>
          <thead><tr><td />{plans.map((p) => <th key={p.planCode} scope="col">{p.name}{p.planCode === currentPlanCode && <span className="ps-tag"> Your current plan</span>}</th>)}</tr></thead>
          <tbody>
            <tr><th scope="row">Price</th>{plans.map((p) => <td key={p.planCode}><strong>{formatMoney(p.priceMinor, p.currency)}</strong> {per[p.interval]}</td>)}</tr>
            <tr><th scope="row">Tax</th>{plans.map((p) => <td key={p.planCode}>{p.tax.presentation === "inclusive" ? "Tax included" : "Tax added"} ({p.tax.jurisdiction}). {p.tax.wording}</td>)}</tr>
            <tr><th scope="row">Included credits</th>{plans.map((p) => <td key={p.planCode}>{credits(p.includedCredits)} each month</td>)}</tr>
            <tr><th scope="row">Using more</th>{plans.map((p) => <td key={p.planCode}>{NOT_PUBLISHED}</td>)}</tr>
            <tr><th scope="row">Trial</th>{plans.map((p) => <td key={p.planCode}>{NOT_PUBLISHED}</td>)}</tr>
            <tr><th scope="row">Terms</th>{plans.map((p) => <td key={p.planCode}>Version {p.terms.version}, in effect from {date(p.effectiveFrom)}. <a href={p.terms.url} target="_blank" rel="noopener noreferrer">Terms</a> · <a href={p.terms.cancellationUrl} target="_blank" rel="noopener noreferrer">Cancelling</a> · <a href={p.terms.refundUrl} target="_blank" rel="noopener noreferrer">Refunds</a></td>)}</tr>
            <tr><th scope="row">Approved</th>{plans.map((p) => <td key={p.planCode}>{p.approval.decision}, {date(p.approval.approvedAt)}</td>)}</tr>
            {onChoose && <tr><th scope="row">Choose</th>{plans.map((p) => <td key={p.planCode}>{p.planCode === currentPlanCode ? <span>Current plan</span> : <button type="button" className="secondary" onClick={() => onChoose(p)} disabled={!canChoose || Boolean(choosing)}>{choosing === p.planCode ? "Opening…" : `Choose ${p.name}`}</button>}</td>)}</tr>}
          </tbody>
        </table>
      </div>
      <p className="ps-hint">A support contact for plans and billing has not been published yet.</p>
    </section>
  );
}
