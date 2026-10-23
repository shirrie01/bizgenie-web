// @vitest-environment node
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { isPremiumStudioEnabled } from "./flag";
import { SECTORS, SECTOR_ORDER, guidanceFor, resolveSector, sectorOptions, signatureTerms } from "./sectors";
import { GENERIC_BRAND_NAMES, brainFacts, buildWorkspaceModel, summariseCampaigns } from "./workspaceModel";
import { resolveSector as previewResolve } from "../../studio-preview/v3/industry-profiles.js";

describe("feature flag", () => {
  it("is disabled unless the value is exactly true", () => {
    expect(isPremiumStudioEnabled({})).toBe(false);
    expect(isPremiumStudioEnabled({ VITE_PREMIUM_STUDIO_ENABLED: undefined })).toBe(false);
    for (const v of ["false", "", "0", "1", "yes", "on", "enabled", "tru", " false ", null, 1, true]) expect(isPremiumStudioEnabled({ VITE_PREMIUM_STUDIO_ENABLED: v }), String(v)).toBe(false);
    expect(isPremiumStudioEnabled({ VITE_PREMIUM_STUDIO_ENABLED: "true" })).toBe(true);
    expect(isPremiumStudioEnabled({ VITE_PREMIUM_STUDIO_ENABLED: " TRUE " })).toBe(true);
  });
  it("is off by default in this build's environment", () => {
    expect(isPremiumStudioEnabled()).toBe(false);
  });
});

describe("sector resolution", () => {
  it("lets an explicit choice win, then falls back to the customer's own texts, then neutral", () => {
    expect(resolveSector({ choice: "perfume", texts: ["Northgate Vehicle Leasing"] })).toEqual({ key: "perfume", source: "chosen" });
    expect(resolveSector({ texts: ["", "Northgate Vehicle Leasing"] })).toEqual({ key: "leasing", source: "inferred" });
    expect(resolveSector({ texts: ["Harbour Partners", "Business consulting"] })).toEqual({ key: "neutral", source: "none" });
    expect(resolveSector({})).toEqual({ key: "neutral", source: "none" });
    expect(resolveSector({ choice: "bogus", texts: ["Maison fragrance house"] }).key).toBe("perfume");
  });
  it("offers an automatic option, a neutral option and every sector", () => {
    expect(sectorOptions().map((o) => o.value)).toEqual(["", "neutral", ...SECTOR_ORDER]);
  });
  it("stays in step with the preview's resolver (drift guard)", () => {
    const corpus = ["Northgate Vehicle Leasing", "Fragrance house", "Aesthetics clinic", "Soft drinks", "WOW Charity", "Independent takeaway", "Harbour Community Trust", "Business consulting", "", "Plumbing and heating", "a leasing company that sells perfume"];
    for (const text of corpus) {
      const a = resolveSector({ texts: [text] });
      const b = previewResolve({ business: "", industryText: text });
      expect(a.key, text).toBe(b.key);
    }
  });
  it("has three guidance angles per sector and no claim wording", () => {
    for (const key of ["neutral", ...SECTOR_ORDER]) {
      const angles = guidanceFor(key);
      expect(angles.map((a) => a.stage)).toEqual(["Awareness", "Trust", "Action"]);
      for (const a of angles) expect(a.text).not.toMatch(/\d|%|guarantee|best|cheapest|results?/i);
    }
  });
});

const BRAIN = { name: "Northgate Vehicle Leasing", identity: { description: "We lease cars to small businesses." }, audience: { summary: "Small business owners." }, commercial: { primary_cta: "Request a quote" }, voice: { tone: "Clear and direct" }, metadata: { status: "draft", version: 1 } };
const WS = { tenant_id: "t1", project_id: "p1", brand_id: "b1", brand_name: "Northgate Vehicle Leasing" };

