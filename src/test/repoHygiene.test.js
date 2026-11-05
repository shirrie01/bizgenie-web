// @vitest-environment node
// Guard (BG-STUDIO-023-FE): build output and browser-test artefacts must never be tracked again. Earlier commits in the stacked branches added
// dist-* and test-results/ by mistake (see docs/studio/BG_STUDIO_023_ARTEFACT_AUDIT.md). Skips when the code is not in a git checkout.
import { execFileSync } from "node:child_process";
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
});
