// BG-LAUNCH-ACCEPTANCE-04 (R2 hardening): pure verdict logic for the read-only R2 acceptance, unit-tested, so the shell script stays thin.
// Contract source: bizgenie-api Closure-06 (docs/staging/BG_API_CLOSURE06_POOL_REVIEW_AND_R2.md). Only the minimum safe response fields are read; nothing else is printed.
// Verdicts: PASS (applicable condition independently established) | FAIL (observed contract or security violation) | BLOCKED (access, identity or fixture unavailable)
//           | SKIPPED (optional case omitted, with reason) | NOT RUN (no executable evidence) | INFO (recorded, not a pass/fail test).
export const VERDICTS = ["PASS", "FAIL", "BLOCKED", "SKIPPED", "NOT RUN", "INFO"];
export const MANDATORY = ["target", "owner_workspace", "owner_onboarding", "foreign_calendar_denial", "unauthenticated_direct"];
const v = (verdict, detail) => ({ verdict, detail });
const code = (b) => (b && typeof b === "object" && b.error && typeof b.error === "object" ? b.error.code : undefined);

// proxy: value of x-operator-proxy-response ("upstream" | "proxy" | "" for a direct call)
export function evaluate(name, { status, body, proxy = "" }) {
  const b = body && typeof body === "object" ? body : null;
  const viaProxy = ["owner_workspace", "owner_onboarding", "other_workspace_ownstate", "other_onboarding_ownstate", "foreign_calendar_denial", "revoked_onboarding", "revoked_calendar"].includes(name);
  if (viaProxy && proxy !== "upstream") return v("FAIL", `status ${status} was not produced by the API (label '${proxy || "none"}')`);
  if (name === "unauthenticated_direct" && proxy) return v("FAIL", "the direct call went through the proxy");
  switch (name) {
    case "owner_workspace":
      if (status === 200 && b?.status === "ready") return v("PASS", "200 status=ready");
      if (status === 200 && b?.status === "missing_workspace") return v("BLOCKED", "owner fixture has no workspace (absent fixture, not a successful read)");
      if (status === 200 && b?.status === "selection_required") return v("BLOCKED", "multiple workspaces: selection required (selecting is a write and is not performed)");
      if (status === 401 || status === 403) return v("BLOCKED", `identity not accepted (HTTP ${status}); the owner token must be valid and unexpired`);
      return v("FAIL", `unexpected HTTP ${status}${b?.status ? ` status=${String(b.status).slice(0, 30)}` : ""}`);
    case "owner_onboarding":
      if (status === 200 && b?.status === "ready" && b?.onboarding?.contract_version === "workspace-onboarding.v1") return v("PASS", "200 status=ready contract=workspace-onboarding.v1");
      if (status === 503) return v("FAIL", "503 ONBOARDING_UNAVAILABLE: preflight or SQL failed on the real pool");
      if (status === 200) return v("FAIL", "200 without the required onboarding contract");
      if (status === 401 || status === 403) return v("BLOCKED", `identity not authorised for onboarding (HTTP ${status}${code(b) ? ` ${code(b)}` : ""})`);
      return v("FAIL", `unexpected HTTP ${status}`);
    case "other_workspace_ownstate":
    case "other_onboarding_ownstate":
      return v("INFO", `second identity reads its OWN state: HTTP ${status}${b?.status ? ` status=${String(b.status).slice(0, 30)}` : ""} (not a denial test)`);
    case "foreign_calendar_denial":
      if (status === 404 && code(b) === "RESOURCE_NOT_AVAILABLE") return v("PASS", "404 RESOURCE_NOT_AVAILABLE for a foreign tenant/project");
      if (status === 200) return v("FAIL", "200: foreign scope was served (possible cross-tenant exposure)");
      return v("FAIL", `unexpected denial shape HTTP ${status}${code(b) ? ` ${code(b)}` : ""}: contract expects 404 RESOURCE_NOT_AVAILABLE`);
    case "unauthenticated_direct":
      if (status === 401 && b?.status === "failed" && code(b) === "AUTHENTICATION_REQUIRED") return v("PASS", "401 AUTHENTICATION_REQUIRED from the API");
      if ((status === 401 || status === 403) && !b) return v("BLOCKED", `HTTP ${status} without the API error contract: private Cloud Run IAM rejected the call (identity token), not evidence about the API`);
      return v("FAIL", `HTTP ${status}${code(b) ? ` ${code(b)}` : ""}: expected 401 AUTHENTICATION_REQUIRED`);
    case "revoked_onboarding":
      if (status === 403 && code(b) === "WORKSPACE_NOT_AUTHORIZED") return v("PASS", "403 WORKSPACE_NOT_AUTHORIZED");
      return v("FAIL", `HTTP ${status}${code(b) ? ` ${code(b)}` : ""}: expected 403 WORKSPACE_NOT_AUTHORIZED`);
    case "revoked_calendar":
      if (status === 404 && code(b) === "RESOURCE_NOT_AVAILABLE") return v("PASS", "404 RESOURCE_NOT_AVAILABLE");
      return v("FAIL", `HTTP ${status}${code(b) ? ` ${code(b)}` : ""}: expected 404 RESOURCE_NOT_AVAILABLE`);
    default:
      return v("FAIL", "unknown case");
  }
}

