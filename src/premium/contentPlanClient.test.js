// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { addPlanItems, creditNeeds, fetchContentPlan, isRealDate, validatePlan } from "./contentPlanClient";
import { FONZO_CAMPAIGN_ID, FONZO_PLAN, FONZO_PLAN_NEXT_WEEK } from "../test/fonzoPlanFixture";

const scope = { tenantId: "t", projectId: "p" };
const base = { apiBaseUrl: "http://api.test", accessToken: "synthetic", scope };
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
// A minimal fake API: content-items add an item and bump the version, honouring idempotency keys.
function fakeApi({ failAt = null, lose = null } = {}) {
  const keys = new Map(); const items = []; let version = 1; const calls = [];
  const fetchImpl = vi.fn(async (url, init = {}) => {
    calls.push({ url, method: init.method || "GET", body: init.body ? JSON.parse(init.body) : null });
    if (/\/content-items$/.test(url)) {
      const b = JSON.parse(init.body); const n = calls.filter((c) => c.method === "POST").length;
      if (failAt === n) return json({ error: { code: "VERSION_CONFLICT" } }, 409);
      if (lose === n) { if (!keys.has(b.idempotency_key)) { keys.set(b.idempotency_key, true); items.push({ content_item_id: `i${items.length}`, name: b.name, variants: [] }); version += 1; } throw new Error("lost response"); }
      if (!keys.has(b.idempotency_key)) { keys.set(b.idempotency_key, true); items.push({ content_item_id: `i${items.length}`, name: b.name, variants: [] }); version += 1; }
      return json({ campaign: { campaign_id: FONZO_CAMPAIGN_ID, version, items: items.map((i) => ({ ...i })) } }, 201);
    }
    if (/\/customer\/campaigns\/[^/?]+\?/.test(url)) return json({ campaign: { campaign_id: FONZO_CAMPAIGN_ID, version, items: items.map((i) => ({ ...i })) } });
    return json({}, 404);
  });
  return { fetchImpl, calls, items };
}
const campaign0 = { campaign_id: FONZO_CAMPAIGN_ID, version: 1, items: [] };

