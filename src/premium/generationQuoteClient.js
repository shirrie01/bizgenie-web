// Credit-cost disclosure before a chargeable generation (BG-STUDIO-019-FE, workstream D).
//
// AUTHORITY: the price is the backend's. Today the backend resolves it from the tenant's active commercial policy when a generation
// runs (`execution_costs`: text.standard, image.normal, image.premium, video.normal, video.premium; reservation, then debit on success or
// release on failure; 402 GENERATION_CREDITS_UNAVAILABLE and 503 GENERATION_BILLING_UNAVAILABLE). It has NO endpoint that tells the customer
// the price BEFORE. This module is the contract-tested client for the PROPOSED quote endpoint and stays off until the build says it exists:
//   POST /customer/generation-quotes
//     { tenant_id, project_id, campaign_id, variant_id, expected_campaign_version, execution_class, execution_mode, supplied_assets, idempotency_key }
//   201 { quote_id, execution_class, credits, kind: "fixed" | "estimate", max_credits, available_credits, sufficient, expires_at, policy_version }
// A quote debits nothing and calls no provider. The generate call then carries `quote_id` and `max_credits`; the server re-prices with the
// same policy and refuses with 409 QUOTE_EXPIRED or QUOTE_CHANGED if the price differs. No price is computed or assumed in the browser.
export const isGenerationQuoteApiEnabled = (env = import.meta.env) => {
  const raw = env && env.VITE_GENERATION_QUOTE_API;
  return typeof raw === "string" && raw.trim().toLowerCase() === "true";
};

export const EXECUTION_CLASSES = ["text.standard", "image.normal", "image.premium", "video.normal", "video.premium"];

export class QuoteError extends Error {
  constructor(message, { kind = "error", status = 0, code = "" } = {}) { super(message); this.name = "QuoteError"; this.kind = kind; this.status = status; this.code = code; }
}

export const CREDITS_UNAVAILABLE_TEXT = "You do not have enough credits for this. Nothing was started and nothing was charged. Your balance is in Plan and billing.";
export const BILLING_UNAVAILABLE_TEXT = "Credits cannot be checked right now, so nothing was started or charged. Try again shortly.";

const isCount = (v) => Number.isInteger(v) && v >= 0;

// Fail closed: a quote with any field missing or inconsistent is NOT shown as a price.
export function normaliseQuote(body, now = Date.now()) {
  const q = body && typeof body === "object" ? body : null;
  const bad = (why) => new QuoteError("The credit cost could not be confirmed, so nothing can be started. Nothing was charged.", { kind: "invalid", code: `BAD_QUOTE:${why}` });
  if (!q) throw bad("shape");
  if (typeof q.quote_id !== "string" || !q.quote_id) throw bad("quote_id");
  if (!EXECUTION_CLASSES.includes(q.execution_class)) throw bad("execution_class");
  if (!isCount(q.credits)) throw bad("credits");
  if (q.kind !== "fixed" && q.kind !== "estimate") throw bad("kind");
  const max = q.max_credits == null ? null : q.max_credits;
  if (max !== null && (!isCount(max) || max < q.credits)) throw bad("max_credits");
  if (q.kind === "estimate" && max === null) throw bad("estimate_without_maximum"); // an estimate must say the most it can cost
  if (!(q.available_credits === null || isCount(q.available_credits))) throw bad("available_credits");
  if (typeof q.sufficient !== "boolean") throw bad("sufficient");
  const expires = Date.parse(q.expires_at);
  if (!Number.isFinite(expires)) throw bad("expires_at");
  if (typeof q.policy_version !== "string" || !q.policy_version) throw bad("policy_version");
  const authorised = max === null ? q.credits : max;
  // The server's `sufficient` is trusted only if it is not more generous than the numbers: never claim enough credits that are not there.
  const sufficient = q.sufficient && (q.available_credits === null || q.available_credits >= authorised);
  return { quoteId: q.quote_id, executionClass: q.execution_class, credits: q.credits, kind: q.kind, maxCredits: max, authorisedCredits: authorised, availableCredits: q.available_credits, sufficient, expiresAt: expires, expired: expires <= now, policyVersion: q.policy_version };
}

