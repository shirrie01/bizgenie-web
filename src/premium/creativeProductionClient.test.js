import { describe, expect, it, vi } from "vitest";
import { approveOutput, fetchAssets, fetchCapabilities, fetchJob, isCustomerMediaApiEnabled, normaliseCapabilities, normaliseJob, requestRevision, startCreativeJob, uploadAsset, validateBrief } from "./creativeProductionClient";

const capsBody = { kinds: ["image", "video", "hybrid", "bogus"], platforms: [{ key: "fx", label: "FX Platform", aspect_ratios: ["1:1", "9:16", "wide"] }, { key: "none", label: "Broken", aspect_ratios: [] }], max_assets: 3, max_asset_bytes: 5242880, content_types: ["image/png", "video/mp4"], max_brief_chars: 500 };
const caps = normaliseCapabilities(capsBody);
const scope = { tenantId: "t", projectId: "p", brandId: "b" };
const reply = (status, body) => vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }));
const brief = { kind: "image", platform: "fx", aspectRatio: "1:1", text: "A calm product shot", assetIds: [] };
const campaign = { campaign_id: "c1", version: 4 }; const variant = { variant_id: "v1" };
const job = (o = {}) => ({ job_id: "j1", kind: "image", status: "ready_for_review", credits_charged: 3, outputs: [{ output_id: "o1", kind: "image", url: "https://cdn.example.test/a.png", width: 10, height: 10, provenance: { origin: "ai_generated" } }], ...o });

