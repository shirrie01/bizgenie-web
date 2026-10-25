// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { MISSING_GUIDANCE, buildSavePayload, channelState, confirmationReadiness, effectiveSector, formFromOnboarding, hasUnsavedChanges, isBareUrl, isNotADescription, isSeededDescription } from "./onboardingModel";

const SAVED = (over = {}) => ({ contract_version: "workspace-onboarding.v1", version: 2, status: "in_progress", sector: { key: null, source: null }, industry_text: null, channels: { values: [], source: null }, current_step: null, draft: {}, ...over });
const FORM = (over = {}) => ({ sectorChoice: "", industryText: "", businessName: "", description: "", channels: [], draft: {}, ...over });

describe("formFromOnboarding", () => {
  it("restores nothing from an unsaved (version 0) record", () => {
    expect(formFromOnboarding(SAVED({ version: 0 }))).toMatchObject({ sectorChoice: "", channels: [], draft: {}, step: null });
    expect(formFromOnboarding(null).channels).toEqual([]);
  });
  it("restores a customer choice as a choice, but an inferred sector only as 'work it out'", () => {
    expect(formFromOnboarding(SAVED({ sector: { key: "perfume", source: "customer" } })).sectorChoice).toBe("perfume");
    expect(formFromOnboarding(SAVED({ sector: { key: "perfume", source: "inferred" } })).sectorChoice).toBe("");
  });
  it("maps channels and draft keys back to form fields and ignores unknown or non-string draft values", () => {
    const f = formFromOnboarding(SAVED({ channels: { values: ["tiktok", "email"], source: "customer" }, current_step: 3, industry_text: "x", draft: { primary_cta: "Call", audience_summary: "People", goal: 4, surprise: "y" } }));
    expect(f.channels).toEqual(["TikTok", "Email"]);
    expect(f.step).toBe(3);
    expect(f.draft).toEqual({ cta: "Call", audience: "People" });
  });
});

describe("effectiveSector provenance", () => {
  it("local choice > inference > saved inferred > none, labelled saved only when it matches the record", () => {
    expect(effectiveSector({ sectorChoice: "perfume", onboarding: SAVED({ sector: { key: "perfume", source: "customer" } }) })).toEqual({ key: "perfume", source: "saved_customer" });
    expect(effectiveSector({ sectorChoice: "charity", onboarding: SAVED({ sector: { key: "perfume", source: "customer" } }) })).toEqual({ key: "charity", source: "customer" });
    expect(effectiveSector({ texts: ["Vehicle leasing"], onboarding: SAVED({ sector: { key: "leasing", source: "inferred" } }) })).toEqual({ key: "leasing", source: "saved_inferred" });
    expect(effectiveSector({ texts: ["Vehicle leasing"], onboarding: SAVED() })).toEqual({ key: "leasing", source: "inferred" });
    expect(effectiveSector({ onboarding: SAVED({ sector: { key: "beverage", source: "inferred" } }) })).toEqual({ key: "beverage", source: "saved_inferred" });
    expect(effectiveSector({})).toEqual({ key: "neutral", source: "none" });
  });
  it("never reports a saved CUSTOMER sector that the customer did not choose as an inference", () => {
    expect(effectiveSector({ texts: ["Vehicle leasing"], onboarding: SAVED({ sector: { key: "leasing", source: "customer" } }) }).source).toBe("inferred");
  });
});

describe("channelState", () => {
  it("is saved only when it equals the saved record", () => {
    const saved = SAVED({ channels: { values: ["email", "tiktok"], source: "customer" } });
    expect(channelState({ channels: ["TikTok", "Email"], onboarding: saved })).toEqual({ source: "saved_customer", saved: true });
    expect(channelState({ channels: ["Email"], onboarding: saved })).toEqual({ source: "customer", saved: false });
    expect(channelState({ channels: [], onboarding: saved })).toEqual({ source: "missing", saved: false });
  });
});

