// Subscription management through the backend (BG-STUDIO-019-FE B2, reconciled in BG-STUDIO-020-FE with the backend DRAFT: bizgenie-api PR #216
// head f8d81bf, src/billing/stripe/managementDraft.js, docs/studio/BG_STUDIO_019_COMMERCIAL_CONTRACTS.md). That router is UNMOUNTED and disabled
// by default and only exercised with mock Stripe clients, so this client stays off until `VITE_BILLING_MANAGEMENT_API=true`, set only after the
// backend mounts it and the founder approves. The browser holds no Stripe secret and takes no privileged action: it asks the backend, which checks
// that the caller is the tenant OWNER and creates a Stripe-HOSTED confirmation session. Everything the customer confirms happens on Stripe.
//   POST /customer/billing/management/portal-session        { request_id }
//   POST /customer/billing/management/subscription/change  { request_id, plan_code }
//   POST /customer/billing/management/subscription/cancel   { request_id }
//   201 { status: "confirmation_required", portal_url: "https://billing.stripe.com/...", entitlement_confirmed: false }
// Bodies are strict (no tenant_id, price, redirect or customer field is accepted); the workspace is sent as the `tenant_id` query parameter, which
// is how the other customer billing routes resolve it. OPEN QUESTION for the backend (handoff row): the draft does not show where it reads the
// tenant from when mounted. Errors: 400 STRIPE_BILLING_VALIDATION_ERROR, 401 AUTHENTICATION_REQUIRED, 404 RESOURCE_NOT_AVAILABLE (not the owner) or
// STRIPE_BILLING_RESOURCE_NOT_AVAILABLE (no Stripe mapping), 409 STRIPE_BILLING_CONFLICT, 503 STRIPE_BILLING_NOT_CONFIGURED / BILLING_MANAGEMENT_UNAVAILABLE.
// There is NO invoices endpoint: invoices and receipts live in Stripe's hosted portal. A confirmation redirect is not a payment, cancellation,
// refund or entitlement change; only the webhook-confirmed subscription (GET /customer/billing/subscription) is.
export const isBillingManagementApiEnabled = (env = import.meta.env) => {
  const raw = env && env.VITE_BILLING_MANAGEMENT_API;
  return typeof raw === "string" && raw.trim().toLowerCase() === "true";
};

export class BillingManagementError extends Error {
  constructor(message, { kind = "error", status = 0, code = "" } = {}) { super(message); this.name = "BillingManagementError"; this.kind = kind; this.status = status; this.code = code; }
}

const stripeHosted = (v) => { try { const u = new URL(v); return u.protocol === "https:" && u.hostname === "billing.stripe.com" && !u.username && !u.password && !u.port; } catch { return false; } };
export const requestId = (prefix) => `${prefix}_${(globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replaceAll("-", "")}`;

async function call(fetchImpl, apiBaseUrl, path, tenantId, accessToken, payload, action) {
  let response;
  try { response = await fetchImpl(`${apiBaseUrl}/customer/billing/management/${path}?${new URLSearchParams({ tenant_id: tenantId })}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` }, body: JSON.stringify(payload) }); }
  catch { throw new BillingManagementError(`${action} may or may not have been received because the connection failed. Check your subscription before trying again; sending the same request again will not act twice.`, { kind: "unconfirmed", code: "NETWORK" }); }
  let json = null; try { json = await response.json(); } catch { json = null; }
  const code = (json && json.error && json.error.code) || "";
  if (response.status === 401) throw new BillingManagementError("Your session has ended. Sign in again to continue. Nothing was changed.", { kind: "auth", status: 401, code: code || "AUTHENTICATION_REQUIRED" });
  if (response.status === 404) throw new BillingManagementError(code === "STRIPE_BILLING_RESOURCE_NOT_AVAILABLE" ? "There is no billing account to manage yet. Nothing was changed." : "Only the workspace owner can manage this subscription. Nothing was changed.", { kind: code === "STRIPE_BILLING_RESOURCE_NOT_AVAILABLE" ? "unavailable" : "forbidden", status: 404, code });
  if (response.status === 403) throw new BillingManagementError("Only the workspace owner can manage this subscription. Nothing was changed.", { kind: "forbidden", status: 403, code });
  if (response.status === 400) throw new BillingManagementError(`${action} could not be started with those choices. Nothing was changed.`, { kind: "invalid", status: 400, code });
  if (response.status === 409) throw new BillingManagementError("Your subscription changed or is already being updated, so nothing was changed. Check your subscription and try again.", { kind: "conflict", status: 409, code });
  if (response.status === 503) throw new BillingManagementError("Subscription management is not available right now. Nothing was changed.", { kind: "unavailable", status: 503, code });
  if (response.status >= 500) throw new BillingManagementError(`${action} may or may not have been received because billing is temporarily unavailable. Check your subscription before trying again.`, { kind: "unconfirmed", status: response.status, code });
  if (!response.ok) throw new BillingManagementError(`${action} could not be done yet. Nothing was changed.`, { kind: "error", status: response.status, code });
  if (!json || json.status !== "confirmation_required" || json.entitlement_confirmed !== false || !stripeHosted(json.portal_url)) throw new BillingManagementError("Stripe's page could not be opened safely, so nothing was changed.", { kind: "invalid", code: "BAD_RESPONSE" });
  return { url: new URL(json.portal_url).toString() };
}

export const openBillingPortal = ({ apiBaseUrl, accessToken, tenantId, fetchImpl = (...a) => fetch(...a), id = requestId("portal") }) => call(fetchImpl, apiBaseUrl, "portal-session", tenantId, accessToken, { request_id: id }, "Opening your billing details");
export const requestPlanChange = ({ apiBaseUrl, accessToken, tenantId, planCode, fetchImpl = (...a) => fetch(...a), id = requestId("change") }) => {
  if (!/^[a-z0-9_-]{1,32}$/.test(planCode || "")) return Promise.reject(new BillingManagementError("Choose a plan from the list.", { kind: "invalid" }));
  return call(fetchImpl, apiBaseUrl, "subscription/change", tenantId, accessToken, { request_id: id, plan_code: planCode }, "Your plan change");
};
export const requestCancellation = ({ apiBaseUrl, accessToken, tenantId, fetchImpl = (...a) => fetch(...a), id = requestId("cancel") }) => call(fetchImpl, apiBaseUrl, "subscription/cancel", tenantId, accessToken, { request_id: id }, "Your cancellation");
