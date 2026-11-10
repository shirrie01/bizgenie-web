// BG-LAUNCH-017: customer acceptance harness for the authorised staging Studio, to run AFTER a deployment is approved. Read-only: it never creates, saves, confirms,
// connects, pays or publishes. Journeys that would are listed as NOT RUN with the approval they need (SEPARATED_JOURNEYS).
//
//   HOSTED_TEST_EMAIL=... HOSTED_TEST_PASSWORD=... HOSTED_IDENTITY_APPROVED=yes \
//   node qa/hosted/hosted-acceptance.mjs --target https://staging-app.getbizgenie.com [--out evidence-dir]
//
// Exit codes: 0 every check PASS; 1 any FAIL; 3 no FAIL but something NOT RUN; 2 refused to start (bad target or arguments).
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { checkUrl } from "../../scripts/smoke-pages.mjs";
import { STATUS, guardTarget, requireIdentity, check, summarise, redact, scopeFromToken, evidenceClass, SEPARATED_JOURNEYS } from "./lib.mjs";

const SETTINGS = JSON.parse(fs.readFileSync(new URL("./staging-settings.json", import.meta.url), "utf8"));
const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };

export async function runAcceptance({ target, settings = SETTINGS, env = process.env, outDir, selftest = false, intercept = null, fetchImpl = fetch }) {
  const results = []; const started = new Date().toISOString();
  const g = guardTarget(target, settings, { selftest });
  if (!g.ok) return { refused: true, reason: g.reason, results: [check("H01", "Target is the approved staging Studio", STATUS.FAIL, g.reason)] };
  fs.mkdirSync(outDir, { recursive: true });
  const api = settings.api_origin, supabaseOrigin = settings.supabase_origin;
  const cls = () => evidenceClass({ hosted: g.hosted, intercepted: Boolean(intercept) });
  results.push(check("H01", "Target is the approved staging Studio", STATUS.PASS, `${g.origin} (${g.hosted ? "allowlisted hosted origin" : "self-test loopback"})`, { class: cls() }));

  // H02 headers, CSP, noindex, SPA fallback, immutable assets, bundle free of secrets and other-environment origins
  try {
    const bad = await checkUrl(g.origin, { api, supabaseRef: settings.supabase_ref, supabaseOrigin, noindex: true }, fetchImpl);
    results.push(check("H02", "Security headers, CSP, noindex, SPA routes and bundle scan", bad.length ? STATUS.FAIL : STATUS.PASS, bad.join("; ") || "headers, CSP, noindex, SPA fallback, immutable assets and bundle scan all pass", { class: cls() }));
  } catch (e) { results.push(check("H02", "Security headers, CSP, noindex, SPA routes and bundle scan", STATUS.FAIL, `The host could not be read: ${e.message}`)); }

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: g.origin });
  const page = await context.newPage();
  const origins = new Set(); const forbiddenHeaders = []; const violations = []; const pageErrors = []; const customerCalls = [];
  page.on("request", (r) => { try { origins.add(new URL(r.url()).origin); } catch { /* ignore */ } const h = r.headers(); if (h["x-serverless-authorization"]) forbiddenHeaders.push(r.url()); });
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("console", (m) => { if (/content security policy|refused to/i.test(m.text())) violations.push(m.text()); });
  page.on("response", async (r) => { const u = new URL(r.url()); if (u.origin === api && u.pathname.startsWith("/customer/")) customerCalls.push({ method: r.request().method(), path: u.pathname, status: r.status(), tenant: u.searchParams.get("tenant_id") }); });
  if (intercept) await intercept(context);
  const shot = async (name) => { try { await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true }); } catch { /* evidence only */ } };

  try {
    // H03 the Studio loads and shows the sign-in screen without a policy violation or script error
    await page.goto("/", { waitUntil: "networkidle" });
    const signIn = await page.getByRole("button", { name: /^sign in$/i }).first().isVisible().catch(() => false);
    await shot("h03-signed-out");
    results.push(check("H03", "Studio loads to the sign-in screen with no CSP violation or script error", signIn && !violations.length && !pageErrors.length ? STATUS.PASS : STATUS.FAIL,
      `sign-in visible: ${signIn}; CSP violations: ${violations.length}; page errors: ${pageErrors.length}${violations[0] ? `; first: ${violations[0]}` : ""}`, { class: cls() }));

    // H04 browser-to-API connectivity from the Studio's own origin: an unauthenticated request must reach the application (401 with CORS), not die at CORS or Cloud Run IAM
    const probe = await page.evaluate(async (apiOrigin) => {
      try { const r = await fetch(`${apiOrigin}/customer/workspace`, { headers: { authorization: "Bearer not-a-real-token" }, credentials: "omit" }); let code = ""; try { code = (await r.json())?.error?.code || ""; } catch { /* not json */ } return { reached: true, status: r.status, code }; }
      catch (e) { return { reached: false, error: String(e && e.message) }; }
    }, api);
    results.push(check("H04", "Browser reaches the API from the Studio origin (CORS and invoker path)",
      probe.reached && probe.status === 401 ? STATUS.PASS : STATUS.FAIL,
      probe.reached ? `status ${probe.status} ${probe.code}${probe.status === 401 ? "" : " (expected 401 AUTHENTICATION_REQUIRED from the application)"}` : `The browser could not read the reply (${probe.error}). Typical causes: the API origin does not allow this Studio origin, or Cloud Run IAM answered before the application. No token was involved.`, { class: cls() }));

    customerCalls.length = 0; // the deliberate unauthenticated probe above is not a customer read
    // H05 onwards need the approved synthetic identity
    const id = requireIdentity(env);
    if (!id.ok) {
      for (const [i, t] of [["H05", "Sign in with the approved synthetic identity"], ["H06", "Workspace scope matches the token; safe customer reads succeed"], ["H07", "Requests only go to approved origins; no Google identity header is ever sent"], ["H08", "Session recovery: signed-out state and sign-in again"]]) results.push(check(i, t, STATUS.NOT_RUN, id.reason));
    } else {
      await page.getByLabel(/^email$/i).fill(id.email); await page.getByLabel(/^password$/i).fill(id.password);
      await page.getByRole("button", { name: /^sign in$/i }).last().click();
      const reached = await page.getByRole("button", { name: /sign out/i }).first().waitFor({ state: "visible", timeout: 20000 }).then(() => true).catch(() => false);
      await page.waitForLoadState("networkidle").catch(() => {}); await shot("h05-signed-in");
      const stored = await page.evaluate(() => { const k = Object.keys(localStorage).find((x) => /^sb-.*-auth-token$/.test(x)); try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } });
      const scope = scopeFromToken(stored && stored.access_token);
      results.push(check("H05", "Sign in with the approved synthetic identity", reached && stored ? STATUS.PASS : STATUS.FAIL, reached ? "signed in; Sign out available" : "the Studio did not reach a signed-in screen", { class: cls() }));
      if (!scope.tenant_id) results.push(check("H06", "Workspace scope matches the token; safe customer reads succeed", STATUS.NOT_RUN, "The account has no workspace scope in its session (it needs onboarding, which writes data and is journey W01)."));
      else {
        const bad = [];
        const mine = customerCalls.filter((c) => c.method === "GET");
        for (const c of mine) { if (c.tenant && c.tenant !== scope.tenant_id) bad.push(`${c.path} asked for another tenant`); if (c.status >= 500) bad.push(`${c.method} ${c.path} -> ${c.status}`); if (c.status === 401 || c.status === 403) bad.push(`${c.method} ${c.path} -> ${c.status}`); }
        const writes = customerCalls.filter((c) => c.method !== "GET" && !c.path.endsWith("/workspace/select"));
        if (writes.length) bad.push(`unexpected writes: ${writes.map((w) => `${w.method} ${w.path}`).join(", ")}`);
        if (!mine.some((c) => c.status === 200)) bad.push("no customer read succeeded");
        results.push(check("H06", "Workspace scope matches the token; safe customer reads succeed", bad.length ? STATUS.FAIL : STATUS.PASS, bad.join("; ") || `${mine.length} read(s); all for this tenant; none refused; no writes${mine.some((c) => c.status === 404) ? "; some 404s (resources not created yet)" : ""}`, { class: cls(), calls: mine.map((c) => `${c.method} ${c.path} ${c.status}`) }));
      }
      const allowed = new Set([g.origin, api, supabaseOrigin, "https://fonts.googleapis.com", "https://fonts.gstatic.com"]); const stray = [...origins].filter((o) => !allowed.has(o) && !o.startsWith("data:") && !o.startsWith("blob:"));
      results.push(check("H07", "Requests only go to approved origins; no Google identity header is ever sent", stray.length || forbiddenHeaders.length ? STATUS.FAIL : STATUS.PASS, stray.length ? `unexpected origins: ${stray.join(", ")}` : forbiddenHeaders.length ? "an x-serverless-authorization header was sent from the browser" : `${origins.size} origin(s), all approved`, { class: cls() }));
      // H08 session recovery: remove this device's session, reload (signed out), sign in again
      await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (/^sb-.*-auth-token$/.test(k)) localStorage.removeItem(k); });
      await page.reload({ waitUntil: "networkidle" });
      const out = await page.getByRole("button", { name: /^sign in$/i }).first().isVisible().catch(() => false);
      await page.getByLabel(/^email$/i).fill(id.email); await page.getByLabel(/^password$/i).fill(id.password); await page.getByRole("button", { name: /^sign in$/i }).last().click();
      const back = await page.getByRole("button", { name: /sign out/i }).first().waitFor({ state: "visible", timeout: 20000 }).then(() => true).catch(() => false); await shot("h08-signed-in-again");
      results.push(check("H08", "Session recovery: signed-out state and sign-in again", out && back ? STATUS.PASS : STATUS.FAIL, `signed-out screen after losing the session: ${out}; signed in again: ${back}`, { class: cls() }));
    }
  } finally { await browser.close(); }

  for (const j of SEPARATED_JOURNEYS) results.push(check(j.id, j.title, STATUS.NOT_RUN, `Separated: requires ${j.approval}. This harness never performs it.`));
  const report = { harness: "BG-LAUNCH-017 hosted acceptance", started, finished: new Date().toISOString(), target: g.origin, hostedReal: g.hosted && !intercept, selftest, evidenceClass: cls(), summary: summarise(results), results };
  fs.writeFileSync(path.join(outDir, "report.json"), redact(JSON.stringify(report, null, 2)));
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const target = arg("target");
  if (!target) { console.error("hosted-acceptance: --target <origin> is required"); process.exit(2); }
  const outDir = arg("out") || `hosted-acceptance-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const report = await runAcceptance({ target, outDir });
  if (report.refused) { console.error(`REFUSED: ${report.reason}`); process.exit(2); }
  for (const r of report.results) console.log(`${r.status.padEnd(7)} ${r.id}  ${r.title}${r.status === "PASS" ? "" : `\n          ${r.detail}`}`);
  console.log(`\n${report.evidenceClass}: ${report.summary.pass} PASS, ${report.summary.fail} FAIL, ${report.summary.notRun} NOT RUN -> ${report.summary.verdict}\nEvidence: ${outDir}/report.json`);
  process.exit(report.summary.fail ? 1 : report.summary.notRun ? 3 : 0);
}
