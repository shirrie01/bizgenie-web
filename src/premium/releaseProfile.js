// BG-RELEASE08-WEB-COMPAT-01: the founder staging release profile `bridge-founder-release04`, as a pure, testable contract.
// The release workflow (route_profile input) builds the Studio for the trusted founder bridge. Which controls may appear is still decided by featureGate.js from the declared API
// identity (VITE_API_SOURCE_SHA + VITE_API_SERVING_REVISION) and the reviewed manifest (apiCompatibility.js); nothing here widens that. This module only states what THIS stage allows and
// refuses a release whose reviewed manifest entry says anything else, so a build for an unknown API source SHA or revision, a wildcard, or an entry that lists media intake, social providers,
// generation, billing or analytics fails closed BEFORE any deployment.
import { featureAvailability, FEATURES, validEntries } from "./featureGate";
import { API_COMPATIBILITY } from "./apiCompatibility";

export const RELEASE04_PROFILE = "bridge-founder-release04";
// The WEB build flags the workflow sets for this profile and nothing else (a test asserts the workflow's profile build step carries exactly these).
export const RELEASE04_FLAGS = Object.freeze({
  VITE_PREMIUM_STUDIO_ENABLED: "true",
  VITE_FOUNDER_CAMPAIGN_ROOT_API: "true",
  VITE_CONTENT_PLAN_API: "true",
  VITE_COPY_EDIT_API: "true",
  VITE_WORKSPACE_CALENDAR_API: "true",
});
// Features this stage turns on (A0-A2 without artwork intake, social, generation or billing) and the manifest capabilities they need. A manifest entry for this profile lists EXACTLY these.
export const RELEASE04_FEATURES = Object.freeze(["founderCampaignRoot", "contentPlan", "copyEditing", "workspaceCalendar"]);
export const RELEASE04_CAPABILITIES = Object.freeze(["contentPlan", "copyRevisions", "founderCampaignRoot", "workspaceCalendar"]);
export const BRIDGE_ORIGIN = "https://bizgenie-studio-bridge-staging-303691956826.europe-west1.run.app";
export const SHA_PATTERN = /^[0-9a-f]{40}$/;
export const REVISION_PATTERN = /^bizgenie-api-staging-[0-9]{5}-[a-z0-9]{3}$/;

// → { ok, problems: string[] } (codes only; never a value). `manifest` defaults to the shipped manifest.
export function checkReleaseProfile({ sha, revision, manifest = API_COMPATIBILITY } = {}) {
  const problems = [];
  if (typeof sha !== "string" || !SHA_PATTERN.test(sha)) problems.push("API_SOURCE_SHA_MALFORMED");
  if (typeof revision !== "string" || !REVISION_PATTERN.test(revision)) problems.push("API_SERVING_REVISION_MALFORMED");
  if (problems.length) return { ok: false, problems };
  const entry = validEntries(manifest).good.find((e) => e.sourceSha === sha && e.servingRevision === revision);
  if (!entry) return { ok: false, problems: ["API_PAIR_NOT_IN_REVIEWED_MANIFEST"] };
  const listed = Object.keys(entry.capabilities).sort();
  if (listed.length !== RELEASE04_CAPABILITIES.length || listed.some((c, i) => c !== RELEASE04_CAPABILITIES[i])) problems.push("MANIFEST_CAPABILITIES_NOT_EXACTLY_THIS_STAGE");
  if (entry.socialProviders !== undefined && entry.socialProviders.length > 0) problems.push("MANIFEST_LISTS_SOCIAL_PROVIDERS");
  const env = { ...RELEASE04_FLAGS, VITE_BIZGENIE_API_URL: BRIDGE_ORIGIN, VITE_API_ROUTE_LIMITS: RELEASE04_PROFILE, VITE_API_SOURCE_SHA: sha, VITE_API_SERVING_REVISION: revision };
  for (const feature of Object.keys(FEATURES)) {
    const a = featureAvailability(feature, env, { manifest, mode: "production" });
    if (RELEASE04_FEATURES.includes(feature)) { if (!(a.enabled === true && a.state === "verified")) problems.push(`FEATURE_NOT_VERIFIED:${feature}`); }
    else if (a.enabled) problems.push(`FEATURE_UNEXPECTEDLY_ON:${feature}`);
  }
  return { ok: problems.length === 0, problems };
}
