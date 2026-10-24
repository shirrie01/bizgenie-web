import { describe, expect, it } from "vitest";
import { buildWorkspaceModel } from "./workspaceModel";
import { SECTORS, SECTOR_ORDER, resolveSector, signatureTerms } from "./sectors";

// BG-STUDIO-015-FE: five deterministic business fixtures, one per kind of customer BizGenie must serve. These are
// TEST-ONLY, mock-labelled fixtures (none is a real customer) and nothing here is imported by production code.
// They prove the workspace shows each business's own identity and sector language, never another's, and that a business
// kind BizGenie has no sector for is shown honestly as "Not specified" rather than forced into the nearest consumer sector.
const FIXTURES = [
  { id: "leasing", name: "Northgate Vehicle Leasing", description: "We lease cars and vans to small businesses.", expectKey: "leasing" },
  { id: "beauty", name: "Clearskin Studio", description: "A skincare and aesthetics clinic offering facials and consultations.", expectKey: "aesthetics" },
  { id: "fragrance", name: "Maison Aurelle", description: "An independent perfume house making small-batch fragrances.", expectKey: "perfume" },
  { id: "b2b", name: "Ashdown & Pryce Chartered Accountants", description: "Tax and advisory services for owner-managed businesses.", expectKey: "neutral" },
  { id: "local", name: "Brightside Window Cleaning", description: "Window cleaning for homes and shops across Leeds.", expectKey: "neutral" },
];
const brainOf = (f) => ({ brand_id: `b-${f.id}`, project_id: `p-${f.id}`, name: f.name, identity: { description: f.description }, audience: { summary: "Local customers." }, commercial: { primary_cta: "Get in touch" }, metadata: { version: 1, status: "approved" } });
const modelOf = (f, extra = {}) => buildWorkspaceModel({ brain: brainOf(f), onboarding: null, brandNamePlaceholder: false, onboardingStatus: "ready", ...extra });
const allText = (m) => m.text.join(" \n ");
const OTHER_TERMS = (key) => SECTOR_ORDER.filter((k) => k !== key).flatMap((k) => signatureTerms(k));

describe("five business kinds each see only their own workspace", () => {
  for (const f of FIXTURES) {
    it(`${f.id}: own name, own sector (${f.expectKey}), no other fixture's identity`, () => {
      const m = modelOf(f);
      expect(m.title).toBe(`Welcome back, ${f.name}.`);
      expect(m.brand.name).toBe(f.name);
      expect(m.sector.key).toBe(f.expectKey);
      const text = allText(m);
      for (const other of FIXTURES.filter((o) => o.id !== f.id)) {
        expect(text).not.toContain(other.name);
        expect(text).not.toContain(other.description);
      }
      expect(text).not.toMatch(/\b(Fonzo|Bubblo)\b/i);
    });
  }

  it("a kind of business with no sector is shown as 'Not specified' with neutral guidance, never forced into a consumer sector", () => {
    for (const f of FIXTURES.filter((x) => x.expectKey === "neutral")) {
      const m = modelOf(f);
      expect(m.sector.label).toBe(SECTORS.neutral.label);
      expect(m.sector.source).toBe("missing"); // nothing was chosen or inferred: the UI says so
      const text = allText(m).toLowerCase();
      for (const term of OTHER_TERMS("neutral")) expect(text, `${f.id} must not use the ${term} sector's language`).not.toMatch(new RegExp(`\\b${term}\\b`));
    }
  });

  it("each sector's guidance uses its own language and none of another sector's", () => {
    for (const key of ["leasing", "aesthetics", "perfume"]) {
      const f = FIXTURES.find((x) => x.expectKey === key);
      const text = allText(modelOf(f)).toLowerCase();
      expect(text).toMatch(new RegExp(signatureTerms(key).join("|")));
      for (const term of OTHER_TERMS(key)) expect(text, `${key} must not use "${term}"`).not.toMatch(new RegExp(`\\b${term}\\b`));
    }
  });

  it("guidance is labelled as general guidance, not as personalised intelligence", () => {
    for (const f of FIXTURES) expect(modelOf(f).guidance.note).toMatch(/general guidance .* not generated content/i);
  });

  it("switching from one fixture to the next carries nothing over (pure model: same inputs, same output, no hidden state)", () => {
    const a1 = JSON.stringify(modelOf(FIXTURES[0]));
    modelOf(FIXTURES[2]); modelOf(FIXTURES[3]);
    expect(JSON.stringify(modelOf(FIXTURES[0]))).toBe(a1);
  });
});

describe("known limits of keyword inference (documented, safe because an inferred sector is labelled and overridable)", () => {
  // These typed words belong to a different kind of business than the sector they match. The product never hides this:
  // the source is 'inferred' (never 'chosen'), the customer is asked to confirm it, and an explicit choice always wins.
  const AMBIGUOUS = [
    ["mobile car valeting", "leasing"],
    ["hair salon", "aesthetics"],
    ["food safety consultancy", "takeaway"],
    ["fleet tracking software for hauliers", "leasing"],
  ];
  for (const [text, key] of AMBIGUOUS) {
    it(`"${text}" matches ${key} only as an inferred guess that the customer can change`, () => {
      const r = resolveSector({ texts: [text] });
      expect(r).toEqual({ key, source: "inferred" });
      expect(resolveSector({ choice: "neutral", texts: [text] })).toEqual({ key: "neutral", source: "chosen" });
    });
  }
});
