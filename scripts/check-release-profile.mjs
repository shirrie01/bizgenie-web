// BG-RELEASE08-WEB-COMPAT-01: build-time gate used by the staging release workflow when route_profile is set. Run with vite-node (it resolves the src/ imports).
//   RELEASE_PROFILE=bridge-founder-release04 API_SOURCE_SHA=<40 hex> API_SERVING_REVISION=<revision> npx vite-node scripts/check-release-profile.mjs
// Exit 0 only when the reviewed manifest lists exactly that API source SHA + serving revision with exactly this stage's capabilities. Prints codes, never values.
import { checkReleaseProfile, RELEASE04_PROFILE } from "../src/premium/releaseProfile";

const profile = process.env.RELEASE_PROFILE ?? "";
if (profile !== RELEASE04_PROFILE) { console.error("RELEASE_PROFILE_UNKNOWN"); process.exit(2); }
const r = checkReleaseProfile({ sha: process.env.API_SOURCE_SHA, revision: process.env.API_SERVING_REVISION });
if (!r.ok) { console.error("RELEASE_PROFILE_REFUSED: " + r.problems.join(",")); process.exit(1); }
console.log("RELEASE_PROFILE_OK: reviewed manifest verifies the exact API source SHA and serving revision for this stage");
