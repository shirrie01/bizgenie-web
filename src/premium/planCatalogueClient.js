// Server-owned plan catalogue (BG-STUDIO-019-FE, workstream A). The backend has no public catalogue endpoint and no approved pricing or terms
// source exists in either repository (see docs/studio/BG_STUDIO_019_FE_REPORT.md, "Pricing provenance"). This client is built against the
// PROPOSED contract, with deterministic test fixtures, and stays off until `VITE_PLAN_CATALOGUE_API=true`. NO price, credit allowance,
// currency, tax rule or term is written anywhere in this app: every one of them is shown only if the server sent it.
//
//   GET /billing/plans?tenant_id
//   200 { catalogue_version, effective_from, currency, vat: { treatment, text }, terms: { version, effective_from, url },
//         support: { email?, url?, hours? }, plans: [ { plan_code, name, tier, summary?, price: { amount_minor, currency, interval },
//         included_credits, additional_usage: { text }, trial: { days, conditions? } | null, renewal: { text }, cancellation: { text },
//         refund: { text }, current: boolean } ] }
export const isPlanCatalogueApiEnabled = (env = import.meta.env) => {
  const raw = env && env.VITE_PLAN_CATALOGUE_API;
  return typeof raw === "string" && raw.trim().toLowerCase() === "true";
};

export class CatalogueError extends Error {
  constructor(message, { kind = "error", status = 0, code = "" } = {}) { super(message); this.name = "CatalogueError"; this.kind = kind; this.status = status; this.code = code; }
}

const str = (v) => typeof v === "string" && v.trim().length > 0;
const count = (v) => Number.isInteger(v) && v >= 0;
const https = (v) => { try { return new URL(v).protocol === "https:"; } catch { return false; } };
const VAT = ["inclusive", "exclusive", "not_applicable"];
const INTERVALS = ["month", "year"];
const NOT_SHOWN = "Prices and terms cannot be shown right now. Nothing is charged until you see and confirm them.";

// Fail closed. A catalogue is shown only if EVERY thing a customer needs before paying is present; otherwise nothing is shown, and
// the reason is named for support, not guessed at.
export function normaliseCatalogue(body) {
  const bad = (why) => new CatalogueError(NOT_SHOWN, { kind: "invalid", code: `BAD_CATALOGUE:${why}` });
  if (!body || typeof body !== "object") throw bad("shape");
  if (!str(body.catalogue_version)) throw bad("catalogue_version");
  if (!Number.isFinite(Date.parse(body.effective_from))) throw bad("effective_from");
  if (!/^[A-Z]{3}$/.test(body.currency || "")) throw bad("currency");
  if (!body.vat || !VAT.includes(body.vat.treatment) || !str(body.vat.text)) throw bad("vat");
  const t = body.terms;
  if (!t || !str(t.version) || !Number.isFinite(Date.parse(t.effective_from)) || !https(t.url)) throw bad("terms");
  const s = body.support;
  if (!s || !(str(s.email) || https(s.url))) throw bad("support");
  if (!Array.isArray(body.plans) || body.plans.length === 0) throw bad("plans");
  const seen = new Set();
  const plans = body.plans.map((p, i) => {
    if (!p || !/^[a-z0-9_-]{1,32}$/.test(p.plan_code || "") || seen.has(p.plan_code)) throw bad(`plan[${i}].plan_code`);
    seen.add(p.plan_code);
    if (!str(p.name)) throw bad(`plan[${i}].name`);
    if (!count(p.tier)) throw bad(`plan[${i}].tier`);
    const pr = p.price;
    if (!pr || !count(pr.amount_minor) || pr.currency !== body.currency || !INTERVALS.includes(pr.interval)) throw bad(`plan[${i}].price`);
    if (!count(p.included_credits)) throw bad(`plan[${i}].included_credits`);
    for (const k of ["additional_usage", "renewal", "cancellation", "refund"]) if (!p[k] || !str(p[k].text)) throw bad(`plan[${i}].${k}`);
    if (p.trial != null && (!count(p.trial.days) || (p.trial.conditions != null && !str(p.trial.conditions)))) throw bad(`plan[${i}].trial`);
    return { planCode: p.plan_code, name: p.name.trim(), tier: p.tier, summary: str(p.summary) ? p.summary.trim() : "", priceMinor: pr.amount_minor, currency: pr.currency, interval: pr.interval, includedCredits: p.included_credits, additionalUsage: p.additional_usage.text.trim(), trial: p.trial ? { days: p.trial.days, conditions: p.trial.conditions || "" } : null, renewal: p.renewal.text.trim(), cancellation: p.cancellation.text.trim(), refund: p.refund.text.trim(), current: p.current === true };
  }).sort((a, b) => a.tier - b.tier);
  return { version: body.catalogue_version, effectiveFrom: body.effective_from, currency: body.currency, vat: { treatment: body.vat.treatment, text: body.vat.text.trim() }, terms: { version: t.version, effectiveFrom: t.effective_from, url: t.url }, support: { email: str(s.email) ? s.email.trim() : "", url: https(s.url) ? s.url : "", hours: str(s.hours) ? s.hours.trim() : "" }, plans };
}

// Money exactly as the server stated it: minor units divided by the currency's own number of decimals, in that currency.
export function formatMoney(amountMinor, currency, locale = "en-GB") {
  const fmt = new Intl.NumberFormat(locale, { style: "currency", currency });
  const digits = fmt.resolvedOptions().maximumFractionDigits;
  return fmt.format(amountMinor / 10 ** digits);
}

export async function fetchPlanCatalogue({ apiBaseUrl, accessToken, tenantId, fetchImpl = (...a) => fetch(...a) }) {
  let response;
  try { response = await fetchImpl(`${apiBaseUrl}/billing/plans?${new URLSearchParams({ tenant_id: tenantId })}`, { headers: { authorization: `Bearer ${accessToken}` } }); }
  catch { throw new CatalogueError("Prices and terms could not be loaded because the connection failed. Nothing is charged.", { kind: "network", code: "NETWORK" }); }
  if (response.status === 401) throw new CatalogueError("Your session has ended. Sign in again to continue.", { kind: "auth", status: 401, code: "AUTHENTICATION_REQUIRED" });
  if (response.status === 403 || response.status === 404) throw new CatalogueError("Plans are not available for this workspace.", { kind: "unavailable", status: response.status });
  if (!response.ok) throw new CatalogueError("Prices and terms could not be loaded yet. Nothing is charged.", { kind: "error", status: response.status });
  let json = null; try { json = await response.json(); } catch { json = null; }
  return normaliseCatalogue(json);
}
