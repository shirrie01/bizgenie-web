import { describe, expect, it, vi } from "vitest";
import { createPaidBetaLeadAdapter } from "../Founding100Panel";

describe("Founding 100 paid-beta adapter", () => {
  it("posts the contract payload with server-owned attribution", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "received", replay: false }),
    });
    vi.stubGlobal("crypto", { randomUUID: () => "submission-123" });
    const adapter = createPaidBetaLeadAdapter({ fetchImpl, apiBaseUrl: "https://api.example.test" });

    await expect(adapter.submit({
      name: "Ada Lovelace",
      work_email: "ada@example.com",
      business_name: "Analytical Engines",
      website_or_social_profile: "https://example.com",
      business_stage: "pre-revenue",
      primary_marketing_challenge: "Finding first customers",
    })).resolves.toEqual({ status: "received", replay: false });

    expect(fetchImpl).toHaveBeenCalledWith("https://api.example.test/public/paid-beta-interest", expect.objectContaining({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Ada Lovelace",
        work_email: "ada@example.com",
        business_name: "Analytical Engines",
        website_or_social_profile: "https://example.com",
        business_stage: "pre-revenue",
        primary_marketing_challenge: "Finding first customers",
        privacy_contact_consent: true,
        source: "founding-100-web",
        submission_id: "submission-123",
      }),
    }));
  });

  it("surfaces replay responses without treating them as failures", async () => {
    const adapter = createPaidBetaLeadAdapter({
      fetchImpl: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "received", replay: true }) }),
      apiBaseUrl: "https://api.example.test",
    });
    vi.stubGlobal("crypto", { randomUUID: () => "submission-456" });

    await expect(adapter.submit({ name: "A", work_email: "a@example.com", business_name: "B", website_or_social_profile: "https://b.example", business_stage: "under-250k", primary_marketing_challenge: "Need leads" }))
      .resolves.toMatchObject({ replay: true });
  });

  it("maps API failures to a safe error while preserving the provider code", async () => {
    const adapter = createPaidBetaLeadAdapter({
      fetchImpl: vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: { code: "RATE_LIMITED", message: "Please try again later." } }) }),
      apiBaseUrl: "https://api.example.test",
    });

    await expect(adapter.submit({})).rejects.toMatchObject({ message: "Please try again later.", code: "RATE_LIMITED" });
  });
});
