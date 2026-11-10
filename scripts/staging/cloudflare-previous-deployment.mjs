// BG-LAUNCH-017b: reads (never writes) the Cloudflare Pages project to record the deployment that a new deploy would replace.
// Replaces an inline `curl -f`, which hid Cloudflare's reply, so an HTTP 400 gave no cause. This prints only the HTTP status and Cloudflare's
// error code and message (token-shaped text removed, length capped), and fails closed with a plain explanation.
// Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, PAGES_PROJECT. Output (stdout): one line "PREVIOUS_DEPLOYMENT_ID=<id|none>".
const ACCOUNT_ID = /^[0-9a-f]{32}$/;
const PROJECT = /^[a-z0-9][a-z0-9-]{0,57}$/;

// Describes a secret by SHAPE only (length and character class), never its value, so a wrong kind of credential can be recognised without printing it.
export function tokenShape(token) {
  const t = String(token || ""); const hex = /^[0-9a-f]+$/i.test(t); const b64 = /^[A-Za-z0-9_-]+$/.test(t);
  const kind = t.length === 40 && b64 ? "the format of a Cloudflare API token" : t.length === 37 && hex ? "the format of a Global API Key, which Cloudflare does not accept as a Bearer API token" : "not the 40-character format of a Cloudflare API token";
  return `the token secret is ${t.length} characters (${hex ? "hex digits only" : b64 ? "letters, digits, - and _" : "other characters"}), ${kind}`;
}

export const clean = (s, secrets = []) => {
  let t = String(s == null ? "" : s);
  for (const v of secrets) if (v && v.length >= 6) t = t.split(v).join("[redacted]");
  return t.replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g, "[jwt]").replace(/(bearer\s+)\S+/gi, "$1[redacted]").replace(/[\r\n\t]+/g, " ").slice(0, 650);
};

// Checks the inputs before any request. A secret pasted with a trailing newline or space, a "Bearer " prefix, or the wrong value for the account id all make Cloudflare answer 400.
export function validateInputs({ token, accountId, project }) {
  const problems = [];
  if (!token) problems.push("CLOUDFLARE_API_TOKEN is empty");
  else {
    if (/\s/.test(token)) problems.push("CLOUDFLARE_API_TOKEN contains whitespace or a line break (re-save the secret without a trailing newline)");
    if (/^bearer/i.test(token.trim())) problems.push('CLOUDFLARE_API_TOKEN starts with "Bearer": store only the token itself');
    if (token.trim().length < 20) problems.push("CLOUDFLARE_API_TOKEN is too short to be an API token");
  }
  if (!accountId) problems.push("CLOUDFLARE_ACCOUNT_ID is empty");
  else if (!ACCOUNT_ID.test(accountId)) problems.push(`CLOUDFLARE_ACCOUNT_ID is not a 32-character lowercase hex account id (${/\s/.test(accountId) ? "it contains whitespace or a line break" : `length ${accountId.length}`})`);
  if (!PROJECT.test(project || "")) problems.push("PAGES_PROJECT is not a valid Pages project name");
  return problems;
}

// Turns Cloudflare's reply into a decision. Never returns a rollback target that does not exist.
export function interpret(status, body) {
  const errors = Array.isArray(body && body.errors) ? body.errors : [];
  const detail = errors.map((e) => `code ${e && e.code}: ${e && e.message}`).join("; ") || "no error detail in the reply";
  if (status === 200 && body && body.success !== false && body.result && typeof body.result === "object") {
    const id = body.result.canonical_deployment && body.result.canonical_deployment.id;
    const pb = typeof body.result.production_branch === "string" && /^[A-Za-z0-9._\/-]{1,100}$/.test(body.result.production_branch) ? body.result.production_branch : "";
    return id ? { ok: true, previous: String(id), productionBranch: pb, note: "a previous production deployment exists" } : { ok: true, previous: "none", productionBranch: pb, note: "the project has no previous production deployment (first deployment): there is no rollback target, so rolling back means pausing the project or removing the CNAME" };
  }
  const hint = {
    400: "Cloudflare rejected the request itself. With code 9106 the Authorization header was not accepted: the secret is not a valid Cloudflare API token (for example a Global API Key, an account id or another credential was saved instead). Otherwise the account id or token is malformed; it is not the project.",
    401: "Cloudflare did not accept the token (invalid, expired or revoked).",
    403: "The token is valid but not allowed: it needs Account > Cloudflare Pages > Edit for this account.",
    404: "The Pages project or account was not found. The project must be created first (a separate approval); this workflow never creates it.",
    429: "Cloudflare rate limit; retry later.",
  }[status] || (status >= 500 ? "Cloudflare reported a server error; retry later." : "Unexpected reply.");
  return { ok: false, status, message: `Cloudflare answered HTTP ${status}. ${hint} (${detail})` };
}

