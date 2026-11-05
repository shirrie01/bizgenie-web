// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { MAX_CAMPAIGNS, fetchWorkspaceCalendar, itemsFromCampaign } from "./workspaceCalendarClient";

const SCOPE = { tenantId: "t1", projectId: "p1" };
const FROM = "2026-09-24T00:00:00.000Z"; const TO = "2026-11-09T00:00:00.000Z";
const summary = (n, extra = {}) => ({ campaign_id: `c${n}`, name: `Campaign ${n}`, status: "active", archived_at: null, updated_at: `2026-10-${String(10 + n).padStart(2, "0")}T09:00:00.000Z`, ...extra });
const doc = (id, name) => ({ campaign: { campaign_id: id, name, display_timezone: "Europe/London", items: [
  { content_item_id: `${id}-i1`, name: "Offer", format: "text", variants: [{ variant_id: `${id}-v1`, platform: "instagram", placement: "feed", destination_label: "Instagram", workflow: "scheduled" }, { variant_id: `${id}-v2`, platform: "email", placement: "newsletter", destination_label: "Email", workflow: "draft" }] },
  { content_item_id: `${id}-i2`, name: "Archived idea", archived_at: "2026-10-01T00:00:00Z", variants: [{ variant_id: `${id}-v9`, workflow: "draft" }] },
] } });
const calendar = (id) => ({ entries: [{ campaign_id: id, content_item_id: `${id}-i1`, variant_id: `${id}-v1`, workflow: "scheduled", occurrence_at: "2026-10-27T10:00:00.000Z" }] });
const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const api = (overrides = {}) => vi.fn(async (url) => {
  const u = new URL(url); const m = u.pathname.match(/campaigns\/([^/]+)(\/calendar)?$/);
  const id = m[1]; const key = `${id}${m[2] || ""}`;
  if (overrides[key]) return overrides[key];
  return ok(m[2] ? calendar(id) : doc(id, `Campaign ${id.slice(1)}`));
});
const run = (fetchImpl, over = {}) => fetchWorkspaceCalendar({ apiBaseUrl: "http://api.test", accessToken: "tok", scope: SCOPE, from: FROM, to: TO, campaigns: [summary(1), summary(2)], fetchImpl, ...over });

describe("fetchWorkspaceCalendar", () => {
  it("joins each campaign's content (platform, status) with its dated occurrences, and lists the rest as undated", async () => {
    const r = await run(api());
    expect(r.campaignsRead).toBe(2); expect(r.truncated).toBe(false); expect(r.failures).toEqual([]);
    const dated = r.items.filter((i) => i.occurrenceAt); const undated = r.items.filter((i) => !i.occurrenceAt);
    expect(dated).toHaveLength(2); expect(undated).toHaveLength(2);
    expect(dated[0]).toMatchObject({ contentName: "Offer", platform: "instagram", destinationLabel: "Instagram", workflow: "scheduled", campaignTimeZone: "Europe/London" });
    expect(r.items.some((i) => i.contentName === "Archived idea")).toBe(false);
  });

  it("sends only authorised GETs with the scope and the explicit window, and never writes", async () => {
    const f = api(); await run(f);
    for (const [url, opts] of f.mock.calls) {
      expect(opts.method).toBeUndefined(); expect(opts.headers.authorization).toBe("Bearer tok");
      const u = new URL(url); expect(u.searchParams.get("tenant_id")).toBe("t1"); expect(u.searchParams.get("project_id")).toBe("p1");
      if (u.pathname.endsWith("/calendar")) { expect(u.searchParams.get("from")).toBe(FROM); expect(u.searchParams.get("to")).toBe(TO); }
    }
    expect(f).toHaveBeenCalledTimes(4);
  });

  it(`reads at most ${MAX_CAMPAIGNS} of the most recently updated campaigns and says it was cut short; archived ones are skipped`, async () => {
    const campaigns = [...Array.from({ length: 12 }, (_, i) => summary(i + 1)), summary(99, { archived_at: "2026-10-01T00:00:00Z", updated_at: "2026-12-01T00:00:00Z" })];
    const f = api(); const r = await run(f, { campaigns });
    expect(r.campaignsChosen).toBe(MAX_CAMPAIGNS); expect(r.campaignsTotal).toBe(12); expect(r.truncated).toBe(true);
    const read = new Set(f.mock.calls.map(([u]) => new URL(u).pathname.split("/")[3]));
    expect([...read].sort()).toEqual(["c12", "c11", "c10", "c9", "c8", "c7", "c6", "c5"].sort());
  });

  it("keeps the other campaigns when one cannot be read, and names the one that failed", async () => {
    const r = await run(api({ "c2/calendar": { ok: false, status: 500, json: async () => ({}) } }));
    expect(r.failures).toEqual([{ campaignId: "c2", campaignName: "Campaign 2", status: 500 }]);
    expect(r.campaignsRead).toBe(1); expect(r.items.every((i) => i.campaignId === "c1")).toBe(true);
  });

  it("stops everything on a 401 (the session has ended) rather than reporting every campaign as failed", async () => {
    await expect(run(api({ c1: { ok: false, status: 401, json: async () => ({}) } }))).rejects.toMatchObject({ kind: "auth" });
  });

  it("discards work once the workspace has changed", async () => {
    let current = true; const f = vi.fn(async (url) => { current = false; return api()(url); });
    const r = await run(f, { isCurrent: () => current });
    expect(r.items).toEqual([]);
  });

  it("an occurrence whose variant is missing from the document is still shown, with only what the API said", () => {
    const items = itemsFromCampaign({ campaign_id: "c1", name: "X", items: [] }, [{ campaign_id: "c1", content_item_id: "i", variant_id: "ghost", workflow: "published", occurrence_at: "2026-10-27T10:00:00.000Z" }]);
    expect(items).toHaveLength(1); expect(items[0]).toMatchObject({ variantId: "ghost", workflow: "published", platform: "" });
  });
});
