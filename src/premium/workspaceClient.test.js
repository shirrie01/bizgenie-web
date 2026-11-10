// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { WorkspaceError, fetchWorkspaces, normaliseWorkspace, sameWorkspace, selectWorkspace } from "./workspaceClient";

// Response shapes follow bizgenie-api's existing /customer/workspace routes. MOCKED, not staging evidence.
const WS = (n, over = {}) => ({ tenant_id: `t${n}`, tenant_name: `Tenant ${n}`, project_id: `p${n}`, project_name: `Project ${n}`, brand_id: `b${n}`, brand_name: `Brand ${n}`, brand_status: "approved", membership_role: "owner", ...over });
const reply = (status, body) => vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }));
const BASE = { apiBaseUrl: "https://api.test", accessToken: "tok" };

describe("fetchWorkspaces", () => {
  it("sends the identity token only and reads the three documented states", async () => {
    const f = reply(200, { status: "selection_required", workspace: null, workspaces: [WS(1), WS(2)] });
    const r = await fetchWorkspaces({ ...BASE, fetchImpl: f });
    expect(f.mock.calls[0][0]).toBe("https://api.test/customer/workspace");
    expect(f.mock.calls[0][1]).toEqual({ method: "GET", headers: { authorization: "Bearer tok" } });
    expect(r.status).toBe("selection_required");
    expect(r.workspaces.map((w) => w.brand_id)).toEqual(["b1", "b2"]);
    expect((await fetchWorkspaces({ ...BASE, fetchImpl: reply(200, { status: "missing_workspace", workspace: null }) }))).toEqual({ status: "missing_workspace", workspace: null, workspaces: [] });
    const one = await fetchWorkspaces({ ...BASE, fetchImpl: reply(200, { status: "ready", workspace: WS(1) }) });
    expect(one.workspaces).toHaveLength(1);
  });
  it("rejects shapes it does not recognise rather than guessing a list", async () => {
    for (const bad of [null, {}, { status: "selection_required", workspaces: [] }, { status: "selection_required", workspaces: [WS(1)] }, { status: "selection_required", workspaces: [WS(1), { tenant_id: "x" }] }, { status: "ready", workspace: { brand_id: "b" } }, { status: "weird" }]) {
      await expect(fetchWorkspaces({ ...BASE, fetchImpl: reply(200, bad) })).rejects.toMatchObject({ code: "WORKSPACE_BAD_RESPONSE" });
    }
  });
  it("maps failures to plain messages", async () => {
    await expect(fetchWorkspaces({ ...BASE, fetchImpl: reply(401, {}) })).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
    await expect(fetchWorkspaces({ ...BASE, fetchImpl: reply(503, {}) })).rejects.toMatchObject({ status: 503 });
    await expect(fetchWorkspaces({ ...BASE, fetchImpl: vi.fn(async () => { throw new TypeError("x"); }) })).rejects.toMatchObject({ code: "NETWORK" });
  });
});

describe("selectWorkspace", () => {
  const W = normaliseWorkspace(WS(2));
  it("posts exactly the three ids the customer chose, with the identity token", async () => {
    const f = reply(200, { status: "ready", workspace: WS(2), requires_session_refresh: true });
    const r = await selectWorkspace({ ...BASE, workspace: W, fetchImpl: f });
    const [url, options] = f.mock.calls[0];
    expect(url).toBe("https://api.test/customer/workspace/select");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({ tenant_id: "t2", project_id: "p2", brand_id: "b2" });
    expect(options.headers.authorization).toBe("Bearer tok");
    expect(r.requiresSessionRefresh).toBe(true);
    expect((await selectWorkspace({ ...BASE, workspace: W, fetchImpl: reply(200, { status: "ready", workspace: WS(2) }) })).requiresSessionRefresh).toBe(false);
  });
  it("does not trust a confirmation for a different workspace", async () => {
    await expect(selectWorkspace({ ...BASE, workspace: W, fetchImpl: reply(200, { status: "ready", workspace: WS(1) }) })).rejects.toMatchObject({ code: "WORKSPACE_BAD_RESPONSE" });
    await expect(selectWorkspace({ ...BASE, workspace: W, fetchImpl: reply(200, { status: "ready" }) })).rejects.toMatchObject({ code: "WORKSPACE_BAD_RESPONSE" });
    await expect(selectWorkspace({ ...BASE, workspace: W, fetchImpl: reply(200, { status: "selection_required", workspaces: [] }) })).rejects.toBeInstanceOf(WorkspaceError);
  });
  it("treats 400 as 'no longer available' (refresh the list), 401 and 503 as nothing changed", async () => {
    const e400 = await selectWorkspace({ ...BASE, workspace: W, fetchImpl: reply(400, { error: { code: "WORKSPACE_VALIDATION_ERROR" } }) }).catch((e) => e);
    expect(e400).toMatchObject({ code: "WORKSPACE_UNAVAILABLE", unavailable: true });
    expect(e400.message).toMatch(/nothing was changed/i);
    expect(await selectWorkspace({ ...BASE, workspace: W, fetchImpl: reply(401, {}) }).catch((e) => e)).toMatchObject({ code: "AUTHENTICATION_REQUIRED", unavailable: false });
    expect((await selectWorkspace({ ...BASE, workspace: W, fetchImpl: reply(503, {}) }).catch((e) => e)).message).toMatch(/nothing was changed/i);
  });
});

describe("helpers", () => {
  it("compares workspaces by all three ids and normalises missing names", () => {
    expect(sameWorkspace(WS(1), WS(1, { brand_name: "x" }))).toBe(true);
    expect(sameWorkspace(WS(1), WS(2))).toBe(false);
    expect(sameWorkspace(WS(1), { ...WS(1), project_id: "other" })).toBe(false);
    expect(sameWorkspace(null, WS(1))).toBe(false);
    expect(normaliseWorkspace({ tenant_id: "t", project_id: "p", brand_id: "b" })).toMatchObject({ brand_name: "", brand_status: "", membership_role: "" });
  });
});
