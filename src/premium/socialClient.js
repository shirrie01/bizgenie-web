// Social account connection and publishing (BG-STUDIO-024-FE). Adapter for the REAL backend contract in bizgenie-api PR #218 (9346055):
// router src/social-publishing/router.js mounted at /customer/social, service src/social-publishing/service.js. It replaces the earlier PROPOSED
// /customer/social-accounts and /customer/publishing-queue routes, which the backend never had (qa/integration/backend218 asserts they 404).
// Off unless `VITE_SOCIAL_ACCOUNTS_API=true`. The backend answers 503 SOCIAL_NOT_CONFIGURED until an operator configures a platform; no live OAuth or publishing is authorised.
//   scope = { tenant_id, project_id, brand_id } is sent in the query (GET) or body (POST).
//   GET  /connections            -> { connections: [ { connection_id, platform, account_id, display_name|null, status: active|revoked|expired, expires_at, version } ], next_cursor|null }
//   POST /oauth-intents          { scope, platform, pkce_challenge(43 base64url) } -> { intent_id, state, expires_at }   (owner only)
//   POST /oauth-complete         { scope, intent_id, state, code, code_verifier(43-128) } -> connection              (owner only)
//   POST /connections/:id/disconnect { scope } -> connection (status revoked)                                         (owner only)
//   GET  /dispatches             -> { dispatches: [ dispatch ], next_cursor|null }
//   GET  /calendar?from&to       -> { contract_version: "publishing-calendar.v1", entries: [ dispatch + delivery_state ], next_cursor|null }
//   POST /dispatches             { scope, connection_id, campaign_id, variant_id, schedule_id, expected_campaign_version, publishing_confirmed: true } -> dispatch (idempotent)
//   POST /dispatches/:id/cancel  { scope } -> dispatch
//   dispatch = { dispatch_id, campaign_id, variant_id, revision_id, state: queued|claimed|sending|reconciliation_required|published|failed|cancelled,
//                scheduled_for, publication_id|null, publication_url|null, published_at|null, evidence_kind: "platform_api"|null }
// Updated for bizgenie-api #220 (application e653ed346c41887261ff6861342e3861995edcc0; docs/studio/BG_STUDIO_025_BACKEND_HANDOFF.md F1):
//   POST /oauth-intents -> { contract_version:"social-oauth-intent.v1", intent_id, state, expires_at, authorize_url|null, redirect_uri|null,
//                            authorization_status: "ready" | "provider_configuration_required" }
//   The browser navigates ONLY when authorization_status is "ready" and authorize_url/redirect_uri are https and consistent with this attempt (state, our S256 challenge, the pinned
//   redirect_uri). "ready" means the server's explicit configuration validated; it is NOT proof of Meta approval. Connection rows add display_name|null; an expired grant is reported
//   as status "expired" by the server. Errors: OAUTH_STATE_INVALID / OAUTH_CONFIGURATION_CHANGED -> start again; PLATFORM_PERMISSION_REQUIRED / PLATFORM_APP_REVIEW_REQUIRED /
//   OAUTH_ACCESS_DENIED -> not connected; SOCIAL_NOT_CONFIGURED / OAUTH_CONFIGURATION_UNAVAILABLE -> do not navigate; OAUTH_PROVIDER_UNAVAILABLE -> attempt consumed, check accounts first.
// A post counts as platform-verified only when state is "published", evidence_kind is "platform_api" and publication_url is https.
export const isSocialApiEnabled = (env = import.meta.env) => {
  const raw = env && env.VITE_SOCIAL_ACCOUNTS_API;
  return typeof raw === "string" && raw.trim().toLowerCase() === "true";
};
export class SocialError extends Error {
  constructor(message, { kind = "error", status = 0, code = "" } = {}) { super(message); this.name = "SocialError"; this.kind = kind; this.status = status; this.code = code; }
}
export const PROVIDERS = ["instagram", "facebook", "linkedin", "tiktok", "youtube"];
export const PROVIDER_LABEL = { instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn", tiktok: "TikTok", youtube: "YouTube" };
const CONNECTION_STATUS = { active: "connected", revoked: "revoked", expired: "needs_reauth" };
const DISPATCH_STATE = ["queued", "claimed", "sending", "reconciliation_required", "published", "failed", "cancelled"];
const str = (v) => typeof v === "string" && v.trim().length > 0; const https = (v) => { try { return new URL(v).protocol === "https:"; } catch { return false; } };
const bad = () => new SocialError("The server's answer was not in the expected form, so nothing is shown from it.", { kind: "invalid", code: "BAD_RESPONSE" });
const q = (scope, extra = {}) => new URLSearchParams({ tenant_id: scope.tenantId, project_id: scope.projectId, brand_id: scope.brandId, ...extra });
const body = (scope, extra = {}) => ({ tenant_id: scope.tenantId, project_id: scope.projectId, brand_id: scope.brandId, ...extra });

export function normaliseConnection(c) {
  if (!c || !str(c.connection_id) || !PROVIDERS.includes(c.platform) || !str(c.account_id) || !Object.hasOwn(CONNECTION_STATUS, c.status) || !Number.isFinite(Date.parse(c.expires_at)) || !Number.isInteger(c.version)) return null;
  // display_name is verified connector output, shown as TEXT only (max 200, no control characters); otherwise the account id stands in.
  const display = typeof c.display_name === "string" && c.display_name.trim().length > 0 && c.display_name.length <= 200 && !/[\u0000-\u001f\u007f]/.test(c.display_name) ? c.display_name.trim() : "";
  return { id: c.connection_id, provider: c.platform, accountId: c.account_id, displayName: display, name: display || c.account_id, status: CONNECTION_STATUS[c.status], expiresAt: c.expires_at, version: c.version };
}
export function normaliseConnections(b) {
  if (!b || !Array.isArray(b.connections)) throw bad();
  const connections = b.connections.map(normaliseConnection).filter(Boolean);
  return { connections, skipped: b.connections.length - connections.length, nextCursor: str(b.next_cursor) ? b.next_cursor : null };
}
export function normaliseDispatch(d) {
  if (!d || !str(d.dispatch_id) || !str(d.campaign_id) || !str(d.variant_id) || !DISPATCH_STATE.includes(d.state)) return null;
  const verified = d.state === "published" && d.evidence_kind === "platform_api" && https(d.publication_url);
  return { id: d.dispatch_id, campaignId: d.campaign_id, variantId: d.variant_id, state: d.state, scheduledFor: Number.isFinite(Date.parse(d.scheduled_for)) ? d.scheduled_for : null, platformVerified: verified, postUrl: verified ? new URL(d.publication_url).toString() : "", publishedAt: verified && Number.isFinite(Date.parse(d.published_at)) ? d.published_at : null };
}
export function normaliseDispatches(b) {
  if (!b || !Array.isArray(b.dispatches)) throw bad();
  const items = b.dispatches.map(normaliseDispatch).filter(Boolean);
  return { items, skipped: b.dispatches.length - items.length, nextCursor: str(b.next_cursor) ? b.next_cursor : null };
}
export function normaliseCalendar(b) {
  if (!b || b.contract_version !== "publishing-calendar.v1" || !Array.isArray(b.entries)) throw bad();
  const entries = b.entries.map((e) => { const d = normaliseDispatch(e); return d && str(e.delivery_state) ? { ...d, deliveryState: e.delivery_state } : null; }).filter(Boolean);
  return { entries, skipped: b.entries.length - entries.length, nextCursor: str(b.next_cursor) ? b.next_cursor : null };
}

const code = async (res) => { try { const j = await res.json(); return j && j.error && typeof j.error.code === "string" ? j.error.code : ""; } catch { return ""; } };
async function get(fetchImpl, url, token, what) {
  let res; try { res = await fetchImpl(url, { headers: { authorization: `Bearer ${token}` } }); } catch { throw new SocialError(`${what} could not be loaded because the connection failed.`, { kind: "network" }); }
  if (res.status === 401) throw new SocialError("Your session has ended. Sign in again to continue.", { kind: "auth", status: 401 });
  if (res.status === 404) throw new SocialError(`${what} is not available to you.`, { kind: "unavailable", status: 404 });
  if (res.status === 503) throw new SocialError(`${what} is not switched on for this workspace yet.`, { kind: "unavailable", status: 503 });
  if (!res.ok) throw new SocialError(`${what} could not be loaded yet.`, { kind: "error", status: res.status });
  try { return await res.json(); } catch { throw bad(); }
}
const CODES = {
  OAUTH_STATE_INVALID: ["stale_attempt", "That sign-in attempt expired or was already used, so nothing was connected. Start again."],
  OAUTH_CONFIGURATION_CHANGED: ["stale_attempt", "The connection settings changed while you were away, so nothing was connected. Start again."],
  OAUTH_PKCE_REQUIRED: ["stale_attempt", "That sign-in attempt could not be verified, so nothing was connected. Start again."],
  PLATFORM_PERMISSION_REQUIRED: ["permission", "The platform did not grant the permissions BizGenie needs, so nothing was connected."],
  PLATFORM_APP_REVIEW_REQUIRED: ["permission", "This platform connection is not approved for use yet, so nothing was connected."],
  OAUTH_ACCESS_DENIED: ["permission", "Permission was not given on the platform, so nothing was connected."],
  SOCIAL_NOT_CONFIGURED: ["unavailable", "Connecting social accounts is not switched on for this workspace yet. Nothing was changed."],
  OAUTH_CONFIGURATION_UNAVAILABLE: ["unavailable", "This platform connection is not set up yet. Nothing was changed."],
  OAUTH_PROVIDER_UNAVAILABLE: ["unconfirmed", "The platform did not give a clear answer, and this sign-in attempt is now finished. Check your connected accounts before starting again."],
  PUBLICATION_ALREADY_STARTED: ["conflict", "That post has already started publishing, so it cannot be cancelled."],
};
async function post(fetchImpl, url, token, payload, what) {
  let res; try { res = await fetchImpl(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(payload) }); } catch { throw new SocialError(`${what} may or may not have been received because the connection failed. Check your connected accounts before trying again.`, { kind: "unconfirmed" }); }
  if (res.status === 401) throw new SocialError("Your session has ended. Sign in again to continue.", { kind: "auth", status: 401 });
  if (res.ok) { try { return await res.json(); } catch { throw bad(); } }
  const c = await code(res);
  if (CODES[c]) throw new SocialError(CODES[c][1], { kind: CODES[c][0], status: res.status, code: c });
  if (res.status === 404) throw new SocialError("Only the workspace owner can do that, or it is no longer available. Nothing was changed.", { kind: "forbidden", status: 404, code: c });
  if (res.status === 409 || res.status === 422) throw new SocialError("That changed in the meantime or needs a permission from the platform. Check your accounts and try again.", { kind: "conflict", status: res.status, code: c });
  // Any other 5xx on a write may have taken effect: never say "nothing was changed".
  if (res.status >= 500) throw new SocialError(`${what} may or may not have completed because the service had a problem. Check your connected accounts before trying again.`, { kind: "unconfirmed", status: res.status, code: c });
  throw new SocialError(`${what} could not be done yet.`, { kind: "error", status: res.status, code: c });
}
const u = (base, p) => `${base}/customer/social${p}`;
export const fetchConnections = async ({ apiBaseUrl, accessToken, scope, cursor, fetchImpl = (...a) => fetch(...a) }) => normaliseConnections(await get(fetchImpl, u(apiBaseUrl, `/connections?${q(scope, cursor ? { cursor } : {})}`), accessToken, "Your connected accounts"));
export const fetchDispatches = async ({ apiBaseUrl, accessToken, scope, cursor, fetchImpl = (...a) => fetch(...a) }) => normaliseDispatches(await get(fetchImpl, u(apiBaseUrl, `/dispatches?${q(scope, cursor ? { cursor } : {})}`), accessToken, "The publishing list"));
export const fetchPublishingCalendar = async ({ apiBaseUrl, accessToken, scope, from, to, cursor, fetchImpl = (...a) => fetch(...a) }) => normaliseCalendar(await get(fetchImpl, u(apiBaseUrl, `/calendar?${q(scope, { from, to, ...(cursor ? { cursor } : {}) })}`), accessToken, "The publishing calendar"));

