// Server-owned plan catalogue (BG-STUDIO-019-FE A, reconciled in BG-STUDIO-020-FE with the backend DRAFT: bizgenie-api PR #216 head f8d81bf,
// src/billing/commercialCatalog.js + src/billing/customerRouter.js, docs/studio/BG_STUDIO_019_COMMERCIAL_CONTRACTS.md). The route is NOT
// deployed and the backend serves 503 COMMERCIAL_CATALOG_UNAVAILABLE until a founder-approved catalogue is injected; no approved pricing source
// exists in either repository. This stays off until `VITE_PLAN_CATALOGUE_API=true`. NO price, credit allowance, currency, tax rule or term is
// written anywhere in this app: every one of them is shown only if the server sent it.
//
//   GET /customer/billing/plans?tenant_id          (Bearer; tenant read; foreign tenant 404; no token 401; no catalogue 503)
//   200 { contract_version: "commercial-catalog.v1", plans: [ { plan_code, plan_version, amount_minor, currency, billing_cadence: month|year,
//         tax: { presentation: inclusive|exclusive, jurisdiction, wording }, credit_grant_cadence: "month", included_credits, policy_id,
//         entitlement_codes[], effective_from, effective_to|null, terms: { version, url, cancellation_url, refund_url },
//         approval: { decision, source(https), approved_at } } ] }
// The contract has NO plan display name, support contact, trial, additional-usage price, renewal wording or "current plan" marker. The app shows
// those as "not published", derives the label from plan_code, and marks the current plan from the subscription it already reads.
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
const TAX = ["inclusive", "exclusive"];
const INTERVALS = ["month", "year"];
export const CONTRACT_VERSION = "commercial-catalog.v1";
const NOT_SHOWN = "Prices and terms cannot be shown right now. Nothing is charged until you see and confirm them.";

// Fail closed. A catalogue is shown only if EVERY thing a customer needs before paying is present; otherwise nothing is shown, and
// the reason is named for support, not guessed at.
export const planLabel = (code) => (typeof code === "string" && code ? code.charAt(0).toUpperCase() + code.slice(1) : "Plan");

export function normaliseCatalogue(body) {
  const bad = (why) => new CatalogueError(NOT_SHOWN, { kind: "invalid", code: `BAD_CATALOGUE:${why}` });
  if (!body || typeof body !== "object" || body.contract_version !== CONTRACT_VERSION) throw bad("contract_version");
  if (!Array.isArray(body.plans) || body.plans.length === 0) throw bad("plans");
  const seen = new Set();
  const plans = body.plans.map((p, i) => {
    if (!p || !/^[a-z0-9_-]{1,32}$/.test(p.plan_code || "") || seen.has(p.plan_code)) throw bad(`plan[${i}].plan_code`);
    seen.add(p.plan_code);
    if (!Number.isInteger(p.plan_version) || p.plan_version < 1) throw bad(`plan[${i}].plan_version`);
    if (!count(p.amount_minor)) throw bad(`plan[${i}].amount_minor`);
    if (!/^[A-Z]{3}$/.test(p.currency || "")) throw bad(`plan[${i}].currency`);
    if (!INTERVALS.includes(p.billing_cadence)) throw bad(`plan[${i}].billing_cadence`);
    const t = p.tax; if (!t || !TAX.includes(t.presentation) || !str(t.jurisdiction) || !str(t.wording)) throw bad(`plan[${i}].tax`);
    if (p.credit_grant_cadence !== "month") throw bad(`plan[${i}].credit_grant_cadence`);
    if (!count(p.included_credits)) throw bad(`plan[${i}].included_credits`);
    if (!Number.isFinite(Date.parse(p.effective_from)) || (p.effective_to !== null && !Number.isFinite(Date.parse(p.effective_to)))) throw bad(`plan[${i}].effective`);
    const m = p.terms; if (!m || !str(m.version) || !https(m.url) || !https(m.cancellation_url) || !https(m.refund_url)) throw bad(`plan[${i}].terms`);
    const a = p.approval; if (!a || !str(a.decision) || !https(a.source) || !Number.isFinite(Date.parse(a.approved_at))) throw bad(`plan[${i}].approval`);
    if (!Array.isArray(p.entitlement_codes) || p.entitlement_codes.length === 0 || !p.entitlement_codes.every(str)) throw bad(`plan[${i}].entitlement_codes`);
    return { planCode: p.plan_code, name: planLabel(p.plan_code), planVersion: p.plan_version, priceMinor: p.amount_minor, currency: p.currency, interval: p.billing_cadence, tax: { presentation: t.presentation, jurisdiction: t.jurisdiction.trim(), wording: t.wording.trim() }, includedCredits: p.included_credits, entitlementCodes: [...p.entitlement_codes], effectiveFrom: p.effective_from, effectiveTo: p.effective_to, terms: { version: m.version, url: new URL(m.url).toString(), cancellationUrl: new URL(m.cancellation_url).toString(), refundUrl: new URL(m.refund_url).toString() }, approval: { decision: a.decision, source: new URL(a.source).toString(), approvedAt: a.approved_at } };
  }).sort((x, y) => x.priceMinor - y.priceMinor || x.planCode.localeCompare(y.planCode));
  return { version: CONTRACT_VERSION, plans };
}

// Money exactly as the server stated it: minor units divided by the currency's own number of decimals, in that currency.
export function formatMoney(amountMinor, currency, locale = "en-GB") {
  const fmt = new Intl.NumberFormat(locale, { style: "currency", currency });
  const digits = fmt.resolvedOptions().maximumFractionDigits;
  return fmt.format(amountMinor / 10 ** digits);
}

export async function fetchPlanCatalogue({ apiBaseUrl, accessToken, tenantId, fetchImpl = (...a) => fetch(...a) }) {
  let response;
  try { response = await fetchImpl(`${apiBaseUrl}/customer/billing/plans?${new URLSearchParams({ tenant_id: tenantId })}`, { headers: { authorization: `Bearer ${accessToken}` } }); }
  catch { throw new CatalogueError("Prices and terms could not be loaded because the connection failed. Nothing is charged.", { kind: "network", code: "NETWORK" }); }
  if (response.status === 401) throw new CatalogueError("Your session has ended. Sign in again to continue.", { kind: "auth", status: 401, code: "AUTHENTICATION_REQUIRED" });
  if (response.status === 403 || response.status === 404) throw new CatalogueError("Plans are not available for this workspace.", { kind: "unavailable", status: response.status });
  if (response.status === 503) throw new CatalogueError("Approved plans and prices have not been published yet, so none are shown. Nothing is charged.", { kind: "unavailable", status: 503, code: "COMMERCIAL_CATALOG_UNAVAILABLE" });
  if (!response.ok) throw new CatalogueError("Prices and terms could not be loaded yet. Nothing is charged.", { kind: "error", status: response.status });
  let json = null; try { json = await response.json(); } catch { json = null; }
  return normaliseCatalogue(json);
}
