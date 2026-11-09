import { describe, expect, it } from "vitest";
import { INDUSTRIES, OBJECTIVES, buildStrategy, readObjective, suggestObjective } from "./goalModel";
import { approveFact, newContext, setFact } from "./productContext";
import { buildReference, directions } from "./referenceBrief";
import { createExperiment } from "./experimentModel";
import { SECTORS, resolveSector } from "../premium/sectors";

// Five-industry x owner/member acceptance for the BG-STUDIO-022 intelligence stages (strategy, experiments, product details, creative ideas).
// This is MOCK-TESTED / model-level coverage: pure functions, no network, no backend. It does NOT prove the other journey stages; see the matrix in
// docs/studio/BG_STUDIO_022_FE_REPORT.md for what each stage is classified as.
const BUSINESS = {
  leasing: { text: "Fleet car and van leasing for small businesses", goal: "Get more enquiries from fleet managers", expect: "leads" },
  professional_services: { text: "Independent accountancy and advisory practice", goal: "Fill our diary with consultations", expect: "bookings" },
  aesthetics: { text: "Aesthetics clinic offering skin treatments", goal: "More people booking appointments", expect: "bookings" },
  perfume: { text: "Independent perfume house with niche fragrances", goal: "Sell more of our fragrances this Christmas", expect: "sales" },
  beverage: { text: "Craft drinks producer selling to bars and shops", goal: "Win wholesale accounts with local distributors", expect: "distributor" },
};
describe.each(INDUSTRIES)("%s", (industry) => {
  const b = BUSINESS[industry];
  it("is recognised from the customer's own words and its goal is read correctly", () => {
    expect(resolveSector({ texts: [b.text] }).key).toBe(industry);
    expect(suggestObjective(b.goal).objective).toBe(b.expect);
  });
  it("every objective reads for this industry, with a caution and no forecast, for owners and members alike", () => {
    for (const objective of Object.keys(OBJECTIVES)) {
      const s = buildStrategy({ sector: industry, sectorSource: "chosen", objective, brainFacts: { audience: "A", cta: "B" }, channels: ["LinkedIn"] });
      expect(s.forecast).toBeNull(); expect(readObjective(industry, objective).caution.length).toBeGreaterThan(10);
      expect(JSON.stringify(s)).not.toMatch(/\d+%|guarantee|will (increase|grow|double)/i);
    }
  });
  it("only the owner can approve a product fact; a member cannot, and nothing reaches the Brand Brain without the owner", () => {
    const c = setFact(newContext(), "offer", `Trial for ${SECTORS[industry].short}`);
    expect(approveFact(c, "offer", { isOwner: false }).error).toMatch(/Only the owner/);
    expect(approveFact(c, "offer", { isOwner: true }).context.facts.offer.approved).toBe(true);
  });
  it("creative ideas stay original and say what was analysed", () => {
    const r = buildReference({ description: `A short demonstration in the style of BigBrand Rival for ${b.text}`, rightsConfirmed: true, platform: "Instagram" });
    expect(r.reference.analysis).toBe("description_only");
    for (const d of directions(r.reference, {})) { expect(d.brief).not.toMatch(/BigBrand Rival/); expect(d.brief).toMatch(/Do not copy/); }
  });
  it("an experiment tests one variable", () => {
    const x = createExperiment({ type: "cta", objective: b.expect, hypothesis: "A softer call to action gets more replies", outcomeMetric: "clicks", windowDays: 14, variants: [{ key: "a", attributes: { cta: "Book now" } }, { key: "b", attributes: { cta: "Ask a question" } }] });
    expect(x.variable).toBe("cta");
  });
});
