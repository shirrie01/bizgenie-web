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