describe("buildSavePayload", () => {
  it("sends nothing but the version when nothing changed", () => {
    const r = buildSavePayload({ onboarding: SAVED(), form: FORM() });
    expect(r.body).toEqual({ expected_version: 2 });
    expect(r.hasChanges).toBe(false);
  });
  it("uses version 0 for a customer with no saved record", () => {
    expect(buildSavePayload({ onboarding: null, form: FORM({ channels: ["Email"] }) }).body).toEqual({ expected_version: 0, channels: ["email"], channels_source: "customer" });
  });
  it("sends a chosen sector as customer, an inferred one as inferred, and not again when unchanged", () => {
    expect(buildSavePayload({ onboarding: SAVED(), form: FORM({ sectorChoice: "perfume" }) }).body).toMatchObject({ sector_key: "perfume", sector_source: "customer" });
    expect(buildSavePayload({ onboarding: SAVED(), form: FORM({ industryText: "vehicle leasing" }) }).body).toMatchObject({ sector_key: "leasing", sector_source: "inferred", industry_text: "vehicle leasing" });
    expect(buildSavePayload({ onboarding: SAVED({ sector: { key: "perfume", source: "customer" } }), form: FORM({ sectorChoice: "perfume" }) }).body).not.toHaveProperty("sector_key");
    expect(buildSavePayload({ onboarding: SAVED({ sector: { key: "leasing", source: "inferred" } }), form: FORM({ industryText: "leasing" }), step: undefined }).body).not.toHaveProperty("sector_key");
  });
  it("never sends an inferred sector over a saved customer choice", () => {
    const saved = SAVED({ sector: { key: "perfume", source: "customer" } });
    const body = buildSavePayload({ onboarding: saved, form: FORM({ sectorChoice: "perfume", industryText: "vehicle leasing" }) }).body;
    expect(body.sector_source).not.toBe("inferred");
    expect(body).not.toHaveProperty("sector_key");
  });
  it("clears a saved customer sector when the customer returns to 'work it out'", () => {
    expect(buildSavePayload({ onboarding: SAVED({ sector: { key: "perfume", source: "customer" } }), form: FORM() }).body.sector_key).toBeNull();
  });
  it("ignores unknown sector keys and unknown channels", () => {
    const body = buildSavePayload({ onboarding: SAVED(), form: FORM({ sectorChoice: "crypto", channels: ["MySpace", "Email", "email"] }) }).body;
    expect(body).not.toHaveProperty("sector_key");
    expect(body.channels).toEqual(["email"]);
  });
  it("clears channels with an empty list and no source", () => {
    const body = buildSavePayload({ onboarding: SAVED({ channels: { values: ["email"], source: "customer" } }), form: FORM() }).body;
    expect(body.channels).toEqual([]);
    expect(body).not.toHaveProperty("channels_source");
  });
  it("re-labels saved inferred channels as customer-confirmed when the customer keeps them", () => {
    const body = buildSavePayload({ onboarding: SAVED({ channels: { values: ["email"], source: "inferred" } }), form: FORM({ channels: ["Email"] }) }).body;
    expect(body).toMatchObject({ channels_source: "customer" });
    expect(body).not.toHaveProperty("channels");
  });
  it("saves only answers that differ from the Brand Brain, and clears ones that were erased", () => {
    const brain = { name: "Acme", identity: { description: "Already saved" }, audience: { summary: "Old" }, commercial: { primary_cta: "Call us" } };
    const form = FORM({ businessName: "Acme", description: "Already saved", draft: { businessName: "Acme", description: "Already saved", audience: "New typed audience", cta: "Call us", goal: "A goal" } });
    expect(buildSavePayload({ onboarding: SAVED(), form, brain }).body.draft).toEqual({ audience_summary: "New typed audience", goal: "A goal" });
    const erased = buildSavePayload({ onboarding: SAVED({ draft: { goal: "Old goal" } }), form: FORM({ draft: { goal: "  " } }), brain }).body;
    expect(erased.draft).toEqual({ goal: null });
  });
  it("blocks over-long answers instead of truncating them", () => {
    const r = buildSavePayload({ onboarding: SAVED(), form: FORM({ draft: { cta: "x".repeat(501), goal: "y".repeat(2001) }, industryText: "z".repeat(201) }) });
    expect(r.errors).toHaveLength(3);
    for (const part of [/Customer action must be 500/, /Goal must be 2000/, /Kind of business must be 200/]) expect(r.errors.join(" ")).toMatch(part);
    expect(r.body).not.toHaveProperty("draft");
  });
  it("accepts a long Brand Brain call to action that bootstrap seeded, because it equals the Brand Brain and is not re-saved", () => {
    const long = "c".repeat(900);
    const r = buildSavePayload({ onboarding: SAVED(), form: FORM({ draft: { cta: long } }), brain: { commercial: { primary_cta: long } } });
    expect(r.errors).toEqual([]);
    expect(r.body).not.toHaveProperty("draft");
  });
  it("sends the step only when it moved, and only valid steps", () => {
    expect(buildSavePayload({ onboarding: SAVED({ current_step: 2 }), form: FORM(), step: 2 }).body).not.toHaveProperty("current_step");
    expect(buildSavePayload({ onboarding: SAVED({ current_step: 2 }), form: FORM(), step: 4 }).body.current_step).toBe(4);
    expect(buildSavePayload({ onboarding: SAVED(), form: FORM(), step: 21 }).body).not.toHaveProperty("current_step");
    expect(buildSavePayload({ onboarding: SAVED(), form: FORM(), step: -1 }).body).not.toHaveProperty("current_step");
  });
  it("adds only the completion flag when confirming", () => {
    const r = buildSavePayload({ onboarding: SAVED({ version: 5 }), form: FORM(), complete: true });
    expect(r.body).toEqual({ expected_version: 5, complete: true });
    expect(r.hasChanges).toBe(true);
  });
});

