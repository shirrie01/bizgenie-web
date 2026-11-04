// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { guardTarget, requireIdentity, redact, scopeFromToken, evidenceClass, summarise, STATUS, SEPARATED_JOURNEYS } from "../../qa/hosted/lib.mjs";

const S = JSON.parse(readFileSync("qa/hosted/staging-settings.json", "utf8"));
describe("hosted acceptance harness: safety rules (BG-LAUNCH-017)", () => {
  it("accepts only the approved staging host or the project's pages.dev host", () => {
    for (const ok of ["https://staging-app.getbizgenie.com", "https://bizgenie-studio-staging.pages.dev", "https://abc123.bizgenie-studio-staging.pages.dev"]) expect(guardTarget(ok, S).ok, ok).toBe(true);
    expect(guardTarget("https://staging-app.getbizgenie.com", S).hosted).toBe(true);
  });
  it.each([
    ["https://getbizgenie.com"], ["https://www.getbizgenie.com"], ["https://app.getbizgenie.com"], ["https://api.getbizgenie.com"], ["https://staging-api.getbizgenie.com"],
    ["https://other-project.pages.dev"], ["https://evil.example/bizgenie-studio-staging.pages.dev"], ["https://staging-app.getbizgenie.com.evil.example"], ["https://notbizgenie-studio-staging.pages.dev"],
    ["http://staging-app.getbizgenie.com"], ["https://staging-app.getbizgenie.com:8443"], ["https://user:pw@staging-app.getbizgenie.com"], ["https://staging-app.getbizgenie.com/path"], ["https://staging-app.getbizgenie.com/?x=1"], ["http://127.0.0.1:4191"], ["nonsense"],
  ])("refuses %s", (t) => expect(guardTarget(t, S).ok).toBe(false));
  it("self-test mode accepts only a loopback http origin and is never hosted", () => {
    expect(guardTarget("http://127.0.0.1:4191", S, { selftest: true })).toMatchObject({ ok: true, hosted: false });
    expect(guardTarget("https://staging-app.getbizgenie.com", S, { selftest: true }).ok).toBe(false);
    expect(guardTarget("http://evil.example", S, { selftest: true }).ok).toBe(false);
  });
  it("requires an explicitly approved identity and never invents one", () => {
    expect(requireIdentity({}).ok).toBe(false);
    expect(requireIdentity({ HOSTED_TEST_EMAIL: "a@b.test", HOSTED_TEST_PASSWORD: "x" }).reason).toMatch(/not been approved/);
    expect(requireIdentity({ HOSTED_TEST_EMAIL: "a@b.test", HOSTED_TEST_PASSWORD: "x", HOSTED_IDENTITY_APPROVED: "yes" }).ok).toBe(true);
    expect(requireIdentity({ HOSTED_TEST_EMAIL: "nope", HOSTED_TEST_PASSWORD: "x", HOSTED_IDENTITY_APPROVED: "yes" }).ok).toBe(false);
  });
  it("redacts tokens, keys and passwords from anything written out", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop";
    const out = redact(`Authorization: Bearer ${jwt} access_token":"${jwt}" password=hunter22 key=sb_publishable_ABCdef123 sb_secret_XYZ987 `);
    expect(out).not.toMatch(/eyJ|hunter22|ABCdef123|XYZ987/); expect(out).toContain("[redacted]");
  });
  it("reads trusted scope claims locally without exposing the token", () => {
    const p = Buffer.from(JSON.stringify({ app_metadata: { tenant_id: "t1", project_id: "p1", brand_id: "b1" } })).toString("base64url");
    expect(scopeFromToken(`h.${p}.s`)).toEqual({ tenant_id: "t1", project_id: "p1", brand_id: "b1" }); expect(scopeFromToken("garbage").tenant_id).toBeNull();
  });
  it("HOSTED REAL needs an allowlisted host AND nothing intercepted", () => {
    expect(evidenceClass({ hosted: true, intercepted: false })).toBe("HOSTED REAL");
    expect(evidenceClass({ hosted: true, intercepted: true })).toBe("MOCKED");
    expect(evidenceClass({ hosted: false, intercepted: false })).toBe("LOCAL");
  });
  it("a FAIL outranks NOT RUN; NOT RUN is never a PASS", () => {
    expect(summarise([{ status: STATUS.PASS }, { status: STATUS.NOT_RUN }]).verdict).toBe("INCOMPLETE");
    expect(summarise([{ status: STATUS.FAIL }, { status: STATUS.NOT_RUN }]).verdict).toBe("FAIL");
    expect(summarise([{ status: STATUS.PASS }]).verdict).toBe("PASS");
  });
  it("write, spend, OAuth and billing journeys are separated with a named approval", () => {
    expect(SEPARATED_JOURNEYS.map((j) => j.id)).toEqual(["W01", "W02", "W03", "W04", "W05", "W06"]);
    for (const j of SEPARATED_JOURNEYS) expect(j.approval).toMatch(/approval|supervised/i);
  });
});
