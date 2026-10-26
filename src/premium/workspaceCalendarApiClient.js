// Adapter for the PROPOSED server endpoint GET /customer/calendar (BG-STUDIO-019-FE, workstream B1). The endpoint does NOT exist in the
// backend yet (see docs/studio/BG_STUDIO_019_FE_REPORT.md for the contract handed to Codex), so this adapter is built against that
// contract with deterministic fixtures and stays OFF until `VITE_WORKSPACE_CALENDAR_API=true` (see flag below). Real integration is BLOCKED.
//
//   GET /customer/calendar?tenant_id&project_id&from&to[&campaign_id][&platform][&workflow][&cursor][&limit]
//   200 { window: { from, to }, entries: [ { campaign_id, campaign_name, content_item_id, content_item_name, format, variant_id,
//         platform, placement, destination_label, workflow, occurrence_at, occurrence_kind } ],
//         unscheduled: [ { campaign_id, campaign_name, content_item_id, content_item_name, format, variant_id, platform, placement,
//         destination_label, workflow } ], next_cursor: string | null }
// `from` inclusive, `to` exclusive. Pages are followed until `next_cursor` is null, so nothing is ever left unloaded.

export const isWorkspaceCalendarApiEnabled = (env = import.meta.env) => {
  const raw = env && env.VITE_WORKSPACE_CALENDAR_API;
  return typeof raw === "string" && raw.trim().toLowerCase() === "true";
};

export class WorkspaceCalendarApiError extends Error {
  constructor(message, { kind = "error", status = 0 } = {}) { super(message); this.name = "WorkspaceCalendarApiError"; this.kind = kind; this.status = status; }
}

const text = (v) => (typeof v === "string" ? v : "");
const MAX_PAGES = 50;

function itemOf(row, dated) {
  if (!row || typeof row !== "object" || !text(row.campaign_id) || !text(row.variant_id)) return null;
  if (dated && !Number.isFinite(Date.parse(row.occurrence_at))) return null;
  return {
    key: `${row.campaign_id}:${row.variant_id}`, campaignId: row.campaign_id, campaignName: text(row.campaign_name) || "Untitled campaign", campaignTimeZone: "",
    contentItemId: text(row.content_item_id), contentName: text(row.content_item_name) || "Untitled content", format: text(row.format), variantId: row.variant_id,
    platform: text(row.platform), placement: text(row.placement), destinationLabel: text(row.destination_label), workflow: text(row.workflow),
    occurrenceAt: dated ? new Date(row.occurrence_at).toISOString() : null, occurrenceKind: dated ? text(row.occurrence_kind) : "",
  };
}

export async function fetchWorkspaceCalendarFromApi({ apiBaseUrl, accessToken, scope, from, to, filters = {}, limit = 200, fetchImpl = (...a) => fetch(...a), isCurrent = () => true }) {
  const items = []; const seen = new Set(); let cursor = null; let pages = 0; let rejected = 0;
  do {
    if (!isCurrent()) return { items: [], failures: [], campaignsRead: 0, campaignsChosen: 0, campaignsTotal: 0, truncated: false, nextOffset: null, source: "api" };
    const q = new URLSearchParams({ tenant_id: scope.tenantId, project_id: scope.projectId, from, to, limit: String(limit) });
    if (filters.campaignId) q.set("campaign_id", filters.campaignId); if (filters.platform) q.set("platform", filters.platform); if (filters.workflow) q.set("workflow", filters.workflow);
    if (cursor) q.set("cursor", cursor);
    let response;
    try { response = await fetchImpl(`${apiBaseUrl}/customer/calendar?${q}`, { headers: { authorization: `Bearer ${accessToken}` } }); }
    catch { throw new WorkspaceCalendarApiError("The calendar could not be reached.", { kind: "network" }); }
    if (response.status === 401) throw new WorkspaceCalendarApiError("Your session has ended. Sign in again to continue.", { kind: "auth", status: 401 });
    if (response.status === 400) throw new WorkspaceCalendarApiError("That period could not be loaded. Choose a different period.", { kind: "invalid", status: 400 });
    if (response.status === 403 || response.status === 404) throw new WorkspaceCalendarApiError("This workspace's calendar is not available to you.", { kind: "unavailable", status: response.status });
    if (!response.ok) throw new WorkspaceCalendarApiError("The calendar could not be loaded yet.", { kind: "error", status: response.status });
    let body; try { body = await response.json(); } catch { throw new WorkspaceCalendarApiError("The server sent an unexpected answer.", { kind: "error", status: response.status }); }
    if (!body || !Array.isArray(body.entries) || !Array.isArray(body.unscheduled)) throw new WorkspaceCalendarApiError("The server sent an unexpected answer.", { kind: "error", status: response.status });
    for (const [rows, dated] of [[body.entries, true], [body.unscheduled, false]]) for (const row of rows) {
      const item = itemOf(row, dated);
      if (!item) { rejected += 1; continue; }
      const key = `${dated ? "d" : "u"}:${item.key}:${item.occurrenceAt || ""}`;
      if (!seen.has(key)) { seen.add(key); items.push(item); }
    }
    cursor = typeof body.next_cursor === "string" && body.next_cursor ? body.next_cursor : null; pages += 1;
    if (cursor && pages >= MAX_PAGES) throw new WorkspaceCalendarApiError("The calendar has more pages than can be loaded at once. Choose a shorter period.", { kind: "error" });
  } while (cursor);
  const campaigns = new Set(items.map((i) => i.campaignId));
  // Rows the app could not read are counted and reported, not hidden.
  return { items, failures: rejected ? [{ campaignId: "", campaignName: `${rejected} item${rejected === 1 ? "" : "s"} the server sent in an unreadable form`, status: 0 }] : [], campaignsRead: campaigns.size, campaignsChosen: campaigns.size, campaignsTotal: campaigns.size, truncated: false, nextOffset: null, source: "api" };
}