// PKCE (RFC 7636, S256). The verifier never leaves the browser until /oauth-complete.
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
export async function newPkce(cryptoImpl = globalThis.crypto) {
  const verifier = b64url(cryptoImpl.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(new Uint8Array(await cryptoImpl.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  return { verifier, challenge };
}
export async function startConnect({ apiBaseUrl, accessToken, scope, provider, pkce, fetchImpl = (...a) => fetch(...a) }) {
  if (!PROVIDERS.includes(provider)) throw new SocialError("Choose a platform from the list.", { kind: "invalid" });
  const p = pkce || await newPkce();
  const j = await post(fetchImpl, u(apiBaseUrl, "/oauth-intents"), accessToken, body(scope, { platform: provider, pkce_challenge: p.challenge }), "Connecting");
  if (!j || j.contract_version !== "social-oauth-intent.v1" || !str(j.intent_id) || !str(j.state) || !Number.isFinite(Date.parse(j.expires_at))) throw bad();
  // Fail closed: navigate only when the server says the configuration is ready AND the URL is the one this attempt expects.
  if (j.authorization_status !== "ready" || !j.authorize_url || !j.redirect_uri) throw new SocialError("This platform connection is not set up yet, so nothing was opened and nothing was connected.", { kind: "unavailable", code: "PROVIDER_CONFIGURATION_REQUIRED" });
  let target, redirect; try { target = new URL(j.authorize_url); redirect = new URL(j.redirect_uri); } catch { throw new SocialError("The platform's sign-in page could not be opened safely, so nothing was connected.", { kind: "invalid", code: "BAD_URL" }); }
  const sp = target.searchParams;
  if (target.protocol !== "https:" || redirect.protocol !== "https:" || target.username || target.password || sp.get("state") !== j.state || sp.get("code_challenge") !== p.challenge || sp.get("code_challenge_method") !== "S256" || sp.get("redirect_uri") !== j.redirect_uri || sp.get("response_type") !== "code")
    throw new SocialError("The platform's sign-in page did not match this attempt, so it was not opened and nothing was connected.", { kind: "invalid", code: "BAD_URL" });
  return { url: target.toString(), pending: { intentId: j.intent_id, state: j.state, verifier: p.verifier, provider, redirectUri: j.redirect_uri, expiresAt: j.expires_at } };
}
export async function completeConnect({ apiBaseUrl, accessToken, scope, pending, code: authCode, state, now = Date.now(), fetchImpl = (...a) => fetch(...a) }) {
  if (!pending || !str(authCode) || state !== pending.state) throw new SocialError("The platform's answer did not match this connection attempt, so nothing was connected.", { kind: "invalid", code: "STATE_MISMATCH" });
  if (Number.isFinite(Date.parse(pending.expiresAt)) && Date.parse(pending.expiresAt) <= now) throw new SocialError("That sign-in attempt expired, so nothing was connected. Start again.", { kind: "stale_attempt", code: "ATTEMPT_EXPIRED" });
  const c = normaliseConnection(await post(fetchImpl, u(apiBaseUrl, "/oauth-complete"), accessToken, body(scope, { intent_id: pending.intentId, state, code: authCode, code_verifier: pending.verifier }), "Connecting"));
  if (!c) throw bad();
  return c;
}
export async function disconnect({ apiBaseUrl, accessToken, scope, connectionId, fetchImpl = (...a) => fetch(...a) }) {
  const c = normaliseConnection(await post(fetchImpl, u(apiBaseUrl, `/connections/${encodeURIComponent(connectionId)}/disconnect`), accessToken, body(scope), "Disconnecting"));
  if (!c || c.status !== "revoked") throw new SocialError("The disconnection could not be confirmed. Check your connected accounts.", { kind: "unconfirmed" });
  return { connectionId };
}
export async function enqueueDispatch({ apiBaseUrl, accessToken, scope, connectionId, campaignId, variantId, scheduleId, expectedCampaignVersion, fetchImpl = (...a) => fetch(...a) }) {
  const d = normaliseDispatch(await post(fetchImpl, u(apiBaseUrl, "/dispatches"), accessToken, body(scope, { connection_id: connectionId, campaign_id: campaignId, variant_id: variantId, schedule_id: scheduleId, expected_campaign_version: expectedCampaignVersion, publishing_confirmed: true }), "Queueing the post"));
  if (!d) throw bad();
  return d;
}
export async function cancelDispatch({ apiBaseUrl, accessToken, scope, dispatchId, fetchImpl = (...a) => fetch(...a) }) {
  const d = normaliseDispatch(await post(fetchImpl, u(apiBaseUrl, `/dispatches/${encodeURIComponent(dispatchId)}/cancel`), accessToken, body(scope), "Cancelling"));
  if (!d || d.state !== "cancelled") throw new SocialError("The cancellation could not be confirmed. Check the publishing list.", { kind: "unconfirmed" });
  return d;
}