describe("workspace model", () => {
  it("uses the real Brand Brain and labels every fact with its source", () => {
    const m = buildWorkspaceModel({ workspace: WS, brain: BRAIN, goal: "Get more enquiries", channels: ["Email"] });
    expect(m.brand).toMatchObject({ name: "Northgate Vehicle Leasing", source: "backend", hasName: true });
    expect(m.title).toBe("Welcome back, Northgate Vehicle Leasing.");
    const by = Object.fromEntries(m.profile.rows.map((r) => [r.key, r]));
    expect(by.description).toMatchObject({ value: "We lease cars to small businesses.", source: "backend" });
    expect(by.goal).toMatchObject({ value: "Get more enquiries", source: "customer" });
    expect(by.channels.note).toMatch(/no account is connected/i);
    expect(by.sector).toMatchObject({ value: "Vehicle leasing", source: "inferred" });
    expect(m.profile.complete).toBe(true);
  });

  it("treats a placeholder brand name as missing and never invents a business", () => {
    for (const generic of GENERIC_BRAND_NAMES) {
      const m = buildWorkspaceModel({ workspace: { ...WS, brand_name: generic }, brain: { ...BRAIN, name: generic } });
      expect(m.brand.hasName).toBe(false);
      expect(m.title).toBe("Welcome to your workspace.");
      expect(m.profile.complete).toBe(false);
      expect(m.text.join(" ")).not.toContain(generic);
    }
  });

  it("falls back to neutral, honest states when nothing is known", () => {
    const m = buildWorkspaceModel({});
    expect(m.brand.hasName).toBe(false);
    expect(m.sector).toMatchObject({ key: "neutral", source: "missing" });
    expect(m.profile.rows.filter((r) => r.source === "missing").length).toBeGreaterThanOrEqual(6);
    expect(m.profile.rows.every((r) => r.source !== "missing" || r.value === "")).toBe(true);
    expect(m.campaign).toBeNull();
    expect(m.analytics.status).toBe("none");
    expect(m.nextActions[0].id).toBe("profile");
  });

  it("does not count typed-but-unsaved values as saved", () => {
    const m = buildWorkspaceModel({ workspace: { ...WS, brand_name: "" }, brain: null, draft: { businessName: "Typed Co", description: "Typed description" } });
    const by = Object.fromEntries(m.profile.rows.map((r) => [r.key, r]));
    expect(by.name.source).toBe("customer");
    expect(by.description.source).toBe("customer");
    expect(m.profile.complete).toBe(false);
    expect(brainFacts(null, { cta: " Call us " }).cta).toEqual({ value: "Call us", source: "customer" });
  });

  it("never invents metrics, results, posts, creative or schedule", () => {
    const m = buildWorkspaceModel({ workspace: WS, brain: BRAIN, goal: "g", channels: ["Instagram"] });
    const text = m.text.join(" ");
    expect(text).not.toMatch(/\d{2,}(\.\d)?[KkMm]\b/);
    expect(text).not.toMatch(/example|illustrative|simulated|demo/i);
    expect(m.analytics.text).toMatch(/no measured results/i);
    expect(m.campaign).toBeNull();
  });

  it("summarises only the real campaign and derives next actions from its real status", () => {
    const campaign = { campaign_id: "c1", name: "Real campaign", items: [{ variants: [{ workflow: "draft", destination_label: "Instagram" }, { workflow: "review", destination_label: "Email" }, { workflow: "approved", destination_label: "Email" }] }] };
    const m = buildWorkspaceModel({ workspace: WS, brain: BRAIN, goal: "g", campaign, hasRecommendation: true });
    expect(m.campaign).toMatchObject({ id: "c1", name: "Real campaign", total: 3, destinations: ["Instagram", "Email"] });
    expect(m.campaign.counts).toMatchObject({ draft: 1, review: 1, approved: 1, published: 0 });
    expect(m.nextActions.map((a) => a.id)).toEqual(["generate", "review", "publish", "calendar"]);
    const noCreate = m.nextActions.find((a) => a.id === "create");
    expect(noCreate).toBeUndefined();
  });

  it("walks the first-run actions in order", () => {
    expect(buildWorkspaceModel({ workspace: WS, brain: BRAIN }).nextActions[0].id).toBe("goal");
    expect(buildWorkspaceModel({ workspace: WS, brain: BRAIN, goal: "g" }).nextActions[0].id).toBe("recommend");
    expect(buildWorkspaceModel({ workspace: WS, brain: BRAIN, goal: "g", hasRecommendation: true }).nextActions[0].id).toBe("create");
  });
});

