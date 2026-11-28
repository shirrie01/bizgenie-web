// @vitest-environment node
import { describe, it, expect } from "vitest";
import { RELEASE_STAGES, checkReleaseProfile, RELEASE04_FLAGS, RELEASE04_CAPABILITIES, RELEASE04_FEATURES, RELEASE04_PROFILE, BRIDGE_ORIGIN } from "./releaseProfile";
import { featureAvailability, FEATURES } from "./featureGate";
import { API_COMPATIBILITY } from "./apiCompatibility";

// Synthetic values only: the real serving API revision does not exist yet and must be bound by a reviewed change, never guessed.
const SHA = "a".repeat(40), REV = "bizgenie-api-staging-00099-zzz", OTHER_REV = "bizgenie-api-staging-00098-yyy";
const entry = (o = {}) => ({ sourceSha: SHA, servingRevision: REV, verifiedAt: "2026-11-26T00:00:00Z", evidence: "https://github.com/shirrie01/bizgenie-api/issues/191#issuecomment-1", capabilities: Object.fromEntries(RELEASE04_CAPABILITIES.map((c) => [c, true])), bridge: { evidence: "https://github.com/shirrie01/bizgenie-api/issues/191#issuecomment-2", capabilities: Object.fromEntries(RELEASE04_CAPABILITIES.map((c) => [c, true])) }, ...o });
const manifest = (...entries) => ({ schema: 1, revisions: entries });
const env = (extra = {}) => ({ ...RELEASE04_FLAGS, VITE_BIZGENIE_API_URL: BRIDGE_ORIGIN, VITE_API_ROUTE_LIMITS: RELEASE04_PROFILE, VITE_API_SOURCE_SHA: SHA, VITE_API_SERVING_REVISION: REV, ...extra });
const gate = (feature, e, m) => featureAvailability(feature, e, { manifest: m, mode: "production" });

