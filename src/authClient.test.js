import { beforeEach, describe, expect, it, vi } from "vitest";

// "Sign out" / "Sign in again" must always end this device's session (BG-LAUNCH-011). The failure that motivated this: supabase-js 2.119.0 keeps the session when the server refuses the
// revoke request of a default (global) sign-out, so the customer stayed on a page whose "Sign in again" did nothing.
const auth = { signOut: vi.fn() };
let client = { auth };
vi.mock("./supabaseClient", () => ({ getSupabaseClient: () => client }));
import { signOut } from "./authClient";

beforeEach(() => { auth.signOut.mockReset(); client = { auth }; });

describe("signOut", () => {
  it("removes this device's session without depending on the network: scope local", async () => {
    auth.signOut.mockResolvedValue({ error: null });
    await signOut();
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it("never traps the customer when the server refuses or the call throws: it resolves, with no error shown", async () => {
    auth.signOut.mockResolvedValueOnce({ error: { status: 400, message: "invalid_grant" } });
    await expect(signOut()).resolves.toBeUndefined();
    auth.signOut.mockRejectedValueOnce(new Error("network down"));
    await expect(signOut()).resolves.toBeUndefined();
  });
  it("does nothing when sign-in is not configured", async () => {
    client = null;
    await expect(signOut()).resolves.toBeUndefined();
    expect(auth.signOut).not.toHaveBeenCalled();
  });
});
