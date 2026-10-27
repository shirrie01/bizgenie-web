// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { WorkspaceCalendarApiError, fetchWorkspaceCalendarFromApi, isWorkspaceCalendarApiEnabled, splitWindow } from "./workspaceCalendarApiClient";

// MOCKED CONTRACT TESTS against `workspace-calendar.v1` as implemented in the backend DRAFT (bizgenie-api PR #216 f8d81bf). The route is not deployed.
const SCOPE = { tenantId: "t1", projectId: "p1" }; const FROM = "2026-10-01T00:00:00.000Z"; const TO = "2026-11-01T00:00:00.000Z";
const row = (n, over = {}) => ({ campaign_id: `c${n}`, campaign_name: `Campaign ${n}`, content_item_id: `i${n}`, content_item_name: `Post ${n}`, format: "text", variant_id: `v${n}`, platform: "instagram", placement: "feed", destination_label: "Instagram", workflow: "scheduled", occurrence_at: "2026-10-27T10:00:00+01:00", occurrence_kind: "scheduled", ...over });
const un = (n) => { const { occurrence_at, occurrence_kind, ...rest } = row(n, { workflow: "draft" }); return rest; };
const page = (entries, unscheduled = [], next = null) => ({ ok: true, status: 200, json: async () => ({ contract_version: "workspace-calendar.v1", display_timezone: "UTC", window: { from: FROM, to: TO }, entries, unscheduled, next_cursor: next }) });
const run = (fetchImpl, over = {}) => fetchWorkspaceCalendarFromApi({ apiBaseUrl: "http://api.test", accessToken: "tok", scope: SCOPE, from: FROM, to: TO, fetchImpl, ...over });

