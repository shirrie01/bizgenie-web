// Authoritative credit quote, explicit confirmation and queued-job status (BG-STUDIO-021-FE), written against the backend DRAFT in bizgenie-api PR #217,
// head 23f49038f36acf8414a079e27a8d5ffc8d302f2b (src/generation-quotes/{router,service,worker}.js, docs/studio/BG_STUDIO_020_BACKEND_FRONTEND_CONTRACT.md,
// contract `generation-quote.v1`). Off unless `VITE_GENERATION_QUOTE_API=true`; the backend has no production profiles and no worker dispatch yet.
//   POST /customer/generation-quotes                      201 { contract_version, quote_id, execution_class, credits, kind:"fixed", max_credits, available_credits,
//        { tenant_id, project_id, campaign_id(uuid), variant_id(uuid), expected_campaign_version, execution_class,     sufficient, expires_at (60 s), policy_version, state }
//          execution_mode: ai|hybrid, execution_brief? (required for image/video), supplied_assets:[{asset_id(uuid), role}], idempotency_key }
//   POST /customer/generation-quotes/:id/confirm { idempotency_key, max_credits (the exact quoted maximum), confirmed:true }  202 { status, job_id, quote_id, reserved_credits, replay }
//   GET  /customer/generation-quotes/:id                  200 { quote_id, job_id, state, execution_class, reserved_credits, reservation_state }
//   POST /customer/generation-quotes/:id/cancel           200 { quote_id, status:"cancelled", charged:false }  (409 EXECUTION_ALREADY_STARTED once calling)
// Rules that shape this file:
//  * A quote binds the WHOLE normalised request. The same key with a different request is 409 IDEMPOTENCY_KEY_CONFLICT, so the key is derived from the
//    request fingerprint plus a nonce: the nonce is reused only for a network retry of the same request and replaced for a fresh quote after expiry.
//  * Confirmation is queued-job semantics. 202 means a reservation and a queued job exist, never that anything was generated.
//  * A confirmation key is created once per quote, saved before it is sent, and reused for every retry; a lost response is never answered with a new key.
//  * Status `state` is worker state (queued, claimed, calling, recovery_required, succeeded, failed, cancelled), not approval and not publication.
export const isGenerationQuoteApiEnabled = (env = import.meta.env) => {
  const raw = env && env.VITE_GENERATION_QUOTE_API;
  return typeof raw === "string" && raw.trim().toLowerCase() === "true";
};

export const EXECUTION_CLASSES = ["text.standard", "image.normal", "video.normal", "video.premium"];
export const CONTRACT_VERSION = "generation-quote.v1";
export const EXECUTION_STATES = ["quoted", "confirmed", "queued", "claimed", "calling", "recovery_required", "succeeded", "failed", "cancelled"];
export const TERMINAL_STATES = ["succeeded", "failed", "cancelled"];

export class QuoteError extends Error {
  constructor(message, { kind = "error", status = 0, code = "" } = {}) { super(message); this.name = "QuoteError"; this.kind = kind; this.status = status; this.code = code; }
}

export const CREDITS_UNAVAILABLE_TEXT = "You do not have enough credits for this. Nothing was started and nothing was charged. Your balance is in Plan and billing.";
export const BILLING_UNAVAILABLE_TEXT = "Credits cannot be checked right now, so nothing was started or charged. Try again shortly.";