describe("hasUnsavedChanges", () => {
  it("does not count a sector merely worked out from the customer's words as unsaved work", () => {
    expect(hasUnsavedChanges({ onboarding: SAVED(), form: FORM({ businessName: "Northgate Vehicle Leasing" }), brain: { name: "Northgate Vehicle Leasing" } })).toBe(false);
  });
  it("counts typed answers, channel changes and a chosen sector", () => {
    expect(hasUnsavedChanges({ onboarding: SAVED(), form: FORM({ draft: { goal: "x" } }) })).toBe(true);
    expect(hasUnsavedChanges({ onboarding: SAVED(), form: FORM({ channels: ["Email"] }) })).toBe(true);
    expect(hasUnsavedChanges({ onboarding: SAVED(), form: FORM({ sectorChoice: "perfume" }) })).toBe(true);
    expect(hasUnsavedChanges({ onboarding: SAVED({ sector: { key: "perfume", source: "customer" } }), form: FORM({ sectorChoice: "perfume" }) })).toBe(false);
  });
});

describe("confirmation readiness", () => {
  const ok = { onboarding: SAVED({ sector: { key: "perfume", source: "customer" }, channels: { values: ["email"], source: "customer" } }), brain: { name: "Maison", identity: { description: "A perfume house." } }, brandNamePlaceholder: false };
  it("is ready only from saved sector, saved channels, a backend-confirmed name and a written description", () => {
    expect(confirmationReadiness(ok)).toMatchObject({ ready: true, missing: [], paths: [] });
  });
  it("is not ready when any one of them is missing, unknown or seeded", () => {
    expect(confirmationReadiness({ ...ok, onboarding: SAVED({ channels: ok.onboarding.channels }) }).missing).toEqual(["Save your sector."]);
    expect(confirmationReadiness({ ...ok, onboarding: SAVED({ sector: ok.onboarding.sector }) }).missing).toEqual(["Save at least one channel."]);
    expect(confirmationReadiness({ ...ok, brandNamePlaceholder: true }).ready).toBe(false);
    expect(confirmationReadiness({ ...ok, brandNamePlaceholder: null }).ready).toBe(false);
    expect(confirmationReadiness({ ...ok, brain: { name: "Maison", identity: { description: "Customer-provided website or profile: https://x.test" } } }).missing[0]).toMatch(/website address is not a description/i);
    expect(confirmationReadiness({ ...ok, brain: null }).ready).toBe(false);
    expect(confirmationReadiness({ onboarding: null, brain: null, brandNamePlaceholder: null }).missing).toHaveLength(4);
  });
  it("also refuses a description that is only a web address, as the hardened API does", () => {
    const brain = { name: "Maison", identity: { description: "https://maison.example/about" } };
    const r = confirmationReadiness({ ...ok, brain });
    expect(r.ready).toBe(false);
    expect(r.paths).toEqual(["description"]);
    expect(isBareUrl("www.maison.example")).toBe(true);
    expect(isBareUrl("Visit https://maison.example for more")).toBe(false);
    expect(isNotADescription("  ")).toBe(true);
    expect(isNotADescription("We make perfume.")).toBe(false);
  });
  it("keeps Confirm closed when the SERVER says something is missing, and never lists a path twice", () => {
    const onboarding = { ...ok.onboarding, completeness: { sector: true, channels: true, ready_to_complete: false, missing: ["business_name", "description"] } };
    const r = confirmationReadiness({ ...ok, onboarding });
    expect(r.ready).toBe(false);
    expect(r.paths).toEqual(["business_name", "description"]);
    expect(r.missing).toEqual([MISSING_GUIDANCE.business_name.text, MISSING_GUIDANCE.description.text]);
    const both = confirmationReadiness({ ...ok, onboarding, brain: { name: "", identity: { description: "" } }, brandNamePlaceholder: true });
    expect(both.paths).toEqual(["business_name", "description"]);
    expect(both.missing).toHaveLength(2);
  });
  it("has guidance for every path the API can list, each pointing at a real step", () => {
    for (const path of ["sector_key", "channels", "business_name", "description"]) expect(MISSING_GUIDANCE[path].step).toBeGreaterThanOrEqual(1);
  });
  it("recognises the exact text bootstrap seeds", () => {
    expect(isSeededDescription("Customer-provided website or profile: https://example.test")).toBe(true);
    expect(isSeededDescription("  Customer-provided website or profile: x")).toBe(true);
    expect(isSeededDescription("We sell perfume. Customer-provided website or profile: x")).toBe(false);
    expect(isSeededDescription("")).toBe(false);
  });
});

