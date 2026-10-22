// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const refreshMock = vi.fn();
vi.mock("./session", () => ({ refreshCustomerSession: (...args) => refreshMock(...args) }));

import { fetchMediaPreview, isRetryable, MAX_ASSEMBLED_VIDEO_BYTES, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, mediaPreviewUrl, MediaPreviewError } from "./mediaPreviewClient";
import { useMediaPreview } from "./useMediaPreview";

const API = "http://api.test";
const ASSET = "9b2f7c1e-4d3a-4f6b-8a1c-0e5d7a9b3c21";
const session = { status: "ready", accessToken: "tok-1", tenantId: "tenant-1", projectId: "project-1" };
const campaign = (version = 3) => ({ campaign_id: "22222222-2222-4222-8222-222222222222", version });
const variant = (rev = "rev-1") => ({ variant_id: "44444444-4444-4444-8444-444444444440", current_revision_id: rev });
const image = { id: ASSET, role: "primary", kind: "image" };
const video = { id: ASSET, role: "primary", kind: "video" };
const bytes = (n = 8) => new Uint8Array(n).fill(7);
const reply = (status = 200, { mime = "image/png", length = 8, body = bytes(length), headers = {} } = {}) => ({
  ok: status >= 200 && status < 300, status,
  headers: new Headers(status === 200 ? { "content-type": mime, "content-length": String(length), ...headers } : {}),
  arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
});
const args = (over = {}) => ({ apiBaseUrl: API, session, campaign: campaign(), variant: variant(), media: image, ...over });

beforeEach(() => { refreshMock.mockReset(); global.fetch = vi.fn(); URL.createObjectURL = vi.fn(() => "blob:test/1"); URL.revokeObjectURL = vi.fn(); });
afterEach(() => vi.restoreAllMocks());

describe("mediaPreviewUrl", () => {
  it("is an API path with scope and version only: no token, bucket, key or asset URL", () => {
    const url = new URL(mediaPreviewUrl({ apiBaseUrl: API, session, campaign: campaign(), variant: variant(), assetId: ASSET }));
    expect(url.origin).toBe(API);
    expect(url.pathname).toBe(`/customer/campaigns/${campaign().campaign_id}/variants/${variant().variant_id}/revisions/rev-1/assets/${ASSET}/preview`);
    expect([...url.searchParams.keys()].sort()).toEqual(["expected_campaign_version", "project_id", "tenant_id"]);
    expect(url.toString()).not.toMatch(/token|bearer|bucket|storage|googleapis|tok-1/i);
  });
});

