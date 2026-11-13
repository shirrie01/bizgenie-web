// @vitest-environment node
// BG-WEB-LAUNCH-CLOSURE-16: the compatibility matrix and hosted-acceptance guide must stay honest and current. The matrix names the API main it was checked against, uses only the seven defined
// classifications, and never claims VERIFIED WORKING; the guide never claims PASS (no hosted run exists); the Closure-15 pack's obsolete section is marked superseded.
import fs from "node:fs";
import { describe, expect, it } from "vitest";

const read = (f) => fs.readFileSync(`docs/studio/${f}`, "utf8");
const matrix = read("BG_WEB_LAUNCH_CLOSURE_16_CONTRACT_MATRIX.md");
const guide = read("BG_WEB_LAUNCH_CLOSURE_16_HOSTED_ACCEPTANCE_GUIDE.md");
const CLASSES = ["SOURCE ROUTE ABSENT", "SOURCE PRESENT, NOT MOUNTED", "MOUNTED, SERVICE NOT CONFIGURED", "FEATURE FLAG OFF", "STAGING REVISION NOT VERIFIED", "STAGING TEST NOT RUN", "VERIFIED WORKING"];
const rows = matrix.split("\n").filter((l) => /^\| \d+ \|/.test(l)).map((l) => l.split("|").slice(1, -1).map((c) => c.trim()));

describe("closure-16 documents", () => {
  it("the matrix is checked against the accepted API main and says it supersedes Closure-15 section 1", () => {
    expect(matrix).toContain("d3ec6c375ab14b4d3180e05e784361d0bf155046"); expect(matrix).toMatch(/supersedes section 1 of the Closure-15 pack/);
    expect(read("BG_WEB_LAUNCH_CLOSURE_15_ACCEPTANCE_PACK.md")).toMatch(/SUPERSEDED \(13 Nov 2026\)/);
  });
  it("every compatibility row has a primary state from the defined set, and none claims VERIFIED WORKING", () => {
    expect(rows.length).toBeGreaterThanOrEqual(14);
    const primary = (r) => r[8];
    for (const r of rows) expect(CLASSES.some((c) => primary(r).replace(/\*/g, "").includes(c)), `row ${r[0]}: ${primary(r)}`).toBe(true);
    for (const r of rows) expect(primary(r), `row ${r[0]}`).not.toMatch(/VERIFIED WORKING/); // no hosted run exists, so no row may claim it anywhere in its state cell
  });
  it("the hosted guide claims no PASS: every scenario status is NOT RUN or BLOCKED", () => {
    const sc = guide.split("\n").filter((l) => /^\| (\d+|R2) \|/.test(l) && l.split("|").length >= 8).map((l) => l.split("|").slice(1, -1).map((c) => c.trim()));
    expect(sc.length).toBe(16);
    for (const r of sc) expect(r[r.length - 1], `scenario ${r[0]}`).toMatch(/^(NOT RUN|BLOCKED)/);
    expect(guide).not.toMatch(/\|\s*PASS\s*\|/);
  });
  it("the decision pack keeps approved targets and states nothing as approved that is not", () => {
    const d = read("BG_WEB_LAUNCH_CLOSURE_16_DECISIONS_AND_LEGAL.md").replace(/\*/g, "");
    expect(d).toMatch(/£99\/month/); expect(d).toMatch(/60 monthly credits/); expect(d).toMatch(/£100 per calendar month/); expect(d).not.toMatch(/£3\.33/); expect(d).toMatch(/not queried/);
    expect(d).toMatch(/not assumed to be the entity/); expect(d).toMatch(/never set without it/);
  });
});