export async function quoteKey(campaign, variant, executionClass, mode) {
  const scope = `quote:campaign:${campaign.campaign_id}:variant:${variant.variant_id}:version:${campaign.version}:${executionClass}:${mode}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(scope));
  return `op:quote:${Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export async function requestGenerationQuote({ apiBaseUrl, accessToken, scope, campaign, variant, executionClass = "text.standard", executionMode = "ai", suppliedAssets = [], fetchImpl = (...a) => fetch(...a) }) {
  if (!EXECUTION_CLASSES.includes(executionClass)) throw new QuoteError("That kind of generation cannot be priced.", { kind: "invalid" });
  let response;
  try {
    response = await fetchImpl(`${apiBaseUrl}/customer/generation-quotes`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ tenant_id: scope.tenantId, project_id: scope.projectId, campaign_id: campaign.campaign_id, variant_id: variant.variant_id, expected_campaign_version: campaign.version, execution_class: executionClass, execution_mode: executionMode, supplied_assets: suppliedAssets, idempotency_key: await quoteKey(campaign, variant, executionClass, executionMode) }) });
  } catch { throw new QuoteError("The credit cost could not be checked because the connection failed. Nothing was started or charged.", { kind: "network", code: "NETWORK" }); }
  let json = null; try { json = await response.json(); } catch { json = null; }
  const code = json && json.error && json.error.code;
  if (response.status === 401) throw new QuoteError("Your session has ended. Sign in again to continue. Nothing was started or charged.", { kind: "auth", status: 401, code: code || "AUTHENTICATION_REQUIRED" });
  if (response.status === 403 || response.status === 404) throw new QuoteError("This campaign is not available to you any more. Nothing was started or charged.", { kind: "unavailable", status: response.status, code });
  if (response.status === 409) throw new QuoteError("The campaign changed, so the cost was not checked. Reload it and try again. Nothing was started or charged.", { kind: "conflict", status: 409, code });
  if (response.status === 503 || code === "GENERATION_BILLING_UNAVAILABLE") throw new QuoteError(BILLING_UNAVAILABLE_TEXT, { kind: "unavailable", status: response.status, code: code || "GENERATION_BILLING_UNAVAILABLE" });
  if (!response.ok) throw new QuoteError("The credit cost could not be checked yet. Nothing was started or charged.", { kind: "error", status: response.status, code });
  return normaliseQuote(json);
}

// What the generate request carries once the customer has confirmed a quote.
// A read-only preview (binding === false) carries nothing: the backend's generate body is strict and has no quote fields until the durable
// quote/confirm contract ships, so only a real server quote may add them.
export const quoteFields = (quote) => (quote && quote.binding !== false && quote.quoteId ? { quote_id: quote.quoteId, max_credits: quote.authorisedCredits } : {});

// Turns a refused generate call into what the customer should see and what the screen should do next.
export function describeGenerateRefusal(status, code) {
  if (status === 402 || code === "GENERATION_CREDITS_UNAVAILABLE") return { kind: "insufficient", text: CREDITS_UNAVAILABLE_TEXT };
  if (status === 503 && code === "GENERATION_BILLING_UNAVAILABLE") return { kind: "billing_unavailable", text: BILLING_UNAVAILABLE_TEXT };
  if (code === "QUOTE_EXPIRED") return { kind: "expired", text: "The price you confirmed has expired. Nothing was charged. Check the cost again to continue." };
  if (code === "QUOTE_CHANGED") return { kind: "changed", text: "The price changed after you confirmed it, so nothing was started or charged. Check the new cost to continue." };
  return null;
}