// first object carrying both ids; only the equality result is ever reported
export function scopeOf(body) {
  const seen = [body];
  while (seen.length) { const o = seen.shift(); if (!o || typeof o !== "object") continue; if (typeof o.tenant_id === "string" && typeof o.project_id === "string") return `${o.tenant_id}|${o.project_id}`; seen.push(...Object.values(o)); }
  return null;
}
export function scopeCheck(a, b) {
  const x = scopeOf(a), y = scopeOf(b);
  if (!x || !y) return v("SKIPPED", "no tenant/project pair in one of the responses; scope match not available");
  return x === y ? v("PASS", "onboarding scope equals the workspace scope") : v("FAIL", "onboarding scope differs from the workspace scope");
}

// results: { caseName: {verdict, detail} } ; mandatory cases that are not PASS block a full acceptance verdict.
export function overall(results) {
  const missing = MANDATORY.filter((m) => !results[m]).map((m) => [m, "NOT RUN"]);
  const rows = [...MANDATORY.map((m) => [m, results[m]?.verdict || "NOT RUN"])];
  const fails = Object.entries(results).filter(([, r]) => r.verdict === "FAIL").map(([k]) => k);
  if (fails.length) return { verdict: "FAIL", exit: 1, reason: `failed: ${fails.join(", ")}` };
  const notPass = rows.filter(([, x]) => x !== "PASS").map(([m, x]) => `${m}=${x}`);
  if (notPass.length || missing.length) return { verdict: "INCOMPLETE", exit: 3, reason: `mandatory not established: ${notPass.join(", ")}` };
  return { verdict: "PASS", exit: 0, reason: "all mandatory applicable conditions independently established" };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const fs = await import("node:fs");
  const [, , cmd, ...rest] = process.argv;
  if (cmd === "case") { // case <name> <status> <bodyfile> [proxyLabel]
    const [name, status, file, proxy = ""] = rest; let body = null; try { body = JSON.parse(fs.readFileSync(file, "utf8")); } catch { /* non-JSON body */ }
    const r = evaluate(name, { status: Number(status), body, proxy }); console.log(`${r.verdict}\t${r.detail}`);
  } else if (cmd === "scope") { // scope <workspacefile> <onboardingfile>
    const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
    const r = scopeCheck(rd(rest[0]), rd(rest[1])); console.log(`${r.verdict}\t${r.detail}`);
  } else if (cmd === "overall") { // overall name=VERDICT ...
    const res = {}; for (const kv of rest) { const i = kv.indexOf("="); res[kv.slice(0, i)] = { verdict: kv.slice(i + 1) }; }
    const r = overall(res); console.log(`${r.verdict}\t${r.reason}`); process.exitCode = r.exit;
  } else { console.error("usage: case|scope|overall"); process.exitCode = 2; }
}
