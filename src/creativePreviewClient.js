import { refreshCustomerSession } from "./session";

const CONTRACT = "campaign-creative-preview.v1";

export class CreativePreviewError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

const MESSAGES = {
  stale: "This campaign changed since you opened it. Reload the latest version to see the current content.",
  auth: "Your session needs to be refreshed. Please sign in again to review this content.",
  missing: "This content is no longer available to you.",
  unavailable: "The saved content is temporarily unavailable. Please try again.",
  network: "The saved content could not be loaded. Check your connection and try again.",
  failed: "The saved content could not be loaded yet. Please try again.",
};
const fail = (code) => new CreativePreviewError(MESSAGES[code], code);

export function currentRevisionId(variant) {
  return variant?.current_revision_id || variant?.current_revision?.revision_id || "";
}

// GET /customer/campaigns/:campaignId/variants/:variantId/creative-preview (bizgenie-api PR #205).
// Read-only: it never renders, acknowledges or approves. The revision and campaign version are the
// ones the reviewer is looking at, so a newer revision is never silently shown (409 instead).
export async function fetchCreativePreview({ apiBaseUrl, session, campaign, variant, signal }) {
  const revisionId = currentRevisionId(variant);
  if (!campaign?.campaign_id || !variant?.variant_id || !revisionId || !Number.isInteger(campaign.version)) throw fail("failed");
  const query = new URLSearchParams({
    tenant_id: session.tenantId,
    project_id: session.projectId,
    revision_id: revisionId,
    expected_campaign_version: String(campaign.version),
  });
  const url = `${apiBaseUrl}/customer/campaigns/${campaign.campaign_id}/variants/${variant.variant_id}/creative-preview?${query.toString()}`;

  let token = session.accessToken;
  let response;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      response = await fetch(url, { headers: { authorization: "Bearer " + token }, signal });
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      throw fail("network");
    }
    if (response.status !== 401 || attempt === 1) break;
    // One refresh through the existing session path; never fall back to any other credential.
    const next = await refreshCustomerSession();
    if (next?.status !== "ready" || !next.accessToken) throw fail("auth");
    token = next.accessToken;
  }

  if (response.status === 409) throw fail("stale");
  if (response.status === 401) throw fail("auth");
  if (response.status === 404) throw fail("missing");
  if (response.status === 503 || response.status >= 500) throw fail("unavailable");
  if (!response.ok) throw fail("failed");

  let body;
  try { body = await response.json(); } catch { throw fail("failed"); }
  const preview = body?.preview;
  if (preview?.contract_version !== CONTRACT) throw fail("failed");
  // Defensive: only accept content bound to exactly what the reviewer is looking at.
  if (preview.variant_id !== variant.variant_id || preview.revision_id !== revisionId || preview.campaign_version !== campaign.version) throw fail("stale");
  return preview;
}