describe("gate", () => {
  it.each([[undefined, false], ["false", false], ["1", false], ["true", true], [" TRUE ", true]])("%s -> %s", (v, e) => expect(isCustomerMediaApiEnabled({ VITE_CUSTOMER_MEDIA_API: v })).toBe(e));
});
describe("capabilities", () => {
  it("keeps only known kinds and usable platforms and shapes", () => { expect(caps.kinds).toEqual(["image", "video", "hybrid"]); expect(caps.platforms).toEqual([{ key: "fx", label: "FX Platform", aspectRatios: ["1:1", "9:16"] }]); });
  it("rejects malformed bodies", () => { expect(() => normaliseCapabilities(null)).toThrow(); expect(() => normaliseCapabilities({ ...capsBody, max_brief_chars: 0 })).toThrow(); });
  it("fetches with tenant and token", async () => { const f = reply(200, capsBody); await fetchCapabilities({ apiBaseUrl: "http://a", accessToken: "tk", tenantId: "t", fetchImpl: f }); expect(f.mock.calls[0][0]).toBe("http://a/customer/creative-capabilities?tenant_id=t"); expect(f.mock.calls[0][1].headers.authorization).toBe("Bearer tk"); });
});
describe("assets", () => {
  const a = { asset_id: "a1", kind: "image", filename: "x.png", content_type: "image/png", bytes: 5, width: 4, height: 4, created_at: "2026-01-01T00:00:00Z", rights_confirmed: true };
  it("lists valid assets and counts the ones it could not read", async () => {
    const r = await fetchAssets({ apiBaseUrl: "http://a", accessToken: "t", scope, fetchImpl: reply(200, { assets: [a, { asset_id: "x" }, { ...a, rights_confirmed: "yes" }] }) });
    expect(r.assets).toHaveLength(1); expect(r.skipped).toBe(2);
  });
  it("401 and 403 are explained", async () => {
    await expect(fetchAssets({ apiBaseUrl: "h", accessToken: "t", scope, fetchImpl: reply(401, {}) })).rejects.toMatchObject({ kind: "auth" });
    await expect(fetchAssets({ apiBaseUrl: "h", accessToken: "t", scope, fetchImpl: reply(403, {}) })).rejects.toMatchObject({ kind: "forbidden" });
  });
  const file = (o = {}) => ({ name: "x.png", type: "image/png", size: 100, ...o });
  it("upload refuses without rights confirmation, wrong type, too big, empty — before any request", async () => {
    const f = vi.fn();
    for (const [o, rights] of [[{}, false], [{ type: "text/html" }, true], [{ size: 9999999 }, true], [{ size: 0 }, true]]) await expect(uploadAsset({ apiBaseUrl: "h", accessToken: "t", scope, file: file(o), rightsConfirmed: rights, capabilities: caps, fetchImpl: f })).rejects.toMatchObject({ kind: "invalid-input" });
    expect(f).not.toHaveBeenCalled();
  });
  it("upload runs init, direct PUT to the signed https URL, then complete", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ asset_id: "a1", upload_url: "https://storage.example.test/u" }) })
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ asset: a }) });
    const asset = await uploadAsset({ apiBaseUrl: "http://a", accessToken: "tk", scope, file: file(), rightsConfirmed: true, capabilities: caps, fetchImpl: f });
    expect(asset.id).toBe("a1");
    expect(f.mock.calls[1][0]).toBe("https://storage.example.test/u"); expect(f.mock.calls[1][1].method).toBe("PUT");
    expect(f.mock.calls[1][1].headers.authorization).toBeUndefined(); // the bearer token is never sent to storage
    expect(JSON.parse(f.mock.calls[0][1].body)).toMatchObject({ rights_confirmed: true, bytes: 100 });
  });
  it("refuses a non-https upload target and reports a rejected PUT", async () => {
    await expect(uploadAsset({ apiBaseUrl: "h", accessToken: "t", scope, file: file(), rightsConfirmed: true, capabilities: caps, fetchImpl: reply(201, { asset_id: "a", upload_url: "http://insecure/u" }) })).rejects.toMatchObject({ kind: "invalid" });
    const f = vi.fn().mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ asset_id: "a", upload_url: "https://s.test/u" }) }).mockResolvedValueOnce({ ok: false, status: 403 });
    await expect(uploadAsset({ apiBaseUrl: "h", accessToken: "t", scope, file: file(), rightsConfirmed: true, capabilities: caps, fetchImpl: f })).rejects.toMatchObject({ code: "UPLOAD_REJECTED" });
  });
});
describe("validateBrief", () => {
  it("accepts a good image brief", () => expect(validateBrief(brief, caps)).toEqual([]));
  it("requires a brief, platform and matching shape", () => {
    expect(validateBrief({ ...brief, text: " " }, caps)).toHaveLength(1);
    expect(validateBrief({ ...brief, platform: "zz" }, caps)).toHaveLength(1);
    expect(validateBrief({ ...brief, aspectRatio: "16:9" }, caps)).toHaveLength(1);
    expect(validateBrief({ ...brief, text: "x".repeat(501) }, caps)[0]).toMatch(/500/);
  });
  it("hybrid needs media, and media needs hybrid — so text/AI is never relabelled as hybrid", () => {
    expect(validateBrief({ ...brief, kind: "hybrid" }, caps)[0]).toMatch(/at least one/);
    expect(validateBrief({ ...brief, assetIds: ["a1"] }, caps)[0]).toMatch(/only with Hybrid/);
    expect(validateBrief({ ...brief, kind: "hybrid", assetIds: ["a1"] }, caps)).toEqual([]);
    expect(validateBrief({ ...brief, kind: "hybrid", assetIds: ["1", "2", "3", "4"] }, caps)[0]).toMatch(/at most 3/);
  });
});
describe("jobs", () => {
  it("start carries the quote and idempotency key, and hybrid sends its assets", async () => {
    const f = reply(202, { job_id: "j1", status: "queued" });
    await startCreativeJob({ apiBaseUrl: "http://a", accessToken: "t", scope, campaign, variant, brief: { ...brief, kind: "hybrid", assetIds: ["a1"] }, capabilities: caps, quote: { quoteId: "q1", authorisedCredits: 7 }, key: "k1", fetchImpl: f });
    const body = JSON.parse(f.mock.calls[0][1].body);
    expect(body).toMatchObject({ kind: "hybrid", supplied_asset_ids: ["a1"], quote_id: "q1", max_credits: 7, idempotency_key: "k1", expected_campaign_version: 4, execution_class: "image.normal" });
  });
  it("invalid choices never reach the network", async () => { const f = vi.fn(); await expect(startCreativeJob({ apiBaseUrl: "h", accessToken: "t", scope, campaign, variant, brief: { ...brief, text: "" }, capabilities: caps, fetchImpl: f })).rejects.toMatchObject({ kind: "invalid-input" }); expect(f).not.toHaveBeenCalled(); });
  it.each([[402, "credits", /enough credits/], [409, "conflict", /changed in the meantime/], [422, "invalid-input", /could not accept/], [403, "forbidden", /permission/], [500, "unconfirmed", /may or may not/]])("start %i", async (status, kind, text) => {
    await expect(startCreativeJob({ apiBaseUrl: "h", accessToken: "t", scope, campaign, variant, brief, capabilities: caps, fetchImpl: reply(status, {}) })).rejects.toMatchObject({ kind, message: expect.stringMatching(text) });
  });
  it("quote errors are their own kind", async () => { await expect(startCreativeJob({ apiBaseUrl: "h", accessToken: "t", scope, campaign, variant, brief, capabilities: caps, fetchImpl: reply(409, { error: { code: "QUOTE_EXPIRED" } }) })).rejects.toMatchObject({ kind: "quote" }); });
  it("a network failure on start is 'unconfirmed', never 'not started'", async () => { await expect(startCreativeJob({ apiBaseUrl: "h", accessToken: "t", scope, campaign, variant, brief, capabilities: caps, fetchImpl: vi.fn().mockRejectedValue(new Error("x")) })).rejects.toMatchObject({ kind: "unconfirmed" }); });
  it("normaliseJob keeps outputs with a known origin and https url only", () => {
    const j = normaliseJob(job({ outputs: [job().outputs[0], { output_id: "o2", kind: "image", url: "http://x/a.png", provenance: { origin: "ai_generated" } }, { output_id: "o3", kind: "image", url: "https://x/b.png", provenance: { origin: "unknown" } }] }));
    expect(j.outputs.map((o) => o.id)).toEqual(["o1"]);
  });
  it("ready without a usable output is rejected, failure carries its message", () => {
    expect(() => normaliseJob(job({ outputs: [] }))).toThrow();
    expect(normaliseJob(job({ status: "failed", outputs: [], failure: { code: "PROVIDER", message: "The provider could not make this." }, credits_charged: 0 })).failure.message).toMatch(/provider/);
    expect(() => normaliseJob(job({ status: "weird" }))).toThrow();
  });
  it("revision and approval send keys; approval requires the approved answer", async () => {
    await expect(requestRevision({ apiBaseUrl: "h", accessToken: "t", tenantId: "t", jobId: "j", note: " ", fetchImpl: vi.fn() })).rejects.toMatchObject({ kind: "invalid-input" });
    const f = reply(202, { job_id: "j2" }); expect((await requestRevision({ apiBaseUrl: "h", accessToken: "t", tenantId: "t", jobId: "j1", note: "Brighter", key: "rk", fetchImpl: f })).jobId).toBe("j2");
    expect(JSON.parse(f.mock.calls[0][1].body).idempotency_key).toBe("rk");
    await expect(approveOutput({ apiBaseUrl: "h", accessToken: "t", tenantId: "t", jobId: "j", outputId: "o", fetchImpl: reply(200, { status: "pending" }) })).rejects.toMatchObject({ kind: "unconfirmed" });
    await expect(approveOutput({ apiBaseUrl: "h", accessToken: "t", tenantId: "t", jobId: "j", outputId: "o", fetchImpl: reply(200, { status: "approved" }) })).resolves.toEqual({ jobId: "j" });
  });
  it("fetchJob reads by id with tenant", async () => { const f = reply(200, job()); const j = await fetchJob({ apiBaseUrl: "http://a", accessToken: "t", tenantId: "t", jobId: "j 1", fetchImpl: f }); expect(f.mock.calls[0][0]).toContain("/customer/creative-jobs/j%201?tenant_id=t"); expect(j.creditsCharged).toBe(3); });
});
describe("no price or provider names in source", () => {
  it("source has no currency amount or provider names", async () => { const fs = await import("node:fs"); const src = fs.readFileSync("src/premium/creativeProductionClient.js", "utf8"); expect(src).not.toMatch(/£\s?\d|\$\s?\d|openai|runway|midjourney|stability|elevenlabs/i); });
});