describe("GET /customer/calendar adapter (contract, mocked)", () => {
  it("is off unless the build says the backend has the endpoint", () => {
    expect(isWorkspaceCalendarApiEnabled({})).toBe(false); expect(isWorkspaceCalendarApiEnabled({ VITE_WORKSPACE_CALENDAR_API: "yes" })).toBe(false); expect(isWorkspaceCalendarApiEnabled({ VITE_WORKSPACE_CALENDAR_API: "true" })).toBe(true);
  });
  it("sends scope, the explicit window and filters; normalises instants; and reports every campaign it saw", async () => {
    const f = vi.fn().mockResolvedValue(page([row(1), row(2)], [un(3)]));
    const r = await run(f, { filters: { campaignId: "c1", platform: "instagram", workflow: "scheduled" } });
    const u = new URL(f.mock.calls[0][0]);
    expect(u.pathname).toBe("/customer/calendar"); expect(u.searchParams.get("tenant_id")).toBe("t1"); expect(u.searchParams.get("from")).toBe(FROM); expect(u.searchParams.get("to")).toBe(TO);
    expect(u.searchParams.get("campaign_id")).toBe("c1"); expect(u.searchParams.get("platform")).toBe("instagram"); expect(u.searchParams.get("workflow")).toBe("scheduled");
    expect(f.mock.calls[0][1].headers.authorization).toBe("Bearer tok"); expect(f.mock.calls[0][1].method).toBeUndefined();
    expect(r.items.find((i) => i.variantId === "v1").occurrenceAt).toBe("2026-10-27T09:00:00.000Z"); // an offset instant is normalised
    expect(r.items.filter((i) => !i.occurrenceAt)).toHaveLength(1); expect(r.campaignsTotal).toBe(3); expect(r.truncated).toBe(false);
  });
  it("follows every cursor until the server says there is no more, so nothing is silently left out", async () => {
    const f = vi.fn().mockResolvedValueOnce(page([row(1)], [], "A")).mockResolvedValueOnce(page([row(2)], [], "B")).mockResolvedValueOnce(page([row(3)], [un(4)], null));
    const r = await run(f);
    expect(f).toHaveBeenCalledTimes(3); expect(new URL(f.mock.calls[1][0]).searchParams.get("cursor")).toBe("A"); expect(new URL(f.mock.calls[2][0]).searchParams.get("cursor")).toBe("B");
    expect(r.items).toHaveLength(4);
  });
  it("de-duplicates a row repeated across pages, and reports rows it cannot read instead of dropping them quietly", async () => {
    const f = vi.fn().mockResolvedValueOnce(page([row(1), { campaign_id: "c9" }, row(5, { occurrence_at: "nonsense" })], [], "A")).mockResolvedValueOnce(page([row(1)], [], null));
    const r = await run(f);
    expect(r.items).toHaveLength(1); expect(r.failures[0].campaignName).toMatch(/2 items the server sent in an unreadable form/);
  });
  it("stops following pages if the server never ends them", async () => {
    const f = vi.fn().mockImplementation(async () => page([row(1)], [], "forever"));
    await expect(run(f)).rejects.toThrow(/more pages than can be loaded/i); expect(f.mock.calls.length).toBeLessThanOrEqual(50);
  });
  it.each([[401, "auth"], [400, "invalid"], [403, "unavailable"], [404, "unavailable"], [500, "error"], [503, "unavailable"]])("status %s is a typed error, not an empty calendar", async (status, kind) => {
    await expect(run(vi.fn().mockResolvedValue({ ok: false, status, json: async () => ({}) }))).rejects.toMatchObject({ kind, status });
  });
  it("a dropped connection, an unreadable body and a wrong shape are errors", async () => {
    await expect(run(vi.fn().mockRejectedValue(new Error("x")))).rejects.toMatchObject({ kind: "network" });
    await expect(run(vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new Error("bad"); } }))).rejects.toBeInstanceOf(WorkspaceCalendarApiError);
    await expect(run(vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ entries: [] }) }))).rejects.toThrow(/unexpected answer/);
  });
  it("discards the whole read when the workspace changed", async () => {
    const r = await run(vi.fn(), { isCurrent: () => false }); expect(r.items).toEqual([]);
  });

  it("never asks for more than 100 rows, whatever the caller passes", async () => {
    const f = vi.fn().mockResolvedValue(page([row(1)])); await run(f, { limit: 500 }); expect(new URL(f.mock.calls[0][0]).searchParams.get("limit")).toBe("100");
    const g = vi.fn().mockResolvedValue(page([row(1)])); await run(g); expect(new URL(g.mock.calls[0][0]).searchParams.get("limit")).toBe("100");
  });
  it("splits a long period into consecutive windows of at most 93 days with no gap or overlap", () => {
    const w = splitWindow("2026-09-26T00:00:00.000Z", "2027-01-24T00:00:00.000Z");
    expect(w.length).toBe(2);
    expect(w[0].from).toBe("2026-09-26T00:00:00.000Z"); expect(w[1].from).toBe(w[0].to); expect(w[1].to).toBe("2027-01-24T00:00:00.000Z");
    for (const x of w) expect(Date.parse(x.to) - Date.parse(x.from)).toBeLessThanOrEqual(93 * 86400000);
    expect(() => splitWindow(TO, FROM)).toThrow();
  });
  it("loads every window, and later windows stop once their dated entries are done (undated rows are not fetched again)", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(page([row(1)], [un(9)], null))
      .mockResolvedValueOnce(page([row(2)], [], "Z"))
      .mockResolvedValueOnce(page([], [un(9)], "Z2"));
    const r = await run(f, { from: "2026-09-26T00:00:00.000Z", to: "2027-01-24T00:00:00.000Z" });
    expect(f).toHaveBeenCalledTimes(3);
    expect(new URL(f.mock.calls[1][0]).searchParams.get("from")).toBe(new URL(f.mock.calls[0][0]).searchParams.get("to"));
    expect(r.items.map((i) => i.variantId).sort()).toEqual(["v1", "v2", "v9"]);
  });
  it("fails closed on a wrong or missing contract version", async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ entries: [], unscheduled: [], next_cursor: null }) });
    await expect(run(f)).rejects.toThrow(/unexpected answer/);
  });
  it("503 is a temporary problem, not an empty calendar", async () => {
    await expect(run(vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }))).rejects.toMatchObject({ kind: "unavailable", status: 503 });
  });
  it("refuses filter values the backend does not accept, before any request", async () => {
    const f = vi.fn();
    await expect(run(f, { filters: { platform: "myspace" } })).rejects.toMatchObject({ kind: "invalid" });
    await expect(run(f, { filters: { workflow: "failed" } })).rejects.toMatchObject({ kind: "invalid" });
    expect(f).not.toHaveBeenCalled();
  });
  it("keeps schedule and publication ids so a scheduled item can be unscheduled or traced", async () => {
    const r = await run(vi.fn().mockResolvedValue(page([row(1, { schedule_id: "s1", publication_id: null })])));
    expect(r.items[0]).toMatchObject({ scheduleId: "s1", publicationId: null });
  });
  it("an aborted request returns nothing rather than an error", async () => {
    const f = vi.fn().mockRejectedValue(Object.assign(new Error("x"), { name: "AbortError" }));
    expect((await run(f)).items).toEqual([]);
  });
  it("provenance (#220): a published entry is platform-confirmed only with evidence_kind platform_api AND a provider publication id; a manual one is not; scheduled entries are never confirmed", async () => {
    const f = vi.fn(async () => page([row(1, { occurrence_kind: "published", workflow: "published", publication_id: "d1", evidence_kind: "platform_api", provider_publication_id: "p1" }), row(2, { occurrence_kind: "published", workflow: "published", publication_id: "m1" }), row(3, { occurrence_kind: "published", workflow: "published", publication_id: "d3", evidence_kind: "platform_api" }), row(4, { evidence_kind: "platform_api", provider_publication_id: "p4" })]));
    const r = await run(f); const by = Object.fromEntries(r.items.map((i) => [i.variantId, i]));
    expect([by.v1.platformVerified, by.v2.platformVerified, by.v3.platformVerified, by.v4.platformVerified]).toEqual([true, false, false, false]); expect(by.v1).toMatchObject({ evidenceKind: "platform_api", providerPublicationId: "p1", scheduleId: null });
  });
});
