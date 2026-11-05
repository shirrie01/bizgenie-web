// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { validateInputs, interpret, run, clean } from "../../scripts/staging/cloudflare-previous-deployment.mjs";

const ACC = "0123456789abcdef0123456789abcdef", TOK = "tok_abcdefghijklmnopqrstuvwxyz0123456789", PROJ = "bizgenie-studio-staging";
const reply = (status, body) => async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("Cloudflare previous-deployment lookup (BG-LAUNCH-017b)", () => {
  it("validates the inputs before any request: whitespace, Bearer prefix, malformed account id", () => {
    expect(validateInputs({ token: TOK, accountId: ACC, project: PROJ })).toEqual([]);
    expect(validateInputs({ token: `${TOK}\n`, accountId: ACC, project: PROJ }).join()).toMatch(/whitespace or a line break/);
    expect(validateInputs({ token: `Bearer ${TOK}`, accountId: ACC, project: PROJ }).join()).toMatch(/whitespace|Bearer/);
    expect(validateInputs({ token: TOK, accountId: `${ACC}\n`, project: PROJ }).join()).toMatch(/32-character/);
    expect(validateInputs({ token: TOK, accountId: "my-account", project: PROJ }).join()).toMatch(/32-character/);
    expect(validateInputs({ token: "", accountId: "", project: "Bad Name" }).length).toBe(3);
  });
  it("does not call Cloudflare at all when an input is malformed", async () => {
    const f = vi.fn(); const r = await run({ CLOUDFLARE_API_TOKEN: TOK, CLOUDFLARE_ACCOUNT_ID: "nope", PAGES_PROJECT: PROJ }, f);
    expect(r.ok).toBe(false); expect(f).not.toHaveBeenCalled(); expect(r.message).not.toContain(TOK);
  });
  it("records the canonical (previous production) deployment id", async () => {
    const r = await run({ CLOUDFLARE_API_TOKEN: TOK, CLOUDFLARE_ACCOUNT_ID: ACC, PAGES_PROJECT: PROJ }, reply(200, { success: true, result: { name: PROJ, canonical_deployment: { id: "dep-123" } } }));
    expect(r).toMatchObject({ ok: true, previous: "dep-123" });
  });
  it("a project with no deployment yet is a first deployment: previous is 'none' and no rollback target is pretended", async () => {
    for (const result of [{ name: PROJ, canonical_deployment: null }, { name: PROJ }]) {
      const r = await run({ CLOUDFLARE_API_TOKEN: TOK, CLOUDFLARE_ACCOUNT_ID: ACC, PAGES_PROJECT: PROJ }, reply(200, { success: true, result }));
      expect(r).toMatchObject({ ok: true, previous: "none" }); expect(r.note).toMatch(/no rollback target/);
    }
  });
  it.each([[400, /malformed/], [401, /did not accept the token/], [403, /Cloudflare Pages > Edit/], [404, /must be created first/]])("HTTP %s fails closed with Cloudflare's code and message and an explanation", async (status, hint) => {
    const r = await run({ CLOUDFLARE_API_TOKEN: TOK, CLOUDFLARE_ACCOUNT_ID: ACC, PAGES_PROJECT: PROJ }, reply(status, { success: false, errors: [{ code: 7003, message: "Could not route to /client/v4/accounts" }] }));
    expect(r.ok).toBe(false); expect(r.message).toContain(`HTTP ${status}`); expect(r.message).toContain("code 7003: Could not route"); expect(r.message).toMatch(hint);
  });
  it("never prints the token, the account id or a bearer value, even if Cloudflare echoes them", async () => {
    const echo = `${TOK} ${ACC} Bearer ${TOK} eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefghij`;
    const r = await run({ CLOUDFLARE_API_TOKEN: TOK, CLOUDFLARE_ACCOUNT_ID: ACC, PAGES_PROJECT: PROJ }, reply(400, { success: false, errors: [{ code: 6003, message: echo }] }));
    expect(r.message).not.toContain(TOK); expect(r.message).not.toContain(ACC); expect(r.message).not.toMatch(/eyJ/); expect(r.message.length).toBeLessThan(700);
    const net = await run({ CLOUDFLARE_API_TOKEN: TOK, CLOUDFLARE_ACCOUNT_ID: ACC, PAGES_PROJECT: PROJ }, async () => { throw new Error(`connect failed for ${TOK}`); });
    expect(net.ok).toBe(false); expect(net.message).not.toContain(TOK);
  });
  it("a non-JSON or successless reply is a failure, never a rollback target", () => {
    expect(interpret(200, { success: false, errors: [] }).ok).toBe(false); expect(interpret(502, null).ok).toBe(false);
    expect(clean("a\nb\tc")).toBe("a b c");
  });
  it("only GETs the project, to the Cloudflare API host, with no redirects", async () => {
    const f = vi.fn(reply(200, { success: true, result: {} })); await run({ CLOUDFLARE_API_TOKEN: TOK, CLOUDFLARE_ACCOUNT_ID: ACC, PAGES_PROJECT: PROJ }, f);
    const [url, init] = f.mock.calls[0]; expect(url).toBe(`https://api.cloudflare.com/client/v4/accounts/${ACC}/pages/projects/${PROJ}`); expect(init.method).toBe("GET"); expect(init.redirect).toBe("error");
  });
  it("the release workflow uses this helper (from the workflow's own ref), no longer hides Cloudflare's reply with curl -f, and keeps its approvals and guards", () => {
    const wf = readFileSync(".github/workflows/studio-staging-release.yml", "utf8");
    expect(wf).toContain("node tooling/scripts/staging/cloudflare-previous-deployment.mjs"); expect(wf).toMatch(/path: tooling/); expect(wf).not.toMatch(/curl -f/);
    expect(wf).toMatch(/environment: staging-studio/); expect(wf).toMatch(/if: \$\{\{ inputs\.deploy \}\}/); expect(wf).toContain("dist differs from the verified build"); expect(wf).toContain("PREVIOUS_DEPLOYMENT_ID");
  });
});
