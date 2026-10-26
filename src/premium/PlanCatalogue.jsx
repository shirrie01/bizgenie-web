import React from "react";
import { formatMoney } from "./planCatalogueClient";

// Approved plans, prices and terms, exactly as the server sent them (BG-STUDIO-019-FE, workstream A). Nothing here is a constant: every
// price, credit allowance, tax statement, term and contact is read from the validated catalogue. A "Choose" button exists only when the
// caller can really act on it (the workspace owner, and a checkout the backend offers).
const per = { month: "per month", year: "per year" };
const date = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const credits = (n) => `${n} credit${n === 1 ? "" : "s"}`;

export default function PlanCatalogue({ catalogue, canChoose = false, onChoose, choosing = "", notice = "" }) {
  const { plans, vat, terms, support } = catalogue;
  return (
    <section className="ps-plans" aria-labelledby="ppl-h">
      <h3 id="ppl-h">Plans and prices</h3>
      <p>Prices are in {catalogue.currency}. {vat.text}</p>
      <p className="ps-hint">Terms version {terms.version}, in effect from {date(terms.effectiveFrom)}. <a href={terms.url} target="_blank" rel="noopener noreferrer">Read the full terms</a>.</p>
      {!canChoose && <p className="ps-hint">Only the workspace owner can start or change a subscription.</p>}
      {notice && <p role="status">{notice}</p>}
      <div className="ps-plans-scroll" role="region" aria-label="Compare plans" tabIndex={0}>
        <table className="ps-plans-table">
          <caption className="visually-hidden">Compare plans</caption>
          <thead><tr><td />{plans.map((p) => <th key={p.planCode} scope="col">{p.name}{p.current && <span className="ps-tag"> Your current plan</span>}</th>)}</tr></thead>
          <tbody>
            <tr><th scope="row">Price</th>{plans.map((p) => <td key={p.planCode}><strong>{formatMoney(p.priceMinor, p.currency)}</strong> {per[p.interval]}</td>)}</tr>
            <tr><th scope="row">Included credits</th>{plans.map((p) => <td key={p.planCode}>{credits(p.includedCredits)} each {p.interval}</td>)}</tr>
            <tr><th scope="row">Using more</th>{plans.map((p) => <td key={p.planCode}>{p.additionalUsage}</td>)}</tr>
            <tr><th scope="row">Trial</th>{plans.map((p) => <td key={p.planCode}>{p.trial ? `${p.trial.days}-day trial.${p.trial.conditions ? ` ${p.trial.conditions}` : ""}` : "No trial"}</td>)}</tr>
            <tr><th scope="row">Renewal</th>{plans.map((p) => <td key={p.planCode}>{p.renewal}</td>)}</tr>
            <tr><th scope="row">Cancelling</th>{plans.map((p) => <td key={p.planCode}>{p.cancellation}</td>)}</tr>
            <tr><th scope="row">Refunds</th>{plans.map((p) => <td key={p.planCode}>{p.refund}</td>)}</tr>
            {onChoose && <tr><th scope="row">Choose</th>{plans.map((p) => <td key={p.planCode}>{p.current ? <span>Current plan</span> : <button type="button" className="secondary" onClick={() => onChoose(p)} disabled={!canChoose || Boolean(choosing)}>{choosing === p.planCode ? "Opening…" : `Choose ${p.name}`}</button>}</td>)}</tr>}
          </tbody>
        </table>
      </div>
      <p className="ps-hint">Questions about plans or billing: {support.email && <a href={`mailto:${support.email}`}>{support.email}</a>}{support.email && support.url && " · "}{support.url && <a href={support.url} target="_blank" rel="noopener noreferrer">support page</a>}{support.hours && ` (${support.hours})`}.</p>
    </section>
  );
}
