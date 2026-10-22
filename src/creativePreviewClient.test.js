// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const refreshMock = vi.fn();
vi.mock("./session", () => ({ refreshCustomerSession: (...args) => refreshMock(...args) }));

import { CreativePreviewError, fetchCreativePreview } from "./creativePreviewClient";
import { useCreativePreview } from "./useCreativePreview";

const API = "http://api.test";
const session = { status: "ready", accessToken: "tok-1", tenantId: "tenant-1", projectId: "project-1" };
const campaign = (version = 3) => ({ campaign_id: "22222222-2222-4222-8222-222222222222", version });
const variant = (rev = "rev-1") => ({ variant_id: "44444444-4444-4444-8444-444444444440", current_revision_id: rev });
const preview = (over = {}) => ({ contract_version: "campaign-creative-preview.v1", campaign_version: 3, variant_id: variant().variant_id, revision_id: "rev-1", copy_status: "available", copy: { body: "Saved copy" }, media: [], ...over });
const res = (status, body = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

beforeEach(() => { refreshMock.mockReset(); global.fetch = vi.fn(); });
afterEach(() => vi.restoreAllMocks());

describe("fetchCreativePreview", () => {
  it("sends a scoped, versioned, read-only GET with the customer bearer token", async () => {
    global.fetch.mockResolvedValueOnce(res(200, { preview: preview() }));
    const result = await fetchCreativePreview({ apiBaseUrl: API, session, campaign: campaign(), variant: variant() });
    expect(result.copy.body).toBe("Saved copy");
    const [url, options] = global.fetch.mock.calls[0];
    const u = new URL(url);
    expect(u.pathname).toBe(`/customer/campaigns/${campaign().campaign_id}/variants/${variant().variant_id}/creative-preview`);
    expect(Object.fromEntries(u.searchParams)).toEqual({ tenant_id: "tenant-1", project_id: "project-1", revision_id: "rev-1", expected_campaign_version: "3" });
    expect(options.headers.authorization).toBe("Bearer tok-1");
    expect(options.method).toBeUndefined();
    expect(options.body).toBeUndefined();
  });

  it("refreshes the session once on 401 through the existing path and retries", async () => {
    refreshMock.mockResolvedValueOnce({ status: "ready", accessToken: "tok-2" });
    global.fetch.mockResolvedValueOnce(res(401)).mockResolvedValueOnce(res(200, { preview: preview() }));
    await fetchCreativePreview({ apiBaseUrl: API, session, campaign: campaign(), variant: variant() });
    expect(global.fetch.mock.calls[1][1].headers.authorization).toBe("Bearer tok-2");
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry forever or fall back to another credential when refresh fails or 401 repeats", async () => {
    refreshMock.mockResolvedValueOnce({ status: "signed-out" });
    global.fetch.mockResolvedValueOnce(res(401));
    await expect(fetchCreativePreview({ apiBaseUrl: API, session, campaign: campaign(), variant: variant() })).rejects.toMatchObject({ code: "auth" });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    refreshMock.mockResolvedValueOnce({ status: "ready", accessToken: "tok-2" });
    global.fetch.mockResolvedValueOnce(res(401)).mockResolvedValueOnce(res(401));
    await expect(fetchCreativePreview({ apiBaseUrl: API, session, campaign: campaign(), variant: variant() })).rejects.toMatchObject({ code: "auth" });
    expect(refreshMock).toHaveBeenCalledTimes(2);
  });

  it("treats a hung session refresh as an ended session instead of waiting forever", async () => {
    vi.useFakeTimers();
    try {
      refreshMock.mockReturnValueOnce(new Promise(() => {}));
      global.fetch.mockResolvedValueOnce(res(401));
      const pending = fetchCreativePreview({ apiBaseUrl: API, session, campaign: campaign(), variant: variant() }).catch((e) => e);
      await vi.advanceTimersByTimeAsync(8100);
      expect((await pending).code).toBe("auth");
      expect(global.fetch).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });

  it.each([[409, "stale"], [404, "missing"], [503, "unavailable"], [500, "unavailable"], [400, "failed"]])("maps HTTP %i to %s", async (status, code) => {
    global.fetch.mockResolvedValueOnce(res(status, { error: { code: "X" } }));
    const error = await fetchCreativePreview({ apiBaseUrl: API, session, campaign: campaign(), variant: variant() }).catch((e) => e);
    expect(error).toBeInstanceOf(CreativePreviewError);
    expect(error.code).toBe(code);
    expect(error.message).not.toMatch(/X|undefined/);
  });

  it("reports a network failure without leaking details", async () => {
    global.fetch.mockRejectedValueOnce(new TypeError("fetch failed: secret-host"));
    const error = await fetchCreativePreview({ apiBaseUrl: API, session, campaign: campaign(), variant: variant() }).catch((e) => e);
    expect(error.code).toBe("network");
    expect(error.message).not.toMatch(/secret-host/);
  });

  it("rejects content bound to a different revision, version, variant or contract", async () => {
    for (const over of [{ revision_id: "rev-2" }, { campaign_version: 4 }, { variant_id: "other" }]) {
      global.fetch.mockResolvedValueOnce(res(200, { preview: preview(over) }));
      await expect(fetchCreativePreview({ apiBaseUrl: API, session, campaign: campaign(), variant: variant() })).rejects.toMatchObject({ code: "stale" });
    }
    global.fetch.mockResolvedValueOnce(res(200, { preview: preview({ contract_version: "v0" }) }));
    await expect(fetchCreativePreview({ apiBaseUrl: API, session, campaign: campaign(), variant: variant() })).rejects.toMatchObject({ code: "failed" });
    global.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => { throw new Error("bad json"); } });
    await expect(fetchCreativePreview({ apiBaseUrl: API, session, campaign: campaign(), variant: variant() })).rejects.toMatchObject({ code: "failed" });
  });

  it("does not call the API when the revision or version is unknown", async () => {
    await expect(fetchCreativePreview({ apiBaseUrl: API, session, campaign: campaign(), variant: { variant_id: "v" } })).rejects.toMatchObject({ code: "failed" });
    await expect(fetchCreativePreview({ apiBaseUrl: API, session, campaign: { campaign_id: "c" }, variant: variant() })).rejects.toMatchObject({ code: "failed" });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("useCreativePreview", () => {
  const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

  it("discards a late response for a version the reviewer has already left", async () => {
    const slow = deferred();
    global.fetch
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce(res(200, { preview: preview({ campaign_version: 7, copy: { body: "Newer copy" } }) }));
    const { result, rerender } = renderHook((props) => useCreativePreview({ apiBaseUrl: API, session, ...props }), { initialProps: { campaign: campaign(3), variant: variant() } });
    expect(result.current.status).toBe("loading");
    rerender({ campaign: campaign(7), variant: variant() });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.preview.copy.body).toBe("Newer copy");
    await act(async () => { slow.resolve(res(200, { preview: preview({ copy: { body: "Older copy" } }) })); await slow.promise; });
    expect(result.current.preview.copy.body).toBe("Newer copy");
  });

  it("never shows content from a previous key while the next one loads, and can retry after a failure", async () => {
    global.fetch
      .mockResolvedValueOnce(res(200, { preview: preview() }))
      .mockResolvedValueOnce(res(503))
      .mockResolvedValueOnce(res(200, { preview: preview({ campaign_version: 4 }) }));
    const { result, rerender } = renderHook((props) => useCreativePreview({ apiBaseUrl: API, session, ...props }), { initialProps: { campaign: campaign(3), variant: variant() } });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    rerender({ campaign: campaign(4), variant: variant() });
    expect(result.current.preview).toBeNull();
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.code).toBe("unavailable");
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it("does not fetch when disabled", () => {
    const { result } = renderHook(() => useCreativePreview({ apiBaseUrl: API, session, campaign: campaign(), variant: variant(), enabled: false }));
    expect(result.current.status).toBe("idle");
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
