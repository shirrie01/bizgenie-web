// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { HYBRID_BLOCKER, IMAGE_RATIOS, PREVIEW_BLOCKER, VIDEO_DURATIONS, executionClassFor, fetchVideo, isCustomerMediaApiEnabled, normaliseRecord, pollVideo, startImage, startVideo, validateBrief } from "./creativeProductionClient";

// MOCKED CONTRACT TESTS against the real route schemas in bizgenie-api PR #216 (f8d81bf): src/image-generation, src/video-generation. No provider is called.
const scope = { tenantId: "t1", projectId: "p1", brandId: "b1" }; const campaign = { campaign_id: "c1", version: 3 };
const ids = { executionId: "exec_1", generationId: "gen_1" };
const imgBrief = { text: "A calm product shot", aspectRatio: "1:1" }; const vidBrief = { text: "A short reveal", aspectRatio: "9:16", duration: 8, quality: "normal" };
const reply = (status, body) => vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }));
const imageBody = (o = {}) => ({ status: "completed", execution_id: "exec_1", generation_id: "gen_1", media: { provider: "p", provider_job_id: "j", asset: { location: "gs://private-bucket/a.png", mime_type: "image/png" }, aspect_ratio: "1:1", approval_status: "pending", created_at: "2026-10-26T10:00:00Z", completed_at: "2026-10-26T10:00:05Z" }, ...o });
const videoBody = (o = {}) => ({ status: "processing", execution_id: "exec_1", generation_id: "gen_1", video: { quality: "normal", aspect_ratio: "9:16", duration_seconds: 8, approval_status: "pending", asset: null }, ...o });
const common = { apiBaseUrl: "http://api.test", accessToken: "tok", scope, campaign, contentItemId: "i1", topic: "Lease offer post", platform: "instagram", ids };

