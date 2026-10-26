// Campaign and manual-publication management (BG-STUDIO-019-FE, workstream E). Contract: bizgenie-api src/campaigns/router.js, read at
// dec-023-backend-contract-support (6279832):
//   PATCH /customer/campaigns/:id                     { tenant_id, project_id, idempotency_key, expected_campaign_version, name, display_timezone }
//   POST  /customer/campaigns/:id/archive | /restore  { ...scope, idempotency_key, expected_campaign_version, reason }
//   POST  .../variants/:v/manual-publication/confirm  { ...scope, idempotency_key, expected_campaign_version, attempt_id, published_at, publication_url, external_reference?, note? }
//   POST  .../variants/:v/manual-publication/fail | /cancel   { ...scope, idempotency_key, expected_campaign_version, attempt_id, reason }
// Responses carry the whole campaign document. Nothing here talks to a social platform: a "confirm" is the customer's own attestation.
// Archive/restore are refused (409 INVALID_TRANSITION) while any item is scheduled or awaiting a manual-publication answer.

export class CampaignApiError extends Error {
  constructor(message, { kind = "error", status = 0, code = "" } = {}) { super(message); this.name = "CampaignApiError"; this.kind = kind; this.status = status; this.code = code; }
}

const MESSAGES = {
  VERSION_CONFLICT: "This campaign was changed somewhere else, so nothing was changed. The latest version has been loaded; check it and try again.",
  INVALID_TRANSITION: "That is not possible in the campaign's current state.",
  CAMPAIGN_ARCHIVED: "This campaign is archived. Restore it before changing it.",
  MANUAL_ATTEMPT_PENDING: "A manual publication is already waiting for your answer. Record how it went first.",
  PUBLICATION_EVIDENCE_INVALID: "The publication details could not be accepted. Check the address and the time you published, then try again.",
  SCHEDULE_INVALID: "That time could not be accepted. Choose a time in the future.",
  IDEMPOTENCY_KEY_CONFLICT: "This request was already used for a different change. Reload the campaign and try again.",
  VALIDATION_ERROR: "Some of the details were not accepted. Check them and try again.",
  CAMPAIGN_TEMPORARILY_UNAVAILABLE: "Campaigns are temporarily unavailable. Nothing was changed. Try again shortly.",
};

export async function errorFor(response, action = "That") {
  let code = "";
  try { code = (await response.json())?.error?.code || ""; } catch { /* no JSON body */ }
  const s = response.status;
  if (s === 401) return new CampaignApiError("Your session has ended. Sign in again to continue. Nothing was changed.", { kind: "auth", status: s, code: code || "AUTHENTICATION_REQUIRED" });
  if (s === 403 || s === 404) return new CampaignApiError("This campaign is not available to you any more. It may have been removed or your access may have changed. Nothing was changed.", { kind: "unavailable", status: s, code: code || "RESOURCE_NOT_AVAILABLE" });
  if (s === 409) return new CampaignApiError(MESSAGES[code] || MESSAGES.INVALID_TRANSITION, { kind: code === "VERSION_CONFLICT" ? "conflict" : "refused", status: s, code });
  if (s === 400) return new CampaignApiError(MESSAGES.VALIDATION_ERROR, { kind: "invalid", status: s, code: code || "VALIDATION_ERROR" });
  if (s >= 500) return new CampaignApiError(`${action} may or may not have been saved. ${MESSAGES.CAMPAIGN_TEMPORARILY_UNAVAILABLE}`, { kind: "unconfirmed", status: s, code: code || "CAMPAIGN_TEMPORARILY_UNAVAILABLE" });
  return new CampaignApiError(`${action} could not be done yet. Nothing was changed.`, { kind: "error", status: s, code });
}