describe("founder release profile (bridge-founder-release04)", () => {
  it("is exactly the A0-A2 stage without intake, social, generation or billing", () => {
    expect(RELEASE04_PROFILE).toBe("bridge-founder-release04");
    expect(Object.keys(RELEASE04_FLAGS).sort()).toEqual(["VITE_CONTENT_PLAN_API", "VITE_COPY_EDIT_API", "VITE_FOUNDER_CAMPAIGN_ROOT_API", "VITE_PREMIUM_STUDIO_ENABLED", "VITE_WORKSPACE_CALENDAR_API"]);
    expect([...RELEASE04_CAPABILITIES]).toEqual(["contentPlan", "copyRevisions", "founderCampaignRoot", "workspaceCalendar"]);
    expect([...RELEASE04_FEATURES].sort()).toEqual(["contentPlan", "copyEditing", "founderCampaignRoot", "workspaceCalendar"]);
  });
  it("accepts the exact reviewed pair and turns on campaign root, content planning, copy editing and workspace calendar, verified", () => {
    const m = manifest(entry());
    expect(checkReleaseProfile({ sha: SHA, revision: REV, manifest: m })).toEqual({ ok: true, problems: [] });
    for (const f of RELEASE04_FEATURES) expect(gate(f, env(), m), f).toMatchObject({ enabled: true, state: "verified" });
  });
  it("keeps media intake, media delete, social, generation, billing, analytics and every other feature OFF even if their flags were switched on by mistake", () => {
    const allOn = env(Object.fromEntries(Object.values(FEATURES).map((f) => [f.flag, "true"])));
    const m = manifest(entry());
    // `unschedule` rides on the stage's own workspaceCalendar capability and its route is admitted by the founder bridge; the workflow leaves its flag off, so it is not part of this stage's build.
    for (const [f] of Object.entries(FEATURES)) if (!RELEASE04_FEATURES.includes(f) && f !== "unschedule") expect(gate(f, allOn, m).enabled, f).toBe(false);
    expect(gate("unschedule", env(), m)).toMatchObject({ enabled: false, state: "flag_off" });
    expect(gate("mediaIntake", allOn, m).state).toBe("capability_not_verified");
    expect(gate("social", allOn, m).state).toBe("capability_not_verified");
    expect(gate("analytics", allOn, m).state).toBe("not_carried_by_bridge");
    expect(gate("billingManagement", allOn, m).state).toBe("not_carried_by_bridge");
  });

  it("API identity alone never authorises A1/A2 capabilities behind the founder bridge: the bridge's own permissions must be evidenced", () => {
    const noBridge = (() => { const e = entry(); delete e.bridge; return e; })();
    const m = manifest(noBridge);
    expect(checkReleaseProfile({ sha: SHA, revision: REV, manifest: m }).problems).toContain("BRIDGE_PERMISSIONS_NOT_EVIDENCED_FOR_THIS_STAGE");
    for (const f of RELEASE04_FEATURES) expect(gate(f, env(), m), f).toMatchObject({ enabled: false, state: "bridge_permission_not_evidenced" });
    // partial evidence enables only what it evidences, and the profile build is still refused
    const partial = manifest(entry({ bridge: { evidence: "https://github.com/shirrie01/bizgenie-api/issues/191#issuecomment-2", capabilities: { contentPlan: true } } }));
    expect(gate("contentPlan", env(), partial).enabled).toBe(true);
    for (const f of ["founderCampaignRoot", "copyEditing", "workspaceCalendar"]) expect(gate(f, env(), partial).state, f).toBe("bridge_permission_not_evidenced");
    expect(checkReleaseProfile({ sha: SHA, revision: REV, manifest: partial }).problems).toContain("BRIDGE_PERMISSIONS_NOT_EVIDENCED_FOR_THIS_STAGE");
    // malformed bridge evidence makes the whole entry untrusted
    for (const bad of [{ evidence: "http://insecure", capabilities: { contentPlan: true } }, { evidence: "https://x.test/y", capabilities: { contentPlan: "yes" } }, { evidence: "https://x.test/y", capabilities: { unknownCap: true } }, { evidence: "https://x.test/y", capabilities: {} }, "yes"]) {
      expect(checkReleaseProfile({ sha: SHA, revision: REV, manifest: manifest(entry({ bridge: bad })) }).problems).toEqual(["API_PAIR_NOT_IN_REVIEWED_MANIFEST"]);
    }
    // the evidence is only demanded behind the founder bridge: the default release's rules are unchanged
    expect(gate("contentPlan", { ...env(), VITE_API_ROUTE_LIMITS: "" }, m)).toMatchObject({ enabled: true, state: "verified" });
  });
  it("fails closed for missing or malformed API identity (undefined, empty, whitespace, short, uppercase, non-string)", () => {
    const m = manifest(entry());
    for (const bad of [undefined, "", " ", SHA.slice(1), SHA.toUpperCase(), 7, null]) expect(checkReleaseProfile({ sha: bad, revision: REV, manifest: m }).problems).toEqual(["API_SOURCE_SHA_MALFORMED"]);
    for (const bad of [undefined, "", " ", "latest", "bizgenie-api-staging-*", "bizgenie-api-staging-00099-*", "bizgenie-api-staging-99-zz", "bizgenie-api-staging-00099-zzz ", "BIZGENIE-API-STAGING-00099-ZZZ", 7, null]) expect(checkReleaseProfile({ sha: SHA, revision: bad, manifest: m }).problems).toEqual(["API_SERVING_REVISION_MALFORMED"]);
    expect(checkReleaseProfile({ sha: SHA, revision: REV, manifest: m }).ok).toBe(true);
  });
  it("fails closed for an unknown source SHA or revision, and one pair's entry never verifies another pair", () => {
    const m = manifest(entry(), entry({ sourceSha: "b".repeat(40), servingRevision: OTHER_REV }));
    expect(checkReleaseProfile({ sha: SHA, revision: OTHER_REV, manifest: m }).problems).toEqual(["API_PAIR_NOT_IN_REVIEWED_MANIFEST"]);
    expect(checkReleaseProfile({ sha: "c".repeat(40), revision: REV, manifest: m }).problems).toEqual(["API_PAIR_NOT_IN_REVIEWED_MANIFEST"]);
    expect(checkReleaseProfile({ sha: SHA, revision: "bizgenie-api-staging-00097-xxx", manifest: m }).problems).toEqual(["API_PAIR_NOT_IN_REVIEWED_MANIFEST"]);
    // a build env that declares a pair the manifest does not list keeps every feature off
    expect(gate("copyEditing", env({ VITE_API_SERVING_REVISION: OTHER_REV }), manifest(entry()))).toMatchObject({ enabled: false, state: "revision_not_in_manifest" });
    expect(gate("copyEditing", env({ VITE_API_SOURCE_SHA: "" , VITE_API_SERVING_REVISION: "" }), manifest(entry()))).toMatchObject({ enabled: false, state: "api_revision_undeclared" });
  });
  it("refuses a manifest entry that lists more than this stage (media intake, social, generation, billing) or less, or a malformed one", () => {
    const code = (o) => checkReleaseProfile({ sha: SHA, revision: REV, manifest: manifest(entry(o)) });
    expect(code({ capabilities: { ...entry().capabilities, mediaIntake: true } }).problems).toContain("MANIFEST_CAPABILITIES_NOT_EXACTLY_THIS_STAGE");
    expect(code({ capabilities: { ...entry().capabilities, social: true }, socialProviders: ["linkedin"] }).ok).toBe(false);
    expect(code({ capabilities: { ...entry().capabilities, quotedGeneration: true } }).problems).toContain("MANIFEST_CAPABILITIES_NOT_EXACTLY_THIS_STAGE");
    expect(code({ socialProviders: ["linkedin"] }).problems).toContain("MANIFEST_LISTS_SOCIAL_PROVIDERS");
    const { workspaceCalendar, ...fewer } = entry().capabilities;
    expect(code({ capabilities: fewer }).problems).toEqual(expect.arrayContaining(["MANIFEST_CAPABILITIES_NOT_EXACTLY_THIS_STAGE", "FEATURE_NOT_VERIFIED:workspaceCalendar"]));
    expect(code({ evidence: "http://insecure.example/x" }).problems).toEqual(["API_PAIR_NOT_IN_REVIEWED_MANIFEST"]);
    expect(code({ capabilities: { ...entry().capabilities, mediaIntake: "yes" } }).problems).toEqual(["API_PAIR_NOT_IN_REVIEWED_MANIFEST"]);
  });
  it("refuses today's shipped manifest: nothing is bound until a reviewed change adds the exact API pair", () => {
    expect(API_COMPATIBILITY.revisions).toHaveLength(0);
    expect(checkReleaseProfile({ sha: SHA, revision: REV }).problems).toEqual(["API_PAIR_NOT_IN_REVIEWED_MANIFEST"]);
  });
  it("the default release is unaffected: without the profile marker the same flags still need the manifest, and bridge-v1 still blocks copy editing", () => {
    const m = manifest(entry());
    const plain = { VITE_COPY_EDIT_API: "true", VITE_API_SOURCE_SHA: SHA, VITE_API_SERVING_REVISION: REV, VITE_BIZGENIE_API_URL: BRIDGE_ORIGIN };
    expect(gate("copyEditing", { ...plain, VITE_API_ROUTE_LIMITS: "bridge-v1" }, m)).toMatchObject({ enabled: false, state: "not_carried_by_bridge" });
    expect(gate("copyEditing", plain, manifest())).toMatchObject({ enabled: false, state: "revision_not_in_manifest" });
    expect(gate("copyEditing", { VITE_BIZGENIE_API_URL: BRIDGE_ORIGIN }, m)).toMatchObject({ enabled: false, state: "flag_off" });
  });

  describe("stage-aware gate (A1 vs A2)", () => {
    const e1 = () => entry({ capabilities: Object.fromEntries(RELEASE_STAGES.a1.capabilities.map((c) => [c, true])), bridge: { evidence: "https://github.com/shirrie01/bizgenie-api/issues/191#issuecomment-2", capabilities: Object.fromEntries(RELEASE_STAGES.a1.capabilities.map((c) => [c, true])) } });
    it("a1 accepts exactly campaign root + content plan and leaves drafts, copy editing and calendar off", () => {
      const m = manifest(e1());
      expect(checkReleaseProfile({ sha: SHA, revision: REV, manifest: m, stage: "a1" })).toEqual({ ok: true, problems: [] });
      for (const f of ["copyEditing", "workspaceCalendar"]) expect(gate(f, env(), m).enabled, f).toBe(false);
    });
    it("the shipped manifest is empty, so every stage is refused until a real verified API pair is reviewed in", () => {
      for (const stage of ["a1", "a2"]) expect(checkReleaseProfile({ sha: SHA, revision: REV, stage })).toEqual({ ok: false, problems: ["API_PAIR_NOT_IN_REVIEWED_MANIFEST"] });
    });
    it("a stage never accepts the other stage's manifest, and unknown stages fail closed; the default stays a2", () => {
      expect(checkReleaseProfile({ sha: SHA, revision: REV, manifest: manifest(e1()) }).ok).toBe(false);
      expect(checkReleaseProfile({ sha: SHA, revision: REV, manifest: manifest(entry()), stage: "a1" }).ok).toBe(false);
      for (const bad of ["a0", "a3", "A1", "", "__proto__", "constructor"]) expect(checkReleaseProfile({ sha: SHA, revision: REV, manifest: manifest(entry()), stage: bad })).toEqual({ ok: false, problems: ["RELEASE_STAGE_UNKNOWN"] });
    });
  });
});
