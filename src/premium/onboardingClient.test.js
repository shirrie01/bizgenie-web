// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { CONTRACT_VERSION, OnboardingError, createSaveKeeper, fetchOnboarding, parseOnboardingResponse, putOnboarding } from "./onboardingClient";

// The mock shapes below are the workspace-onboarding.v1 responses documented in API draft PR #213 (head d0e1142).
// They are NOT staging evidence.
const DOC = { contract_version: CONTRACT_VERSION, tenant_id: "t", project_id: "p", brand_id: "b", version: 1, status: "in_progress", sector: { key: "perfume", source: "customer" }, industry_text: null, channels: { values: ["email"], source: "customer" }, current_step: 2, draft: {}, completeness: { sector: true, channels: true, ready_to_complete: true, missing: [] }, completed_at: null, updated_at: "2026-10-23T10:00:00.000Z" };
const reply = (status, body) => vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }));
const BASE = { apiBaseUrl: "https://api.test", accessToken: "tok" };

describe("parseOnboardingResponse", () => {
  it("accepts the documented shape and reads the placeholder flag and replay marker", () => {
    expect(parseOnboardingResponse({ status: "saved", replayed: true, brand_name_placeholder: true, onboarding: DOC })).toMatchObject({ brandNamePlaceholder: true, replayed: true, onboarding: { version: 1 } });
    expect(parseOnboardingResponse({ status: "ready", onboarding: DOC }).brandNamePlaceholder).toBeNull(); // unknown stays unknown
  });
  it("rejects anything else rather than guessing", () => {
    for (const bad of [null, {}, { onboarding: null }, { onboarding: { ...DOC, contract_version: "workspace-onboarding.v2" } }, { onboarding: { ...DOC, version: "1" } }, { onboarding: { ...DOC, version: -1 } }, { onboarding: { ...DOC, status: "done" } }, { onboarding: { ...DOC, channels: {} } }, { onboarding: { ...DOC, sector: undefined } }]) {
      expect(() => parseOnboardingResponse(bad)).toThrow(OnboardingError);
    }
  });
});

describe("requests", () => {
  it("GET sends the bearer token only: no scope, no body, no token in the URL", async () => {
    const fetchImpl = reply(200, { status: "ready", onboarding: DOC });
    await fetchOnboarding({ ...BASE, fetchImpl });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.test/customer/workspace/onboarding");
    expect(options).toEqual({ method: "GET", headers: { authorization: "Bearer tok" } });
  });
  it("PUT sends JSON with the bearer header", async () => {
    const fetchImpl = reply(200, { status: "saved", replayed: false, onboarding: DOC });
    await putOnboarding({ ...BASE, body: { expected_version: 0, idempotency_key: "k1", channels: ["email"] }, fetchImpl });
    const [, options] = fetchImpl.mock.calls[0];
    expect(options.method).toBe("PUT");
    expect(options.headers).toEqual({ "content-type": "application/json", authorization: "Bearer tok" });
    expect(JSON.parse(options.body)).toEqual({ expected_version: 0, idempotency_key: "k1", channels: ["email"] });
  });
});

