import { describe, expect, it, vi, beforeEach } from "vitest";

const getSessionMock = vi.fn();

vi.mock("../supabaseClient", () => ({
  isSupabaseConfigured: vi.fn(() => true),
  getSupabaseClient: vi.fn(() => ({
    auth: { getSession: getSessionMock },
  })),
}));

// Imported after the mock so the module under test picks up the mocked client.
const { getCustomerSession } = await import("../session");
const { isSupabaseConfigured } = await import("../supabaseClient");

beforeEach(() => {
  getSessionMock.mockReset();
  isSupabaseConfigured.mockReturnValue(true);
});

describe("getCustomerSession", () => {
  it("reports unconfigured when Supabase env vars are missing", async () => {
    isSupabaseConfigured.mockReturnValue(false);
    const result = await getCustomerSession();
    expect(result).toEqual({ status: "unconfigured" });
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it("reports signed-out when there is no Supabase session", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null }, error: null });
    const result = await getCustomerSession();
    expect(result).toEqual({ status: "signed-out" });
  });

  it("reports scope-missing when app_metadata lacks tenant/project/brand", async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: "token-abc", user: { app_metadata: {}, user_metadata: {} } } },
      error: null,
    });
    const result = await getCustomerSession();
    expect(result.status).toBe("scope-missing");
    expect(result.accessToken).toBe("token-abc");
  });

  it("ignores tenant/project/brand values placed in user-editable user_metadata", async () => {
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: "token-abc",
          user: {
            app_metadata: {},
            // A user can edit their own user_metadata client-side; scope must
            // never be sourced from here even if the shape looks right.
            user_metadata: { tenant_id: "attacker-tenant", project_id: "x", brand_id: "y" },
          },
        },
      },
      error: null,
    });
    const result = await getCustomerSession();
    expect(result.status).toBe("scope-missing");
  });

  it("returns ready with scope sourced only from app_metadata", async () => {
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: "token-abc",
          user: { app_metadata: { tenant_id: "t1", project_id: "p1", brand_id: "b1" } },
        },
      },
      error: null,
    });
    const result = await getCustomerSession();
    expect(result).toEqual({
      status: "ready",
      accessToken: "token-abc",
      tenantId: "t1",
      projectId: "p1",
      brandId: "b1",
    });
  });
});
