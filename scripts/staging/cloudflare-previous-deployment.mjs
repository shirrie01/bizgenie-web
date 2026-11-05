// BG-LAUNCH-017b: reads (never writes) the Cloudflare Pages project to record the deployment that a new deploy would replace.
// Replaces an inline `curl -f`, which hid Cloudflare's reply, so an HTTP 400 gave no cause. This prints only the HTTP status and Cloudflare's
// error code and message (token-shaped text removed, length capped), and fails closed with a plain explanation.
// Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, PAGES_PROJECT. Output (stdout): one line "PREVIOUS_DEPLOYMENT_ID=<id|none>".
const ACCOUNT_ID = /^[0-9a-f]{32}$/;
const PROJECT = /^[a-z0-9][a-z0-9-]{0,57}$/;

export const clean = (s, secrets = []) => {
  let t = String(s == null ? "" : s);
  for (const v of secrets) if (v && v.length >= 6) t = t.split(v).join("[redacted]");
  return t.replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g, "[jwt]").replace(/(bearer\s+)\S+/gi, "$1[redacted]").replace(/[\r\n\t]+/g, " ").slice(0, 300);
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
    return id ? { ok: true, previous: String(id), note: "a previous production deployment exists" } : { ok: true, previous: "none", note: "the project has no previous production deployment (first deployment): there is no rollback target, so rolling back means pausing the project or removing the CNAME" };
  }
  const hint = {
    400: "Cloudflare rejected the request itself. Usual causes: the account id or token secret is malformed (whitespace, wrong value), not the project.",
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
  return out.ok ? out : { ...out, message: clean(out.message, secrets) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = await run(process.env);
  if (!r.ok) { console.error(`::error::${r.message}`); process.exit(1); }
  console.error(r.note);
  console.log(`PREVIOUS_DEPLOYMENT_ID=${r.previous}`);
}
