// @vitest-environment node
// Guard (BG-LAUNCH-011): the acceptance matrix must stay honest. Every entry names a real spec and test, uses one of the three evidence classes, and nothing is claimed as HOSTED REAL
// without an evidence URL (none exists yet). A LOCAL REAL entry must list its stand-ins: identity, billing and social behaviour are never reported as real acceptance.
import fs from "node:fs";
import { describe, expect, it } from "vitest";

const matrix = JSON.parse(fs.readFileSync("qa/acceptance-matrix.json", "utf8"));
const specs = matrix.journeys.flatMap((j) => j.specs.map((s) => ({ journey: j.id, ...s })));
describe("acceptance matrix", () => {
  it("covers the twelve customer journeys required for the staging release candidate", () => {
    expect(matrix.journeys.map((j) => j.id)).toEqual(["signin-boundary", "onboarding-brand-brain", "campaign-creation", "quote-confirm", "attach-preview", "failed-generation", "review-approval", "calendar-scheduling", "accounts-capabilities", "credits-billing", "session-expiry", "responsive"]);
  });
  it("every entry uses a defined evidence class and points at a test that exists", () => {
    for (const s of specs) {
      expect(matrix.classes, `${s.journey}: class`).toContain(s.class);
      expect(fs.existsSync(s.file), `${s.file} exists`).toBe(true);
      expect(fs.readFileSync(s.file, "utf8"), `${s.file} contains "${s.test}"`).toContain(s.test);
    }
  });
  it("nothing is HOSTED REAL without evidence, and hosted status is NOT RUN until a hosted environment exists", () => {
    for (const s of specs.filter((x) => x.class === "HOSTED REAL")) expect(s.evidenceUrl, `${s.journey}: hosted evidence URL`).toMatch(/^https:\/\//);
    expect(specs.filter((x) => x.class === "HOSTED REAL")).toHaveLength(0);
    expect(matrix.hosted.status).toBe("NOT RUN");
  });
  it("LOCAL REAL entries declare their stand-ins and always include the identity stand-in", () => {
    for (const s of specs.filter((x) => x.class === "LOCAL REAL")) { expect(Array.isArray(s.standIns) && s.standIns.length > 0, `${s.journey}: standIns`).toBe(true); expect(s.standIns.join(" ")).toMatch(/identity/); for (const k of s.standIns) expect(matrix.standIns["local-real"]).toContain(k); }
  });
  it("no sign-in, billing or social journey is ever classed as real on mocked-only evidence", () => {
    for (const id of ["signin-boundary", "credits-billing", "session-expiry"]) for (const s of specs.filter((x) => x.journey === id)) expect(s.class, `${id}`).toBe("MOCKED");
    for (const s of specs.filter((x) => x.journey === "accounts-capabilities" && x.class === "LOCAL REAL")) expect(s.standIns.join(" ")).toMatch(/no real platform data|TikTok HTTP/);
  });
});
