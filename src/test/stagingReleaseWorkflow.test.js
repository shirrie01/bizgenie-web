// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const wf = readFileSync(".github/workflows/studio-staging-release.yml", "utf8");
describe("staging release workflow guards (BG-LAUNCH-013)", () => {
  it("is manual only", () => {
    const on = wf.slice(wf.indexOf("\non:"), wf.indexOf("\npermissions:"));
    expect(on).toMatch(/workflow_dispatch/); expect(on).not.toMatch(/\bpush:|pull_request|schedule:|workflow_run|release:/);
  });
  it("deploys only on request, only through a protected environment, and never in the secret-free build job", () => {
    const [build, deploy] = wf.split(/\n  deploy:\n/);
    expect(wf).toMatch(/deploy:\s*\n\s+description:[^\n]*\n\s+type: boolean\n\s+default: false/);
    expect(deploy).toMatch(/if: \$\{\{ inputs\.deploy \}\}/); expect(deploy).toMatch(/environment: staging-studio/);
    expect(build).not.toMatch(/secrets\./); expect(build).not.toMatch(/wrangler|CLOUDFLARE/);
  });
  it("pins the SHA, builds from the lockfile with the environment guards and verifies before any deploy", () => {
    expect(wf).toMatch(/\^\[0-9a-f\]\{40\}\$/); expect(wf).toMatch(/npm ci/); expect(wf).not.toMatch(/package-lock=false/);
    for (const g of ["PAGES_EXPECT_API_ORIGIN", "PAGES_EXPECT_SUPABASE_REF", "PAGES_NOINDEX", "smoke-pages.mjs --dir", "smoke-pages.mjs --url"]) expect(wf).toContain(g);
    expect(wf).toMatch(/sb_secret_/); expect(wf).not.toMatch(/(?<!staging-)api\.getbizgenie\.com|uvgblmejpbswkvlqvqmz/);
    expect(wf).toMatch(/PREVIOUS_DEPLOYMENT_ID/);
  });
  it("agrees with qa/hosted/staging-settings.json, deploys to the configured production branch, and only smoke-tests the approved host (BG-LAUNCH-017)", () => {
    const S = JSON.parse(readFileSync("qa/hosted/staging-settings.json", "utf8"));
    expect(wf).toContain(`STAGING_API_ORIGIN: ${S.api_origin}`); expect(wf).toContain(`STAGING_SUPABASE_URL: ${S.supabase_origin}`);
    expect(wf).toContain(`STAGING_SUPABASE_REF: ${S.supabase_ref}`); expect(wf).toContain(`PAGES_PROJECT: ${S.pages_project}`); expect(wf).toContain(`PAGES_PRODUCTION_BRANCH: ${S.pages_production_branch}`);
    expect(wf).toContain(`default: 'https://${S.studio_hostname}'`);
    expect(wf).toContain('--branch "${PROJECT_PRODUCTION_BRANCH:-$PAGES_PRODUCTION_BRANCH}"'); expect(wf).not.toMatch(/default_branch/);
    expect(wf).toMatch(/smoke_url must be the approved staging Studio host/);
    for (const ref of S.never_ref) expect(wf).not.toContain(ref);
  });
  it("the API origin is the default staging host or one approved in this file, checked before any build (BG-017C-05B)", () => {
    const S = JSON.parse(readFileSync("qa/hosted/staging-settings.json", "utf8"));
    expect(wf).toContain(`APPROVED_API_ORIGINS: ${S.approved_api_origins.join(" ")}`);
    expect(S.approved_api_origins).toContain(S.api_origin); expect(S.bridge.origin).toBe("https://bizgenie-studio-bridge-staging-303691956826.europe-west1.run.app"); expect(S.bridge_api_origins).toEqual([S.bridge.origin]); expect(S.approved_api_origins).toEqual([S.api_origin, S.bridge.origin]); // BG-017C-06: exactly one founder-allowlisted bridge origin, no wildcard
    expect(S.bridge.origin).toMatch(/^https:\/\/[a-z0-9-]+\.europe-west1\.run\.app$/);
    expect(wf).toMatch(/api_origin:\n\s+description:[^\n]*\n\s+required: false\n\s+default: ''/);
    const resolveAt = wf.indexOf("id: api"), buildAt = wf.indexOf("Build for staging"), shaAt = wf.indexOf("Refuse anything but a full SHA");
    expect(resolveAt).toBeGreaterThan(0); expect(resolveAt).toBeLessThan(shaAt); expect(shaAt).toBeLessThan(buildAt);
    expect(wf).toContain("VITE_BIZGENIE_API_URL: ${{ steps.api.outputs.origin }}"); expect(wf).toContain("PAGES_EXPECT_API_ORIGIN: ${{ steps.api.outputs.origin }}");
    expect(wf).toContain("is not in APPROVED_API_ORIGINS"); expect(wf).toMatch(/--api "\$\{\{ needs\.build-verify\.outputs\.api_origin \}\}"/);
    expect(wf).not.toMatch(/api_origin: ['"]?https:\/\/(?!staging-api)/); // no unverified host is written into the workflow
  });
  it("the origin check accepts the default, accepts a listed origin, and refuses anything else (bash, as the workflow runs it)", () => {
    const run = (requested, approved) => { try { return execFileSync("bash", ["-c", `STAGING_API_ORIGIN=https://staging-api.getbizgenie.com; APPROVED_API_ORIGINS='${approved}'; REQUESTED='${requested}'; ORIGIN="\${REQUESTED:-$STAGING_API_ORIGIN}"; echo "$ORIGIN" | grep -Eq '^https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?$' || exit 3; case " $APPROVED_API_ORIGINS " in *" $ORIGIN "*) echo "$ORIGIN";; *) exit 4;; esac`]).toString(); } catch (e) { return `exit${e.status}`; } };
    const approved = "https://staging-api.getbizgenie.com";
    expect(run("", approved)).toBe("https://staging-api.getbizgenie.com\n");
    expect(run("https://bridge.example.test", approved + " https://bridge.example.test")).toBe("https://bridge.example.test\n");
    expect(run("https://bridge.example.test", approved)).toBe("exit4"); expect(run("https://localhost", approved)).toBe("exit4");
    for (const bad of ["http://staging-api.getbizgenie.com", "https://staging-api.getbizgenie.com/", "https://staging-api.getbizgenie.com:8443", "https://user@staging-api.getbizgenie.com", "https://x.test/path"]) expect(run(bad, approved + " " + bad), bad).toBe("exit3");
  });
  it("a build for a listed bridge origin (and only that) carries the route-limits marker (BG-017C-05B)", () => {
    const S = JSON.parse(readFileSync("qa/hosted/staging-settings.json", "utf8"));
    expect(wf).toContain(`BRIDGE_API_ORIGINS: '${S.bridge_api_origins.join(" ")}'`);
    for (const o of S.bridge_api_origins) expect(S.approved_api_origins).toContain(o); // a bridge origin must also be approved
    expect(wf).toContain("VITE_API_ROUTE_LIMITS: ${{ steps.api.outputs.limits }}"); expect(wf).toContain('echo "limits=bridge-v1"');
    const run = (origin, bridge) => execFileSync("bash", ["-c", `BRIDGE_API_ORIGINS='${bridge}'; ORIGIN='${origin}'; case " $BRIDGE_API_ORIGINS " in *" $ORIGIN "*) echo "limits=bridge-v1";; *) echo "limits=";; esac`]).toString().trim();
    expect(run("https://staging-api.getbizgenie.com", "")).toBe("limits="); expect(run("https://b.example.test", "https://b.example.test")).toBe("limits=bridge-v1"); expect(run("https://staging-api.getbizgenie.com", "https://b.example.test")).toBe("limits=");
  });
  it("deploy=true is refused unless the origin is a listed trusted-bridge origin; build-only stays allowed (BG-017C-05B closure)", () => {
    const wf = readFileSync(".github/workflows/studio-staging-release.yml", "utf8");
    expect(wf).toContain("DEPLOY: '${{ inputs.deploy }}'"); expect(wf).toContain("deploy=true refused");
    const run = (deploy, origin, bridge) => { try { return execFileSync("bash", ["-c", `DEPLOY='${deploy}'; BRIDGE_API_ORIGINS='${bridge}'; ORIGIN='${origin}'; if [ "$DEPLOY" = "true" ]; then case " $BRIDGE_API_ORIGINS " in *" $ORIGIN "*) ;; *) exit 1;; esac; fi; echo ok`]).toString().trim(); } catch (e) { return `exit${e.status}`; } };
    const priv = "https://staging-api.getbizgenie.com";
    expect(run("false", priv, "")).toBe("ok"); expect(run("true", priv, "")).toBe("exit1"); expect(run("true", "https://localhost", "")).toBe("exit1");
    expect(run("true", "https://b.example.test", "https://b.example.test")).toBe("ok");
  });
});

// BG-WEB-LAUNCH-CLOSURE-14: the Studio footer destinations reach the staging build ONLY from repository variables the founder sets once the pages are approved.
describe("staging legal and support destinations", () => {
  it("maps each footer setting from its own STAGING_* repository variable, with no literal URL, and nowhere else", () => {
    for (const [vite, v] of [["VITE_SUPPORT_URL", "STAGING_SUPPORT_URL"], ["VITE_TERMS_URL", "STAGING_TERMS_URL"], ["VITE_PRIVACY_URL", "STAGING_PRIVACY_URL"]]) {
      const m = wf.match(new RegExp(`^\\s+${vite}: (.+)$`, "m")); expect(m, vite).toBeTruthy();
      expect(m[1].trim()).toBe("${{ vars." + v + " }}");
      const all = [...wf.matchAll(new RegExp(`^\\s+${vite}: (.+)$`, "gm"))].map((x) => x[1].trim());
      expect(all, `${vite} appears once per build step (default release, founder profile) and always from its repository variable`).toEqual(["${{ vars." + v + " }}", "${{ vars." + v + " }}"]);
      expect((wf.match(new RegExp(vite, "g")) || []).length, `${vite} appears nowhere else`).toBe(2);
    }
  });
  it("these settings are optional by design: the build does not fail when they are unset (the footer then says 'not set up yet')", () => {
    const step = wf.slice(wf.indexOf("Build for staging"), wf.indexOf("Verify headers"));
    expect(step).not.toMatch(/test -n "\$VITE_(SUPPORT|TERMS|PRIVACY)_URL"/);
  });
});

// BG-WEB-LAUNCH-CLOSURE-18: what the staging release build actually exposes. The workflow turns several feature flags on; the compatibility gate (src/premium/featureGate.js)
// then decides, from the declared API revision and the reviewed manifest, whether each control is shown. No revision is declared and the manifest is empty, so none is.
import { featureAvailability, FEATURES } from "../premium/featureGate";
import { API_COMPATIBILITY } from "../premium/apiCompatibility";
describe("staging release: feature exposure under the compatibility gate", () => {
  const build = wf.slice(wf.indexOf("Build for staging"), wf.indexOf("Verify headers"));
  const env = Object.fromEntries([...build.matchAll(/^\s+(VITE_[A-Z_]+): (.+)$/gm)].map((m) => [m[1], m[2].replace(/^'|'$/g, "").trim()]));
  env.VITE_BIZGENIE_API_URL = (wf.match(/STAGING_API_ORIGIN: (\S+)/) || [])[1]; // the real staging origin, not a test double
  it("turns on the flags it turns on, and declares no API revision (nothing to verify against)", () => {
    expect(Object.keys(env).filter((k) => /_API$/.test(k) && env[k] === "true").sort()).toEqual(["VITE_CUSTOMER_MEDIA_API", "VITE_GENERATION_QUOTE_API", "VITE_SOCIAL_ACCOUNTS_API", "VITE_WORKSPACE_CALENDAR_API"]);
    // The DEFAULT build step still declares no API revision; only the opt-in founder profile step does, and only from its validated inputs (never a literal).
    expect(build).not.toMatch(/VITE_API_SOURCE_SHA|VITE_API_SERVING_REVISION|VITE_API_COMPAT_MODE/);
    expect(wf).not.toMatch(/VITE_API_COMPAT_MODE/);
    expect((wf.match(/VITE_API_SOURCE_SHA: (.+)/g) || [])).toEqual(["VITE_API_SOURCE_SHA: ${{ inputs.api_source_sha }}"]);
    expect((wf.match(/VITE_API_SERVING_REVISION: (.+)/g) || [])).toEqual(["VITE_API_SERVING_REVISION: ${{ inputs.api_serving_revision }}"]);
  });
  it("with the shipped (empty) manifest every flagged feature is OFF in the built bundle, so no control can reach an unverified backend", () => {
    expect(API_COMPATIBILITY.revisions).toHaveLength(0);
    for (const [feature, f] of Object.entries(FEATURES)) {
      const a = featureAvailability(feature, env, { mode: "production" });
      expect(a.enabled, `${feature} (${f.flag}=${env[f.flag]})`).toBe(false);
      expect(a.state, feature).toBe(env[f.flag] === "true" ? "api_revision_undeclared" : "flag_off");
    }
  });
  it("if a later workflow edit does declare an API revision, the manifest must already verify it", () => {
    const sha = (wf.match(/VITE_API_SOURCE_SHA: (\S+)/) || [])[1]; if (!sha) return;
    if (sha === "${{") return; // the founder profile takes it from the validated input; scripts/check-release-profile.mjs then requires the exact pair in the manifest (see the profile tests below)
    expect(API_COMPATIBILITY.revisions.some((e) => e.sourceSha === sha.replace(/['"]/g, ""))).toBe(true);
  });
});

// BG-RELEASE08-WEB-COMPAT-01: the opt-in founder release profile. The default release must be byte-for-byte what it was; the profile is a separate, mutually exclusive build that fails closed.
import { RELEASE04_FLAGS, RELEASE04_PROFILE } from "../premium/releaseProfile";
describe("founder release profile (route_profile) in the staging release workflow", () => {
  const steps = wf.split(/\n      - /).slice(1).map((t) => "      - " + t);
  const stepOf = (marker) => { const m = steps.filter((t) => t.includes(marker)); expect(m, marker).toHaveLength(1); return m[0]; };
  const envOf = (step) => Object.fromEntries([...step.matchAll(/^\s{10}(VITE_[A-Z_]+|PAGES_[A-Z_]+): (.+)$/gm)].map((x) => [x[1], x[2].replace(/^'|'$/g, "").trim()]));
  const scriptOf = (step) => step.slice(step.indexOf("run: |\n") + 7).split("\n").map((l) => l.replace(/^ {10}/, "")).join("\n");
  const defaultBuild = stepOf("Build for staging (fails closed"), profileBuild = stepOf("Build the founder release profile"), validate = stepOf("id: profile"), gateStep = stepOf("Check the route profile against the reviewed manifest");
  const bash = (script, env) => { const dir = mkdtempSync(join(tmpdir(), "wf-")), out = join(dir, "out"); writeFileSync(out, ""); try { execFileSync("bash", ["-c", script], { env: { PATH: process.env.PATH, BRIDGE_API_ORIGINS: "https://bridge.example.test", GITHUB_OUTPUT: out, GITHUB_STEP_SUMMARY: "/dev/null", ...env }, stdio: ["ignore", "pipe", "pipe"] }); return readFileSync(out, "utf8"); } catch (e) { return `exit${e.status}`; } finally { rmSync(dir, { recursive: true, force: true }); } };

  it("adds exactly three optional inputs, all empty by default, and no other trigger", () => {
    for (const k of ["route_profile", "api_source_sha", "api_serving_revision"]) expect(wf).toMatch(new RegExp(`${k}:\\n\\s+description:[^\\n]*\\n\\s+required: false\\n\\s+default: ''`));
    expect(wf.match(/^ {6}[a-z_]+:\n {8}description:/gm).map((x) => x.split(":")[0].trim())).toEqual(["sha", "deploy", "api_origin", "route_profile", "api_source_sha", "api_serving_revision", "smoke_url"]);
  });
  it("the default build step is unchanged (same settings, now only skipped when a profile is selected)", () => {
    expect(defaultBuild).toContain("if: ${{ steps.profile.outputs.profile == '' }}");
    expect(envOf(defaultBuild)).toEqual({
      VITE_BIZGENIE_API_URL: "${{ steps.api.outputs.origin }}", VITE_API_ROUTE_LIMITS: "${{ steps.api.outputs.limits }}", VITE_SUPABASE_URL: "${{ env.STAGING_SUPABASE_URL }}",
      VITE_SUPABASE_PUBLISHABLE_KEY: "${{ vars.STAGING_SUPABASE_PUBLISHABLE_KEY }}", VITE_PREMIUM_STUDIO_ENABLED: "true", VITE_GENERATION_QUOTE_API: "true", VITE_WORKSPACE_CALENDAR_API: "true",
      VITE_CUSTOMER_MEDIA_API: "true", VITE_SOCIAL_ACCOUNTS_API: "true", VITE_SOCIAL_PROVIDERS: "tiktok", VITE_SUPPORT_URL: "${{ vars.STAGING_SUPPORT_URL }}", VITE_TERMS_URL: "${{ vars.STAGING_TERMS_URL }}",
      VITE_PRIVACY_URL: "${{ vars.STAGING_PRIVACY_URL }}", PAGES_EXPECT_API_ORIGIN: "${{ steps.api.outputs.origin }}", PAGES_EXPECT_SUPABASE_REF: "${{ env.STAGING_SUPABASE_REF }}", PAGES_NOINDEX: "1" });
    expect(scriptOf(defaultBuild)).toBe(scriptOf(profileBuild)); // same fail-closed key checks and build command
  });
  it("the profile build is a separate, mutually exclusive step carrying exactly the stage's flags and nothing else", () => {
    expect(profileBuild).toContain("if: ${{ steps.profile.outputs.profile != '' }}");
    const env = envOf(profileBuild);
    for (const [k, v] of Object.entries(RELEASE04_FLAGS)) expect(env[k], k).toBe(v);
    expect(env.VITE_API_ROUTE_LIMITS).toBe(RELEASE04_PROFILE);
    expect(env.VITE_API_SOURCE_SHA).toBe("${{ inputs.api_source_sha }}"); expect(env.VITE_API_SERVING_REVISION).toBe("${{ inputs.api_serving_revision }}");
    const allowed = new Set([...Object.keys(RELEASE04_FLAGS), "VITE_BIZGENIE_API_URL", "VITE_API_ROUTE_LIMITS", "VITE_API_SOURCE_SHA", "VITE_API_SERVING_REVISION", "VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY", "VITE_SUPPORT_URL", "VITE_TERMS_URL", "VITE_PRIVACY_URL", "PAGES_EXPECT_API_ORIGIN", "PAGES_EXPECT_SUPABASE_REF", "PAGES_NOINDEX"]);
    expect(Object.keys(env).filter((k) => !allowed.has(k))).toEqual([]);
    for (const off of ["VITE_GENERATION_QUOTE_API", "VITE_CUSTOMER_MEDIA_API", "VITE_CUSTOMER_MEDIA_INTAKE_API", "VITE_CUSTOMER_MEDIA_DELETE_API", "VITE_SOCIAL_ACCOUNTS_API", "VITE_SOCIAL_PROVIDERS", "VITE_ANALYTICS_API", "VITE_BILLING_MANAGEMENT_API", "VITE_PLAN_CATALOGUE_API", "VITE_CREDIT_PREVIEW_API", "VITE_PROFESSIONAL_SECTOR_PERSISTED", "VITE_UNSCHEDULE_API", "VITE_API_COMPAT_MODE"]) expect(env, off).not.toHaveProperty(off);
  });
  it("runs in order: origin resolved, profile inputs validated, then the manifest gate, then the profile build, all before any deploy", () => {
    const at = (m) => wf.indexOf(m);
    expect(at("id: api")).toBeLessThan(at("id: profile")); expect(at("id: profile")).toBeLessThan(at("Refuse anything but a full SHA"));
    expect(at("- run: npm test")).toBeLessThan(at("Check the route profile against the reviewed manifest")); expect(at("Check the route profile")).toBeLessThan(at("Build the founder release profile"));
    expect(at("Build the founder release profile")).toBeLessThan(at("Build for staging (fails closed")); expect(at("Build for staging (fails closed")).toBeLessThan(at("Verify headers"));
    expect(gateStep).toContain("npx vite-node scripts/check-release-profile.mjs"); expect(gateStep).toContain("if: ${{ steps.profile.outputs.profile != '' }}");
    expect(wf.slice(0, wf.indexOf("\n  deploy:\n"))).not.toMatch(/secrets\./);
  });
  it("profile validation (bash as the workflow runs it): empty profile passes only with empty identity; the profile needs a bridge origin, a full SHA and an exact revision", () => {
    const script = scriptOf(validate);
    const run = (e) => bash(script, { PROFILE: "", API_SHA: "", API_REV: "", ORIGIN: "https://bridge.example.test", ...e });
    const sha = "a".repeat(40), rev = "bizgenie-api-staging-00099-zzz";
    expect(run({})).toBe("profile=\n");
    expect(run({ API_SHA: sha })).toBe("exit1"); expect(run({ API_REV: rev })).toBe("exit1"); // default release cannot be mixed with profile inputs
    const ok = { PROFILE: RELEASE04_PROFILE, API_SHA: sha, API_REV: rev };
    expect(run(ok)).toContain(`profile=${RELEASE04_PROFILE}`);
    expect(run({ ...ok, PROFILE: "bridge-founder-release05" })).toBe("exit1"); expect(run({ ...ok, PROFILE: "latest" })).toBe("exit1");
    expect(run({ ...ok, ORIGIN: "https://staging-api.getbizgenie.com" })).toBe("exit1"); expect(run({ ...ok, ORIGIN: "https://other.example.test" })).toBe("exit1"); // not a listed bridge origin
    for (const bad of ["", "abc", "A".repeat(40), "a".repeat(39), "a".repeat(41), "g".repeat(40)]) expect(run({ ...ok, API_SHA: bad }), `sha ${bad.length}`).toBe("exit1");
    for (const bad of ["", "latest", "bizgenie-api-staging-*", "bizgenie-api-staging-00099-*", "bizgenie-api-staging-0099-zzz", "bizgenie-api-staging-00099-zzzz", "bizgenie-api-prod-00099-zzz", " bizgenie-api-staging-00099-zzz"]) expect(run({ ...ok, API_REV: bad }), JSON.stringify(bad)).toBe("exit1");
  });
  it("the build-time manifest gate refuses today's manifest, unknown profiles and malformed identity (exit codes, no values printed)", () => {
    const run = (env) => { try { execFileSync("npx", ["vite-node", "scripts/check-release-profile.mjs"], { env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env }, stdio: ["ignore", "pipe", "pipe"] }); return { code: 0, err: "" }; } catch (e) { return { code: e.status, err: String(e.stderr) }; } };
    const ok = { RELEASE_PROFILE: RELEASE04_PROFILE, API_SOURCE_SHA: "a".repeat(40), API_SERVING_REVISION: "bizgenie-api-staging-00099-zzz" };
    expect(run({}).code).toBe(2); expect(run({ ...ok, RELEASE_PROFILE: "other" }).code).toBe(2);
    const noEntry = run(ok); expect(noEntry.code).toBe(1); expect(noEntry.err).toContain("API_PAIR_NOT_IN_REVIEWED_MANIFEST"); expect(noEntry.err).not.toContain("a".repeat(40));
    expect(run({ ...ok, API_SERVING_REVISION: "bizgenie-api-staging-*" }).err).toContain("API_SERVING_REVISION_MALFORMED");
    expect(run({ ...ok, API_SOURCE_SHA: "" }).err).toContain("API_SOURCE_SHA_MALFORMED");
  }, 60000);
  it("deploy stays bridge-only and the deploy job is untouched by the profile", () => {
    const deployJob = wf.slice(wf.indexOf("\n  deploy:\n"));
    expect(deployJob).not.toMatch(/route_profile|api_source_sha|api_serving_revision/);
    expect(wf).toContain("deploy=true refused");
  });
});
