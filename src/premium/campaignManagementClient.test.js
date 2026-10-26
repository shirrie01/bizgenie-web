// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { CampaignApiError, campaignKey, errorFor, fetchCampaignDetail, recordManualPublication, renameCampaign, setCampaignArchived } from "./campaignManagementClient";

const SCOPE = { tenantId: "t1", projectId: "p1" };
const CAMP = { campaign_id: "11111111-1111-4111-8111-111111111111", version: 7, name: "Spring", display_timezone: "Europe/London" };
const VARIANT = { variant_id: "22222222-2222-4222-8222-222222222222" };
const ATTEMPT = "33333333-3333-4333-8333-333333333333";
const ok = (campaign = { ...CAMP, version: 8 }) => ({ ok: true, status: 200, json: async () => ({ result: {}, campaign }) });
const bad = (status, code) => ({ ok: false, status, json: async () => ({ error: { code } }) });
const call = (fn, extra, fetchImpl) => fn({ apiBaseUrl: "http://api.test", accessToken: "tok", scope: SCOPE, campaign: CAMP, fetchImpl, ...extra });
const sent = (f, i = 0) => ({ url: f.mock.calls[i][0], ...f.mock.calls[i][1], body: JSON.parse(f.mock.calls[i][1].body) });
const KEY = /^(?=.{1,128}$)[A-Za-z0-9][A-Za-z0-9._:-]*$/;

describe("rename", () => {
  it("PATCHes exactly the fields the backend validates, keeping the timezone, with a compliant idempotency key", async () => {
    const f = vi.fn().mockResolvedValue(ok());
    const c = await call(renameCampaign, { name: "  Autumn leasing  " }, f);
    const r = sent(f);
    expect(r.method).toBe("PATCH"); expect(r.url).toBe(`http://api.test/customer/campaigns/${CAMP.campaign_id}`); expect(r.headers.authorization).toBe("Bearer tok");
    expect(Object.keys(r.body).sort()).toEqual(["display_timezone", "expected_campaign_version", "idempotency_key", "name", "project_id", "tenant_id"]);
    expect(r.body).toMatchObject({ tenant_id: "t1", project_id: "p1", expected_campaign_version: 7, name: "Autumn leasing", display_timezone: "Europe/London" });
    expect(r.body.idempotency_key).toMatch(KEY); expect(c.version).toBe(8);
  });
  it("refuses an empty or over-long name before any request", async () => {
    const f = vi.fn();
    await expect(call(renameCampaign, { name: "   " }, f)).rejects.toMatchObject({ kind: "invalid" });
    await expect(call(renameCampaign, { name: "x".repeat(201) }, f)).rejects.toMatchObject({ kind: "invalid" });
    expect(f).not.toHaveBeenCalled();
  });
  it("the same request reuses its key; a different name or version does not", async () => {
    expect(await campaignKey(CAMP, "rename", "A")).toBe(await campaignKey(CAMP, "rename", "A"));
    expect(await campaignKey(CAMP, "rename", "A")).not.toBe(await campaignKey(CAMP, "rename", "B"));
    expect(await campaignKey(CAMP, "rename", "A")).not.toBe(await campaignKey({ ...CAMP, version: 8 }, "rename", "A"));
  });
});

describe("archive and restore", () => {
  it("POST to the matching path with a reason, and not to the other", async () => {
    const f = vi.fn().mockResolvedValue(ok());
    await call(setCampaignArchived, { archive: true, reason: "Season over" }, f);
    await call(setCampaignArchived, { archive: false, reason: "Running again" }, f);
    expect(sent(f, 0).url).toMatch(/\/archive$/); expect(sent(f, 1).url).toMatch(/\/restore$/);
    expect(sent(f, 0).body).toMatchObject({ reason: "Season over", expected_campaign_version: 7 }); expect(sent(f, 0).body.idempotency_key).toMatch(KEY);
  });
  it("needs a reason", async () => {
    const f = vi.fn(); await expect(call(setCampaignArchived, { archive: true, reason: " " }, f)).rejects.toMatchObject({ kind: "invalid" }); expect(f).not.toHaveBeenCalled();
  });
});

