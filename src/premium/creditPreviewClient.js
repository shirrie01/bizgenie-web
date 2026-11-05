// Read-only credit cost PREVIEW (BG-STUDIO-020-FE), matching the backend DRAFT in bizgenie-api PR #216 (head f8d81bf,
// src/billing/customerRouter.js `GET /credit-preview`, contract `execution-cost-preview.v1`, docs/studio/BG_STUDIO_019_COMMERCIAL_CONTRACTS.md).
//   GET /customer/billing/credit-preview?tenant_id&project_id&brand_id&execution_class&spend_cap   (Bearer; needs generation:create on the brand)
//   200 { contract_version, tenant_id, project_id, brand_id, execution_class, credit_cost, policy_id, entitlement_id, available_credits, spend_cap,
//         affordability: within_limit | spend_cap_exceeded | insufficient_credits, observed_at, expires_at, reserved:false,
//         execution_authorized:false, confirmation_supported:false }
//   400 VALIDATION_ERROR · 401 · 404 (foreign scope) · 503 CREDIT_PREVIEW_UNAVAILABLE
// A preview is NOT a quote: nothing is reserved, no spend cap is enforced at execution, and two reads do not promise capacity to both. The app
// therefore labels it "current price" and never offers a "confirm this exact cost" action from it. A binding quote needs the durable quote/confirm
// backend (generationQuoteClient.js stays off until that exists). Off unless `VITE_CREDIT_PREVIEW_API=true`.
import { BILLING_UNAVAILABLE_TEXT, EXECUTION_CLASSES } from "./generationQuoteClient";

export const isCreditPreviewApiEnabled = (env = import.meta.env) => {
  const raw = env && env.VITE_CREDIT_PREVIEW_API;
  return typeof raw === "string" && raw.trim().toLowerCase() === "true";
};
export const CONTRACT_VERSION = "execution-cost-preview.v1";
const AFFORDABILITY = ["within_limit", "spend_cap_exceeded", "insufficient_credits"];
const count = (v) => Number.isInteger(v) && v >= 0;

export class PreviewError extends Error {
  constructor(message, { kind = "error", status = 0, code = "" } = {}) { super(message); this.name = "PreviewError"; this.kind = kind; this.status = status; this.code = code; }
}

// Fail closed: a preview missing any field, or claiming it reserved/authorised anything, is not shown as a price.
export function normalisePreview(body, expected, now = Date.now()) {
  const bad = (why) => new PreviewError("The credit cost could not be checked yet. Nothing was started or charged.", { kind: "invalid", code: `BAD_PREVIEW:${why}` });
  if (!body || typeof body !== "object" || body.contract_version !== CONTRACT_VERSION) throw bad("contract_version");
  if (body.execution_class !== expected.executionClass) throw bad("execution_class");
  if (body.tenant_id !== expected.tenantId || body.project_id !== expected.projectId || body.brand_id !== expected.brandId) throw bad("scope");
  if (!count(body.credit_cost) || !count(body.available_credits) || !count(body.spend_cap)) throw bad("numbers");
  if (!AFFORDABILITY.includes(body.affordability)) throw bad("affordability");
  if (body.reserved !== false || body.execution_authorized !== false || body.confirmation_supported !== false) throw bad("claims_binding");
  const expiresAt = Date.parse(body.expires_at);
  if (!Number.isFinite(expiresAt) || !Number.isFinite(Date.parse(body.observed_at))) throw bad("times");
  if (expiresAt <= now) throw new PreviewError("That cost check is already out of date. Check the cost again.", { kind: "expired", code: "EXPIRED" });
  return { binding: false, quoteId: null, executionClass: body.execution_class, credits: body.credit_cost, kind: "current", maxCredits: body.credit_cost, authorisedCredits: null, availableCredits: body.available_credits, sufficient: body.affordability === "within_limit", affordability: body.affordability, expiresAt };
}

export async function requestCreditPreview({ apiBaseUrl, accessToken, scope, executionClass = "text.standard", fetchImpl = (...a) => fetch(...a), now = Date.now() }) {
  if (!EXECUTION_CLASSES.includes(executionClass)) throw new PreviewError("That kind of generation cannot be priced.", { kind: "invalid" });
  if (!scope || !scope.tenantId || !scope.projectId || !scope.brandId) throw new PreviewError("Open a workspace with an approved brand to check the cost.", { kind: "invalid" });
  // The backend requires a spend cap. The app does not ask for one (a cap is not enforced at execution), so it passes the largest the contract accepts.
  const q = new URLSearchParams({ tenant_id: scope.tenantId, project_id: scope.projectId, brand_id: scope.brandId, execution_class: executionClass, spend_cap: String(Number.MAX_SAFE_INTEGER) });
  let response;
  try { response = await fetchImpl(`${apiBaseUrl}/customer/billing/credit-preview?${q}`, { headers: { authorization: `Bearer ${accessToken}` } }); }
  catch { throw new PreviewError("The credit cost could not be checked because the connection failed. Nothing was started or charged.", { kind: "network", code: "NETWORK" }); }
  let json = null; try { json = await response.json(); } catch { json = null; }
  const code = json && json.error && json.error.code;
  if (response.status === 401) throw new PreviewError("Your session has ended. Sign in again to continue. Nothing was started or charged.", { kind: "auth", status: 401, code: code || "AUTHENTICATION_REQUIRED" });
  if (response.status === 404) throw new PreviewError("This workspace is not available to you any more. Nothing was started or charged.", { kind: "unavailable", status: 404, code });
  if (response.status === 503) throw new PreviewError(BILLING_UNAVAILABLE_TEXT, { kind: "unavailable", status: 503, code: code || "CREDIT_PREVIEW_UNAVAILABLE" });
  if (!response.ok) throw new PreviewError("The credit cost could not be checked yet. Nothing was started or charged.", { kind: "error", status: response.status, code });
  return normalisePreview(json, { executionClass, ...scope }, now);
}
