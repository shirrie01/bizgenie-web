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
  it("reports the project's own production branch (validated) so the upload is filed as production", async () => {
    const mk = (pb) => run({ CLOUDFLARE_API_TOKEN: TOK, CLOUDFLARE_ACCOUNT_ID: ACC, PAGES_PROJECT: PROJ }, reply(200, { success: true, result: { production_branch: pb, canonical_deployment: null } }));
    expect((await mk("main")).productionBranch).toBe("main"); expect((await mk("release/staging")).productionBranch).toBe("release/staging");
    expect((await mk("a b; rm -rf /")).productionBranch).toBe("");
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

// BG-LAUNCH-018: a zero exit code from the upload is not proof of a deployment (run #7).
import { judgeDeployment, verifyDeployment } from "../../scripts/staging/cloudflare-previous-deployment.mjs";
import { execFileSync } from "node:child_process";
const SHA = "1e08cbce69b0ec47e19d067c96445ef20045feda";
const dep = (over = {}) => ({ id: "d-1", url: "https://abc12345.bizgenie-studio-staging.pages.dev", environment: "production", deployment_trigger: { metadata: { commit_hash: SHA } }, latest_stage: { name: "deploy", status: "success" }, ...over });
const env = { CLOUDFLARE_API_TOKEN: TOK, CLOUDFLARE_ACCOUNT_ID: ACC, PAGES_PROJECT: PROJ };
const noWait = { sleep: async () => {}, delayMs: 0 };

describe("verifying the deployment really exists (BG-LAUNCH-018)", () => {
  it("accepts only a production deployment for the exact SHA whose deploy stage succeeded", () => {
    expect(judgeDeployment([dep()], SHA)).toMatchObject({ state: "ok", id: "d-1" });
    expect(judgeDeployment([], SHA).state).toBe("missing");
    expect(judgeDeployment([dep({ deployment_trigger: { metadata: { commit_hash: "f".repeat(40) } } })], SHA).state).toBe("missing");
    expect(judgeDeployment([dep({ environment: "preview" })], SHA).state).toBe("not_production");
    expect(judgeDeployment([dep({ latest_stage: { name: "deploy", status: "failure" } })], SHA).state).toBe("failed");
    expect(judgeDeployment([dep({ latest_stage: { name: "build", status: "active" } })], SHA).state).toBe("pending");
    expect(judgeDeployment(null, SHA).state).toBe("missing");
  });
  it("zero deployments is a failure with an explanation, after a bounded number of status checks and no upload", async () => {
    const f = vi.fn(reply(200, { success: true, result: [] }));
    const r = await verifyDeployment(env, SHA, { fetchImpl: f, attempts: 3, ...noWait });
    expect(r.ok).toBe(false); expect(r.message).toMatch(/lists no deployment|did not create/); expect(f).toHaveBeenCalledTimes(3);
    for (const [url, init] of f.mock.calls) { expect(url).toContain("/pages/projects/bizgenie-studio-staging/deployments"); expect(init.method).toBe("GET"); }
  });
  it("waits for a pending deployment and then returns its id and url", async () => {
    const seq = [dep({ latest_stage: { name: "build", status: "active" } }), dep()]; let i = 0;
    const f = async () => new Response(JSON.stringify({ success: true, result: [seq[Math.min(i++, 1)]] }), { status: 200 });
    expect(await verifyDeployment(env, SHA, { fetchImpl: f, attempts: 5, ...noWait })).toMatchObject({ ok: true, id: "d-1", url: expect.stringContaining("pages.dev"), environment: "production" });
  });
  it("a preview-environment deployment fails at once (the project address would not serve it)", async () => {
    const r = await verifyDeployment(env, SHA, { fetchImpl: reply(200, { success: true, result: [dep({ environment: "preview" })] }), attempts: 5, ...noWait });
    expect(r.ok).toBe(false); expect(r.message).toMatch(/preview/); expect(r.message).toContain(PROJ);
  });
  it("refuses a malformed secret or SHA without calling Cloudflare, and never prints the token", async () => {
    const f = vi.fn(); expect((await verifyDeployment({ ...env, CLOUDFLARE_API_TOKEN: `${TOK}\n` }, SHA, { fetchImpl: f })).ok).toBe(false);
    expect((await verifyDeployment(env, "abc", { fetchImpl: f })).ok).toBe(false); expect(f).not.toHaveBeenCalled();
    const r = await verifyDeployment(env, SHA, { fetchImpl: reply(403, { success: false, errors: [{ code: 10000, message: `denied ${TOK}` }] }) });
    expect(r.message).toContain("HTTP 403"); expect(r.message).not.toContain(TOK);
  });
});

describe("release workflow cannot report a failed upload as success (BG-LAUNCH-018)", () => {
  const wf = readFileSync(".github/workflows/studio-staging-release.yml", "utf8");
  it("runs every step under bash with pipefail and verifies the deployment after the upload", () => {
    expect(wf).toMatch(/defaults: \{ run: \{ shell: bash \} \}/);
    const deployAt = wf.indexOf("npx --yes wrangler@3 pages deploy"), verifyAt = wf.indexOf("--verify"), smokeAt = wf.indexOf("Smoke test the live host");
    expect(deployAt).toBeGreaterThan(0); expect(verifyAt).toBeGreaterThan(deployAt); expect(smokeAt).toBeGreaterThan(verifyAt);
  });
  it("the secret clean-up line removes whitespace, line breaks and a Bearer prefix and nothing else", () => {
    const line = wf.split("\n").find((l) => l.includes("CLOUDFLARE_API_TOKEN=\"$(printf")).trim();
    const out = execFileSync("bash", ["-c", `CLOUDFLARE_API_TOKEN=$'Bearer abc123_DEF-456 \\n'; CLOUDFLARE_ACCOUNT_ID=$' 0123456789abcdef0123456789abcdef\\r\\n'; ${line.replace(/echo "::add-mask::[^"]*";?/g, "")}; printf '%s|%s' "$CLOUDFLARE_API_TOKEN" "$CLOUDFLARE_ACCOUNT_ID"`]).toString();
    expect(out).toBe("abc123_DEF-456|0123456789abcdef0123456789abcdef");
  });
  it("keeps the approvals: Environment, exact SHA, artefact hash and staging-only smoke host", () => {
    expect(wf).toMatch(/environment: staging-studio/); expect(wf).toContain("dist differs from the verified build"); expect(wf).toContain("smoke_url must be the approved staging Studio host"); expect(wf).toMatch(/\^\[0-9a-f\]\{40\}\$/);
  });
});
