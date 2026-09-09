import { describe, expect, it } from "vitest";
import { createLocalLeadAdapter } from "../Founding100Panel";

describe("Founding 100 preview adapter", () => {
  it("never persists and returns preview-only for a first email", async () => {
    const adapter = createLocalLeadAdapter();
    await expect(adapter.submit({ email: "Test@example.com", consent_at: new Date().toISOString(), source: "test" }))
      .resolves.toEqual({ status: "preview-only" });
  });

  it("returns duplicate for the same email within the preview session", async () => {
    const adapter = createLocalLeadAdapter();
    await adapter.submit({ email: "duplicate@example.com" });
    await expect(adapter.submit({ email: "DUPLICATE@example.com" }))
      .resolves.toEqual({ status: "duplicate" });
  });
});
