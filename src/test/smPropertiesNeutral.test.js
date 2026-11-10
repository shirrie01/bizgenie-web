// @vitest-environment node
import { describe, it, expect } from "vitest";
import { suggestObjective, buildStrategy } from "../intel/goalModel.js";
import { SECTORS } from "../premium/sectors.js";

// BG-LAUNCH-019 (LOCAL, pure functions): the first hosted customer is a residential property business (SM Properties). No sector in the Studio covers it, so it must get the
// neutral reading, never another industry's wording (vehicle leasing, perfume, aesthetics, drinks, charity, takeaway).
const GOAL = "Generate more enquiries for residential property sales and lettings, build a professional social media presence, create engaging property marketing content and convert more enquiries into customers.";
const OTHER_INDUSTRY = /\b(drink|drinker|beverage|perfume|fragrance|vehicle|lease|leasing|clinic|aesthetic|takeaway|charity|donor|fonzo|bubblo|northgate)\b/i;

describe("a residential property business gets neutral, honest guidance", () => {
  it("the goal is read as lead generation from the customer's own word 'enquiries'", () => {
    expect(suggestObjective(GOAL)).toMatchObject({ objective: "leads", matched: "enquiries" });
  });
  it("no sector in the list claims to be property, so the Studio will not pretend to know it", () => {
    expect(JSON.stringify(SECTORS)).not.toMatch(/propert|estate|letting/i);
  });
  it("the strategy for an unrecognised sector is the neutral reading with no other industry's words", () => {
    for (const sector of [null, "residential_property", "unknown"]) {
      const s = buildStrategy({ objective: "leads", objectiveSource: "suggested", sector, sectorSource: "inferred", brainFacts: {}, channels: [] });
      expect(s.evidence[0]).toBe("Industry reading: general");
      expect(JSON.stringify(s), String(sector)).not.toMatch(OTHER_INDUSTRY);
      expect(s.forecast).toBeNull();
      expect(s.assumptions.join(" ")).toMatch(/general description|inferred/i);
    }
  });
  it("what the customer wrote is used as theirs, and labelled as theirs", () => {
    const s = buildStrategy({ objective: "leads", objectiveSource: "suggested", sector: null, sectorSource: "chosen", brainFacts: { audience: "Local buyers and landlords", cta: "Book a valuation" }, channels: ["instagram"] });
    expect(s.targetCustomer).toEqual({ text: "Local buyers and landlords", source: "Your Brand Brain" }); expect(s.offer).toEqual({ text: "Book a valuation", source: "Your Brand Brain" });
  });
});
