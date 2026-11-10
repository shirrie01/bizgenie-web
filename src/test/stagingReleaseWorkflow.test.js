// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

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
});
