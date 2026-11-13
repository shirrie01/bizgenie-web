// BG-WEB-LAUNCH-CLOSURE-18: fail-closed gate between a build-time feature flag and a customer-visible control. See apiCompatibility.js.
// A flag alone never shows a control that needs a backend capability: the build must also declare the API revision it targets and that revision must be
// verified in the manifest for the capability. Missing, malformed or unlisted evidence means OFF.
import { API_COMPATIBILITY } from "./apiCompatibility";

export const CAPABILITIES = Object.freeze(["quotedGeneration", "workspaceCalendar", "mediaIntake", "social", "learning", "commercialCatalogue", "creditPreview", "billingManagement"]);
const PROVIDERS = ["instagram", "facebook", "linkedin", "tiktok", "youtube"];
// Each customer-facing feature: its build flag and the backend capability it depends on.
export const FEATURES = Object.freeze({
  generationQuote: { flag: "VITE_GENERATION_QUOTE_API", capability: "quotedGeneration" },
  customerMedia: { flag: "VITE_CUSTOMER_MEDIA_API", capability: "quotedGeneration" },
  workspaceCalendar: { flag: "VITE_WORKSPACE_CALENDAR_API", capability: "workspaceCalendar" },
  unschedule: { flag: "VITE_UNSCHEDULE_API", capability: "workspaceCalendar" },
  mediaIntake: { flag: "VITE_CUSTOMER_MEDIA_INTAKE_API", capability: "mediaIntake" },
  mediaDelete: { flag: "VITE_CUSTOMER_MEDIA_DELETE_API", capability: "mediaIntake" },
  social: { flag: "VITE_SOCIAL_ACCOUNTS_API", capability: "social" },
  analytics: { flag: "VITE_ANALYTICS_API", capability: "learning" },
  planCatalogue: { flag: "VITE_PLAN_CATALOGUE_API", capability: "commercialCatalogue" },
  creditPreview: { flag: "VITE_CREDIT_PREVIEW_API", capability: "creditPreview" },
  billingManagement: { flag: "VITE_BILLING_MANAGEMENT_API", capability: "billingManagement" },
});

const SHA = /^[0-9a-f]{40}$/;
const truthy = (v) => typeof v === "string" && v.trim().toLowerCase() === "true";
const https = (v) => { try { const u = new URL(v); return u.protocol === "https:" && !u.username && !u.password; } catch { return false; } };
const text = (v, max = 200) => typeof v === "string" && v.trim().length > 0 && v.length <= max;

// A manifest entry that is not exactly well-formed is ignored (never partly trusted).
export function validEntries(manifest = API_COMPATIBILITY) {
  const good = []; const problems = [];
  if (!manifest || manifest.schema !== 1 || !Array.isArray(manifest.revisions)) return { good, problems: ["manifest schema"] };
  manifest.revisions.forEach((e, i) => {
    const caps = e && e.capabilities;
    const ok = e && typeof e === "object" && typeof e.sourceSha === "string" && SHA.test(e.sourceSha) && text(e.servingRevision) && text(e.verifiedAt, 40) && Number.isFinite(Date.parse(e.verifiedAt))
      && typeof e.evidence === "string" && https(e.evidence) && caps && typeof caps === "object" && Object.keys(caps).length > 0
      && Object.entries(caps).every(([k, v]) => CAPABILITIES.includes(k) && v === true)
      && (e.socialProviders === undefined || (Array.isArray(e.socialProviders) && e.socialProviders.every((p) => PROVIDERS.includes(p))));
    if (ok) good.push(e); else problems.push(`entry ${i}`);
  });
  return { good, problems };
}

const hostOf = (u) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ""; } };
// A browser test double (reserved .test/.example/.invalid/.localhost names or loopback) cannot be a deployed API revision, so revision compatibility does not apply to it.
export function isMockApiHost(apiUrl) {
  const h = hostOf(apiUrl);
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || /\.(test|example|invalid|localhost)$/.test(h);
}
// Unit tests run lenient unless a test asks for enforcement; no release build runs in test mode.
const runtimeMode = () => (typeof import.meta !== "undefined" && import.meta.env ? import.meta.env.MODE : "production");

// → { enabled, state }. state: flag_off | not_applicable_mock_api | not_applicable_test_mode | api_revision_undeclared | api_revision_malformed | revision_not_in_manifest | capability_not_verified | verified
export function featureAvailability(feature, env = import.meta.env, { manifest = API_COMPATIBILITY, mode = runtimeMode(), flagOverride } = {}) {
  const f = FEATURES[feature];
  if (!f) return { enabled: false, state: "unknown_feature" };
  const flag = flagOverride !== undefined ? Boolean(flagOverride) : truthy(env && env[f.flag]);
  if (!flag) return { enabled: false, state: "flag_off" };
  if (mode === "test" && !(env && env.VITE_API_COMPAT_MODE === "enforce")) return { enabled: true, state: "not_applicable_test_mode" };
  if (env && isMockApiHost(env.VITE_BIZGENIE_API_URL)) return { enabled: true, state: "not_applicable_mock_api" };
  const sha = env && typeof env.VITE_API_SOURCE_SHA === "string" ? env.VITE_API_SOURCE_SHA.trim().toLowerCase() : "";
  const rev = env && typeof env.VITE_API_SERVING_REVISION === "string" ? env.VITE_API_SERVING_REVISION.trim() : "";
  if (!sha && !rev) return { enabled: false, state: "api_revision_undeclared" };
  if (!SHA.test(sha) || !text(rev)) return { enabled: false, state: "api_revision_malformed" };
  const entry = validEntries(manifest).good.find((e) => e.sourceSha === sha && e.servingRevision === rev);
  if (!entry) return { enabled: false, state: "revision_not_in_manifest" };
  if (entry.capabilities[f.capability] !== true) return { enabled: false, state: "capability_not_verified" };
  return { enabled: true, state: "verified", entry };
}
export const featureEnabled = (feature, env, opts) => featureAvailability(feature, env, opts).enabled;

// Social providers the build may offer: the listed ones, narrowed to those the verified revision supports. Returns null when the gate does not narrow (test/mock).
export function verifiedSocialProviders(env = import.meta.env, opts = {}) {
  const a = featureAvailability("social", env, { ...opts, flagOverride: true });
  if (a.state === "not_applicable_test_mode" || a.state === "not_applicable_mock_api") return null;
  return a.enabled ? (a.entry.socialProviders || []) : [];
}