describe("fetchMediaPreview", () => {
  it("authorises with HEAD, then fetches the full image with only the Authorization header", async () => {
    global.fetch.mockResolvedValueOnce(reply()).mockResolvedValueOnce(reply());
    const result = await fetchMediaPreview(args());
    expect(result).toMatchObject({ mime: "image/png", bytes: 8 });
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.blob.size).toBe(8);
    expect(result.blob.type).toBe("image/png");
    expect(global.fetch.mock.calls.map(([, o]) => o.method)).toEqual(["HEAD", "GET"]);
    for (const [url, options] of global.fetch.mock.calls) {
      expect(url).not.toMatch(/token|bearer|tok-1/i);
      expect(Object.keys(options.headers)).toEqual(["authorization"]);
      expect(options.headers.authorization).toBe("Bearer tok-1");
      expect(options).toMatchObject({ credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", redirect: "error" });
    }
  });

  it("refreshes the session once through the existing path on 401, then stops", async () => {
    refreshMock.mockResolvedValueOnce({ status: "ready", accessToken: "tok-2" });
    global.fetch.mockResolvedValueOnce(reply(401)).mockResolvedValueOnce(reply()).mockResolvedValueOnce(reply());
    await fetchMediaPreview(args());
    expect(global.fetch.mock.calls[1][1].headers.authorization).toBe("Bearer tok-2");
    expect(refreshMock).toHaveBeenCalledTimes(1);
    refreshMock.mockResolvedValueOnce({ status: "signed-out" });
    global.fetch.mockResolvedValueOnce(reply(401));
    await expect(fetchMediaPreview(args())).rejects.toMatchObject({ code: "auth" });
  });

  it.each([[404, "missing"], [409, "stale"], [413, "too_large"], [416, "unsupported"], [429, "busy"], [503, "unavailable"], [400, "failed"]])("maps HTTP %i to %s without leaking server text", async (status, code) => {
    global.fetch.mockResolvedValueOnce(reply(status));
    const error = await fetchMediaPreview(args()).catch((e) => e);
    expect(error).toBeInstanceOf(MediaPreviewError);
    expect(error.code).toBe(code);
    expect(error.message).not.toMatch(/bucket|key|X\b|undefined/);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("treats network failure as unavailable and lets aborts through", async () => {
    global.fetch.mockRejectedValueOnce(new TypeError("fetch failed: private-host"));
    const error = await fetchMediaPreview(args()).catch((e) => e);
    expect(error.code).toBe("unavailable");
    expect(error.message).not.toMatch(/private-host/);
    global.fetch.mockRejectedValueOnce(Object.assign(new Error("x"), { name: "AbortError" }));
    await expect(fetchMediaPreview(args())).rejects.toMatchObject({ name: "AbortError" });
  });

  it("refuses wrong types and oversize media from HEAD alone, before any bytes are requested", async () => {
    global.fetch.mockResolvedValueOnce(reply(200, { mime: "text/html" }));
    await expect(fetchMediaPreview(args())).rejects.toMatchObject({ code: "unsupported" });
    global.fetch.mockResolvedValueOnce(reply(200, { mime: "image/svg+xml" }));
    await expect(fetchMediaPreview(args())).rejects.toMatchObject({ code: "unsupported" });
    global.fetch.mockResolvedValueOnce(reply(200, { mime: "video/mp4", length: MAX_ASSEMBLED_VIDEO_BYTES + 1, body: bytes(1) }));
    await expect(fetchMediaPreview(args({ media: video }))).rejects.toMatchObject({ code: "too_large" });
    global.fetch.mockResolvedValueOnce(reply(200, { length: MAX_IMAGE_BYTES + 1, body: bytes(1) }));
    await expect(fetchMediaPreview(args())).rejects.toMatchObject({ code: "too_large" });
    expect(global.fetch.mock.calls.every(([, o]) => o.method === "HEAD")).toBe(true);
    global.fetch.mockResolvedValueOnce(reply(200, { mime: "image/png" }));
    await expect(fetchMediaPreview(args({ media: video }))).rejects.toMatchObject({ code: "unsupported" });
  });

  describe("larger MP4 built from bounded ranges", () => {
    const TOTAL = 20 * 1024 * 1024;
    const head = () => reply(200, { mime: "video/mp4", length: TOTAL, body: bytes(1) });
    const part = (start, end, over = {}) => ({ ...reply(206, { mime: "video/mp4", length: end - start + 1, body: bytes(end - start + 1) }), status: 206, ok: true,
      headers: new Headers({ "content-type": "video/mp4", "content-length": String(end - start + 1), "content-range": `bytes ${start}-${end}/${TOTAL}`, ...over }) });
    const ranges = [[0, MAX_VIDEO_BYTES - 1], [MAX_VIDEO_BYTES, 2 * MAX_VIDEO_BYTES - 1], [2 * MAX_VIDEO_BYTES, TOTAL - 1]];

    it("fetches single ranges of at most 8 MiB, in order, with only Authorization and Range headers", async () => {
      global.fetch.mockResolvedValueOnce(head());
      for (const [a, b] of ranges) global.fetch.mockResolvedValueOnce(part(a, b));
      const out = await fetchMediaPreview(args({ media: video }));
      expect(out.bytes).toBe(TOTAL);
      expect(out.blob.size).toBe(TOTAL);
      expect(out.blob.type).toBe("video/mp4");
      const calls = global.fetch.mock.calls.slice(1);
      expect(calls.map(([, o]) => o.headers.range)).toEqual(ranges.map(([a, b]) => `bytes=${a}-${b}`));
      for (const [, o] of calls) { expect(Object.keys(o.headers).sort()).toEqual(["authorization", "range"]); expect(o.method).toBe("GET"); }
      expect(calls.every(([, o]) => { const [a, b] = o.headers.range.slice(6).split("-").map(Number); return b - a + 1 <= MAX_VIDEO_BYTES; })).toBe(true);
    });

    it("discards everything when a range is not a 206, or Content-Range is not exactly what was asked", async () => {
      global.fetch.mockResolvedValueOnce(head()).mockResolvedValueOnce({ ...part(...ranges[0]), status: 200 });
      await expect(fetchMediaPreview(args({ media: video }))).rejects.toMatchObject({ code: "range" });
      global.fetch.mockResolvedValueOnce(head()).mockResolvedValueOnce(part(...ranges[0])).mockResolvedValueOnce(part(...ranges[1], { "content-range": `bytes 0-${MAX_VIDEO_BYTES - 1}/${TOTAL}` }));
      await expect(fetchMediaPreview(args({ media: video }))).rejects.toMatchObject({ code: "range" });
      global.fetch.mockResolvedValueOnce(head()).mockResolvedValueOnce(part(...ranges[0], { "content-range": `bytes 0-${MAX_VIDEO_BYTES - 1}/${TOTAL + 1}` }));
      await expect(fetchMediaPreview(args({ media: video }))).rejects.toMatchObject({ code: "range" });
    });

    it("maps a rejected range to unsupported, a short range body to unavailable, and a changed type to range", async () => {
      global.fetch.mockResolvedValueOnce(head()).mockResolvedValueOnce(reply(416));
      await expect(fetchMediaPreview(args({ media: video }))).rejects.toMatchObject({ code: "unsupported" });
      global.fetch.mockResolvedValueOnce(head()).mockResolvedValueOnce({ ...part(...ranges[0]), arrayBuffer: async () => bytes(10).buffer });
      await expect(fetchMediaPreview(args({ media: video }))).rejects.toMatchObject({ code: "unavailable" });
      global.fetch.mockResolvedValueOnce(head()).mockResolvedValueOnce(part(...ranges[0], { "content-type": "video/webm" }));
      await expect(fetchMediaPreview(args({ media: video }))).rejects.toMatchObject({ code: "unsupported" });
    });

    it("stops requesting further ranges once cancelled", async () => {
      const controller = new AbortController();
      global.fetch.mockResolvedValueOnce(head()).mockImplementationOnce(async () => { controller.abort(); return part(...ranges[0]); });
      await expect(fetchMediaPreview(args({ media: video, signal: controller.signal }))).rejects.toBeTruthy();
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("never assembles more than the in-memory ceiling and never ranges an image", async () => {
      global.fetch.mockResolvedValueOnce(reply(200, { mime: "video/mp4", length: MAX_ASSEMBLED_VIDEO_BYTES + 1, body: bytes(1) }));
      await expect(fetchMediaPreview(args({ media: video }))).rejects.toMatchObject({ code: "too_large" });
      global.fetch.mockResolvedValueOnce(reply(200, { length: 20 * 1024 * 1024, body: bytes(1) }));
      global.fetch.mockResolvedValueOnce(reply(200, { length: 20 * 1024 * 1024, body: bytes(20 * 1024 * 1024) }));
      await fetchMediaPreview(args());
      expect(global.fetch.mock.calls.slice(-2).every(([, o]) => !o.headers.range)).toBe(true);
    });
  });

  it("accepts a small mp4 and a content type with parameters", async () => {
    global.fetch.mockResolvedValueOnce(reply(200, { mime: "video/mp4; codecs=avc1", length: 16 })).mockResolvedValueOnce(reply(200, { mime: "video/mp4", length: 16 }));
    const result = await fetchMediaPreview(args({ media: video }));
    expect(result.mime).toBe("video/mp4");
  });

  it("discards short bodies, failed reads and a changed object between HEAD and GET", async () => {
    global.fetch.mockResolvedValueOnce(reply()).mockResolvedValueOnce(reply(200, { length: 8, body: bytes(5) }));
    await expect(fetchMediaPreview(args())).rejects.toMatchObject({ code: "unavailable" });
    global.fetch.mockResolvedValueOnce(reply()).mockResolvedValueOnce({ ...reply(), arrayBuffer: async () => { throw new TypeError("reset"); } });
    await expect(fetchMediaPreview(args())).rejects.toMatchObject({ code: "unavailable" });
    global.fetch.mockResolvedValueOnce(reply()).mockResolvedValueOnce(reply(200, { length: 9 }));
    await expect(fetchMediaPreview(args())).rejects.toMatchObject({ code: "stale" });
  });

  it("does not call the API for unsupported kinds or incomplete identity", async () => {
    await expect(fetchMediaPreview(args({ media: { id: ASSET, kind: "" } }))).rejects.toMatchObject({ code: "unsupported" });
    await expect(fetchMediaPreview(args({ variant: { variant_id: "v" } }))).rejects.toMatchObject({ code: "failed" });
    await expect(fetchMediaPreview(args({ campaign: { campaign_id: "c" } }))).rejects.toMatchObject({ code: "failed" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("never runs more than two media transfers at once", async () => {
    let running = 0, peak = 0;
    global.fetch.mockImplementation(async () => { running += 1; peak = Math.max(peak, running); await new Promise((r) => setTimeout(r, 5)); running -= 1; return reply(); });
    await Promise.all([1, 2, 3, 4, 5].map((n) => fetchMediaPreview(args({ media: { ...image, id: `${ASSET.slice(0, -1)}${n}` } }))));
    expect(peak).toBeLessThanOrEqual(2);
    expect(global.fetch).toHaveBeenCalledTimes(10);
  });

  it("classifies retryable codes", () => {
    expect(["busy", "unavailable", "failed"].every(isRetryable)).toBe(true);
    expect(["stale", "missing", "too_large", "unsupported", "auth"].some(isRetryable)).toBe(false);
  });
});

describe("useMediaPreview blob lifecycle", () => {
  const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
  const props = (over = {}) => ({ apiBaseUrl: API, session, campaign: campaign(), variant: variant(), media: image, ...over });

  it("creates a blob URL when ready and revokes it on unmount", async () => {
    global.fetch.mockResolvedValue(reply());
    const { result, unmount } = renderHook((p) => useMediaPreview(p), { initialProps: props() });
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.url).toBe("blob:test/1");
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test/1");
  });

  it("revokes and refetches when the campaign version changes, and never shows the old URL for the new key", async () => {
    let n = 0;
    URL.createObjectURL = vi.fn(() => `blob:test/${++n}`);
    global.fetch.mockResolvedValue(reply());
    const { result, rerender } = renderHook((p) => useMediaPreview(p), { initialProps: props() });
    await waitFor(() => expect(result.current.url).toBe("blob:test/1"));
    rerender(props({ campaign: campaign(4) }));
    expect(result.current.url).toBe("");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test/1");
    await waitFor(() => expect(result.current.url).toBe("blob:test/2"));
    expect(new URL(global.fetch.mock.calls.at(-1)[0]).searchParams.get("expected_campaign_version")).toBe("4");
  });

  it("drops a late result for a key the reviewer has left and creates no blob for it", async () => {
    const slow = deferred();
    global.fetch.mockReturnValueOnce(slow.promise).mockResolvedValue(reply());
    const { result, rerender } = renderHook((p) => useMediaPreview(p), { initialProps: props() });
    rerender(props({ campaign: campaign(7) }));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => { slow.resolve(reply()); await slow.promise; });
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("ready");
  });

  it("reports an error without a blob and retries on request", async () => {
    global.fetch.mockResolvedValueOnce(reply(503)).mockResolvedValue(reply());
    const { result } = renderHook((p) => useMediaPreview(p), { initialProps: props() });
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.code).toBe("unavailable");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("ready"));
  });

  it("does nothing when disabled", () => {
    const { result } = renderHook((p) => useMediaPreview(p), { initialProps: props({ enabled: false }) });
    expect(result.current.status).toBe("idle");
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
