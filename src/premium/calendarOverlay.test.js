// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { applyDeliveryOverlay, fetchDeliveryOverlay } from "./calendarOverlay";

const item = (o = {}) => ({ key: "c1:v1", campaignId: "c1", variantId: "v1", occurrenceKind: "scheduled", occurrenceAt: "2026-11-01T10:00:00.000Z", ...o });
const disp = (o = {}) => ({ id: "d1", campaignId: "c1", variantId: "v1", state: "queued", scheduledFor: "2026-11-01T10:00:00Z", deliveryState: "queued", ...o });

describe("applyDeliveryOverlay", () => {
  it("adds delivery status to a scheduled item whose campaign, variant and planned instant match", () => {
    const r = applyDeliveryOverlay([item()], [disp()]); expect(r.items[0].delivery).toMatchObject({ state: "queued", dispatchId: "d1" }); expect(r.dropped).toBe(0);
  });
  it("never touches a published item (no second entry, no second claim) and never matches a different instant, variant or campaign", () => {
    const pub = item({ occurrenceKind: "published" }); const r = applyDeliveryOverlay([pub, item({ variantId: "v2", key: "c1:v2" }), item({ occurrenceAt: "2026-11-02T10:00:00.000Z", key: "x" })], [disp()]);
    expect(r.items.every((i) => i.delivery === undefined)).toBe(true); expect(r.items).toHaveLength(3); expect(r.dropped).toBe(1); // the unmatched row is counted, not drawn
  });
  it("a published overlay row is not counted as dropped (it is already the item's published state)", () => {
    expect(applyDeliveryOverlay([item({ occurrenceKind: "published" })], [disp({ deliveryState: "published", state: "published" })])).toMatchObject({ dropped: 0 });
  });
  it("one dispatch is used once; each delivery state has plain wording; unknown states are ignored", () => {
    const r = applyDeliveryOverlay([item(), item({ key: "dup" })], [disp()]); expect(r.items.filter((i) => i.delivery)).toHaveLength(1);
    for (const s of ["queued", "publishing", "uncertain", "failed", "cancelled"]) expect(applyDeliveryOverlay([item()], [disp({ deliveryState: s })]).items[0].delivery.label.length).toBeGreaterThan(10);
    expect(applyDeliveryOverlay([item()], [disp({ deliveryState: "weird" })]).items[0].delivery).toBeUndefined();
    expect(applyDeliveryOverlay([item()], [disp({ deliveryState: "uncertain" })]).items[0].delivery.label).toMatch(/will not be sent again/);
  });
});
describe("fetchDeliveryOverlay", () => {
  const page = (entries, next) => ({ ok: true, status: 200, json: async () => ({ contract_version: "publishing-calendar.v1", entries, next_cursor: next }) });
  const e = (id) => ({ dispatch_id: id, campaign_id: "c1", variant_id: "v1", revision_id: "r", state: "queued", scheduled_for: "2026-11-01T10:00:00Z", publication_id: null, publication_url: null, published_at: null, evidence_kind: null, delivery_state: "queued" });
  it("follows every page and carries the same window", async () => {
    const f = vi.fn().mockResolvedValueOnce(page([e("a")], "n1")).mockResolvedValueOnce(page([e("b")], null));
    const r = await fetchDeliveryOverlay({ apiBaseUrl: "http://a", accessToken: "t", scope: { tenantId: "t", projectId: "p", brandId: "b" }, from: "2026-11-01T00:00:00Z", to: "2026-11-30T00:00:00Z", fetchImpl: f });
    expect(r.entries.map((x) => x.id)).toEqual(["a", "b"]); expect(f.mock.calls[1][0]).toContain("cursor=n1"); expect(f.mock.calls[1][0]).toContain("from=2026-11-01T00%3A00%3A00Z");
  });
  it("refuses to pretend a truncated overlay is complete", async () => {
    const f = vi.fn().mockResolvedValue(page([e("a")], "more"));
    await expect(fetchDeliveryOverlay({ apiBaseUrl: "h", accessToken: "t", scope: { tenantId: "t", projectId: "p", brandId: "b" }, from: "a", to: "b", fetchImpl: f, maxPages: 3 })).rejects.toThrow(/more pages/);
  });
});
