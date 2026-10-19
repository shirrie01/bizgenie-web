import { describe, it, expect, vi, afterEach } from "vitest";
import { readCustomerBillingState } from "./billingClient";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("customer subscription lookup", () => {
  it("sends the authenticated tenant selector", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "not_subscribed",
        subscription: null,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await readCustomerBillingState({
      accessToken: "test-token",
      tenantId: "tenant with spaces",
    });

    const [url, options] = fetchMock.mock.calls[0];

    expect(new URL(url).searchParams.get("tenant_id"))
      .toBe("tenant with spaces");
    expect(new Headers(options.headers).get("authorization"))
      .toBe("Bearer test-token");
  });

  it("fails closed on HTTP 404 instead of claiming no subscription", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        status: "failed",
        error: { code: "RESOURCE_NOT_AVAILABLE" },
      }),
    }));

    await expect(readCustomerBillingState({
      accessToken: "test-token",
      tenantId: "test-tenant",
    })).rejects.toThrow(/Billing access could not be verified/);
  });
});
