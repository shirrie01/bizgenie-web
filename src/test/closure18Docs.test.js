// @vitest-environment node
// BG-WEB-LAUNCH-CLOSURE-18: the flag-compatibility document names the accepted API main, and every gated flag in featureGate.js appears in its matrix.
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { FEATURES } from "../premium/featureGate";

const md = fs.readFileSync("docs/studio/BG_WEB_LAUNCH_CLOSURE_18_FLAG_COMPATIBILITY.md", "utf8");
describe("closure-18 flag compatibility document", () => {
  it("names the accepted API main and claims no verified staging compatibility", () => {
    expect(md).toContain("5cd1d774e04fcbfb0745d9bd5c7a0b974cd982f5"); expect(md).toMatch(/BLOCKED, by design/); expect(md).not.toMatch(/\bVERIFIED WORKING\b/);
  });
  it("lists every gated flag and every capability the gate knows", () => { for (const f of Object.values(FEATURES)) expect(md, f.flag).toContain(f.flag); });
});

// Acceptance-and-approvals document: every scenario's staging status is NOT RUN or BLOCKED, nothing claims a hosted/Stripe/social result, and the authority SHA is named.
const acc = fs.readFileSync("docs/studio/BG_WEB_LAUNCH_CLOSURE_18_ACCEPTANCE_AND_APPROVALS.md", "utf8");
describe("closure-18 acceptance and approvals document", () => {
  const rows = acc.split("## 2. ")[0].split("\n").filter((l) => /^\| (\d+|R2) \|/.test(l)).map((l) => l.split("|").slice(1, -1).map((c) => c.trim()));
  it("covers the fifteen scenarios and R2, names the API authority, and keeps staging NOT RUN or BLOCKED", () => {
    expect(rows).toHaveLength(16); expect(acc).toContain("5cd1d774e04fcbfb0745d9bd5c7a0b974cd982f5");
    for (const r of rows) { expect(r[5], `scenario ${r[0]}`).toMatch(/^(NOT RUN|BLOCKED)/); expect(r[5]).not.toMatch(/\bPASS\b/); }
  });
  it("states that no hosted PASS, Stripe test-mode run, OAuth or paid generation exists, and that refund/dispute and expiry tests remain todo", () => {
    expect(acc).toMatch(/no hosted PASS exists/); expect(acc).toMatch(/nothing was deployed, run on staging, charged, connected or published/i);
    expect(acc).toMatch(/6 required[^\n]*remain `todo` and red/); expect(acc).not.toMatch(/\|\s*PASS\s*\|/);
  });
  it("keeps the approved targets, treats unused credits and video classes as undecided, and never assumes the entity", () => {
    const t = acc.replace(/\*/g, "");
    expect(t).toMatch(/£99\/month/); expect(t).toMatch(/60 monthly credits/); expect(t).toMatch(/£100\/month aggregate provider-spend ceiling/);
    expect(t).toMatch(/carry over without limit/); expect(t).toMatch(/no billing evidence of provider cost/); expect(t).toMatch(/a similar name is not proof/); expect(t).toMatch(/never set without it/);
  });
});