describe("error mapping tells the truth about what was saved", () => {
  const put = (status, body) => putOnboarding({ ...BASE, body: {}, fetchImpl: reply(status, body) }).catch((e) => e);
  const get = (status, body) => fetchOnboarding({ ...BASE, fetchImpl: reply(status, body) }).catch((e) => e);

  it("401 / 403", async () => {
    expect(await put(401, { error: { code: "AUTHENTICATION_REQUIRED" } })).toMatchObject({ code: "AUTHENTICATION_REQUIRED", message: expect.stringMatching(/nothing was saved/i) });
    expect(await put(403, { error: { code: "WORKSPACE_NOT_AUTHORIZED" } })).toMatchObject({ code: "WORKSPACE_NOT_AUTHORIZED", message: expect.stringMatching(/nothing was saved/i) });
  });
  it("409 version conflict carries the current version and promises nothing was overwritten", async () => {
    const e = await put(409, { error: { code: "VERSION_CONFLICT", details: { current_version: 7 } } });
    expect(e).toMatchObject({ code: "VERSION_CONFLICT", currentVersion: 7 });
    expect(e.message).toMatch(/nothing was overwritten/i);
  });
  it("409 idempotency conflict asks for a new request", async () => {
    expect(await put(409, { error: { code: "IDEMPOTENCY_KEY_CONFLICT" } })).toMatchObject({ code: "IDEMPOTENCY_KEY_CONFLICT" });
  });
  it("422 incomplete names what is missing in plain words", async () => {
    const e = await put(422, { error: { code: "ONBOARDING_INCOMPLETE", details: [{ path: "sector_key" }, { path: "channels" }] } });
    expect(e.message).toMatch(/choose a sector and choose at least one channel/i);
  });
  it("400 validation shows the first reason and says nothing was saved", async () => {
    const e = await put(400, { error: { code: "ONBOARDING_VALIDATION_ERROR", details: [{ path: "draft.goal", message: "Too big" }] } });
    expect(e.message).toMatch(/draft\.goal: Too big/);
    expect(e.message).toMatch(/nothing was saved/i);
  });
  it("503 and 404 mean unavailable and NOT saved (an API without the routes or table behaves the same)", async () => {
    for (const status of [503, 404]) {
      const e = await put(status, status === 503 ? { error: { code: "ONBOARDING_UNAVAILABLE" } } : {});
      expect(e).toMatchObject({ code: "ONBOARDING_UNAVAILABLE", outcome: "not_saved" });
      expect(e.message).toMatch(/NOT saved/);
    }
    expect((await get(503, { error: { code: "ONBOARDING_UNAVAILABLE" } })).code).toBe("ONBOARDING_UNAVAILABLE");
  });
  it("a dropped connection on a write is an UNKNOWN outcome, on a read it is not", async () => {
    const boom = vi.fn(async () => { throw new TypeError("network"); });
    const w = await putOnboarding({ ...BASE, body: {}, fetchImpl: boom }).catch((e) => e);
    expect(w).toMatchObject({ code: "NETWORK", outcome: "unknown" });
    expect(w.message).toMatch(/may or may not have been saved/i);
    expect(w.message).toMatch(/safe/i);
    const r = await fetchOnboarding({ ...BASE, fetchImpl: boom }).catch((e) => e);
    expect(r).toMatchObject({ code: "NETWORK", outcome: "not_saved" });
  });
  it("a non-JSON error body still yields a safe message", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 502, json: async () => { throw new Error("html"); } }));
    expect((await putOnboarding({ ...BASE, body: {}, fetchImpl }).catch((e) => e)).message).toMatch(/error 502.*nothing was saved/i);
  });
});

describe("save keeper (idempotency)", () => {
  it("reuses a key for an identical payload, mints a new one for a different payload, and forgets on success", () => {
    const keeper = createSaveKeeper();
    const a = keeper.keyFor({ expected_version: 1, channels: ["email"] });
    expect(keeper.keyFor({ expected_version: 1, channels: ["email"] })).toBe(a);
    const b = keeper.keyFor({ expected_version: 1, channels: ["email", "tiktok"] });
    expect(b).not.toBe(a);
    expect(keeper.keyFor({ expected_version: 2, channels: ["email", "tiktok"] })).not.toBe(b); // a new version is a new request
    keeper.clear();
    expect(keeper.keyFor({ expected_version: 2, channels: ["email", "tiktok"] })).not.toBe(b);
  });
  it("produces keys the API accepts: 1-128 chars of [A-Za-z0-9._:-], starting alphanumeric", () => {
    const keeper = createSaveKeeper();
    for (let i = 0; i < 50; i += 1) expect(keeper.keyFor({ i })).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
  });
});
