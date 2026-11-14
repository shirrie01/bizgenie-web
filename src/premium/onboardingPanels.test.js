// @vitest-environment node
// BG-WEB-ONBOARDING-MOCKUP: the six panels sit over the seven STORED stage indexes without renumbering them.
import { describe, expect, it } from "vitest";
import { BRAND_CARDS, LOGO_NOTE, OBJECTIVES, ORDER, PANELS, STAGE_COUNT, applyObjective, brandCardSummary, channelConnection, nextStage, objectiveForGoal, panelIndexOfStage, partOfPanel, prevStage } from "./onboardingPanels";
import { STAGES } from "./PremiumOnboarding";

describe("stage mapping (saved progress must keep its meaning)", () => {
  it("the stored stages are still exactly the seven, in the stored order, and every one belongs to exactly one panel", () => {
    expect(STAGES.map((s) => s.id)).toEqual(["welcome", "identity", "about", "customers", "channels", "brain", "recommendation"]);
    expect(STAGE_COUNT).toBe(STAGES.length);
    expect([...ORDER].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    for (let s = 0; s < STAGES.length; s += 1) expect(PANELS.filter((p) => p.stages.includes(s)), `stage ${s}`).toHaveLength(1);
  });
  it("six panels, in the founder's order: Welcome, Your business, Your goals, Brand setup, Channels, Review", () => {
    expect(PANELS.map((p) => p.label)).toEqual(["Welcome", "Your business", "Your goals", "Brand setup", "Channels", "Review proposal"]);
    expect(PANELS).toHaveLength(6);
  });
  it("a saved stage index maps to the panel that holds that same stage (4 is still Channels, 5 is still the Brand Brain)", () => {
    expect(PANELS[panelIndexOfStage(4)].id).toBe("channels"); expect(PANELS[panelIndexOfStage(5)].id).toBe("brand");
    expect(PANELS[panelIndexOfStage(1)].id).toBe("business"); expect(PANELS[panelIndexOfStage(2)].id).toBe("business"); expect(PANELS[panelIndexOfStage(6)].id).toBe("review");
  });
  it("walking order puts Brand setup before Channels and visits every stage once, forwards and back", () => {
    expect(ORDER).toEqual([0, 1, 2, 3, 5, 4, 6]);
    let s = 0; const seen = [s]; while (nextStage(s) !== s) { s = nextStage(s); seen.push(s); }
    expect(seen).toEqual(ORDER);
    while (prevStage(s) !== s) s = prevStage(s);
    expect(s).toBe(0); expect(nextStage(99)).toBe(99); expect(prevStage(-1)).toBe(-1);
  });
  it("only the business panel has two parts", () => { expect(partOfPanel(1)).toEqual({ index: 1, of: 2 }); expect(partOfPanel(2)).toEqual({ index: 2, of: 2 }); expect(partOfPanel(3)).toBeNull(); });
});

describe("objectives are saved as goal text", () => {
  it("offers the six objectives from the design, each with distinct text", () => {
    expect(OBJECTIVES.map((o) => o.id)).toEqual(["customers", "sales", "awareness", "launch", "promotion", "inspiration"]);
    expect(new Set(OBJECTIVES.map((o) => o.text)).size).toBe(6);
  });
  it("picking an objective on an empty goal sets exactly its sentence, and it is recognised again", () => {
    const o = OBJECTIVES[1]; expect(applyObjective("", o)).toBe(o.text); expect(objectiveForGoal(o.text)).toBe(o); expect(objectiveForGoal("")).toBeNull(); expect(objectiveForGoal("something else")).toBeNull();
  });
  it("an objective counts only at a word boundary, so the customer's own longer sentence is never rewritten", () => {
    const a = OBJECTIVES[0];
    expect(objectiveForGoal(`${a.text} owners`)).toBeNull();
    expect(applyObjective(`${a.text} owners`, OBJECTIVES[1])).toBe(`${OBJECTIVES[1].text}. ${a.text} owners`);
    expect(objectiveForGoal(`${a.text}, especially locally`)).toBe(a);
  });
  it("switching objective keeps what the customer added after the previous one", () => {
    const a = OBJECTIVES[0], b = OBJECTIVES[3];
    const withDetail = `${a.text}. especially from small garages`;
    expect(objectiveForGoal(withDetail)).toBe(a);
    expect(applyObjective(withDetail, b)).toBe(`${b.text}. especially from small garages`);
    expect(applyObjective("My own goal text", a)).toBe(`${a.text}. My own goal text`);
  });
});

describe("channel cards say honestly whether anything can be connected", () => {
  it("offers Connect only for a platform the verified build supports; email and website are planning only", () => {
    expect(channelConnection("TikTok", { socialEnabled: true, providers: ["tiktok"] }).offered).toBe(true);
    expect(channelConnection("Instagram", { socialEnabled: true, providers: ["tiktok"] }).offered).toBe(false);
    expect(channelConnection("TikTok", { socialEnabled: false, providers: ["tiktok"] }).offered).toBe(false);
    expect(channelConnection("TikTok", { socialEnabled: true, providers: [] }).text).toMatch(/isn't available in this version yet/);
    expect(channelConnection("Email", { socialEnabled: true, providers: ["tiktok"] })).toMatchObject({ offered: false, text: expect.stringMatching(/planning only/) });
    expect(channelConnection("Website", { socialEnabled: true, providers: ["tiktok"] }).offered).toBe(false);
  });
});

describe("brand setup cards show what is stored, and say plainly what is missing", () => {
  it("summarises stored values and falls back to an honest empty line", () => {
    const [voice, messages, visual] = BRAND_CARDS;
    expect(brandCardSummary(voice, { tone: "Warm and plain-spoken" })).toBe("Warm and plain-spoken");
    expect(brandCardSummary(voice, { tone: "  " })).toBe(voice.empty);
    expect(brandCardSummary(messages, { differentiators: "Family owned\nSince 1998\nLocal\nFourth line dropped" })).toBe("Family owned, Since 1998, Local");
    expect(brandCardSummary(visual, { colours: "Forest green\nCream", photography_style: "Natural light" })).toBe("Forest green, Cream · Natural light");
    expect(brandCardSummary(visual, undefined)).toBe(visual.empty);
    expect(LOGO_NOTE).toMatch(/isn't available in this version yet/);
  });
});
