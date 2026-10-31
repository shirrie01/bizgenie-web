// @vitest-environment node
import { describe, expect, it } from "vitest";
import { GOAL_NAMES, PROFILES, SECTOR_ORDER, buildWorkspace, calendarEvents, resolveSector, sectorOptions, signatureTerms, studioPosts } from "../studio-preview/v3/industry-profiles.js";

const SCENARIOS = [
  { sector: "leasing", business: "Northgate Vehicle Leasing", industryText: "" },
  { sector: "perfume", business: "Maison Aurelle", industryText: "Fragrance house" },
  { sector: "aesthetics", business: "Clearskin Studio", industryText: "Aesthetics clinic" },
  { sector: "beverage", business: "Fonzo", industryText: "Soft drinks" },
  { sector: "charity", business: "WOW Charity", industryText: "" },
  { sector: "neutral", business: "Harbour Partners", industryText: "Business consulting" },
];
const CHANNELS = ["Instagram", "Email"];
const view = (s, extra = {}) => buildWorkspace({ business: s.business, industryText: s.industryText, goal: "Get more customers", channels: CHANNELS, ...extra });
// What a customer can read, with the business name they typed removed: names are theirs, not fixture content.
const readable = (v, business) => v.text.join(" \n ").split(new RegExp(business.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")).join(" ");
const mentions = (text, term) => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text);

describe("sector resolution", () => {
  it.each(SCENARIOS)("resolves $business to $sector", (s) => {
    expect(resolveSector({ business: s.business, industryText: s.industryText }).key).toBe(s.sector);
  });

  it("says whether the sector was chosen, inferred or not found", () => {
    expect(resolveSector({ business: "Northgate Vehicle Leasing" }).source).toBe("inferred");
    expect(resolveSector({ business: "Harbour Partners" }).source).toBe("none");
    expect(resolveSector({ business: "Harbour Partners", choice: "leasing" })).toEqual({ key: "leasing", source: "chosen" });
  });

  it("lets an explicit choice win over inference, including the neutral choice", () => {
    expect(resolveSector({ business: "Northgate Vehicle Leasing", choice: "perfume" }).key).toBe("perfume");
    expect(resolveSector({ business: "Northgate Vehicle Leasing", choice: "neutral" }).key).toBe("neutral");
  });

  it("ignores an unknown choice and never guesses a sector from nothing", () => {
    expect(resolveSector({ business: "Northgate Vehicle Leasing", choice: "bogus" }).key).toBe("leasing");
    expect(resolveSector({}).key).toBe("neutral");
    expect(resolveSector({ business: "   ", industryText: "  " })).toEqual({ key: "neutral", source: "none" });
  });

  it("prefers what the customer typed as the sector over the business name", () => {
    expect(resolveSector({ business: "Northgate Vehicle Leasing", industryText: "fragrance" }).key).toBe("perfume");
  });

  it("offers an automatic option, a neutral option and every sector", () => {
    const values = sectorOptions().map((o) => o.value);
    expect(values).toEqual(["", "neutral", ...SECTOR_ORDER]);
  });
});

describe("workspace follows the selected business", () => {
  it.each(SCENARIOS)("$business: names the customer's business and sector", (s) => {
    const v = view(s);
    expect(v.sector).toBe(s.sector);
    expect(v.title).toBe(`Your growth plan for ${s.business}.`);
    expect(v.eyebrow).toContain(s.business.toUpperCase());
    expect(v.campaign.name).toContain(s.business);
  });

  it("Northgate Vehicle Leasing never shows any Fonzo or drinks content", () => {
    const v = view(SCENARIOS[0]);
    const text = v.text.join(" ");
    for (const term of ["fonzo", "cans", "flavour", "zero sugar", "raspberry", "cherry cola", "mango", "beverage"]) expect(mentions(text, term)).toBe(false);
    expect(v.scene.mark).toBe("");
    expect(v.scene.kind).toBe("symbols");
    expect(v.scene.symbols).toContain("car");
  });

  it("shows only the demonstration brand when the customer typed it, and never invents product details", () => {
    const fonzo = view(SCENARIOS[3]);
    expect(fonzo.scene).toMatchObject({ kind: "cans", mark: "FONZO" });
    const text = fonzo.text.join(" ");
    for (const term of ["zero sugar", "raspberry", "cherry cola", "mango", "blue raspberry"]) expect(mentions(text, term)).toBe(false);
    // The same sector under another business name shows that business, not Fonzo.
    const other = buildWorkspace({ business: "Brookside Drinks", industryText: "soft drinks", channels: CHANNELS });
    expect(other.scene.mark).toBe("BROOKSIDE");
    expect(mentions(other.text.join(" "), "fonzo")).toBe(false);
  });

  it("only draws a can brand mark for the drinks sector", () => {
    for (const s of SCENARIOS.filter((x) => x.sector !== "beverage")) expect(view(s).scene.mark).toBe("");
  });

  it("one sector's fixtures cannot appear under another sector", () => {
    for (const a of SCENARIOS) {
      const text = readable(view(a), a.business);
      for (const b of SCENARIOS.filter((x) => x.sector !== a.sector && x.sector !== "neutral")) {
        for (const term of signatureTerms(b.sector)) {
          expect(mentions(text, term), `${a.sector} view must not mention "${term}" (${b.sector})`).toBe(false);
        }
      }
    }
  });

  it("the neutral fallback contains no sector vocabulary at all", () => {
    const v = view(SCENARIOS[5]);
    const text = readable(v, "Harbour Partners");
    for (const key of SECTOR_ORDER) for (const term of signatureTerms(key)) expect(mentions(text, term), `neutral must not mention "${term}"`).toBe(false);
    expect(v.sectorSource).toBe("none");
    expect(v.scene.symbols).not.toContain("car");
  });

  it("changing the sector choice changes every fixture surface together", () => {
    const base = { business: "Northgate Vehicle Leasing", channels: CHANNELS, goal: "Get more customers" };
    const asPerfume = buildWorkspace({ ...base, sectorChoice: "perfume" });
    expect(asPerfume.sector).toBe("perfume");
    expect(asPerfume.concepts.map((c) => c.title)).toEqual(PROFILES.perfume.concepts.map((c) => c.title));
    expect(studioPosts({ sector: asPerfume.sector, channels: CHANNELS })[0].title).toBe("A signature worth remembering.");
    expect(calendarEvents(asPerfume).map((e) => e.label)).toContain("The fragrance story");
    expect(mentions(readable(asPerfume, base.business), "lease")).toBe(false);
  });

  it("falls back safely when no brand has been entered", () => {
    const v = buildWorkspace({});
    expect(v.hasBrand).toBe(false);
    expect(v.title).toBe("Your growth plan.");
    expect(v.sector).toBe("neutral");
    expect(v.text.join(" ")).not.toMatch(/fonzo/i);
    expect(v.campaign.name).toBe("First campaign");
    expect(buildWorkspace({ business: "   ", sectorChoice: "leasing" }).title).toBe("Your growth plan.");
  });

  it("treats a hostile business name as inert text", () => {
    const v = buildWorkspace({ business: "<img src=x onerror=alert(1)> Leasing", channels: CHANNELS });
    expect(v.title).toContain("<img src=x onerror=alert(1)> Leasing");
    expect(typeof v.title).toBe("string");
  });

  it("truncates an over-long business name for headings only", () => {
    const long = "A".repeat(120);
    const v = buildWorkspace({ business: long });
    expect(v.title.length).toBeLessThan(90);
    expect(v.brandName).toBe(long);
  });
});

describe("onboarding choices carry into the workspace", () => {
  it("every goal changes the lead action, and only the goal's own metric is the focus", () => {
    const seen = new Set();
    for (const goal of GOAL_NAMES) {
      const v = buildWorkspace({ business: "Northgate Vehicle Leasing", goal, channels: CHANNELS });
      seen.add(v.actions[0].title);
      expect(v.goal).toBe(goal);
      const focused = v.kpis.filter((k) => k.focus).map((k) => k.label);
      expect(focused.length).toBe(goal === "Not sure yet" ? 0 : 1);
    }
    expect(seen.size).toBe(GOAL_NAMES.length);
  });

  it("includes the two goals added in BG-STUDIO-005", () => {
    expect(GOAL_NAMES).toEqual(expect.arrayContaining(["Increase online sales", "Support a specific promotion"]));
    expect(buildWorkspace({ goal: "Increase online sales" }).kpis.find((k) => k.focus).label).toBe("Conversions");
  });

  it("an unknown goal is treated as not chosen", () => {
    const v = buildWorkspace({ business: "X", goal: "Make me rich" });
    expect(v.goal).toBe("Not sure yet");
    expect(v.goalChosen).toBe(false);
    expect(v.actions[0].view).toBe("onboard");
  });

  it("only selected channels appear, in a fixed order, and none are claimed as connected", () => {
    const v = buildWorkspace({ business: "X", channels: ["Email", "TikTok"] });
    expect(v.campaign.channels).toEqual(["TikTok", "Email"]);
    expect(v.chart.map((c) => c.channel)).toEqual(["TikTok", "Email"]);
    expect(v.schedule.every((s) => ["TikTok", "Email"].includes(s.channel))).toBe(true);
    // The only mention of "connected" is the notice that nothing is.
    expect(v.text.filter((s) => s !== v.notice).join(" ")).not.toMatch(/connected/i);
    expect(v.notice).toMatch(/no customer accounts are connected/i);
  });

  it("states plainly when no channel is selected instead of inventing one", () => {
    const v = buildWorkspace({ business: "X", channels: [] });
    expect(v.chart).toEqual([]);
    expect(v.schedule[0].channel).toBe("No channel selected");
    expect(studioPosts({ sector: "leasing", channels: [] })).toEqual([]);
  });

  it("studio posts use the selected channels with the sector's own creative", () => {
    const posts = studioPosts({ sector: "leasing", channels: ["LinkedIn", "Instagram", "Email", "TikTok"] });
    expect(posts.map((p) => p.channel)).toEqual(["Instagram", "TikTok", "LinkedIn"]);
    expect(posts[0].title).toBe("A clearer way to lease.");
  });

  it("carries brand voice and key messages as the customer's own input", () => {
    const v = buildWorkspace({ business: "X", voice: "Calm and expert", messages: ["Free local delivery", "  "] });
    expect(v.brand).toEqual({ voice: "Calm and expert", messages: ["Free local delivery"] });
  });

  it("always says the content is illustrative and nothing is published", () => {
    for (const s of SCENARIOS) {
      const v = view(s);
      expect(v.notice).toMatch(/illustrative/i);
      expect(v.notice).toMatch(/no content is generated or published/i);
      expect(v.subtitle).toMatch(/nothing here is your data/i);
    }
  });
});
