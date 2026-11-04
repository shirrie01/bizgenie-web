// @vitest-environment node
// Guard (BG-STUDIO-023-FE): build output and browser-test artefacts must never be tracked again. Earlier commits in the stacked branches added
// dist-* and test-results/ by mistake (see docs/studio/BG_STUDIO_023_ARTEFACT_AUDIT.md). Skips when the code is not in a git checkout.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { describe, expect, it } from "vitest";

const tracked = () => { try { return execFileSync("git", ["ls-files"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\n").filter(Boolean); } catch { return null; } };
describe("repository hygiene", () => {
  it("tracks no build output or Playwright artefacts", () => {
    const files = tracked(); if (!files) return;
    const bad = files.filter((f) => /^(dist|dist-[^/]+|test-results|playwright-report)\//.test(f));
    expect(bad.slice(0, 10)).toEqual([]);
  });
  it("ignores them", () => {
    const files = tracked(); if (!files) return;
    const ignore = execFileSync("git", ["check-ignore", "dist-gates/x", "test-results/x", "playwright-report/x"], { encoding: "utf8" }).trim().split("\n");
    expect(ignore).toHaveLength(3);
  });
  // BG-LAUNCH-011: `npm install --no-save --package-lock=false X` re-resolves EVERY floating range and ignores package-lock.json, so a dependency release made after `npm ci` (supabase-js 2.119.0, 4 Nov 2026)
  // silently changed what CI tested. Browser jobs must add their test tools on top of the locked tree.
  it("workflows add test tools on top of the lockfile and never re-resolve it", () => {
    const dir = ".github/workflows"; if (!fs.existsSync(dir)) return;
    const offenders = fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).filter((f) => /--package-lock=false/.test(fs.readFileSync(`${dir}/${f}`, "utf8")));
    expect(offenders).toEqual([]);
  });
  it("the integration workflow runs the capability-gates suite even when the flag-on suite fails, and keeps traces on failure", () => {
    const f = ".github/workflows/studio-005-integration-ci.yml"; if (!fs.existsSync(f)) return;
    const t = fs.readFileSync(f, "utf8"); const job = t.slice(t.indexOf("  premium-browser:"));
    const gates = job.split("\n").filter((l) => l.includes("premium-gates.playwright.config.mjs") && l.includes("if:"));
    expect(gates.length).toBeGreaterThanOrEqual(3); for (const l of gates) expect(l).toContain("!cancelled()");
    expect(job).toMatch(/actions\/upload-artifact@v4/); expect(job).toMatch(/path: test-results\//);
  });
});
