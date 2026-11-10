import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { NOT_CARRIED, limitedNotice, routeLimited } from "../bridgeLimits";
import { startStandardCheckout } from "../billingClient";
import BillingPanel from "../BillingPanel";
import { readFileSync } from "node:fs";

afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("features the trusted staging bridge does not carry say so, and call nothing (BG-017C-05B)", () => {
  it("only a build marked bridge-v1 is limited, and only for the two features with live UI", () => {
    expect(routeLimited("checkout", {})).toBe(false); expect(routeLimited("checkout", { VITE_API_ROUTE_LIMITS: "" })).toBe(false); expect(routeLimited("checkout", { VITE_API_ROUTE_LIMITS: "bridge-v1" })).toBe(true);
    expect(routeLimited("manualPublication", { VITE_API_ROUTE_LIMITS: "bridge-v1" })).toBe(true); expect(routeLimited("workspace", { VITE_API_ROUTE_LIMITS: "bridge-v1" })).toBe(false); expect(routeLimited("toString", { VITE_API_ROUTE_LIMITS: "bridge-v1" })).toBe(false);
    for (const [k, t] of Object.entries(NOT_CARRIED)) { expect(limitedNotice(k)).toBe(t); expect(t).toMatch(/test environment/); expect(t).not.toMatch(/cloud run|iam|bridge|proxy|cors/i); }
    expect(limitedNotice("nope")).toBe("");
  });
  it("starting checkout in a limited build sends no request and says nothing was charged", async () => {
    vi.stubEnv("VITE_API_ROUTE_LIMITS", "bridge-v1"); const f = vi.fn(); vi.stubGlobal("fetch", f);
    await expect(startStandardCheckout({ accessToken: "t", tenantId: "x" })).rejects.toMatchObject({ kind: "not_available_here", message: expect.stringMatching(/nothing can be charged/i) });
    expect(f).not.toHaveBeenCalled(); vi.unstubAllGlobals();
  });
  it("in a normal build checkout still calls the API exactly as before", async () => {
    vi.stubEnv("VITE_API_ROUTE_LIMITS", ""); const f = vi.fn(async () => new Response(JSON.stringify({ url: "https://checkout.stripe.com/c/pay/x", checkout_session_id: "cs_1" }), { status: 200 })); vi.stubGlobal("fetch", f);
    const r = await startStandardCheckout({ accessToken: "t", tenantId: "x" }); expect(f).toHaveBeenCalledTimes(1); expect(String(f.mock.calls[0][0])).toMatch(/\/billing\/stripe\/checkout$/); expect(r.checkoutSessionId).toBe("cs_1"); vi.unstubAllGlobals();
  });
  it("the billing panel in a limited build shows the notice instead of a checkout button", async () => {
    vi.stubEnv("VITE_API_ROUTE_LIMITS", "bridge-v1");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: "not_subscribed", subscription: null, available_credits: 0 }), { status: 200 })));
    render(<BillingPanel session={{ status: "ready", accessToken: "t", tenantId: "t1", projectId: "p1", brandId: "b1" }} pathname="/" />);
    expect(await screen.findByRole("note")).toHaveTextContent(/subscribing isn.t available in this test environment/i);
    await waitFor(() => expect(screen.queryByRole("button", { name: /secure checkout/i })).toBeNull()); vi.unstubAllGlobals();
  });
  it("the manual-publication panel is wrapped in the same limit in the Studio source", () => {
    const app = readFileSync("src/App.jsx", "utf8"); expect(app).toMatch(/routeLimited\("manualPublication"\) \? <p className="ps-hint" role="note">\{limitedNotice\("manualPublication"\)\}<\/p> : <Lazy><ManualPublicationPanel/);
  });
});