// A key derived from the campaign, its version and what is being asked: a retry of the same request reuses it; a different request
// (different name, reason or version) does not. 1-128 characters of [A-Za-z0-9._:-].
export async function campaignKey(campaign, operation, detail = "") {
  const scope = `campaign:${campaign.campaign_id}:version:${campaign.version}:${operation}:${detail}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(scope));
  return `op:${operation}:${Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

const headers = (token) => ({ "content-type": "application/json", authorization: `Bearer ${token}` });
const scopeOf = (scope) => ({ tenant_id: scope.tenantId, project_id: scope.projectId });

async function send(fetchImpl, url, options, action) {
  let response;
  try { response = await fetchImpl(url, options); }
  catch { throw new CampaignApiError(`${action} may or may not have been saved because the connection failed. Check the campaign before trying again.`, { kind: "unconfirmed", code: "NETWORK" }); }
  if (!response.ok) throw await errorFor(response, action);
  let json = null;
  try { json = await response.json(); } catch { json = null; }
  if (!json || !json.campaign || !json.campaign.campaign_id) throw new CampaignApiError(`${action} could not be confirmed. Reload the campaign to check it.`, { kind: "unconfirmed", status: response.status, code: "BAD_RESPONSE" });
  return json.campaign;
}

export async function fetchCampaignDetail({ apiBaseUrl, accessToken, scope, campaignId, fetchImpl = (...a) => fetch(...a) }) {
  const q = new URLSearchParams(scopeOf(scope));
  let response;
  try { response = await fetchImpl(`${apiBaseUrl}/customer/campaigns/${campaignId}?${q}`, { headers: { authorization: `Bearer ${accessToken}` } }); }
  catch { throw new CampaignApiError("The campaign could not be reached.", { kind: "network", code: "NETWORK" }); }
  if (!response.ok) throw await errorFor(response, "The campaign");
  let json = null; try { json = await response.json(); } catch { json = null; }
  if (!json || !json.campaign || !json.campaign.campaign_id) throw new CampaignApiError("The campaign could not be confirmed.", { kind: "error", code: "BAD_RESPONSE" });
  return json.campaign;
}

export async function renameCampaign({ apiBaseUrl, accessToken, scope, campaign, name, fetchImpl = (...a) => fetch(...a) }) {
  const clean = String(name == null ? "" : name).trim();
  if (!clean) throw new CampaignApiError("Enter a campaign name.", { kind: "invalid", code: "VALIDATION_ERROR" });
  if (clean.length > 200) throw new CampaignApiError("A campaign name can be at most 200 characters.", { kind: "invalid", code: "VALIDATION_ERROR" });
  return send(fetchImpl, `${apiBaseUrl}/customer/campaigns/${campaign.campaign_id}`, { method: "PATCH", headers: headers(accessToken), body: JSON.stringify({ ...scopeOf(scope), idempotency_key: await campaignKey(campaign, "rename", clean), expected_campaign_version: campaign.version, name: clean, display_timezone: campaign.display_timezone }) }, "The rename");
}

export async function setCampaignArchived({ apiBaseUrl, accessToken, scope, campaign, archive, reason, fetchImpl = (...a) => fetch(...a) }) {
  const why = String(reason == null ? "" : reason).trim();
  if (!why) throw new CampaignApiError("Say why, so the history shows the reason.", { kind: "invalid", code: "VALIDATION_ERROR" });
  const path = archive ? "archive" : "restore";
  return send(fetchImpl, `${apiBaseUrl}/customer/campaigns/${campaign.campaign_id}/${path}`, { method: "POST", headers: headers(accessToken), body: JSON.stringify({ ...scopeOf(scope), idempotency_key: await campaignKey(campaign, path, why), expected_campaign_version: campaign.version, reason: why }) }, archive ? "Archiving" : "Restoring");
}

// outcome: "confirm" (the customer says they published), "fail" (they tried and it did not publish), "cancel" (they did not go ahead).
export async function recordManualPublication({ apiBaseUrl, accessToken, scope, campaign, variant, outcome, attemptId, publishedAt, publicationUrl, externalReference, note, reason, fetchImpl = (...a) => fetch(...a) }) {
  if (!["confirm", "fail", "cancel"].includes(outcome)) throw new CampaignApiError("Unknown outcome.", { kind: "invalid" });
  if (!attemptId) throw new CampaignApiError("There is no waiting publication to answer.", { kind: "invalid" });
  const body = { ...scopeOf(scope), expected_campaign_version: campaign.version, attempt_id: attemptId };
  if (outcome === "confirm") {
    if (!publicationUrl || !/^https:\/\//i.test(String(publicationUrl).trim())) throw new CampaignApiError("Enter the public web address (starting https://) of the published post.", { kind: "invalid", code: "VALIDATION_ERROR" });
    const at = new Date(publishedAt);
    if (!publishedAt || Number.isNaN(at.getTime())) throw new CampaignApiError("Enter the date and time you published.", { kind: "invalid", code: "VALIDATION_ERROR" });
    if (at.getTime() > Date.now()) throw new CampaignApiError("The time you published cannot be in the future.", { kind: "invalid", code: "VALIDATION_ERROR" });
    body.published_at = at.toISOString(); body.publication_url = String(publicationUrl).trim();
    if (externalReference && String(externalReference).trim()) {
      const ref = String(externalReference).trim();
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(ref)) throw new CampaignApiError("The reference can use letters, numbers and . _ : - only (up to 128 characters).", { kind: "invalid", code: "VALIDATION_ERROR" });
      body.external_reference = ref;
    }
    if (note && String(note).trim()) body.note = String(note).trim();
  } else {
    const why = String(reason == null ? "" : reason).trim();
    if (!why) throw new CampaignApiError(outcome === "fail" ? "Say what went wrong." : "Say why you are not publishing it.", { kind: "invalid", code: "VALIDATION_ERROR" });
    body.reason = why;
  }
  body.idempotency_key = await campaignKey(campaign, `manual-${outcome}`, `${variant.variant_id}:${attemptId}`);
  return send(fetchImpl, `${apiBaseUrl}/customer/campaigns/${campaign.campaign_id}/variants/${variant.variant_id}/manual-publication/${outcome}`, { method: "POST", headers: headers(accessToken), body: JSON.stringify(body) }, outcome === "confirm" ? "Recording your publication" : outcome === "fail" ? "Recording the failure" : "Cancelling the handoff");
}
