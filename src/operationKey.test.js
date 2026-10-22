import { describe, expect, it } from "vitest";
import { operationKey } from "./operationKey";

// The API's idempotency identifier: 1-128 characters, [A-Za-z0-9][A-Za-z0-9._:-]*  (bizgenie-api src/campaigns/schema.js)
const VALID = /^(?=.{1,128}$)[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const CAMPAIGN = { campaign_id: "36f7ee61-0e76-41d7-acb5-33c69ba24961" };
const VARIANT = { variant_id: "14f0ffb4-e081-420f-a38d-6ec9b41287a0" };
const REVISION = "dac5cc66-ad66-499c-98e3-0aa8957374fd";

describe("operationKey", () => {
  it("is a valid API idempotency key for real UUID scopes (the readable form was 145-160 characters)", async () => {
    for (const operation of ["preview-render", "preview-acknowledgement", "approval", "manual-publication", "manual-publication-confirm"]) {
      const readable = `campaign:${CAMPAIGN.campaign_id}:variant:${VARIANT.variant_id}:revision:${REVISION}:${operation}`;
      if (operation.startsWith("preview") || operation === "approval") expect(readable.length).toBeGreaterThan(128);
      const key = await operationKey(CAMPAIGN, VARIANT, REVISION, operation);
      expect(key).toMatch(VALID);
      expect(key.length).toBeLessThanOrEqual(128);
    }
  });

  it("is deterministic for a retry and unique per campaign, variant, revision and operation", async () => {
    const base = await operationKey(CAMPAIGN, VARIANT, REVISION, "approval");
    expect(await operationKey(CAMPAIGN, VARIANT, REVISION, "approval")).toBe(base);
    const others = await Promise.all([
      operationKey(CAMPAIGN, VARIANT, REVISION, "preview-render"),
      operationKey(CAMPAIGN, VARIANT, "eac5cc66-ad66-499c-98e3-0aa8957374fd", "approval"),
      operationKey(CAMPAIGN, { variant_id: "24f0ffb4-e081-420f-a38d-6ec9b41287a0" }, REVISION, "approval"),
      operationKey({ campaign_id: "46f7ee61-0e76-41d7-acb5-33c69ba24961" }, VARIANT, REVISION, "approval"),
    ]);
    expect(new Set([base, ...others]).size).toBe(5);
  });

  it("names the operation so a reader of the key can tell what it was for", async () => {
    expect(await operationKey(CAMPAIGN, VARIANT, REVISION, "approval")).toMatch(/^op:approval:[0-9a-f]{64}$/);
  });
});
