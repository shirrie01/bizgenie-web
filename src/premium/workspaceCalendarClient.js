// Workspace-wide calendar, assembled from EXISTING read endpoints (BG-STUDIO-018-FE, DEC-025).
//
// The backend has no workspace-wide calendar endpoint yet (docs/studio/DEC_023_BACKEND_CONTRACT_SUPPORT.md on the API branch
// dec-023-backend-contract-support). Until it does, this reads, for the most recently updated campaigns only:
//   GET /customer/campaigns/:id?tenant_id&project_id            campaign document: content items, variants, platform, workflow
//   GET /customer/campaigns/:id/calendar?tenant_id&project_id&from&to   scheduled/published occurrences (from inclusive, to exclusive)
// Nothing is written. The number of campaigns read is capped because each calendar read loads the project's campaign history on
// the server; the cap is shown to the customer and the missing endpoint is specified in docs/studio/BG_STUDIO_018_FE_REPORT.md.

export const MAX_CAMPAIGNS = 8;
const CONCURRENCY = 3;

export class WorkspaceCalendarError extends Error {
  constructor(message, { kind = "error", status = 0 } = {}) { super(message); this.name = "WorkspaceCalendarError"; this.kind = kind; this.status = status; }
}

const authorization = (token) => ({ authorization: `Bearer ${token}` });

async function getJson(fetchImpl, url, accessToken) {
  let response;
  try { response = await fetchImpl(url, { headers: authorization(accessToken) }); }
  catch { throw new WorkspaceCalendarError("The calendar could not be reached.", { kind: "network" }); }
  if (response.status === 401) throw new WorkspaceCalendarError("Your session has ended. Sign in again to continue.", { kind: "auth", status: 401 });
  if (!response.ok) throw new WorkspaceCalendarError("A campaign's calendar could not be loaded.", { kind: "error", status: response.status });
  try { return await response.json(); } catch { throw new WorkspaceCalendarError("The server sent an unexpected answer.", { kind: "error", status: response.status }); }
}

// Items for one campaign. Variants with an occurrence are dated; the rest are listed as not yet scheduled.
export function itemsFromCampaign(campaign, entries) {
  const byVariant = new Map((entries || []).map((e) => [e.variant_id, e]));
  const seen = new Set();
  const items = [];
  for (const content of Array.isArray(campaign.items) ? campaign.items : []) {
    if (content.archived_at) continue;
    for (const variant of Array.isArray(content.variants) ? content.variants : []) {
      const entry = byVariant.get(variant.variant_id); seen.add(variant.variant_id);
      items.push({
        key: `${campaign.campaign_id}:${variant.variant_id}`, campaignId: campaign.campaign_id, campaignName: campaign.name || "Untitled campaign",
        campaignTimeZone: campaign.display_timezone || "", contentItemId: content.content_item_id, contentName: content.name || "Untitled content", format: content.format || "",
        variantId: variant.variant_id, platform: variant.platform || "", placement: variant.placement || "", destinationLabel: variant.destination_label || "",
        workflow: variant.workflow || (entry && entry.workflow) || "", occurrenceAt: entry ? entry.occurrence_at : null,
      });
    }
  }
  // An occurrence whose variant is not in the document (should not happen) is still shown, with only what the API said.
  for (const entry of entries || []) if (!seen.has(entry.variant_id)) items.push({
    key: `${campaign.campaign_id}:${entry.variant_id}`, campaignId: campaign.campaign_id, campaignName: campaign.name || "Untitled campaign", campaignTimeZone: campaign.display_timezone || "",
    contentItemId: entry.content_item_id, contentName: "Content", format: "", variantId: entry.variant_id, platform: "", placement: "", destinationLabel: "", workflow: entry.workflow || "", occurrenceAt: entry.occurrence_at,
  });
  return items;
}

// Reads up to `limit` of the most recently updated, unarchived campaigns. A campaign that cannot be read is reported in
// `failures` and the rest are still shown; a 401 stops everything (the session has ended). `isCurrent()` lets the caller
// discard the whole read when the workspace changed meanwhile.
export async function fetchWorkspaceCalendar({ apiBaseUrl, accessToken, scope, from, to, campaigns, limit = MAX_CAMPAIGNS, fetchImpl = (...a) => fetch(...a), isCurrent = () => true }) {
  const eligible = (campaigns || []).filter((c) => c && c.campaign_id && !c.archived_at).sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  const chosen = eligible.slice(0, limit);
  const q = new URLSearchParams({ tenant_id: scope.tenantId, project_id: scope.projectId });
  const qc = new URLSearchParams({ tenant_id: scope.tenantId, project_id: scope.projectId, from, to });
  const items = []; const failures = [];
  let next = 0; let fatal = null;
  async function worker() {
    while (!fatal) {
      const index = next++; if (index >= chosen.length) return;
      const summary = chosen[index];
      if (!isCurrent()) return;
      try {
        const [doc, cal] = await Promise.all([
          getJson(fetchImpl, `${apiBaseUrl}/customer/campaigns/${summary.campaign_id}?${q}`, accessToken),
          getJson(fetchImpl, `${apiBaseUrl}/customer/campaigns/${summary.campaign_id}/calendar?${qc}`, accessToken),
        ]);
        if (!isCurrent()) return;
        items.push(...itemsFromCampaign(doc.campaign || summary, Array.isArray(cal.entries) ? cal.entries : []));
      } catch (error) {
        if (error.kind === "auth") { fatal = error; return; }
        failures.push({ campaignId: summary.campaign_id, campaignName: summary.name || "Untitled campaign", status: error.status || 0 });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, chosen.length) }, worker));
  if (fatal) throw fatal;
  return { items, failures, campaignsRead: chosen.length - failures.length, campaignsChosen: chosen.length, campaignsTotal: eligible.length, truncated: eligible.length > chosen.length };
}