describe("gate and constants", () => {
  it.each([[undefined, false], ["1", false], ["true", true]])("%s -> %s", (v, e) => expect(isCustomerMediaApiEnabled({ VITE_CUSTOMER_MEDIA_API: v })).toBe(e));
  it("execution classes follow the server's billing classes", () => { expect(executionClassFor("image")).toBe("image.normal"); expect(executionClassFor("video", "premium")).toBe("video.premium"); expect(executionClassFor("video")).toBe("video.normal"); });
  it("states the hybrid and preview blockers in plain words", () => { expect(HYBRID_BLOCKER).toMatch(/not available yet/); expect(PREVIEW_BLOCKER).toMatch(/nothing is shown and nothing is approved/); });
});
describe("validateBrief mirrors the backend enums", () => {
  it("accepts good image and video briefs", () => { expect(validateBrief({ kind: "image", ...imgBrief })).toEqual([]); expect(validateBrief({ kind: "video", ...vidBrief })).toEqual([]); });
  it.each([["no brief", { text: " " }], ["too long", { text: "x".repeat(2001) }], ["unknown shape", { aspectRatio: "3:2" }]])("image: %s", (_l, o) => expect(validateBrief({ kind: "image", ...imgBrief, ...o }).length).toBe(1));
  it.each([["image-only shape", { aspectRatio: "1:1" }], ["unsupported length", { duration: 5 }], ["unknown quality", { quality: "ultra" }]])("video: %s", (_l, o) => expect(validateBrief({ kind: "video", ...vidBrief, ...o }).length).toBe(1));
  it("offers exactly the server's shapes and lengths", () => { expect(IMAGE_RATIOS).toEqual(["1:1", "4:5", "9:16", "16:9"]); expect(VIDEO_DURATIONS).toEqual([4, 6, 8]); });
});
describe("startImage", () => {
  it("posts the strict body: scope, ids, context and brief — no price, no user_id, no asset address", async () => {
    const f = reply(200, imageBody()); const r = await startImage({ ...common, brief: imgBrief, fetchImpl: f });
    expect(f.mock.calls[0][0]).toBe("http://api.test/customer/generate-image"); expect(f.mock.calls[0][1].headers.authorization).toBe("Bearer tok");
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ tenant_id: "t1", project_id: "p1", brand_id: "b1", campaign_id: "c1", content_item_id: "i1", topic: "Lease offer post", platform: "instagram", execution_id: "exec_1", generation_id: "gen_1", image_purpose: "A calm product shot", aspect_ratio: "1:1" });
    expect(r).toMatchObject({ kind: "image", status: "completed", stored: true, approvalStatus: "pending" });
    expect(JSON.stringify(r)).not.toMatch(/gs:\/\/|private-bucket|location/); // the private storage address never leaves the client module
  });
  it("invalid choices never reach the network", async () => { const f = vi.fn(); await expect(startImage({ ...common, brief: { ...imgBrief, text: "" }, fetchImpl: f })).rejects.toMatchObject({ kind: "invalid-input" }); await expect(startImage({ ...common, topic: " ", brief: imgBrief, fetchImpl: f })).rejects.toMatchObject({ kind: "invalid-input" }); expect(f).not.toHaveBeenCalled(); });
  it("'completed' with nothing stored is not shown as a result", async () => { await expect(startImage({ ...common, brief: imgBrief, fetchImpl: reply(200, imageBody({ media: { approval_status: "pending" } })) })).rejects.toMatchObject({ kind: "invalid" }); });
  it.each([
    [402, { error: { code: "GENERATION_CREDITS_UNAVAILABLE" } }, "credits", /enough credits/], [503, { error: { code: "GENERATION_BILLING_UNAVAILABLE" } }, "unavailable", /Credits cannot be checked/], [401, {}, "auth", /session has ended/],
    [404, {}, "missing", /not available to you/], [400, {}, "invalid-input", /could not accept/], [409, {}, "conflict", /already started/], [503, {}, "unconfirmed", /not available right now/], [500, {}, "unconfirmed", /outcome is not known/],
  ])("status %s", async (status, body, kind, text) => { await expect(startImage({ ...common, brief: imgBrief, fetchImpl: reply(status, body) })).rejects.toMatchObject({ kind, message: expect.stringMatching(text) }); });
  it("a dropped connection after sending a paid request is 'unconfirmed', and the same ids are reused for the retry", async () => {
    const f = vi.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce({ ok: true, status: 200, json: async () => imageBody() });
    await expect(startImage({ ...common, brief: imgBrief, fetchImpl: f })).rejects.toMatchObject({ kind: "unconfirmed" });
    await startImage({ ...common, brief: imgBrief, fetchImpl: f });
    expect(JSON.parse(f.mock.calls[0][1].body).generation_id).toBe(JSON.parse(f.mock.calls[1][1].body).generation_id);
    expect(JSON.parse(f.mock.calls[0][1].body).execution_id).toBe(JSON.parse(f.mock.calls[1][1].body).execution_id);
  });
});
describe("startVideo and fetchVideo", () => {
  it("posts quality, shape and length, and accepts the 202 as 'in progress', not done", async () => {
    const f = reply(202, videoBody()); const r = await startVideo({ ...common, brief: vidBrief, fetchImpl: f });
    expect(JSON.parse(f.mock.calls[0][1].body)).toMatchObject({ video_purpose: "A short reveal", quality: "normal", aspect_ratio: "9:16", duration_seconds: 8, execution_id: "exec_1", generation_id: "gen_1" });
    expect(f.mock.calls[0][0]).toBe("http://api.test/customer/generate-video"); expect(r).toMatchObject({ kind: "video", status: "processing", stored: false });
  });
  it("reads progress by generation id with only the bearer token", async () => {
    const f = reply(200, videoBody({ status: "completed", video: { approval_status: "pending", asset: { location: "gs://x/y.mp4" }, completed_at: "2026-10-26T10:05:00Z" } }));
    const r = await fetchVideo({ apiBaseUrl: "http://api.test", accessToken: "tok", generationId: "gen 1", fetchImpl: f });
    expect(f.mock.calls[0][0]).toBe("http://api.test/customer/generate-video/gen%201"); expect(r).toMatchObject({ status: "completed", stored: true }); expect(JSON.stringify(r)).not.toMatch(/gs:\/\//);
  });
  it("polling is a POST to .../poll with only the bearer token, and is what moves a video on", async () => {
    const f = reply(200, videoBody({ status: "completed", video: { approval_status: "pending", asset: { location: "gs://x/y.mp4" } } }));
    const r = await pollVideo({ apiBaseUrl: "http://api.test", accessToken: "tok", generationId: "gen_1", fetchImpl: f });
    expect(f.mock.calls[0][0]).toBe("http://api.test/customer/generate-video/gen_1/poll"); expect(f.mock.calls[0][1].method).toBe("POST"); expect(r).toMatchObject({ status: "completed", stored: true });
  });
  it("unknown statuses are refused", () => { expect(() => normaliseRecord("video", videoBody({ status: "rendering" }))).toThrow(); expect(() => normaliseRecord("image", { status: "submitted", execution_id: "e", generation_id: "g" })).toThrow(); });
  it("a failed record carries no result", () => { expect(normaliseRecord("video", videoBody({ status: "failed" }))).toMatchObject({ status: "failed", stored: false }); });
});
describe("no provider names or prices in source", () => {
  it("source names no provider and contains no currency amount", async () => { const fs = await import("node:fs"); const src = fs.readFileSync("src/premium/creativeProductionClient.js", "utf8"); expect(src).not.toMatch(/£\s?\d|\$\s?\d|openai|veo|runway|midjourney|stability|elevenlabs|google/i); });
});