describe("Professional services is never sent to an API that does not accept it (DEC-023, BG-STUDIO-017-FE)", () => {
  afterEach(() => vi.unstubAllEnvs());
  const PROF = { industryText: "Tax and advisory services for owner-managed businesses" };

  it("with the backend gate off: a worked-out professional sector guides the workspace, and is stored only as the API's own neutral/inferred", () => {
    expect(effectiveSector({ texts: [PROF.industryText] })).toEqual({ key: "professional", source: "inferred" });
    expect(buildSavePayload({ onboarding: SAVED(), form: FORM(PROF) }).body).toMatchObject({ sector_key: "neutral", sector_source: "inferred" });
    // already stored that way: nothing is sent again, and the workspace still shows professional guidance labelled as not saved
    const stored = SAVED({ sector: { key: "neutral", source: "inferred" } });
    expect(buildSavePayload({ onboarding: stored, form: FORM(PROF) }).body.sector_key).toBeUndefined();
    expect(effectiveSector({ texts: [PROF.industryText], onboarding: stored })).toEqual({ key: "professional", source: "inferred" });
  });

  it("with the backend gate off: a choice of professional (impossible from the list) is not sent either", () => {
    expect(buildSavePayload({ onboarding: SAVED(), form: FORM({ sectorChoice: "professional" }) }).body.sector_key).not.toBe("professional");
  });

  it("other sectors are unaffected by the gate", () => {
    expect(buildSavePayload({ onboarding: SAVED(), form: FORM({ sectorChoice: "leasing" }) }).body).toMatchObject({ sector_key: "leasing", sector_source: "customer" });
    expect(buildSavePayload({ onboarding: SAVED(), form: FORM({ industryText: "Vehicle leasing" }) }).body).toMatchObject({ sector_key: "leasing", sector_source: "inferred" });
  });

  it("only when the build says the backend accepts it, is professional saved", () => {
    vi.stubEnv("VITE_PROFESSIONAL_SECTOR_PERSISTED", "true");
    expect(buildSavePayload({ onboarding: SAVED(), form: FORM({ sectorChoice: "professional" }) }).body).toMatchObject({ sector_key: "professional", sector_source: "customer" });
    expect(buildSavePayload({ onboarding: SAVED(), form: FORM(PROF) }).body).toMatchObject({ sector_key: "professional", sector_source: "inferred" });
  });
});
