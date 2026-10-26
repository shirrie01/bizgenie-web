// Subscription management through the backend (BG-STUDIO-019-FE, workstream B2). The backend today offers only: Stripe Checkout start
// (POST /billing/stripe/checkout), the subscription read (GET /customer/billing/subscription), and a signed webhook. Everything below is the
// PROPOSED contract, built with deterministic fixtures, and stays off until `VITE_BILLING_MANAGEMENT_API=true`. The browser holds no Stripe
// secret and performs no privileged operation: it asks the backend, which authorises the TENANT OWNER, talks to Stripe, and answers.
// A "requested" answer is never shown as done: the plan changes only when the entitlement the backend reports changes.
//   POST /billing/portal-session         { tenant_id, request_id }                     -> 201 { url }  (https, Stripe-hosted: payment details, invoices)
//   POST /billing/subscription/change    { tenant_id, plan_code, request_id }          -> 200 { status: "requested", effective_at: ISO|null, url?: https }
//   POST /billing/subscription/cancel    { tenant_id, request_id }                     -> 200 { status: "requested", cancellation_effective_at: ISO|null }
//   GET  /customer/billing/invoices?tenant_id                                          -> 200 { invoices: [ { invoice_id, number, issued_at, amount_minor, currency,
//                                                                                        status, hosted_invoice_url, receipt_url|null } ] }
// 403/404 mean "not the owner or not this workspace's"; the backend, not this file, decides.
export const isBillingManagementApiEnabled = (env = import.meta.env) => {
  const raw = env && env.VITE_BILLING_MANAGEMENT_API;
  return typeof raw === "string" && raw.trim().toLowerCase() === "true";
};

export class BillingManagementError extends Error {
  constructor(message, { kind = "error", status = 0, code = "" } = {}) { super(message); this.name = "BillingManagementError"; this.kind = kind; this.status = status; this.code = code; }
}

const https = (v) => { try { return new URL(v).protocol === "https:"; } catch { return false; } };
export const requestId = (prefix) => `${prefix}_${(globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replaceAll("-", "")}`;

async function call(fetchImpl, url, options, action) {
  let response;
  try { response = await fetchImpl(url, options); }
  catch { throw new BillingManagementError(`${action} may or may not have been received because the connection failed. Check your subscription before trying again; you will not be charged twice for one request.`, { kind: "unconfirmed", code: "NETWORK" }); }
  let json = null; try { json = await response.json(); } catch { json = null; }
  const code = json && json.error && json.error.code;
  if (response.status === 401) throw new BillingManagementError("Your session has ended. Sign in again to continue. Nothing was changed.", { kind: "auth", status: 401, code: code || "AUTHENTICATION_REQUIRED" });
  if (response.status === 403 || response.status === 404) throw new BillingManagementError("Only the workspace owner can manage this subscription. Nothing was changed.", { kind: "forbidden", status: response.status, code });
  if (response.status === 409) throw new BillingManagementError("Your subscription changed or is already being updated, so nothing was changed. Check your subscription and try again.", { kind: "conflict", status: 409, code });
  if (response.status >= 500) throw new BillingManagementError(`${action} may or may not have been received because billing is temporarily unavailable. Check your subscription before trying again.`, { kind: "unconfirmed", status: response.status, code });
  if (!response.ok) throw new BillingManagementError(`${action} could not be done yet. Nothing was changed.`, { kind: "error", status: response.status, code });
  return json;
}
const auth = (token) => ({ "content-type": "application/json", authorization: `Bearer ${token}` });

export async function openBillingPortal({ apiBaseUrl, accessToken, tenantId, fetchImpl = (...a) => fetch(...a), id = requestId("portal") }) {
  const json = await call(fetchImpl, `${apiBaseUrl}/billing/portal-session`, { method: "POST", headers: auth(accessToken), body: JSON.stringify({ tenant_id: tenantId, request_id: id }) }, "Opening your billing details");
  if (!json || !https(json.url)) throw new BillingManagementError("Your billing details could not be opened safely. Nothing was changed.", { kind: "invalid", code: "BAD_URL" });
  return { url: new URL(json.url).toString() };
}