describe("content plan client", () => {
  it("accepts only the exact contract for this campaign", () => {
    expect(validatePlan(FONZO_PLAN, FONZO_CAMPAIGN_ID)).toBe(FONZO_PLAN);
    for (const bad of [null, {}, { ...FONZO_PLAN, contract_version: "x" }, { ...FONZO_PLAN, campaign_id: "other" }, { ...FONZO_PLAN, items: [] }, { ...FONZO_PLAN, items: [{ ...FONZO_PLAN.items[0], initial_content: { ...FONZO_PLAN.items[0].initial_content, asset_refs: [{ asset_id: "a" }] } }] }])
      expect(() => validatePlan(bad, FONZO_CAMPAIGN_ID)).toThrow(/could not be checked/);
  });
  it("fetches the read-only plan with scope and start date only", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ plan: FONZO_PLAN }));
    const plan = await fetchContentPlan({ ...base, campaignId: FONZO_CAMPAIGN_ID, startDate: "2026-12-07", fetchImpl });
    expect(plan.totals.posts).toBe(7);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`http://api.test/customer/campaigns/${FONZO_CAMPAIGN_ID}/content-plan?tenant_id=t&project_id=p&start_date=2026-12-07`);
    expect(init.method).toBeUndefined(); expect(init.body).toBeUndefined();
    await expect(fetchContentPlan({ ...base, campaignId: FONZO_CAMPAIGN_ID, startDate: "tomorrow", fetchImpl })).rejects.toThrow(/start date/);
    await expect(fetchContentPlan({ ...base, campaignId: FONZO_CAMPAIGN_ID, startDate: "2026-12-07", fetchImpl: vi.fn().mockRejectedValue(new Error("x")) })).rejects.toThrow(/Nothing was changed/);
  });
  it("reports credit needs as counts only (the server owns prices)", () => {
    expect(creditNeeds(FONZO_PLAN)).toEqual({ "image.normal": 5, "video.normal": 3 });
  });
  it("adds all eight items once, with stable keys, content drafts, and never calls a generation or write route other than content-items", async () => {
    const api = fakeApi();
    const progress = [];
    const result = await addPlanItems({ ...base, campaign: campaign0, plan: FONZO_PLAN, onProgress: (p) => progress.push(p.done), fetchImpl: api.fetchImpl });
    expect(result).toMatchObject({ added: 8, skipped: 0, failed: null });
    expect(progress).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const posts = api.calls.filter((c) => c.method === "POST");
    expect(posts).toHaveLength(8);
    expect(posts.every((c) => /\/content-items$/.test(c.url))).toBe(true);
    expect(posts.map((c) => c.body.idempotency_key)).toEqual(FONZO_PLAN.items.map((i) => `plan:launch-week-7d.v1:2026-12-07:${FONZO_CAMPAIGN_ID}:${i.plan_item}`));
    expect(posts.every((c) => c.body.name.startsWith("Week of 2026-12-07 · "))).toBe(true);
    expect(posts.every((c) => c.body.initial_content.asset_refs.length === 0 && c.body.initial_content.body.includes("Fonzo"))).toBe(true);
    expect(posts.map((c) => c.body.expected_campaign_version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(api.calls.some((c) => /generation-quotes|confirm|schedule|approval|social/.test(c.url))).toBe(false);
  });
  it("a second run skips present items and adds nothing twice", async () => {
    const api = fakeApi();
    const first = await addPlanItems({ ...base, campaign: campaign0, plan: FONZO_PLAN, fetchImpl: api.fetchImpl });
    const again = await addPlanItems({ ...base, campaign: first.campaign, plan: FONZO_PLAN, fetchImpl: api.fetchImpl });
    expect(again).toMatchObject({ added: 0, skipped: 8, failed: null });
    expect(api.items).toHaveLength(8);
  });
  it("a mid-plan failure keeps completed work and a retry continues without duplicates", async () => {
    const api = fakeApi({ failAt: 4 });
    const partial = await addPlanItems({ ...base, campaign: campaign0, plan: FONZO_PLAN, fetchImpl: api.fetchImpl });
    expect(partial.added).toBe(3); expect(partial.failed.name).toBe(FONZO_PLAN.items[3].content_item.name); expect(api.items).toHaveLength(3);
    const done = await addPlanItems({ ...base, campaign: partial.campaign, plan: FONZO_PLAN, fetchImpl: api.fetchImpl });
    expect(done).toMatchObject({ added: 5, skipped: 3, failed: null }); expect(api.items).toHaveLength(8);
  });
  it("a lost response is re-read from the server and the item is neither duplicated nor reported as failed-and-missing", async () => {
    const api = fakeApi({ lose: 2 });
    const r = await addPlanItems({ ...base, campaign: campaign0, plan: FONZO_PLAN, fetchImpl: api.fetchImpl });
    expect(r.failed.message).toMatch(/may or may not have been saved/);
    expect(r.campaign.items).toHaveLength(2);
    const done = await addPlanItems({ ...base, campaign: r.campaign, plan: FONZO_PLAN, fetchImpl: api.fetchImpl });
    expect(done.failed).toBeNull(); expect(api.items).toHaveLength(8);
  });

  it("rejects impossible dates and any plan whose week identity is inconsistent (fail closed)", () => {
    for (const bad of ["2026-02-30", "2026-13-45", "2027-02-29", "2026-1-5", "", null, 20261207]) expect(isRealDate(bad)).toBe(false);
    for (const good of ["2026-12-07", "2028-02-29"]) expect(isRealDate(good)).toBe(true);
    const clone = () => structuredClone(FONZO_PLAN);
    const mutate = (fn) => { const p = clone(); fn(p); return p; };
    for (const bad of [
      mutate((p) => { p.start_date = "2026-02-30"; }),
      mutate((p) => { p.start_date = "2026-12-14"; }),                                  // week no longer matches names/keys
      mutate((p) => { p.plan_id = "launch-week-7d.v1:2026-12-14"; }),
      mutate((p) => { p.items[0].idempotency_key = p.items[0].idempotency_key.replace("2026-12-07", "2026-12-14"); }),
      mutate((p) => { p.items[0].idempotency_key = `plan:launch-week-7d.v1:2026-12-07:${FONZO_CAMPAIGN_ID}:99`; }),
      mutate((p) => { delete p.items[0].idempotency_key; }),
      mutate((p) => { p.items[1].idempotency_key = p.items[0].idempotency_key; }),
      mutate((p) => { p.items[0].content_item.name = "Day 1 · Meet the brand (Instagram image)"; }), // no week in the saved name
      mutate((p) => { p.items[1].content_item.name = p.items[0].content_item.name; }),
      mutate((p) => { p.pack = "bad pack!"; }),
    ]) expect(() => validatePlan(bad, FONZO_CAMPAIGN_ID)).toThrow(/could not be checked/);
    expect(validatePlan(FONZO_PLAN_NEXT_WEEK, FONZO_CAMPAIGN_ID)).toBe(FONZO_PLAN_NEXT_WEEK);
  });
  it("a different start date adds a second week with no name or key collision; the same week replays exactly", async () => {
    const api = fakeApi();
    const w1 = await addPlanItems({ ...base, campaign: campaign0, plan: FONZO_PLAN, fetchImpl: api.fetchImpl });
    expect(w1).toMatchObject({ added: 8, skipped: 0, failed: null });
    const w2 = await addPlanItems({ ...base, campaign: w1.campaign, plan: FONZO_PLAN_NEXT_WEEK, fetchImpl: api.fetchImpl });
    expect(w2).toMatchObject({ added: 8, skipped: 0, failed: null });          // next week is NOT mistaken for already-added items
    expect(api.items).toHaveLength(16); expect(new Set(api.items.map((i) => i.name)).size).toBe(16);
    const posts = api.calls.filter((c) => c.method === "POST");
    expect(posts).toHaveLength(16); expect(new Set(posts.map((c) => c.body.idempotency_key)).size).toBe(16);
    expect(posts.slice(8).every((c) => c.body.name.startsWith("Week of 2026-12-14 · ") && c.body.idempotency_key.includes(":2026-12-14:"))).toBe(true);
    // Same-week replays (either week) skip every item and send nothing.
    const before = api.calls.length;
    expect(await addPlanItems({ ...base, campaign: w2.campaign, plan: FONZO_PLAN, fetchImpl: api.fetchImpl })).toMatchObject({ added: 0, skipped: 8, failed: null });
    expect(await addPlanItems({ ...base, campaign: w2.campaign, plan: FONZO_PLAN_NEXT_WEEK, fetchImpl: api.fetchImpl })).toMatchObject({ added: 0, skipped: 8, failed: null });
    expect(api.calls.length).toBe(before); expect(api.items).toHaveLength(16);
  });
  it("a stale-view retry of the same week (campaign object not refreshed) is still exact: the server key makes it a replay, not a duplicate", async () => {
    const api = fakeApi();
    await addPlanItems({ ...base, campaign: campaign0, plan: FONZO_PLAN, fetchImpl: api.fetchImpl });
    const again = await addPlanItems({ ...base, campaign: campaign0, plan: FONZO_PLAN, fetchImpl: api.fetchImpl }); // stale: still sees zero items
    expect(again.failed).toBeNull(); expect(api.items).toHaveLength(8);
  });
  it("partial failure and a lost response in the second week keep week one intact and retry without duplicates", async () => {
    for (const mode of [{ failAt: 12 }, { lose: 12 }]) {
      const api = fakeApi(mode);
      const w1 = await addPlanItems({ ...base, campaign: campaign0, plan: FONZO_PLAN, fetchImpl: api.fetchImpl });
      expect(w1.failed).toBeNull();
      const w2 = await addPlanItems({ ...base, campaign: w1.campaign, plan: FONZO_PLAN_NEXT_WEEK, fetchImpl: api.fetchImpl });
      expect(w2.failed).not.toBeNull(); expect(w2.added).toBe(3);              // week-2 items 1..3 saved; the fourth failed or was lost
      expect(api.items.slice(0, 8).every((i) => i.name.startsWith("Week of 2026-12-07 · "))).toBe(true);
      const done = await addPlanItems({ ...base, campaign: w2.campaign, plan: FONZO_PLAN_NEXT_WEEK, fetchImpl: api.fetchImpl });
      expect(done.failed).toBeNull(); expect(api.items).toHaveLength(16); expect(new Set(api.items.map((i) => i.name)).size).toBe(16);
    }
  });
});
