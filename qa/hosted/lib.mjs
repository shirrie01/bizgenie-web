// Pure helpers for the hosted acceptance harness (BG-LAUNCH-017). No network, no browser: unit-tested in src/test/hostedAcceptanceLib.test.js.

export const STATUS = Object.freeze({ PASS: "PASS", FAIL: "FAIL", NOT_RUN: "NOT RUN" });

// A target is accepted only if it is exactly the approved staging hostname, or the project's own pages.dev host (or one of its deployment/branch aliases).
// An allowlist, not a denylist: production hosts are refused because they are not on it. Self-test mode additionally allows one loopback origin and is never HOSTED REAL.
export function guardTarget(raw, settings, { selftest = false } = {}) {
  let u;
  try { u = new URL(raw); } catch { return { ok: false, reason: "The target is not a valid URL." }; }
  if (u.username || u.password) return { ok: false, reason: "The target must not contain credentials." };
  if (u.pathname !== "/" || u.search || u.hash) return { ok: false, reason: "The target must be an origin only (no path, query or fragment)." };
  const host = u.hostname.toLowerCase();
  if (selftest) {
    if (u.protocol === "http:" && (host === "127.0.0.1" || host === "localhost")) return { ok: true, hosted: false, origin: u.origin, host };
    return { ok: false, reason: "Self-test mode only accepts a loopback http origin." };
  }
  if (u.protocol !== "https:" || u.port) return { ok: false, reason: "The target must be https on the default port." };
  const suffix = settings.pages_hostname_suffix;
  if (host === settings.studio_hostname || host === suffix || host.endsWith(`.${suffix}`)) return { ok: true, hosted: true, origin: u.origin, host };
  return { ok: false, reason: `${host} is not the approved staging Studio (${settings.studio_hostname}) or its Pages project host. Production and every other host are refused.` };
}

// The identity must be named and approved explicitly, by name in the environment, never guessed.
export function requireIdentity(env) {
  const email = env.HOSTED_TEST_EMAIL, password = env.HOSTED_TEST_PASSWORD;
  if (!email || !password) return { ok: false, reason: "HOSTED_TEST_EMAIL and HOSTED_TEST_PASSWORD are not set." };
  if (env.HOSTED_IDENTITY_APPROVED !== "yes") return { ok: false, reason: 'The identity has not been approved: set HOSTED_IDENTITY_APPROVED=yes only for a synthetic staging account the founder approved.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, reason: "HOSTED_TEST_EMAIL is not an email address." };
  return { ok: true, email, password };
}

// Token and key shaped strings are removed from anything that is written to disk or printed.
export function redact(text) {
  return String(text)
    .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g, "[jwt]")
    .replace(/\b(sb_(?:publishable|secret)_)[A-Za-z0-9_-]+/g, "$1[redacted]")
    .replace(/(bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, "$1[redacted]")
    .replace(/(access_token|refresh_token|password)(["'=:\s]+)[^"'&\s,}]+/gi, "$1$2[redacted]");
}

// Reads the trusted scope claims out of an access token locally so requests can be compared with it. The token itself is never returned.
export function scopeFromToken(token) {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split(".")[1], "base64url").toString("utf8"));
    const m = payload.app_metadata || {};
    return { tenant_id: m.tenant_id || null, project_id: m.project_id || null, brand_id: m.brand_id || null };
  } catch { return { tenant_id: null, project_id: null, brand_id: null }; }
}

// HOSTED REAL only when the target was an allowlisted hosted origin and nothing was intercepted or stubbed in the browser.
export function evidenceClass({ hosted, intercepted }) {
  if (hosted && !intercepted) return "HOSTED REAL";
  return intercepted ? "MOCKED" : "LOCAL";
}

export function check(id, title, status, detail = "", extra = {}) { return { id, title, status, detail: redact(detail), ...extra }; }

export function summarise(results) {
  const count = (s) => results.filter((r) => r.status === s).length;
  const fail = count(STATUS.FAIL), pass = count(STATUS.PASS), notRun = count(STATUS.NOT_RUN);
  return { pass, fail, notRun, verdict: fail > 0 ? "FAIL" : notRun > 0 ? "INCOMPLETE" : "PASS" };
}

// Journeys that write to shared staging data, spend, connect a real account or charge. Never run by this harness; each names the approval it needs.
export const SEPARATED_JOURNEYS = Object.freeze([
  { id: "W01", title: "Create the workspace through onboarding (writes a tenant, project and brand)", approval: "Founder approval to write to shared staging data, and an account with no workspace" },
  { id: "W02", title: "Save Brand Brain and onboarding, create a campaign, add content items", approval: "Founder approval to write to the sandbox workspace" },
  { id: "W03", title: "Request a generation quote and confirm it (reserves credits)", approval: "Founder approval for credit use; provider flags decide whether any paid call can occur" },
  { id: "W04", title: "Review, approve and schedule content", approval: "Founder approval to write to the sandbox workspace" },
  { id: "W05", title: "Connect TikTok in the sandbox (real OAuth)", approval: "Founder-supervised TikTok sandbox connection with registered redirect URIs" },
  { id: "W06", title: "Stripe checkout in test mode and entitlement", approval: "Founder approval, an approved plan and price, and Stripe test mode only" },
]);
