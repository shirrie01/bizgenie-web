// @vitest-environment node
// BG-WEB-LAUNCH-CLOSURE-15: the acceptance pack must stay honest. In the 15-scenario table, the Staging UI, Real provider and Customer acceptance columns may only say
// NOT RUN, BLOCKED or n/a until a founder-approved hosted run exists (none does), and the pack must name the API main it was checked against.
import fs from "node:fs";
import { describe, expect, it } from "vitest";

const md = fs.readFileSync("docs/studio/BG_WEB_LAUNCH_CLOSURE_15_ACCEPTANCE_PACK.md", "utf8");
const table = (title) => { const i = md.indexOf(title); const rows = md.slice(i).split("\n").slice(1).filter((l) => l.startsWith("|")); return rows.slice(2).map((l) => l.split("|").slice(1, -1).map((c) => c.trim())); };
const scenarios = md.split("## 2. ")[1].split("## 3. ")[0].split("\n").filter((l) => /^\| \d+ \|/.test(l)).map((l) => l.split("|").slice(1, -1).map((c) => c.trim()));

describe("acceptance pack honesty", () => {
  it("covers the fifteen required scenarios", () => { expect(scenarios).toHaveLength(15); expect(scenarios.map((r) => r[0])).toEqual(Array.from({ length: 15 }, (_, i) => String(i + 1))); });
  it("no staging, real-provider or customer-acceptance cell claims PASS (nothing was hosted or approved)", () => {
    for (const r of scenarios) for (const [name, cell] of [["Staging UI", r[4]], ["Real provider", r[5]], ["Customer acceptance", r[6]]]) {
      expect(cell, `scenario ${r[0]} ${name}`).toMatch(/^(NOT RUN|BLOCKED|n\/a)/);
      expect(cell, `scenario ${r[0]} ${name}`).not.toMatch(/\bPASS\b/);
    }
  });
  it("names the accepted API main it was checked against and keeps hosted acceptance NOT RUN", () => {
    expect(md).toContain("16f363e93425e204d744ec5cb6d38391295f2346"); expect(md).toMatch(/Staging and launch remain NO-GO/);
  });
  it("every GAP route family is marked as not on API main and as Codex-owned", () => {
    const gaps = md.split("\n").filter((l) => l.startsWith("|") && l.includes("**GAP**"));
    expect(gaps.length).toBeGreaterThanOrEqual(10); for (const g of gaps) expect(g).toMatch(/Codex/);
  });
});
