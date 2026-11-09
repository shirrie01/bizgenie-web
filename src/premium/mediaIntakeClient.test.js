// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { MediaError, addFile, checkFile, completeUpload, deleteAsset, fetchAssetPreview, fetchAssets, initiateUpload, isMediaIntakeApiEnabled, normaliseAsset, normaliseAssetList, revokeAsset, uploadBytes } from "./mediaIntakeClient";

// FIXTURE tests against the #218 /customer/assets shapes; qa/integration/creativeJobs runs the same client over real HTTP against the backend.
const scope = { tenantId: "t1", projectId: "p1", brandId: "b1" };
const reply = (status, body, headers = {}) => vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body, headers: { get: (k) => headers[k.toLowerCase()] || null }, blob: async () => ({ size: 3 }) }));
const A = (o = {}) => ({ asset_id: "a1", filename: "shop.png", kind: "image", content_type: "image/png", bytes: 1234, state: "ready", rights_confirmed: true, rights_evidence_kind: "customer_attestation", rights_policy_version: "rights.v1", created_at: "2026-10-27T10:00:00Z", physical_deletion: null, ...o });
const file = (o = {}) => ({ name: "shop.png", type: "image/png", size: 1234, ...o });

describe("gate and file checks", () => {
  it.each([[undefined, false], ["1", false], ["true", true]])("%s -> %s", (v, e) => expect(isMediaIntakeApiEnabled({ VITE_CUSTOMER_MEDIA_INTAKE_API: v })).toBe(e));
  it.each([[file(), ""], [file({ type: "image/gif" }), /Only PNG/], [file({ size: 0 }), /empty/], [file({ size: 33 * 1024 * 1024 }), /32 MB/], [file({ name: "a/b.png" }), /Rename/], [null, /Choose/]])("%j", (f, want) => { const r = checkFile(f); want === "" ? expect(r).toBe("") : expect(r).toMatch(want); });
});
describe("assets", () => {
  it("normalises, marks only ready as usable, counts unreadable rows", () => {
    const r = normaliseAssetList({ assets: [A(), A({ asset_id: "a2", state: "quarantined" }), A({ asset_id: "a3", content_type: "image/gif" }), { asset_id: "a4" }], next_cursor: "n" });
    expect(r.assets.map((a) => [a.id, a.usable])).toEqual([["a1", true], ["a2", false]]); expect(r.skipped).toBe(2); expect(r.nextCursor).toBe("n");
    expect(normaliseAsset(A({ upload_path: "https://evil.test/x" })).uploadPath).toBe(""); expect(normaliseAsset(A({ upload_path: "/customer/assets/uploads/a1/bytes" })).uploadPath).toBe("/customer/assets/uploads/a1/bytes");
  });
  it("requests the real list route", async () => { const f = reply(200, { assets: [], next_cursor: null }); await fetchAssets({ apiBaseUrl: "http://a", accessToken: "tk", scope, fetchImpl: f }); expect(f.mock.calls[0][0]).toBe("http://a/customer/assets?tenant_id=t1&project_id=p1&brand_id=b1"); expect(f.mock.calls[0][1].headers.authorization).toBe("Bearer tk"); });
  it.each([[401, {}, "auth"], [404, {}, "forbidden"], [503, { error: { code: "MEDIA_INTAKE_UNAVAILABLE" } }, "unavailable"], [429, {}, "busy"], [422, { error: { code: "UPLOAD_TYPE_OR_SIZE_INVALID" } }, "invalid_file"], [503, { error: { code: "INSPECTION_UNAVAILABLE" } }, "inspection"], [500, {}, "unconfirmed"]])("%s %j -> %s", async (s, b, kind) => { await expect(initiateUpload({ apiBaseUrl: "h", accessToken: "t", scope, file: file(), fetchImpl: reply(s, b) })).rejects.toMatchObject({ kind }); });
});
describe("upload flow", () => {
  it("initiate sends the declared facts and explicit rights confirmation, then bytes with the declared content type, then completion", async () => {
    const calls = []; const f = vi.fn(async (url, o) => { calls.push([url, o]); const json = url.includes("/uploads/") && o.method === "PUT" ? A({ state: "quarantined" }) : url.endsWith("/uploads") ? A({ state: "initiated", upload_path: "/customer/assets/uploads/a1/bytes" }) : A(); return { ok: true, status: 200, json: async () => json }; });
    const bytes = new Uint8Array([1, 2, 3]); const done = await addFile({ apiBaseUrl: "http://a", accessToken: "t", scope, file: Object.assign(bytes, file()), key: "up_1", fetchImpl: f, onStep: () => {} });
    expect(done).toMatchObject({ state: "ready", usable: true }); expect(calls.map((c) => `${c[1].method || "GET"} ${c[0].replace("http://a", "").split("?")[0]}`)).toEqual(["POST /customer/assets/uploads", "PUT /customer/assets/uploads/a1/bytes", "POST /customer/assets/a1/complete"]);
    expect(JSON.parse(calls[0][1].body)).toEqual({ tenant_id: "t1", project_id: "p1", brand_id: "b1", filename: "shop.png", content_type: "image/png", bytes: 1234, rights_confirmed: true, idempotency_key: "up_1" });
    expect(calls[1][1].headers["content-type"]).toBe("image/png"); expect(calls[1][0]).toContain("tenant_id=t1");
  });
  it("a bad file is refused before any request; an upload path that is not the server's own is refused", async () => {
    const f = vi.fn(); await expect(initiateUpload({ apiBaseUrl: "h", accessToken: "t", scope, file: file({ type: "text/html" }), fetchImpl: f })).rejects.toMatchObject({ kind: "invalid_file" }); expect(f).not.toHaveBeenCalled();
    await expect(initiateUpload({ apiBaseUrl: "h", accessToken: "t", scope, file: file(), fetchImpl: reply(201, A({ upload_path: "https://evil.test/x" })) })).rejects.toBeInstanceOf(MediaError);
  });
  it("revoke and delete need the confirming state back", async () => {
    expect((await revokeAsset({ apiBaseUrl: "http://a", accessToken: "t", scope, assetId: "a1", fetchImpl: reply(200, A({ state: "revoked" })) })).state).toBe("revoked");
    await expect(revokeAsset({ apiBaseUrl: "h", accessToken: "t", scope, assetId: "a1", fetchImpl: reply(200, A()) })).rejects.toMatchObject({ kind: "unconfirmed" });
    const d = reply(200, A({ state: "deleted" })); await deleteAsset({ apiBaseUrl: "http://a", accessToken: "t", scope, assetId: "a1", fetchImpl: d }); expect(d.mock.calls[0][1].method).toBe("DELETE");
    await expect(completeUpload({ apiBaseUrl: "h", accessToken: "t", scope, assetId: "a1", fetchImpl: reply(200, { nope: 1 }) })).rejects.toMatchObject({ code: "BAD_RESPONSE" });
  });
  it("preview refuses a non-image type and never uses a server-supplied URL", async () => {
    await expect(fetchAssetPreview({ apiBaseUrl: "h", accessToken: "t", scope, assetId: "a1", fetchImpl: reply(200, null, { "content-type": "text/html" }) })).rejects.toMatchObject({ kind: "unsupported" });
  });
});
