// Social account connection and publishing (BG-STUDIO-024-FE). Adapter for the REAL backend contract in bizgenie-api PR #218 (9346055):
// router src/social-publishing/router.js mounted at /customer/social, service src/social-publishing/service.js. It replaces the earlier PROPOSED
// /customer/social-accounts and /customer/publishing-queue routes, which the backend never had (qa/integration/backend218 asserts they 404).
// Off unless `VITE_SOCIAL_ACCOUNTS_API=true`. The backend answers 503 SOCIAL_NOT_CONFIGURED until an operator configures a platform; no live OAuth or publishing is authorised.
//   scope = { tenant_id, project_id, brand_id } is sent in the query (GET) or body (POST).
//   GET  /connections            -> { connections: [ { connection_id, platform, account_id, status: active|revoked|expired, expires_at, version } ], next_cursor|null }
//   POST /oauth-intents          { scope, platform, pkce_challenge(43 base64url) } -> { intent_id, state, expires_at }   (owner only)
//   POST /oauth-complete         { scope, intent_id, state, code, code_verifier(43-128) } -> connection              (owner only)
//   POST /connections/:id/disconnect { scope } -> connection (status revoked)                                         (owner only)
//   GET  /dispatches             -> { dispatches: [ dispatch ], next_cursor|null }
//   GET  /calendar?from&to       -> { contract_version: "publishing-calendar.v1", entries: [ dispatch + delivery_state ], next_cursor|null }
//   POST /dispatches             { scope, connection_id, campaign_id, variant_id, schedule_id, expected_campaign_version, publishing_confirmed: true } -> dispatch (idempotent)
//   POST /dispatches/:id/cancel  { scope } -> dispatch
//   dispatch = { dispatch_id, campaign_id, variant_id, revision_id, state: queued|claimed|sending|reconciliation_required|published|failed|cancelled,
//                scheduled_for, publication_id|null, publication_url|null, published_at|null, evidence_kind: "platform_api"|null }
// OPEN CONTRACT GAP (for Codex, see docs/studio/BG_STUDIO_024_FE_SOCIAL.md): the intent response carries no provider authorize URL, so the browser cannot
// start the platform sign-in. This client accepts an optional https `authorize_url` on the intent response and otherwise refuses to start, honestly.
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
  return { id: c.connection_id, provider: c.platform, accountId: c.account_id, name: c.account_id, status: CONNECTION_STATUS[c.status], expiresAt: c.expires_at, version: c.version };
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
async function post(fetchImpl, url, token, payload, what) {
  let res; try { res = await fetchImpl(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(payload) }); } catch { throw new SocialError(`${what} may or may not have been received because the connection failed. Check your connected accounts before trying again.`, { kind: "unconfirmed" }); }
  if (res.status === 401) throw new SocialError("Your session has ended. Sign in again to continue. Nothing was changed.", { kind: "auth", status: 401 });
  if (res.status === 404) throw new SocialError("Only the workspace owner can do that, or it is no longer available. Nothing was changed.", { kind: "forbidden", status: 404 });
  if (res.status === 503) throw new SocialError(`${what} is not switched on for this workspace yet. Nothing was changed.`, { kind: "unavailable", status: 503 });
  const c = res.ok ? "" : await code(res);
  if (res.status === 409 || (res.status === 422 && c)) throw new SocialError(c === "PUBLICATION_ALREADY_STARTED" ? "That post has already started publishing, so it cannot be cancelled." : "That changed in the meantime or needs a permission from the platform. Check your accounts and try again. Nothing was changed.", { kind: "conflict", status: res.status, code: c });
  if (res.status >= 500) throw new SocialError(`${what} may or may not have been received because the service had a problem. Check your connected accounts before trying again.`, { kind: "unconfirmed", status: res.status });
  if (!res.ok) throw new SocialError(`${what} could not be done yet. Nothing was changed.`, { kind: "error", status: res.status, code: c });
  try { return await res.json(); } catch { throw bad(); }
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
  const json = await post(fetchImpl, u(apiBaseUrl, "/oauth-intents"), accessToken, body(scope, { platform: provider, pkce_challenge: p.challenge }), "Connecting");
  if (!json || !str(json.intent_id) || !str(json.state)) throw bad();
  if (!json.authorize_url || !https(json.authorize_url)) throw new SocialError("BizGenie cannot open that platform's sign-in page yet, so nothing was connected.", { kind: "unavailable", code: "AUTHORIZE_URL_MISSING" });
  return { url: new URL(json.authorize_url).toString(), pending: { intentId: json.intent_id, state: json.state, verifier: p.verifier, provider } };
}
export async function completeConnect({ apiBaseUrl, accessToken, scope, pending, code: authCode, state, fetchImpl = (...a) => fetch(...a) }) {
  if (!pending || !str(authCode) || state !== pending.state) throw new SocialError("The platform's answer did not match this connection attempt, so nothing was connected.", { kind: "invalid", code: "STATE_MISMATCH" });
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
