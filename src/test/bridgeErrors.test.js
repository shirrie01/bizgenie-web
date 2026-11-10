// @vitest-environment node
import { describe, it, expect } from "vitest";
import { BRIDGE_REFUSALS, bridgeRefusal, responseCode } from "../bridgeErrors.js";
import { requestGenerationQuote, confirmGenerationQuote } from "../premium/generationQuoteClient.js";
import { renameCampaign } from "../premium/campaignManagementClient.js";
import { fetchWorkspaces } from "../premium/workspaceClient.js";

const U = "11111111-1111-4111-8111-111111111111";
const reply = (status, code) => async () => new Response(JSON.stringify({ error: { code, message: "Studio API request is unavailable" } }), { status, headers: { "content-type": "application/json" } });
const base = { apiBaseUrl: "https://bridge.example.test", accessToken: "t" };
const INFRA = /cloud run|iam token|invoker|serverless|proxy|cors/i;

describe("trusted staging bridge refusals have customer wording (BG-017C-05B; codes from API PR #229 src/studio-bridge/service.js)", () => {
  it("every bridge code has plain wording with no infrastructure detail", () => {
    for (const [code, e] of Object.entries(BRIDGE_REFUSALS)) { expect(e.text, code).not.toMatch(INFRA); expect(e.text.length).toBeGreaterThan(20); }
    expect(bridgeRefusal("STAGING_WRITES_DISABLED").kind).toBe("readonly"); expect(bridgeRefusal("NOPE")).toBeNull(); expect(bridgeRefusal(undefined)).toBeNull(); expect(bridgeRefusal("toString")).toBeNull();
  });
  it("a read-only test environment is not described as a permission problem when a workspace is looked up", async () => {
    await expect(fetchWorkspaces({ ...base, fetchImpl: reply(403, "STAGING_WRITES_DISABLED") })).rejects.toMatchObject({ code: "STAGING_WRITES_DISABLED", message: expect.stringMatching(/switched off in this test environment.*nothing was saved/i) });
    await expect(fetchWorkspaces({ ...base, fetchImpl: reply(502, "PRIVATE_API_UNAVAILABLE") })).rejects.toMatchObject({ message: expect.stringMatching(/temporarily unavailable/i), unavailable: true });
  });
  it("a disabled paid confirmation says nothing was started or charged", async () => {
    const quote = { quoteId: "q1", binding: true, sufficient: true, authorisedCredits: 5 };
    await expect(confirmGenerationQuote({ ...base, quote, key: "c:abc", fetchImpl: reply(403, "GENERATION_CONFIRMATION_DISABLED") })).rejects.toMatchObject({ code: "GENERATION_CONFIRMATION_DISABLED", message: expect.stringMatching(/nothing was started and nothing was charged/i) });
  });
  it("campaign edits refused by the test environment do not claim the campaign was removed", async () => {
    const campaign = { campaign_id: U, version: 2, display_timezone: "Europe/London" };
    await expect(renameCampaign({ ...base, scope: { tenantId: U, projectId: U }, campaign, name: "New name", fetchImpl: reply(403, "STAGING_WRITES_DISABLED") })).rejects.toMatchObject({ message: expect.not.stringMatching(/not available to you any more|removed/i) });
    await expect(renameCampaign({ ...base, scope: { tenantId: U, projectId: U }, campaign, name: "New name", fetchImpl: reply(403, "STAGING_WRITES_DISABLED") })).rejects.toMatchObject({ message: expect.stringMatching(/switched off in this test environment/i) });
  });
  it("responseCode reads the standard error code and never throws", async () => {
    expect(await responseCode(new Response(JSON.stringify({ error: { code: "X_Y" } })))).toBe("X_Y"); expect(await responseCode(new Response("<html>"))).toBe(""); expect(await responseCode(new Response(""))).toBe("");
  });
});