describe("manual publication outcomes", () => {
  const base = { variant: VARIANT, attemptId: ATTEMPT };
  it("confirm sends the time, address, optional reference and note; the time is the customer's, not 'now'", async () => {
    const f = vi.fn().mockResolvedValue(ok());
    await call(recordManualPublication, { ...base, outcome: "confirm", publishedAt: "2026-10-20T09:30:00.000Z", publicationUrl: " https://instagram.com/p/abc ", externalReference: "post-abc", note: "Posted from the studio account" }, f);
    const r = sent(f); expect(r.url).toMatch(/\/manual-publication\/confirm$/);
    expect(r.body).toMatchObject({ attempt_id: ATTEMPT, published_at: "2026-10-20T09:30:00.000Z", publication_url: "https://instagram.com/p/abc", external_reference: "post-abc", note: "Posted from the studio account", expected_campaign_version: 7 });
    expect(r.body).not.toHaveProperty("reason"); expect(r.body.idempotency_key).toMatch(KEY);
  });
  it("confirm omits an empty reference and note, and refuses a non-https address or a future time before any request", async () => {
    const f = vi.fn().mockResolvedValue(ok());
    await call(recordManualPublication, { ...base, outcome: "confirm", publishedAt: "2026-10-20T09:30:00.000Z", publicationUrl: "https://x.test/p", externalReference: " ", note: "" }, f);
    expect(sent(f).body).not.toHaveProperty("external_reference"); expect(sent(f).body).not.toHaveProperty("note");
    const g = vi.fn();
    await expect(call(recordManualPublication, { ...base, outcome: "confirm", publishedAt: "2026-10-20T09:30:00.000Z", publicationUrl: "http://x.test/p" }, g)).rejects.toMatchObject({ kind: "invalid" });
    await expect(call(recordManualPublication, { ...base, outcome: "confirm", publishedAt: "2099-01-01T00:00:00.000Z", publicationUrl: "https://x.test/p" }, g)).rejects.toThrow(/cannot be in the future/);
    await expect(call(recordManualPublication, { ...base, outcome: "confirm", publishedAt: "", publicationUrl: "https://x.test/p" }, g)).rejects.toMatchObject({ kind: "invalid" });
    expect(g).not.toHaveBeenCalled();
  });
  it("refuses a reference the backend would reject", async () => {
    const f = vi.fn();
    await expect(call(recordManualPublication, { ...base, outcome: "confirm", publishedAt: "2026-10-20T09:30:00.000Z", publicationUrl: "https://x.test/p", externalReference: "has spaces!" }, f)).rejects.toMatchObject({ kind: "invalid" });
    expect(f).not.toHaveBeenCalled();
  });
  it("fail and cancel send a reason and no publication evidence", async () => {
    const f = vi.fn().mockResolvedValue(ok());
    await call(recordManualPublication, { ...base, outcome: "fail", reason: "The platform rejected the upload" }, f);
    await call(recordManualPublication, { ...base, outcome: "cancel", reason: "Decided not to post" }, f);
    expect(sent(f, 0).url).toMatch(/\/manual-publication\/fail$/); expect(sent(f, 1).url).toMatch(/\/manual-publication\/cancel$/);
    for (const i of [0, 1]) { expect(sent(f, i).body).not.toHaveProperty("publication_url"); expect(sent(f, i).body).not.toHaveProperty("published_at"); expect(sent(f, i).body.reason).toBeTruthy(); }
    expect(sent(f, 0).body.idempotency_key).not.toBe(sent(f, 1).body.idempotency_key);
    const g = vi.fn(); await expect(call(recordManualPublication, { ...base, outcome: "fail", reason: "" }, g)).rejects.toMatchObject({ kind: "invalid" }); expect(g).not.toHaveBeenCalled();
  });
  it("refuses an unknown outcome or a missing attempt", async () => {
    const f = vi.fn();
    await expect(call(recordManualPublication, { ...base, outcome: "published" }, f)).rejects.toBeInstanceOf(CampaignApiError);
    await expect(call(recordManualPublication, { variant: VARIANT, attemptId: "", outcome: "cancel", reason: "x" }, f)).rejects.toMatchObject({ kind: "invalid" });
  });
});

describe("failures are named, never turned into success", () => {
  const rename = (response) => call(renameCampaign, { name: "New" }, vi.fn().mockResolvedValue(response));
  it.each([
    [401, "AUTHENTICATION_REQUIRED", "auth", /session has ended/i],
    [403, "", "unavailable", /not available to you any more/i],
    [404, "RESOURCE_NOT_AVAILABLE", "unavailable", /not available to you any more/i],
    [409, "VERSION_CONFLICT", "conflict", /changed somewhere else/i],
    [409, "INVALID_TRANSITION", "refused", /not possible in the campaign's current state/i],
    [409, "MANUAL_ATTEMPT_PENDING", "refused", /already waiting for your answer/i],
    [409, "PUBLICATION_EVIDENCE_INVALID", "refused", /publication details could not be accepted/i],
    [400, "VALIDATION_ERROR", "invalid", /were not accepted/i],
    [503, "CAMPAIGN_TEMPORARILY_UNAVAILABLE", "unconfirmed", /may or may not have been saved/i],
  ])("%s %s", async (status, code, kind, text) => {
    await expect(rename(bad(status, code))).rejects.toMatchObject({ kind, status });
    await expect(rename(bad(status, code))).rejects.toThrow(text);
  });
  it("a dropped connection and an unreadable success are 'unconfirmed', not 'done'", async () => {
    await expect(call(renameCampaign, { name: "New" }, vi.fn().mockRejectedValue(new Error("offline")))).rejects.toMatchObject({ kind: "unconfirmed", code: "NETWORK" });
    await expect(rename({ ok: true, status: 200, json: async () => ({}) })).rejects.toMatchObject({ kind: "unconfirmed", code: "BAD_RESPONSE" });
  });
  it("reads a campaign with the workspace scope and types its errors", async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ campaign: CAMP }) });
    expect((await fetchCampaignDetail({ apiBaseUrl: "http://api.test", accessToken: "tok", scope: SCOPE, campaignId: CAMP.campaign_id, fetchImpl: f })).name).toBe("Spring");
    expect(f.mock.calls[0][0]).toContain("tenant_id=t1"); expect(f.mock.calls[0][0]).toContain("project_id=p1");
    await expect(fetchCampaignDetail({ apiBaseUrl: "http://api.test", accessToken: "tok", scope: SCOPE, campaignId: "x", fetchImpl: vi.fn().mockResolvedValue(bad(404, "RESOURCE_NOT_AVAILABLE")) })).rejects.toMatchObject({ kind: "unavailable" });
    expect((await errorFor(bad(418, ""), "That")).kind).toBe("error");
  });
});
