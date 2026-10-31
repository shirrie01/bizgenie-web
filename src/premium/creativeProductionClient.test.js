import { describe, expect, it } from "vitest";
import { ATTACH_BLOCKER, HYBRID_BLOCKER, VIDEO_QUALITIES, executionClassFor, isCustomerMediaApiEnabled } from "./creativeProductionClient";

describe("customer media gate (needs the quote gate too)", () => {
  it.each([
    [{}, false], [{ VITE_CUSTOMER_MEDIA_API: "true" }, false], [{ VITE_GENERATION_QUOTE_API: "true" }, false], [{ VITE_CUSTOMER_MEDIA_API: "true", VITE_GENERATION_QUOTE_API: "true" }, true], [{ VITE_CUSTOMER_MEDIA_API: "1", VITE_GENERATION_QUOTE_API: "true" }, false],
  ])("%j -> %s", (env, expected) => expect(isCustomerMediaApiEnabled(env)).toBe(expected));
});
describe("execution classes follow the server's billing classes", () => {
  it("maps a content-item format and quality", () => { expect(executionClassFor("image")).toBe("image.normal"); expect(executionClassFor("video")).toBe("video.normal"); expect(executionClassFor("video", "premium")).toBe("video.premium"); expect(executionClassFor("video", "weird")).toBe("video.normal"); expect(VIDEO_QUALITIES).toEqual(["normal", "premium"]); });
});
describe("honest blockers", () => { it("name what is missing", () => { expect(HYBRID_BLOCKER).toMatch(/not available yet/); expect(ATTACH_BLOCKER).toMatch(/nothing is shown and nothing is approved/); }); });
describe("no provider names, prices or storage addresses in the creative source", () => {
  it("source is clean", async () => { const fs = await import("node:fs"); for (const f of ["creativeProductionClient.js", "CreativeStudio.jsx", "QuotedGeneration.jsx", "generationQuoteClient.js"]) { const src = fs.readFileSync(`src/premium/${f}`, "utf8"); expect(src, f).not.toMatch(/£\s?\d|\$\s?\d|openai|runway|midjourney|stability|elevenlabs/i); } });
});
