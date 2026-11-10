// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { fetchMembershipRole, isReadOnlyRole, roleLabel } from "./membershipClient";

// Shapes follow bizgenie-api's existing GET /customer/workspace. MOCKED, not staging evidence.
const WS = (n, role = "owner") => ({ tenant_id: `t${n}`, project_id: `p${n}`, brand_id: `b${n}`, tenant_name: "T", project_name: "P", brand_name: "B", brand_status: "approved", membership_role: role });
const reply = (status, body) => vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }));
const BASE = { apiBaseUrl: "https://api.test", accessToken: "tok", scope: { tenantId: "t2", projectId: "p2", brandId: "b2" } };

describe("fetchMembershipRole", () => {
  it("reads the role for the signed-in workspace only, from the list, with the bearer token", async () => {
    const f = reply(200, { status: "selection_required", workspaces: [WS(1, "owner"), WS(2, "member")] });
    expect(await fetchMembershipRole({ ...BASE, fetchImpl: f })).toEqual({ role: "member", listed: true });
    expect(f.mock.calls[0][0]).toBe("https://api.test/customer/workspace");
    expect(f.mock.calls[0][1].headers.authorization).toBe("Bearer tok");
    expect(await fetchMembershipRole({ ...BASE, fetchImpl: reply(200, { status: "ready", workspace: WS(2, "owner") }) })).toEqual({ role: "owner", listed: true });
  });
  it("is unknown, never guessed, when the workspace is not listed or the list cannot be read", async () => {
    for (const f of [reply(200, { status: "ready", workspace: WS(9) }), reply(200, { status: "missing_workspace" }), reply(200, { status: "ready", workspace: { ...WS(2), membership_role: "" } }), reply(503, {}), reply(200, null), vi.fn(async () => { throw new TypeError("x"); }), vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new Error("html"); } }))]) {
      const r = await fetchMembershipRole({ ...BASE, fetchImpl: f });
      expect(r.role).toBeNull();
    }
  });
});

describe("role helpers", () => {
  it("only a KNOWN non-owner role is read-only; unknown leaves the decision to the server", () => {
    expect(isReadOnlyRole("member")).toBe(true);
    expect(isReadOnlyRole("viewer")).toBe(true);
    expect(isReadOnlyRole("owner")).toBe(false);
    expect(isReadOnlyRole(null)).toBe(false);
    expect(isReadOnlyRole("")).toBe(false);
    expect(roleLabel("member")).toBe("Member");
    expect(roleLabel(null)).toBe("");
  });
});