const isCount = (v) => Number.isInteger(v) && v >= 0;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (text) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
const canonical = (v) => (Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}` : JSON.stringify(v));

// The request exactly as the backend normalises it (assets sorted by id), WITHOUT the idempotency key.
export function buildQuoteRequest({ scope, campaign, variant, executionClass, executionMode = "ai", brief = "", suppliedAssets = [] }) {
  if (!EXECUTION_CLASSES.includes(executionClass)) throw new QuoteError("That kind of generation cannot be priced.", { kind: "invalid" });
  if (!campaign || !UUID.test(campaign.campaign_id || "") || !variant || !UUID.test(variant.variant_id || "")) throw new QuoteError("This item cannot be priced yet.", { kind: "invalid" });
  if (!Number.isInteger(campaign.version) || campaign.version < 1) throw new QuoteError("The campaign version is not known yet, so it cannot be priced.", { kind: "invalid" });
  const text = String(brief || "").trim();
  if (!executionClass.startsWith("text.") && !text) throw new QuoteError("Describe what you want in the brief first.", { kind: "invalid" });
  if (text.length > 4000) throw new QuoteError("Shorten the brief to 4000 characters or fewer.", { kind: "invalid" });
  const assets = [...suppliedAssets].map((a) => ({ asset_id: a.asset_id, role: a.role === "supporting" ? "supporting" : "primary" })).sort((a, b) => a.asset_id.localeCompare(b.asset_id));
  if (assets.length > 10 || new Set(assets.map((a) => a.asset_id)).size !== assets.length || !assets.every((a) => UUID.test(a.asset_id))) throw new QuoteError("Choose up to 10 different media files.", { kind: "invalid" });
  if (executionMode === "hybrid" && assets.length === 0) throw new QuoteError("Hybrid needs at least one of your own media files.", { kind: "invalid" });
  if (executionMode === "ai" && assets.length > 0) throw new QuoteError("Your media is used only with Hybrid.", { kind: "invalid" });
  return { tenant_id: scope.tenantId, project_id: scope.projectId, campaign_id: campaign.campaign_id, variant_id: variant.variant_id, expected_campaign_version: campaign.version, execution_class: executionClass, execution_mode: executionMode, ...(text ? { execution_brief: text } : {}), supplied_assets: assets };
}
export const requestFingerprint = async (request) => sha256(canonical(request));
export const newNonce = () => (globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replaceAll("-", "");
// 1-128 characters of [A-Za-z0-9._:-]. Same request + same nonce = same key (a retry); a new nonce = a fresh quote.
export const quoteKey = (fingerprint, nonce) => `q:${fingerprint.slice(0, 48)}:${nonce}`;
export const confirmKey = () => `c:${newNonce()}`;

// Fail closed: a quote with any field missing or inconsistent is NOT shown as a price, and one that offers less than it costs is never "sufficient".
export function normaliseQuote(body, now = Date.now()) {
  const bad = (why) => new QuoteError("The credit cost could not be confirmed, so nothing can be started. Nothing was charged.", { kind: "invalid", code: `BAD_QUOTE:${why}` });
  const q = body && typeof body === "object" ? body : null;
  if (!q || q.contract_version !== CONTRACT_VERSION) throw bad("contract_version");
  if (typeof q.quote_id !== "string" || !UUID.test(q.quote_id)) throw bad("quote_id");
  if (!EXECUTION_CLASSES.includes(q.execution_class)) throw bad("execution_class");
  if (!isCount(q.credits) || q.credits < 1) throw bad("credits");
  if (q.kind !== "fixed") throw bad("kind");
  if (q.max_credits !== q.credits) throw bad("max_credits"); // a fixed price authorises exactly itself
  if (!isCount(q.available_credits)) throw bad("available_credits");
  if (typeof q.sufficient !== "boolean") throw bad("sufficient");
  const expiresAt = Date.parse(q.expires_at);
  if (!Number.isFinite(expiresAt)) throw bad("expires_at");
  if (typeof q.policy_version !== "string" || !q.policy_version) throw bad("policy_version");
  if (!["quoted", "confirmed", "cancelled"].includes(q.state)) throw bad("state");
  return { binding: true, quoteId: q.quote_id, executionClass: q.execution_class, credits: q.credits, kind: "fixed", maxCredits: q.max_credits, authorisedCredits: q.max_credits, availableCredits: q.available_credits, sufficient: q.sufficient && q.available_credits >= q.credits, expiresAt, expired: expiresAt <= now, policyVersion: q.policy_version, state: q.state };
}

const TEXT = {
  401: ["auth", "Your session has ended. Sign in again to continue. Nothing was started or charged."],
  404: ["unavailable", "This item is not available to you any more. Nothing was started or charged."],
  402: ["insufficient", CREDITS_UNAVAILABLE_TEXT],
};
const CODE_TEXT = {
  VERSION_CONFLICT: ["conflict", "The campaign changed, so nothing was started. Reload it and try again."],
  QUOTE_EXPIRED: ["expired", "The price expired. Nothing was charged. Get a new price to continue."],
  QUOTE_CHANGED: ["changed", "The price or settings changed after the price was shown, so nothing was started or charged. Get a new price to continue."],
  QUOTE_CANCELLED: ["cancelled", "This price was cancelled. Nothing was charged."],
  IDEMPOTENCY_KEY_CONFLICT: ["key_conflict", "That request was already sent with different choices. Check its status before trying again."],
  EXECUTION_ALREADY_STARTED: ["started", "This has already started, so it can no longer be cancelled. Its result will be shown here."],
  OPERATION_UNSUPPORTED: ["unsupported", "This kind of creative cannot be made for this item yet. Nothing was started or charged."],
  PREVIEW_VERSION_UNAVAILABLE: ["unsupported", "This destination cannot be previewed or approved yet, so it cannot be created. Nothing was started or charged."],
  CREATIVE_BRIEF_REQUIRED: ["invalid", "Describe what you want in the brief first."],
  GENERATION_CREDITS_UNAVAILABLE: ["insufficient", CREDITS_UNAVAILABLE_TEXT],
  GENERATION_BILLING_UNAVAILABLE: ["unavailable", BILLING_UNAVAILABLE_TEXT],
  QUOTE_UNAVAILABLE: ["unavailable", BILLING_UNAVAILABLE_TEXT],
};

async function call(fetchImpl, url, options, { paid = false } = {}) {
  let response;
  try { response = await fetchImpl(url, options); }
  catch { throw new QuoteError(paid ? "The request may or may not have been received because the connection failed. Check its status before trying again: sending the same confirmation again cannot start it twice or charge you twice." : "The request could not be reached. Nothing was started or charged.", { kind: paid ? "uncertain" : "network", code: "NETWORK" }); }
  let json = null; try { json = await response.json(); } catch { json = null; }
  const code = (json && json.error && json.error.code) || "";
  if (response.ok) return json;
  const by = CODE_TEXT[code] || TEXT[response.status];
  if (by) throw new QuoteError(by[1], { kind: by[0], status: response.status, code });
  if (response.status === 400) throw new QuoteError("Some of the details were not accepted. Nothing was started or charged.", { kind: "invalid", status: 400, code });
  if (response.status === 503) throw new QuoteError(paid ? "The service is not available right now. If this was a confirmation, check its status before trying again." : BILLING_UNAVAILABLE_TEXT, { kind: paid ? "uncertain" : "unavailable", status: 503, code });
  if (response.status >= 500) throw new QuoteError(paid ? "The service had a problem and the outcome is not known. Check its status before trying again." : "The service had a problem. Nothing was started or charged.", { kind: paid ? "uncertain" : "error", status: response.status, code });
  throw new QuoteError("That could not be done yet. Nothing was started or charged.", { kind: "error", status: response.status, code });
}
const headers = (t) => ({ "content-type": "application/json", authorization: `Bearer ${t}` });

export async function requestGenerationQuote({ apiBaseUrl, accessToken, request, nonce, fetchImpl = (...a) => fetch(...a), now = Date.now() }) {
  const key = quoteKey(await requestFingerprint(request), nonce);
  return normaliseQuote(await call(fetchImpl, `${apiBaseUrl}/customer/generation-quotes`, { method: "POST", headers: headers(accessToken), body: JSON.stringify({ ...request, idempotency_key: key }) }), now);
}

// `quote` is what requestGenerationQuote returned; the confirmation authorises exactly its maximum and nothing more.
export async function confirmGenerationQuote({ apiBaseUrl, accessToken, quote, key, fetchImpl = (...a) => fetch(...a) }) {
  if (!quote || !quote.binding || !quote.sufficient) throw new QuoteError("There is no usable price to confirm.", { kind: "invalid" });
  if (!key || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(key)) throw new QuoteError("The confirmation could not be prepared.", { kind: "invalid" });
  const json = await call(fetchImpl, `${apiBaseUrl}/customer/generation-quotes/${encodeURIComponent(quote.quoteId)}/confirm`, { method: "POST", headers: headers(accessToken), body: JSON.stringify({ idempotency_key: key, max_credits: quote.authorisedCredits, confirmed: true }) }, { paid: true });
  if (!json || typeof json.job_id !== "string" || !json.job_id || json.quote_id !== quote.quoteId || !isCount(json.reserved_credits) || !EXECUTION_STATES.includes(json.status)) throw new QuoteError("The confirmation may or may not have been received. Check its status before trying again.", { kind: "uncertain", code: "BAD_RESPONSE" });
  return { jobId: json.job_id, quoteId: json.quote_id, reservedCredits: json.reserved_credits, status: json.status, replay: json.replay === true };
}

export async function fetchQuoteStatus({ apiBaseUrl, accessToken, quoteId, fetchImpl = (...a) => fetch(...a) }) {
  const json = await call(fetchImpl, `${apiBaseUrl}/customer/generation-quotes/${encodeURIComponent(quoteId)}`, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!json || json.quote_id !== quoteId || !EXECUTION_STATES.includes(json.state) || !EXECUTION_CLASSES.includes(json.execution_class) || !isCount(json.reserved_credits)) throw new QuoteError("The server's answer was not in the expected form, so no status is shown.", { kind: "invalid", code: "BAD_RESPONSE" });
  return { quoteId, jobId: typeof json.job_id === "string" && json.job_id ? json.job_id : null, state: json.state, executionClass: json.execution_class, reservedCredits: json.reserved_credits, reservation: ["held", "settled", "none"].includes(json.reservation_state) ? json.reservation_state : "none" };
}

export async function cancelGenerationQuote({ apiBaseUrl, accessToken, quoteId, fetchImpl = (...a) => fetch(...a) }) {
  const json = await call(fetchImpl, `${apiBaseUrl}/customer/generation-quotes/${encodeURIComponent(quoteId)}/cancel`, { method: "POST", headers: headers(accessToken) }, { paid: true });
  if (!json || json.quote_id !== quoteId || json.status !== "cancelled" || json.charged !== false) throw new QuoteError("The cancellation could not be confirmed. Check its status.", { kind: "uncertain", code: "BAD_RESPONSE" });
  return { quoteId, charged: false };
}

// Turns a refused legacy text-generate call into what the customer should see (the text path still uses the existing synchronous route).
export function describeGenerateRefusal(status, code) {
  if (status === 402 || code === "GENERATION_CREDITS_UNAVAILABLE") return { kind: "insufficient", text: CREDITS_UNAVAILABLE_TEXT };
  if (status === 503 && code === "GENERATION_BILLING_UNAVAILABLE") return { kind: "billing_unavailable", text: BILLING_UNAVAILABLE_TEXT };
  return null;
}
