import { limitedNotice, routeLimited } from "./bridgeLimits";
import { bridgeRefusal, responseCode } from "./bridgeErrors";
const API_BASE_URL = import.meta.env.VITE_BIZGENIE_API_URL || "http://localhost:8080";

function authHeaders(accessToken, json = false) {
  return {
    authorization: `Bearer ${accessToken}`,
    ...(json ? { "content-type": "application/json" } : {}),
  };
}

function newRequestId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `checkout_${uuid ? uuid.replaceAll("-", "") : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`}`;
}

// BG-017C-05: ONE request_id per checkout intent. The backend turns (tenant, plan, request_id) into Stripe's idempotency key, so the same id after a lost
// response returns the same Checkout Session instead of creating a second one. The id is kept (sessionStorage, so a refresh keeps it) until the intent
// is resolved: a session was returned (success) or the request was refused for good (400/403/404). An unclear outcome (no answer, timeout, 5xx, unreadable
// reply), a busy answer (429) and an ended sign-in (401) keep it. It is bound to the tenant and plan, so another tenant or plan never reuses it, and it
// is dropped after a day (Stripe stops honouring an idempotency key after 24 hours).
const INTENT_KEY = "bizgenie.checkout.intent.v1";
const INTENT_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const memoryIntents = {};
const inFlight = new Map();
const intentKey = (tenantId, planCode) => `${tenantId}|${planCode}`;
function readIntents() {
  try { const raw = JSON.parse(globalThis.sessionStorage?.getItem(INTENT_KEY) || "null"); if (raw && typeof raw === "object") return raw; } catch { /* use the memory copy */ }
  return memoryIntents;
}
function writeIntents(all) {
  Object.keys(memoryIntents).forEach((k) => delete memoryIntents[k]); Object.assign(memoryIntents, all);
  try { globalThis.sessionStorage?.setItem(INTENT_KEY, JSON.stringify(all)); } catch { /* memory copy remains */ }
}
export function checkoutRequestIdFor(tenantId, planCode, now = Date.now()) {
  const all = { ...readIntents() }; const held = all[intentKey(tenantId, planCode)];
  if (held && typeof held.requestId === "string" && now - held.createdAt < INTENT_MAX_AGE_MS) return held.requestId;
  for (const [k, v] of Object.entries(all)) if (!v || now - v.createdAt >= INTENT_MAX_AGE_MS) delete all[k];
  const intent = { requestId: newRequestId(), createdAt: now };
  all[intentKey(tenantId, planCode)] = intent; writeIntents(all);
  return intent.requestId;
}
export function releaseCheckoutIntent(tenantId, planCode) {
  const all = { ...readIntents() }; delete all[intentKey(tenantId, planCode)]; writeIntents(all);
}
export const AMBIGUOUS_CHECKOUT = "We couldn't confirm whether checkout started. Nothing is shown as charged. Try again: it reuses the same request, so you won't be charged twice. You can also check your plan status first.";

function safeCheckoutUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Checkout could not be opened safely.");
  }
  if (url.protocol !== "https:") throw new Error("Checkout could not be opened safely.");
  return url.toString();
}

// `planCode` defaults to the one plan the app has always offered; a server-owned catalogue (BG-STUDIO-019-FE) may name another. The backend
// validates the code and maps it to its own approved Stripe Price: the browser never supplies a price.
export function startStandardCheckout(args) {
  // A second click on the same unresolved intent shares the request that is already running (no second POST).
  const key = `${args?.tenantId}|${args?.planCode || "standard"}`;
  if (inFlight.has(key)) return inFlight.get(key);
  const run = checkoutOnce(args).finally(() => inFlight.delete(key));
  inFlight.set(key, run);
  return run;
}

async function checkoutOnce({ accessToken, tenantId, planCode = "standard" }) {
  // The checkout gate: a bridge-marked build keeps checkout OFF (bridgeLimits) until it is separately approved; nothing is sent, nothing is charged.
  if (routeLimited("checkout")) throw Object.assign(new Error(limitedNotice("checkout")), { kind: "not_available_here" });
  if (!/^[a-z0-9_-]{1,32}$/.test(planCode)) throw new Error("Choose a plan from the list.");
  if (!accessToken || !tenantId) throw new Error("Sign in to start checkout.");

  const requestId = checkoutRequestIdFor(tenantId, planCode);
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/billing/stripe/checkout`, {
      method: "POST",
      headers: authHeaders(accessToken, true),
      body: JSON.stringify({
        // This selector is derived only from trusted Supabase app_metadata. The backend remains authority and re-authorizes owner membership.
        // The browser never supplies a price, a URL or a user id: the plan code is mapped to Stripe's Price on the server.
        tenant_id: tenantId,
        plan_code: planCode,
        request_id: requestId,
      }),
    });
  } catch {
    throw Object.assign(new Error(AMBIGUOUS_CHECKOUT), { kind: "ambiguous" });
  }

  if (!response.ok) {
    const code = await responseCode(response);
    const refusal = bridgeRefusal(code);
    if (response.status === 401) throw Object.assign(new Error("Sign in again to start checkout. Nothing was charged."), { kind: "signed_out" });
    if (response.status === 429) throw Object.assign(new Error(refusal ? refusal.text : "Too many requests just now. Wait a moment, then try again."), { kind: "busy" });
    if (response.status >= 500) throw Object.assign(new Error(AMBIGUOUS_CHECKOUT), { kind: "ambiguous" });
    // From here the request was refused for good: nothing was created, so the next attempt is a new intent.
    releaseCheckoutIntent(tenantId, planCode);
    if (response.status === 403 && refusal) throw Object.assign(new Error(refusal.text), { kind: refusal.kind });
    if (response.status === 404) throw new Error("Checkout is not available for this account.");
    if (response.status === 400) throw new Error("Checkout details weren't accepted, so nothing was started or charged. Please try again, or contact support if it keeps happening.");
    throw new Error("Checkout could not be started. Nothing was charged. Please try again.");
  }

  let result;
  try { result = await response.json(); } catch { throw Object.assign(new Error(AMBIGUOUS_CHECKOUT), { kind: "ambiguous" }); }
  let url;
  try { url = safeCheckoutUrl(result?.url); } catch { throw Object.assign(new Error(AMBIGUOUS_CHECKOUT), { kind: "ambiguous" }); }
  releaseCheckoutIntent(tenantId, planCode);
  return { url, checkoutSessionId: result?.checkout_session_id || "" };
}

export async function readCustomerBillingState({ accessToken, tenantId }) {
  if (!accessToken || !tenantId) throw new Error("Sign in to check your billing status.");

  const response = await fetch(`${API_BASE_URL}/customer/billing/subscription?tenant_id=${encodeURIComponent(tenantId)}`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error("Sign in again to check your billing status.");
    if (response.status === 404) throw new Error("Billing access could not be verified. Please do not start another checkout.");
    throw new Error("We can't check your subscription right now. Please try again.");
  }

  return response.json();
}