export async function requestPlanChange({ apiBaseUrl, accessToken, tenantId, planCode, fetchImpl = (...a) => fetch(...a), id = requestId("change") }) {
  if (!/^[a-z0-9_-]{1,32}$/.test(planCode || "")) throw new BillingManagementError("Choose a plan from the list.", { kind: "invalid" });
  const json = await call(fetchImpl, `${apiBaseUrl}/billing/subscription/change`, { method: "POST", headers: auth(accessToken), body: JSON.stringify({ tenant_id: tenantId, plan_code: planCode, request_id: id }) }, "Your plan change");
  if (!json || json.status !== "requested") throw new BillingManagementError("The plan change could not be confirmed. Check your subscription before trying again.", { kind: "unconfirmed", code: "BAD_RESPONSE" });
  return { effectiveAt: Number.isFinite(Date.parse(json.effective_at)) ? json.effective_at : null, url: https(json.url) ? new URL(json.url).toString() : "" };
}

export async function requestCancellation({ apiBaseUrl, accessToken, tenantId, fetchImpl = (...a) => fetch(...a), id = requestId("cancel") }) {
  const json = await call(fetchImpl, `${apiBaseUrl}/billing/subscription/cancel`, { method: "POST", headers: auth(accessToken), body: JSON.stringify({ tenant_id: tenantId, request_id: id }) }, "Your cancellation");
  if (!json || json.status !== "requested") throw new BillingManagementError("The cancellation could not be confirmed. Check your subscription before trying again.", { kind: "unconfirmed", code: "BAD_RESPONSE" });
  return { effectiveAt: Number.isFinite(Date.parse(json.cancellation_effective_at)) ? json.cancellation_effective_at : null };
}

const STATUSES = ["paid", "open", "void", "uncollectible", "draft"];
export async function fetchInvoices({ apiBaseUrl, accessToken, tenantId, fetchImpl = (...a) => fetch(...a) }) {
  let response;
  try { response = await fetchImpl(`${apiBaseUrl}/customer/billing/invoices?${new URLSearchParams({ tenant_id: tenantId })}`, { headers: { authorization: `Bearer ${accessToken}` } }); }
  catch { throw new BillingManagementError("Invoices could not be loaded because the connection failed.", { kind: "network", code: "NETWORK" }); }
  if (response.status === 401) throw new BillingManagementError("Your session has ended. Sign in again to continue.", { kind: "auth", status: 401 });
  if (response.status === 403 || response.status === 404) throw new BillingManagementError("Only the workspace owner can see invoices.", { kind: "forbidden", status: response.status });
  if (!response.ok) throw new BillingManagementError("Invoices could not be loaded yet.", { kind: "error", status: response.status });
  let json = null; try { json = await response.json(); } catch { json = null; }
  if (!json || !Array.isArray(json.invoices)) throw new BillingManagementError("The server sent an unexpected answer, so no invoices are shown.", { kind: "invalid" });
  const invoices = []; let skipped = 0;
  for (const i of json.invoices) {
    const ok = i && typeof i.invoice_id === "string" && typeof i.number === "string" && Number.isFinite(Date.parse(i.issued_at)) && Number.isInteger(i.amount_minor) && /^[A-Z]{3}$/.test(i.currency || "") && STATUSES.includes(i.status) && https(i.hosted_invoice_url);
    if (!ok) { skipped += 1; continue; }
    invoices.push({ id: i.invoice_id, number: i.number, issuedAt: i.issued_at, amountMinor: i.amount_minor, currency: i.currency, status: i.status, url: new URL(i.hosted_invoice_url).toString(), receiptUrl: https(i.receipt_url) ? new URL(i.receipt_url).toString() : "" });
  }
  return { invoices: invoices.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)), skipped };
}
