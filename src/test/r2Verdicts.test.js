// @vitest-environment node
import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluate, overall, scopeCheck, MANDATORY } from "../../scripts/staging/r2-verdicts.mjs";

const up = (status, body) => ({ status, body, proxy: "upstream" });
describe("R2 verdicts: owner workspace and onboarding must show real success, not just a status", () => {
  it("only 200 status=ready passes; a missing fixture, a selection prompt and an unaccepted identity are BLOCKED; 404 and 5xx fail", () => {
    expect(evaluate("owner_workspace", up(200, { status: "ready" })).verdict).toBe("PASS");
    expect(evaluate("owner_workspace", up(200, { status: "missing_workspace" })).verdict).toBe("BLOCKED");
    expect(evaluate("owner_workspace", up(200, { status: "selection_required" })).verdict).toBe("BLOCKED");
    expect(evaluate("owner_workspace", up(401, { status: "failed" })).verdict).toBe("BLOCKED");
    expect(evaluate("owner_workspace", up(404, { error: { code: "X" } })).verdict).toBe("FAIL"); // misleading 404 is not success
    expect(evaluate("owner_workspace", up(503, null)).verdict).toBe("FAIL");
  });
  it("onboarding needs 200 + ready + contract workspace-onboarding.v1; a generic 200, a 404 and a 503 do not pass", () => {
    expect(evaluate("owner_onboarding", up(200, { status: "ready", onboarding: { contract_version: "workspace-onboarding.v1" } })).verdict).toBe("PASS");
    expect(evaluate("owner_onboarding", up(200, { status: "ready", onboarding: {} })).verdict).toBe("FAIL");
    expect(evaluate("owner_onboarding", up(200, { ok: true })).verdict).toBe("FAIL");
    expect(evaluate("owner_onboarding", up(404, null)).verdict).toBe("FAIL");
    expect(evaluate("owner_onboarding", up(503, { status: "failed", error: { code: "ONBOARDING_UNAVAILABLE" } })).verdict).toBe("FAIL");
  });
  it("a status produced by the proxy never counts as an API result", () => {
    for (const name of ["owner_workspace", "owner_onboarding", "foreign_calendar_denial"]) expect(evaluate(name, { status: 200, body: { status: "ready" }, proxy: "proxy" }).verdict).toBe("FAIL");
    expect(evaluate("foreign_calendar_denial", { status: 404, body: { error: { code: "RESOURCE_NOT_AVAILABLE" } }, proxy: "" }).verdict).toBe("FAIL");
  });
});
describe("R2 verdicts: tenant isolation and the unauthenticated boundary", () => {
  it("another tenant reading its own state is INFO, never a denial", () => { expect(evaluate("other_workspace_ownstate", up(200, { status: "ready" })).verdict).toBe("INFO"); });
  it("explicit foreign scope: only 404 RESOURCE_NOT_AVAILABLE passes; a wrong-scope 200 fails", () => {
    expect(evaluate("foreign_calendar_denial", up(404, { error: { code: "RESOURCE_NOT_AVAILABLE" } })).verdict).toBe("PASS");
    const bad = evaluate("foreign_calendar_denial", up(200, { items: [] })); expect(bad.verdict).toBe("FAIL"); expect(bad.detail).toMatch(/cross-tenant/);
    expect(evaluate("foreign_calendar_denial", up(403, { error: { code: "FORBIDDEN" } })).verdict).toBe("FAIL");
  });
  it("unauthenticated: only the API's own 401 AUTHENTICATION_REQUIRED passes; a Cloud Run IAM page is BLOCKED; a proxy-routed call fails", () => {
    expect(evaluate("unauthenticated_direct", { status: 401, body: { status: "failed", error: { code: "AUTHENTICATION_REQUIRED" } }, proxy: "" }).verdict).toBe("PASS");
    expect(evaluate("unauthenticated_direct", { status: 403, body: null, proxy: "" }).verdict).toBe("BLOCKED");
    expect(evaluate("unauthenticated_direct", { status: 401, body: null, proxy: "" }).verdict).toBe("BLOCKED");
    expect(evaluate("unauthenticated_direct", { status: 200, body: { status: "ready" }, proxy: "" }).verdict).toBe("FAIL");
    expect(evaluate("unauthenticated_direct", { status: 401, body: { status: "failed", error: { code: "AUTHENTICATION_REQUIRED" } }, proxy: "proxy" }).verdict).toBe("FAIL");
  });
  it("revoked fixtures: onboarding 403 WORKSPACE_NOT_AUTHORIZED and calendar 404", () => {
    expect(evaluate("revoked_onboarding", up(403, { error: { code: "WORKSPACE_NOT_AUTHORIZED" } })).verdict).toBe("PASS");
    expect(evaluate("revoked_onboarding", up(200, { status: "ready" })).verdict).toBe("FAIL");
    expect(evaluate("revoked_calendar", up(404, { error: { code: "RESOURCE_NOT_AVAILABLE" } })).verdict).toBe("PASS");
  });
  it("scope check reports only equality and is SKIPPED when ids are unavailable", () => {
    expect(scopeCheck({ w: { tenant_id: "t1", project_id: "p1" } }, { onboarding: { tenant_id: "t1", project_id: "p1" } }).verdict).toBe("PASS");
    expect(scopeCheck({ w: { tenant_id: "t1", project_id: "p1" } }, { onboarding: { tenant_id: "t2", project_id: "p1" } }).verdict).toBe("FAIL");
    expect(scopeCheck({}, { a: 1 }).verdict).toBe("SKIPPED");
  });
});
describe("R2 overall verdict never passes with mandatory evidence missing", () => {
  const all = Object.fromEntries(MANDATORY.map((m) => [m, { verdict: "PASS" }]));
  it("all mandatory PASS -> PASS (exit 0)", () => { expect(overall(all)).toMatchObject({ verdict: "PASS", exit: 0 }); });
  it("a skipped/blocked/not-run mandatory case -> INCOMPLETE (exit 3), never PASS", () => {
    for (const x of ["BLOCKED", "SKIPPED", "NOT RUN"]) expect(overall({ ...all, foreign_calendar_denial: { verdict: x } })).toMatchObject({ verdict: "INCOMPLETE", exit: 3 });
    const { owner_onboarding, ...missing } = all; expect(overall(missing)).toMatchObject({ verdict: "INCOMPLETE", exit: 3 });
  });
  it("any FAIL wins over everything -> FAIL (exit 1), including an optional case", () => { expect(overall({ ...all, revoked_onboarding: { verdict: "FAIL" } })).toMatchObject({ verdict: "FAIL", exit: 1 }); });
  it("the CLI exits 0/1/3 accordingly", () => {
    const run = (...a) => spawnSync("node", ["scripts/staging/r2-verdicts.mjs", "overall", ...a], { encoding: "utf8" });
    expect(run(...MANDATORY.map((m) => `${m}=PASS`)).status).toBe(0);
    expect(run(...MANDATORY.map((m) => `${m}=${m === "owner_onboarding" ? "BLOCKED" : "PASS"}`)).status).toBe(3);
    expect(run(...MANDATORY.map((m) => `${m}=${m === "owner_onboarding" ? "FAIL" : "PASS"}`)).status).toBe(1);
  });
});
describe("R2 shell script fails closed on a wrong target (stub gcloud; no network)", () => {
  const dir = mkdtempSync(join(tmpdir(), "r2stub-"));
  writeFileSync(join(dir, "gcloud"), '#!/usr/bin/env bash\ncase "$*" in\n "config get-value project") echo "${STUB_PROJECT:-wrong}";;\n run\\ services\\ describe*) echo "${STUB_SVC}";;\n "auth print-identity-token") echo STUB.ID;;\n *) exit 1;;\nesac\n'); chmodSync(join(dir, "gcloud"), 0o755);
  const go = (env, input = "") => spawnSync("bash", ["scripts/staging/r2-readonly-acceptance.sh"], { encoding: "utf8", input, env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, ...env } });
  const svc = (rev, pct, tag = "f1fc2f51") => JSON.stringify({ status: { traffic: [{ revisionName: rev, percent: pct, tag, url: "https://f1fc2f51---bizgenie-api-staging-abc-ew.a.run.app" }, { revisionName: "bizgenie-api-staging-00029-wtc", percent: 100 }] } });
  it("refuses a wrong project, a missing tag, the wrong revision, a tag carrying traffic, and a missing owner token", () => {
    expect(go({ STUB_PROJECT: "other" }).stdout).toMatch(/gcloud project is not bizgenie-backend/);
    expect(go({ STUB_PROJECT: "bizgenie-backend", STUB_SVC: JSON.stringify({ status: { traffic: [{ revisionName: "bizgenie-api-staging-00029-wtc", percent: 100 }] } }) }).stdout).toMatch(/not found or malformed/);
    expect(go({ STUB_PROJECT: "bizgenie-backend", STUB_SVC: svc("bizgenie-api-staging-00029-wtc", 0) }).stdout).toMatch(/expected bizgenie-api-staging-00030-pob/);
    expect(go({ STUB_PROJECT: "bizgenie-backend", STUB_SVC: svc("bizgenie-api-staging-00030-pob", 10) }).stdout).toMatch(/carries 10% traffic/);
    const r = go({ STUB_PROJECT: "bizgenie-backend", STUB_SVC: svc("bizgenie-api-staging-00030-pob", 0) }); expect(r.status).toBe(2); expect(r.stdout).toMatch(/owner token missing/);
    expect(r.stdout + r.stderr).not.toMatch(/STUB\.ID/);
  });
});
