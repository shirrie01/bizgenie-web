// Social account connection and publishing status (BG-STUDIO-020-FE). THE BACKEND HAS NONE OF THIS: bizgenie-api PR #216 (f8d81bf) has no OAuth
// module, no token lifecycle, no connected-account store and no publisher; scheduling records a plan and manual publication is the customer's own
// attestation (docs/studio/BG_STUDIO_019_BACKEND_HANDOFF.md, "Full-premium capability boundaries"). This client is therefore a validated adapter for a
// PROPOSED contract, exercised only with fixtures, off unless `VITE_SOCIAL_ACCOUNTS_API=true`, and no live OAuth or publishing is authorised.
// A connection is shown only when the server says so; nothing is inferred from a redirect.
//   GET    /customer/social-accounts?tenant_id&project_id&brand_id
//          -> { contract_version: "social-accounts.v1", accounts: [ { account_id, provider, display_name, status: connected|needs_reauth|revoked|error,
//               scopes_granted: [string], connected_at, token_expires_at|null, last_verified_at|null } ] }
//   POST   /customer/social-accounts/connect  { tenant_id, project_id, brand_id, provider, request_id } -> 201 { authorize_url(https), state_expires_at }
//          (the provider callback is handled server side; the browser never sees a code or token)
//   POST   /customer/social-accounts/:id/disconnect { tenant_id, request_id } -> 200 { account_id, status: "revoked" }
//   GET    /customer/publishing-queue?tenant_id&project_id[&campaign_id] -> { contract_version: "publishing-queue.v1", items: [ { publication_id, campaign_id,
//               variant_id, account_id, scheduled_for, status: queued|dispatching|published|failed|needs_reconciliation, attempts, last_error_code|null,
//               platform_post_url(https)|null, verified_by: "platform"|null } ], next_cursor|null }
// Owner-only connect/disconnect (server enforced). `published` counts as platform-verified only when verified_by === "platform".
export const isSocialApiEnabled = (env = import.meta.env) => {
  const raw = env && env.VITE_SOCIAL_ACCOUNTS_API;
  return typeof raw === "string" && raw.trim().toLowerCase() === "true";
};
export class SocialError extends Error {
  constructor(message, { kind = "error", status = 0, code = "" } = {}) { super(message); this.name = "SocialError"; this.kind = kind; this.status = status; this.code = code; }
}
export const PROVIDERS = ["linkedin", "instagram", "facebook", "tiktok", "youtube"];
export const PROVIDER_LABEL = { linkedin: "LinkedIn", instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", youtube: "YouTube" };
const ACCOUNT_STATUS = ["connected", "needs_reauth", "revoked", "error"]; const QUEUE_STATUS = ["queued", "dispatching", "published", "failed", "needs_reconciliation"];
const str = (v) => typeof v === "string" && v.trim().length > 0; const https = (v) => { try { return new URL(v).protocol === "https:"; } catch { return false; } };
const bad = () => new SocialError("The server's answer was not in the expected form, so nothing is shown from it.", { kind: "invalid", code: "BAD_RESPONSE" });
export const newRequestId = (p) => `${p}_${(globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replaceAll("-", "")}`;

export function normaliseAccounts(body) {
  if (!body || body.contract_version !== "social-accounts.v1" || !Array.isArray(body.accounts)) throw bad();
  const accounts = []; let skipped = 0;
  for (const a of body.accounts) {
    if (!a || !str(a.account_id) || !PROVIDERS.includes(a.provider) || !str(a.display_name) || !ACCOUNT_STATUS.includes(a.status) || !Array.isArray(a.scopes_granted) || !Number.isFinite(Date.parse(a.connected_at))) { skipped += 1; continue; }
    accounts.push({ id: a.account_id, provider: a.provider, name: a.display_name.trim(), status: a.status, scopes: a.scopes_granted.filter(str), connectedAt: a.connected_at, tokenExpiresAt: Number.isFinite(Date.parse(a.token_expires_at)) ? a.token_expires_at : null, lastVerifiedAt: Number.isFinite(Date.parse(a.last_verified_at)) ? a.last_verified_at : null });
  }
  return { accounts, skipped };
}
export function normaliseQueue(body) {
  if (!body || body.contract_version !== "publishing-queue.v1" || !Array.isArray(body.items)) throw bad();
  const items = []; let skipped = 0;
  for (const i of body.items) {
    if (!i || !str(i.publication_id) || !str(i.campaign_id) || !str(i.variant_id) || !QUEUE_STATUS.includes(i.status) || !Number.isInteger(i.attempts) || i.attempts < 0) { skipped += 1; continue; }
    const verified = i.status === "published" && i.verified_by === "platform" && https(i.platform_post_url);
    items.push({ id: i.publication_id, campaignId: i.campaign_id, variantId: i.variant_id, accountId: str(i.account_id) ? i.account_id : "", scheduledFor: Number.isFinite(Date.parse(i.scheduled_for)) ? i.scheduled_for : null, status: i.status, attempts: i.attempts, errorCode: str(i.last_error_code) ? i.last_error_code : "", platformVerified: verified, postUrl: verified ? new URL(i.platform_post_url).toString() : "" });
  }
  return { items, skipped, nextCursor: str(body.next_cursor) ? body.next_cursor : null };
}

async function get(fetchImpl, url, token, what) {
  let res; try { res = await fetchImpl(url, { headers: { authorization: `Bearer ${token}` } }); } catch { throw new SocialError(`${what} could not be loaded because the connection failed.`, { kind: "network" }); }
  if (res.status === 401) throw new SocialError("Your session has ended. Sign in again to continue.", { kind: "auth", status: 401 });
  if (res.status === 403 || res.status === 404) throw new SocialError(`${what} is not available to you.`, { kind: "unavailable", status: res.status });
  if (res.status === 503) throw new SocialError(`${what} is temporarily unavailable. Try again shortly.`, { kind: "unavailable", status: 503 });
  if (!res.ok) throw new SocialError(`${what} could not be loaded yet.`, { kind: "error", status: res.status });
  try { return await res.json(); } catch { throw bad(); }
}
export const fetchAccounts = async ({ apiBaseUrl, accessToken, scope, fetchImpl = (...a) => fetch(...a) }) => normaliseAccounts(await get(fetchImpl, `${apiBaseUrl}/customer/social-accounts?${new URLSearchParams({ tenant_id: scope.tenantId, project_id: scope.projectId, brand_id: scope.brandId })}`, accessToken, "Your connected accounts"));
export const fetchQueue = async ({ apiBaseUrl, accessToken, scope, campaignId, fetchImpl = (...a) => fetch(...a) }) => normaliseQueue(await get(fetchImpl, `${apiBaseUrl}/customer/publishing-queue?${new URLSearchParams({ tenant_id: scope.tenantId, project_id: scope.projectId, ...(campaignId ? { campaign_id: campaignId } : {}) })}`, accessToken, "The publishing queue"));

async function post(fetchImpl, url, token, body, what) {
  let res; try { res = await fetchImpl(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) }); } catch { throw new SocialError(`${what} may or may not have been received because the connection failed. Check your connected accounts before trying again.`, { kind: "unconfirmed" }); }
  let json = null; try { json = await res.json(); } catch { json = null; }
  if (res.status === 401) throw new SocialError("Your session has ended. Sign in again to continue. Nothing was changed.", { kind: "auth", status: 401 });
  if (res.status === 403 || res.status === 404) throw new SocialError("Only the workspace owner can do that. Nothing was changed.", { kind: "forbidden", status: res.status });
  if (res.status === 409) throw new SocialError("That account changed in the meantime. Check your connected accounts and try again. Nothing was changed.", { kind: "conflict", status: 409 });
  if (res.status >= 500) throw new SocialError(`${what} may or may not have been received because the service had a problem. Check your connected accounts before trying again.`, { kind: "unconfirmed", status: res.status });
  if (!res.ok) throw new SocialError(`${what} could not be done yet. Nothing was changed.`, { kind: "error", status: res.status });
  return json;
}
export async function startConnect({ apiBaseUrl, accessToken, scope, provider, id = newRequestId("connect"), fetchImpl = (...a) => fetch(...a) }) {
  if (!PROVIDERS.includes(provider)) throw new SocialError("Choose a platform from the list.", { kind: "invalid" });
  const json = await post(fetchImpl, `${apiBaseUrl}/customer/social-accounts/connect`, accessToken, { tenant_id: scope.tenantId, project_id: scope.projectId, brand_id: scope.brandId, provider, request_id: id }, "Connecting");
  if (!json || !https(json.authorize_url)) throw new SocialError("The platform's sign-in page could not be opened safely, so nothing was connected.", { kind: "invalid", code: "BAD_URL" });
  return { url: new URL(json.authorize_url).toString() };
}
export async function disconnect({ apiBaseUrl, accessToken, scope, accountId, id = newRequestId("disconnect"), fetchImpl = (...a) => fetch(...a) }) {
  const json = await post(fetchImpl, `${apiBaseUrl}/customer/social-accounts/${encodeURIComponent(accountId)}/disconnect`, accessToken, { tenant_id: scope.tenantId, request_id: id }, "Disconnecting");
  if (!json || json.status !== "revoked") throw new SocialError("The disconnection could not be confirmed. Check your connected accounts.", { kind: "unconfirmed" });
  return { accountId };
}