describe("campaign summaries", () => {
  it("keeps only real, unarchived campaigns, newest first, and ignores malformed entries", () => {
    const out = summariseCampaigns([
      { campaign_id: "a", name: " Older ", status: "active", archived_at: null, updated_at: "2026-09-01T00:00:00Z" },
      { campaign_id: "b", name: "Newest", status: "active", updated_at: "2026-10-01T00:00:00Z" },
      { campaign_id: "c", name: "Archived", archived_at: "2026-10-02T00:00:00Z", updated_at: "2026-10-03T00:00:00Z" },
      { name: "No id" }, null, 7, { campaign_id: 5 },
    ]);
    expect(out.map((c) => c.id)).toEqual(["b", "a"]);
    expect(out[1].name).toBe("Older");
    expect(summariseCampaigns(undefined)).toEqual([]);
    expect(summariseCampaigns("nope")).toEqual([]);
  });
  it("is empty in the model when nothing was supplied, never invented", () => {
    expect(buildWorkspaceModel({}).campaigns).toEqual([]);
  });
});

describe("cross-industry isolation", () => {
  const SCENARIOS = [
    { key: "leasing", brain: { name: "Northgate Vehicle Leasing", identity: { description: "We lease cars." } } },
    { key: "perfume", brain: { name: "Maison Aurelle", identity: { description: "A fragrance house." } } },
    { key: "aesthetics", brain: { name: "Clearskin Studio", identity: { description: "An aesthetics clinic." } } },
    { key: "beverage", brain: { name: "Fonzo", identity: { description: "Soft drinks." } } },
    { key: "charity", brain: { name: "WOW Charity", identity: { description: "We support local families." } } },
    { key: "neutral", brain: { name: "Harbour Partners", identity: { description: "Business consulting." } } },
  ];
  const strip = (text, name, description) => text.split(name).join(" ").split(description).join(" ");
  const has = (text, term) => new RegExp(`\\b${term}\\b`, "i").test(text);

  it("resolves each scenario to its own sector", () => {
    for (const s of SCENARIOS) expect(buildWorkspaceModel({ brain: s.brain, workspace: { brand_name: s.brain.name } }).sector.key, s.brain.name).toBe(s.key);
  });

  it("one sector's guidance and wording cannot appear under another", () => {
    for (const a of SCENARIOS) {
      const m = buildWorkspaceModel({ brain: a.brain, workspace: { brand_name: a.brain.name } });
      const text = strip(m.text.join(" "), a.brain.name, a.brain.identity.description);
      for (const b of SCENARIOS.filter((x) => x.key !== a.key && x.key !== "neutral")) {
        for (const term of signatureTerms(b.key)) expect(has(text, term), `${a.key} must not mention "${term}" (${b.key})`).toBe(false);
      }
    }
  });

  it("the neutral fallback carries no sector vocabulary", () => {
    const n = SCENARIOS[5];
    const text = strip(buildWorkspaceModel({ brain: n.brain, workspace: { brand_name: n.brain.name } }).text.join(" "), n.brain.name, n.brain.identity.description);
    for (const key of SECTOR_ORDER) for (const term of signatureTerms(key)) expect(has(text, term), term).toBe(false);
  });

  it("Northgate Vehicle Leasing never shows another brand's content", () => {
    const m = buildWorkspaceModel({ brain: SCENARIOS[0].brain, workspace: { brand_name: "Northgate Vehicle Leasing" }, goal: "More enquiries", channels: ["Email"] });
    const text = m.text.join(" ").toLowerCase();
    for (const term of ["fonzo", "maison", "clearskin", "wow charity", "cans", "flavour"]) expect(text.includes(term), term).toBe(false);
  });
});

describe("production source contains no demonstration brands or fixtures", () => {
  const root = path.resolve(__dirname, "..");
  const files = [];
  const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (e.name !== "test") walk(p); } else if (/\.(jsx?|css)$/.test(e.name) && !/\.test\./.test(e.name)) files.push(p); } };
  walk(root);
  it("scans the production source", () => { expect(files.length).toBeGreaterThan(10); });
  it("has no demonstration brand names, example metrics or fixture data", () => {
    for (const f of files) {
      const body = fs.readFileSync(f, "utf8");
      for (const term of [/\bfonzo\b/i, /maison aurelle/i, /clearskin/i, /northgate/i, /wow charity/i, /\b128\.4K\b/, /\b12\.6K\b/]) expect(body, `${path.relative(root, f)} must not match ${term}`).not.toMatch(term);
    }
  });
});