export async function run(env, fetchImpl = fetch) {
  const token = env.CLOUDFLARE_API_TOKEN || "", accountId = env.CLOUDFLARE_ACCOUNT_ID || "", project = env.PAGES_PROJECT || "";
  const secrets = [token, accountId];
  const problems = validateInputs({ token, accountId, project });
  if (problems.length) return { ok: false, message: `Not calling Cloudflare: ${problems.join("; ")}.` };
  let res, body = null;
  try {
    res = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${project}`, { method: "GET", headers: { authorization: `Bearer ${token}` }, redirect: "error" });
    try { body = await res.json(); } catch { body = null; }
  } catch (e) { return { ok: false, message: `Cloudflare could not be reached: ${clean(e && e.message, secrets)}` }; }
  const out = interpret(res.status, body);
  const shape = !out.ok && [400, 401, 403].includes(res.status) ? ` Diagnostic: ${tokenShape(token)}.` : "";
  return out.ok ? out : { ...out, message: clean(out.message + shape, secrets) };
}

// BG-LAUNCH-018: after `wrangler pages deploy`, ask Cloudflare (read-only) whether it really lists a deployment for this exact commit. A command that exits 0 is not proof:
// run #7 reported the deploy step as successful while nothing was uploaded. Success needs: a deployment whose commit hash is the approved SHA, in the production environment
// (only production is served on the project's pages.dev address), whose final stage is "deploy" with status "success". Polls Cloudflare's status a bounded number of times; never re-uploads.
export function judgeDeployment(deployments, sha) {
  const list = Array.isArray(deployments) ? deployments : [];
  const d = list.find((x) => x && x.deployment_trigger && x.deployment_trigger.metadata && x.deployment_trigger.metadata.commit_hash === sha);
  if (!d) return { state: "missing", message: `Cloudflare lists no deployment for commit ${sha} (it lists ${list.length}: ${list.slice(0, 5).map((x) => String(x && x.id)).join(", ") || "none"}). The upload did not create one.` };
  const stage = d.latest_stage || {};
  const base = { id: String(d.id), url: String(d.url || ""), environment: String(d.environment || ""), stage: `${stage.name}:${stage.status}` };
  if (stage.status === "failure" || stage.status === "canceled") return { state: "failed", ...base, message: `Deployment ${d.id} exists but stage ${stage.name} is ${stage.status}.` };
  if (d.environment !== "production") return { state: "not_production", ...base, message: `Deployment ${d.id} is in the "${d.environment}" environment, so https://<project>.pages.dev will not serve it. The branch label used for the upload must match the project's production branch.` };
  if (stage.name === "deploy" && stage.status === "success") return { state: "ok", ...base };
  return { state: "pending", ...base, message: `Deployment ${d.id} is at stage ${stage.name} (${stage.status}).` };
}

export async function verifyDeployment(env, sha, { fetchImpl = fetch, attempts = 12, delayMs = 5000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const token = env.CLOUDFLARE_API_TOKEN || "", accountId = env.CLOUDFLARE_ACCOUNT_ID || "", project = env.PAGES_PROJECT || "";
  const secrets = [token, accountId];
  const problems = validateInputs({ token, accountId, project });
  if (problems.length) return { ok: false, message: `Not calling Cloudflare: ${problems.join("; ")}.` };
  if (!/^[0-9a-f]{40}$/.test(sha || "")) return { ok: false, message: "The commit SHA to verify must be 40 lowercase hex characters." };
  let last = null;
  for (let i = 0; i < attempts; i += 1) {
    let res, body = null;
    try {
      res = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${project}/deployments?per_page=10`, { method: "GET", headers: { authorization: `Bearer ${token}` }, redirect: "error" });
      try { body = await res.json(); } catch { body = null; }
    } catch (e) { return { ok: false, message: `Cloudflare could not be reached: ${clean(e && e.message, secrets)}` }; }
    if (res.status !== 200 || !body || body.success === false) { const out = interpret(res.status, body); const shape = [400, 401, 403].includes(res.status) ? ` Diagnostic: ${tokenShape(token)}.` : ""; return { ok: false, message: clean((out.message || `Cloudflare answered HTTP ${res.status}.`) + shape, secrets) }; }
    last = judgeDeployment(body.result, sha);
    if (last.state === "ok") return { ok: true, ...last };
    if (last.state === "failed" || last.state === "not_production") return { ok: false, ...last, message: clean(last.message.replace("<project>", project), secrets) };
    if (i < attempts - 1) await sleep(delayMs);
  }
  return { ok: false, ...last, message: clean(`${last.message} (checked ${attempts} times over ${Math.round(attempts * delayMs / 1000)} s; not re-uploading).`, secrets) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const vi = process.argv.indexOf("--verify");
  if (vi > 0) {
    const v = await verifyDeployment(process.env, process.argv[vi + 1]);
    if (!v.ok) { console.error(`::error::${v.message}`); process.exit(1); }
    console.log(`DEPLOYMENT_ID=${v.id}\nDEPLOYMENT_URL=${v.url}\nDEPLOYMENT_ENVIRONMENT=${v.environment}\nDEPLOYMENT_STAGE=${v.stage}`);
  } else {
    const r = await run(process.env);
    if (!r.ok) { console.error(`::error::${r.message}`); process.exit(1); }
    console.error(r.note);
    console.log(`PREVIOUS_DEPLOYMENT_ID=${r.previous}`);
    if (r.productionBranch) console.log(`PROJECT_PRODUCTION_BRANCH=${r.productionBranch}`); // the upload must use the project's own production branch, or Cloudflare files it as a preview
  }
}
