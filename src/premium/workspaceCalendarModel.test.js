// @vitest-environment node
import { describe, expect, it } from "vitest";
import { addMonths, dayKey, filterItems, findClashes, groupByDay, platformLabel, rangeFor, rangeTitle, statusLabel, statusOptions, stepAnchor, timeLabel, undated, windowCovers, windowFor, windowText } from "./workspaceCalendarModel";

const item = (over = {}) => ({ key: `c1:${over.variantId || "v1"}`, campaignId: "c1", campaignName: "Spring", contentName: "Offer", variantId: "v1", platform: "instagram", placement: "feed", destinationLabel: "Instagram", workflow: "scheduled", occurrenceAt: "2026-10-27T10:00:00.000Z", ...over });

describe("days and time zones", () => {
  it("puts an instant on the calendar day it falls on IN THE STATED ZONE", () => {
    expect(dayKey("2026-10-27T23:30:00.000Z", "UTC")).toBe("2026-10-27");
    expect(dayKey("2026-10-27T23:30:00.000Z", "Europe/London")).toBe("2026-10-27"); // BST ended on 25 Oct: UTC+0
    expect(dayKey("2026-10-27T23:30:00.000Z", "Asia/Tokyo")).toBe("2026-10-28");
    expect(dayKey("2026-07-01T23:30:00.000Z", "Europe/London")).toBe("2026-07-02"); // BST
    expect(timeLabel("2026-07-01T23:30:00.000Z", "Europe/London")).toBe("00:30");
    expect(dayKey("not a date", "UTC")).toBe("");
  });
});

describe("ranges", () => {
  it("month: whole weeks, Monday first, covering the month", () => {
    const days = rangeFor("month", "2026-10-15");
    expect(days[0]).toBe("2026-09-28"); expect(days[days.length - 1]).toBe("2026-11-01"); expect(days.length % 7).toBe(0);
    expect(days).toContain("2026-10-01"); expect(days).toContain("2026-10-31");
  });
  it("week and day", () => {
    expect(rangeFor("week", "2026-10-28")).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
    expect(rangeFor("day", "2026-10-28")).toEqual(["2026-10-28"]);
  });
  it("steps by the view and titles it", () => {
    expect(stepAnchor("month", "2026-10-31", 1)).toBe("2026-11-01"); // the month, not 31 days (and never skips February)
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-01");
    expect(stepAnchor("week", "2026-10-28", -1)).toBe("2026-10-21");
    expect(stepAnchor("day", "2026-10-28", 1)).toBe("2026-10-29");
    expect(rangeTitle("month", "2026-10-28")).toBe("October 2026");
    expect(rangeTitle("week", "2026-10-28")).toMatch(/^Week of Mon, 26 October 2026 to Sun, 1 November 2026$/);
  });
});

describe("the requested window (from inclusive, to exclusive, instants with an offset)", () => {
  it("covers the visible month plus a week either side, in order", () => {
    const w = windowFor("2026-10-15");
    expect(w).toEqual({ from: "2026-09-24T00:00:00.000Z", to: "2026-11-09T00:00:00.000Z" });
    expect(Date.parse(w.from)).toBeLessThan(Date.parse(w.to));
  });
  it("knows what it covers, so an empty day in an unloaded period is never read as 'nothing planned'", () => {
    const w = windowFor("2026-10-15");
    expect(windowCovers(w, rangeFor("month", "2026-10-15"))).toBe(true);
    expect(windowCovers(w, rangeFor("month", "2026-12-15"))).toBe(false);
    expect(windowCovers(null, ["2026-10-01"])).toBe(false);
    expect(windowText(w, "UTC")).toBe("Thu, 24 September 2026 to Sun, 8 November 2026");
  });
});

describe("items", () => {
  const items = [item(), item({ variantId: "v2", key: "c1:v2", occurrenceAt: null, workflow: "draft" }), item({ variantId: "v3", key: "c2:v3", campaignId: "c2", platform: "linkedin", destinationLabel: "LinkedIn", workflow: "published", occurrenceAt: "2026-10-28T09:00:00.000Z" })];
  it("dated items go on their day in time order; undated ones are never placed on a day", () => {
    const g = groupByDay(items, "UTC");
    expect([...g.keys()]).toEqual(["2026-10-27", "2026-10-28"]);
    expect(undated(items).map((i) => i.variantId)).toEqual(["v2"]);
  });
  it("filters by campaign, channel and status", () => {
    expect(filterItems(items, { campaignId: "c2" })).toHaveLength(1);
    expect(filterItems(items, { platform: "instagram" })).toHaveLength(2);
    expect(filterItems(items, { status: "draft" }).map((i) => i.variantId)).toEqual(["v2"]);
    expect(filterItems(items, {})).toHaveLength(3);
  });
  it("uses the backend's workflow words; unknown ones are shown plainly, not hidden", () => {
    expect(statusLabel("review")).toBe("In review"); expect(statusLabel("approved")).toBe("Approved, not scheduled");
    expect(statusLabel("manual_hold")).toBe("Manual hold"); expect(statusLabel("")).toBe("Unknown");
    expect(statusOptions(items).map((s) => s.value)).toEqual(["draft", "scheduled", "published"]);
    expect(platformLabel(item({ placement: "feed" }))).toBe("Instagram · feed");
    expect(platformLabel({})).toBe("Channel not stated");
  });
  it("flags only SCHEDULED items for the same destination and minute", () => {
    const a = item({ key: "c1:a", variantId: "a" }); const b = item({ key: "c2:b", variantId: "b", campaignId: "c2" });
    const other = item({ key: "c1:c", variantId: "c", destinationLabel: "TikTok", platform: "tiktok" });
    const published = item({ key: "c1:d", variantId: "d", workflow: "published" });
    expect([...findClashes([a, b, other, published])].sort()).toEqual(["c1:a", "c2:b"]);
    expect(findClashes([a]).size).toBe(0);
  });
});
