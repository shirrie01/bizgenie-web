// BG-017C-05B: the SM Properties acceptance journey for the hosted staging Studio, to run ONLY after a founder-approved deployment of the Studio and of the trusted bridge.
// Read-only by default. The one step that writes (creating the workspace through the Studio's own onboarding, exactly once) runs only if
// HOSTED_ALLOW_WORKSPACE_WRITE=create-sm-properties-once AND the account has no workspace yet. Nothing else is written: no Brand Brain save, campaign, generation, billing or social action.
//
//   HOSTED_TEST_EMAIL=... HOSTED_TEST_PASSWORD=... HOSTED_IDENTITY_APPROVED=yes [HOSTED_ALLOW_WORKSPACE_WRITE=create-sm-properties-once] \
//   [HOSTED_BUSINESS_NAME="SM Properties"] [HOSTED_BUSINESS_WEBSITE=https://...] node qa/hosted/sm-properties-acceptance.mjs --target https://bizgenie-studio-staging.pages.dev
//
// Exit codes as hosted-acceptance.mjs: 0 all PASS, 1 any FAIL, 3 none failed but something NOT RUN, 2 refused to start.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { STATUS, guardTarget, requireIdentity, check, summarise, redact, evidenceClass } from "./lib.mjs";

const SETTINGS = JSON.parse(fs.readFileSync(new URL("./staging-settings.json", import.meta.url), "utf8"));
const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const WRITE_PHRASE = "create-sm-properties-once";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function runSmProperties({ target, settings = SETTINGS, env = process.env, outDir, selftest = false, intercept = null }) {
  const g = guardTarget(target, settings, { selftest });
  if (!g.ok) return { refused: true, reason: g.reason, results: [check("A00", "Target is the approved staging Studio", STATUS.FAIL, g.reason)] };
  const id = requireIdentity(env);
  if (!id.ok) return { refused: true, reason: id.reason, results: [check("A00", "Approved synthetic identity", STATUS.FAIL, id.reason)] };
  fs.mkdirSync(outDir, { recursive: true });
  const api = env.HOSTED_API_ORIGIN && (settings.approved_api_origins || [settings.api_origin]).includes(env.HOSTED_API_ORIGIN) ? env.HOSTED_API_ORIGIN : settings.api_origin, results = []; const cls = () => evidenceClass({ hosted: g.hosted, intercepted: Boolean(intercept) });
  const writeApproved = env.HOSTED_ALLOW_WORKSPACE_WRITE === WRITE_PHRASE; const name = env.HOSTED_BUSINESS_NAME || "SM Properties";
  const ok = (cond) => (cond ? STATUS.PASS : STATUS.FAIL); const add = (i, t, s, d = "", x = {}) => results.push(check(i, t, s, d, { class: cls(), ...x }));
  const browser = await chromium.launch(); const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: g.origin }); const page = await context.newPage();
  const seen = { workspaceGets: [], bootstraps: [], origins: new Set(), pageErrors: [] };
  page.on("pageerror", (e) => seen.pageErrors.push(e.message));
  page.on("response", async (r) => {
    const u = new URL(r.url()); if (u.origin !== api) return;
    if (u.pathname === "/customer/workspace" && r.request().method() === "GET") { let b = null; try { b = await r.json(); } catch { /* not JSON */ } seen.workspaceGets.push({ status: r.status(), body: b && b.status, ids: b && b.workspace ? [b.workspace.tenant_id, b.workspace.project_id, b.workspace.brand_id] : null, count: b && Array.isArray(b.workspaces) ? b.workspaces.length : (b && b.workspace ? 1 : 0) }); }
    if (u.pathname === "/customer/workspace/bootstrap" && r.request().method() === "POST") { let b = null; try { b = await r.json(); } catch { /* not JSON */ } seen.bootstraps.push({ status: r.status(), body: b && b.status }); }
  });
  if (intercept) await intercept(context);
  const shot = async (n) => { try { await page.screenshot({ path: path.join(outDir, `${n}.png`), fullPage: true }); } catch { /* evidence only */ } };
  const signedIn = () => page.getByRole("button", { name: /sign out/i }).first().waitFor({ state: "visible", timeout: 20000 }).then(() => true).catch(() => false);
  const signIn = async () => { await page.getByLabel(/^email$/i).fill(id.email); await page.getByLabel(/^password$/i).fill(id.password); await page.getByRole("button", { name: /^sign in$/i }).last().click(); return signedIn(); };
  try {
    await page.goto("/", { waitUntil: "networkidle" });
    const a1 = await signIn(); await page.waitForLoadState("networkidle").catch(() => {}); await shot("a1-signed-in");
    add("A1", "Sign-in succeeds", ok(a1), a1 ? "signed in" : "the Studio did not reach a signed-in screen");
    await page.reload({ waitUntil: "networkidle" }); const a2 = await signedIn();
    add("A2", "The existing session is recognised after a reload (no credentials asked again)", ok(a2), a2 ? "still signed in" : "asked to sign in again");
    const first = seen.workspaceGets.find((w) => w.status !== undefined);
    add("A3", "Workspace lookup (GET /customer/workspace) returns an authorised customer context", first && first.status === 200 && ["missing_workspace", "ready", "selection_required"].includes(first.body) ? STATUS.PASS : STATUS.FAIL,
      first ? `HTTP ${first.status}, status "${first.body}"${first.ids ? `, ids ${first.ids.every((v) => UUID.test(String(v))) ? "well-formed" : "MALFORMED"}` : ""}` : "no lookup was observed", { workspaceStatus: first && first.body });
    const exists = first && first.body === "ready";
    if (first && first.body === "selection_required") add("A4", "Workspace creation (POST /customer/workspace/bootstrap)", STATUS.NOT_RUN, "The account has more than one workspace; the customer must choose. Nothing was created.");
    else if (exists) add("A4", "Workspace creation (POST /customer/workspace/bootstrap)", STATUS.NOT_RUN, "The workspace already exists: this is the resume path. Nothing was created.");
    else if (!writeApproved) add("A4", "Workspace creation (POST /customer/workspace/bootstrap)", STATUS.NOT_RUN, `Writes are not approved. To create the workspace once, set HOSTED_ALLOW_WORKSPACE_WRITE=${WRITE_PHRASE}.`);
    else {
      await page.getByRole("button", { name: /^continue$/i }).click(); await page.getByLabel("Business name").fill(name);
      if (env.HOSTED_BUSINESS_WEBSITE) await page.getByLabel(/website/i).fill(env.HOSTED_BUSINESS_WEBSITE);
      await page.getByRole("button", { name: /create my workspace/i }).click();
      const step3 = await page.getByRole("heading", { name: /what does your business do/i }).waitFor({ state: "visible", timeout: 15000 }).then(() => true).catch(() => false); await shot("a4-step3");
      add("A4", "Workspace creation (POST /customer/workspace/bootstrap) succeeds once", ok(seen.bootstraps.length === 1 && [200, 201].includes(seen.bootstraps[0].status) && seen.bootstraps[0].body === "ready"), `bootstrap requests: ${seen.bootstraps.length}${seen.bootstraps[0] ? `, HTTP ${seen.bootstraps[0].status}, status "${seen.bootstraps[0].body}"` : ""}`);
      add("A5", "Step 2 advances to Step 3", ok(step3), step3 ? "Step 3 is showing" : "the Studio stayed on Step 2");
      if (!step3) add("A6", "Entered business information is preserved", STATUS.NOT_RUN, "Step 3 was not reached, so there is nothing to go back from.");
      else {
        await page.getByRole("button", { name: /^back$/i }).click({ timeout: 5000 }).catch(() => {}); const kept = await page.getByLabel("Business name").inputValue({ timeout: 5000 }).catch(() => "");
        add("A6", "Entered business information is preserved", ok(kept.includes(name)), `business name field after going back: ${kept ? "present" : "empty"}`);
      }
    }
    if (!(writeApproved && !exists)) for (const [i, t] of [["A5", "Step 2 advances to Step 3"], ["A6", "Entered business information is preserved"]]) add(i, t, STATUS.NOT_RUN, "Depends on creating the workspace, which was not done in this run.");
    // reload: persisted state, no duplicate
    seen.workspaceGets.length = 0; const before = seen.bootstraps.length; await page.reload({ waitUntil: "networkidle" }); const a7 = await signedIn(); await shot("a7-after-reload");
    const after = seen.workspaceGets.find((w) => w.status !== undefined);
    add("A7", "A page refresh restores the signed-in workspace state", ok(a7 && (!after || after.body === "ready" || !(writeApproved && !exists))), `signed in: ${a7}; lookup after reload: ${after ? after.body : "none observed"}`);
    add("A8", "No duplicate workspace: one workspace, and no second create request after the refresh", ok(seen.bootstraps.length === before && (!after || (after.body !== "selection_required" && after.count <= 1))), `create requests total: ${seen.bootstraps.length}; workspaces seen: ${after ? after.count : "n/a"}`);
    // cross-tenant (read-only probe; the token never leaves the page)
    const probe = await page.evaluate(async (apiOrigin) => {
      const k = Object.keys(localStorage).find((x) => /^sb-.*-auth-token$/.test(x)); let t = ""; try { t = JSON.parse(localStorage.getItem(k) || "null").access_token; } catch { /* none */ }
      const rnd = () => crypto.randomUUID(); try { const r = await fetch(`${apiOrigin}/customer/campaigns?tenant_id=${rnd()}&project_id=${rnd()}`, { headers: { authorization: `Bearer ${t}` }, credentials: "omit" }); return { reached: true, status: r.status }; } catch (e) { return { reached: false }; }
    }, api);
    add("A9", "Another tenant's data cannot be read (a read naming a different tenant is refused)", probe.reached && [403, 404].includes(probe.status) ? STATUS.PASS : STATUS.FAIL, probe.reached ? `HTTP ${probe.status} (expected 403 or 404; 200 would be a cross-tenant leak)` : "the request could not be sent");
    // BG-017C-05: read-only coverage of the rest of the journey. Reads use the page's own session from the Studio origin (real CORS path); nothing is created, saved, quoted, generated or charged.
    const readProbe = (route) => page.evaluate(async ([apiOrigin, r]) => {
      const k = Object.keys(localStorage).find((x) => /^sb-.*-auth-token$/.test(x)); let t = ""; try { t = JSON.parse(localStorage.getItem(k) || "null").access_token; } catch { /* none */ }
      try { const res = await fetch(`${apiOrigin}${r}`, { headers: { authorization: `Bearer ${t}` }, credentials: "omit" }); let j = null; try { j = await res.json(); } catch { /* not JSON */ } return { reached: true, status: res.status, keys: j && typeof j === "object" ? Object.keys(j).slice(0, 8) : [] }; } catch { return { reached: false }; }
    }, [api, route]);
    const scoped = exists || (writeApproved && seen.bootstraps.some((b) => b.status === 200 || b.status === 201));
    if (!scoped) for (const [i, t] of [["A12", "Brand Brain readout loads (read-only)"], ["A13", "Calendar loads (read-only)"]]) add(i, t, STATUS.NOT_RUN, "No workspace exists for this account yet, so there is nothing to read.");
    else {
      const bb = await readProbe("/customer/workspace/brand-brain"); add("A12", "Brand Brain readout loads (read-only)", bb.reached && bb.status === 200 ? STATUS.PASS : STATUS.FAIL, bb.reached ? `HTTP ${bb.status}` : "the request could not be sent");
      const cal = await readProbe("/customer/calendar"); add("A13", "Calendar loads (read-only)", cal.reached && cal.status === 200 ? STATUS.PASS : STATUS.FAIL, cal.reached ? `HTTP ${cal.status}` : "the request could not be sent");
    }
    add("A14", "Brand Brain completion and campaign recommendations (writes)", STATUS.NOT_RUN, "These save or request work, so they belong to the separately approved write phase (BG-017C-06). This script never saves Brand Brain or requests recommendations.");
    // checkout entry: the gate must be OFF; the script observes and never clicks
    const checkoutCalls = []; page.on("request", (rq) => { if (new URL(rq.url()).pathname === "/billing/stripe/checkout") checkoutCalls.push(rq.method()); });
    await page.reload({ waitUntil: "networkidle" }); await signedIn();
    const entry = await page.getByRole("button", { name: /continue to secure checkout/i }).first().isVisible().catch(() => false);
    const gated = await page.getByText(/Subscribing isn't available in this test environment yet/i).first().isVisible().catch(() => false);
    if (!scoped) add("A15", "Checkout entry is observed only (gated OFF; the script never clicks it)", STATUS.NOT_RUN, "No workspace exists for this account yet, so the billing area is not shown.");
    else add("A15", "Checkout entry is observed only: no checkout request is made and the entry is gated OFF (the script never clicks it)", ok(checkoutCalls.length === 0 && !entry), `checkout requests: ${checkoutCalls.length}; live subscribe button visible: ${entry}; gate notice visible: ${gated}`);
    add("A16", "Stripe test-mode checkout (hosted)", STATUS.NOT_RUN, "Needs the separate Stripe test-mode approval (bridge BG_BRIDGE_ALLOW_STRIPE_CHECKOUT plus the Studio gate) and an isolated billing test (BG-017C-06). Not attempted.");
    // expired session recovery
    await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (/^sb-.*-auth-token$/.test(k)) localStorage.removeItem(k); });
    await page.reload({ waitUntil: "networkidle" }); const signInScreen = await page.getByRole("button", { name: /^sign in$/i }).first().isVisible().catch(() => false); const back = signInScreen ? await signIn() : false; await shot("a10-recovered");
    add("A10", "A lost or expired session shows the sign-in screen, and signing in again restores access", ok(signInScreen && back), `sign-in screen shown: ${signInScreen}; signed in again: ${back}`);
    add("A11", "No script errors during the journey", ok(!seen.pageErrors.length), seen.pageErrors.length ? `${seen.pageErrors.length} error(s)` : "none");
  } finally { await browser.close(); }
  const report = { harness: "BG-017C-05B SM Properties acceptance", finished: new Date().toISOString(), target: g.origin, hostedReal: g.hosted && !intercept, selftest, evidenceClass: cls(), writeApproved, summary: summarise(results), results };
  fs.writeFileSync(path.join(outDir, "report.json"), redact(JSON.stringify(report, null, 2)));
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const target = arg("target"); if (!target) { console.error("sm-properties-acceptance: --target <origin> is required"); process.exit(2); }
  const outDir = arg("out") || `sm-properties-acceptance-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const report = await runSmProperties({ target, outDir });
  if (report.refused) { console.error(`REFUSED: ${report.reason}`); process.exit(2); }
  for (const r of report.results) console.log(`${r.status.padEnd(7)} ${r.id}  ${r.title}${r.status === "PASS" ? "" : `\n          ${r.detail}`}`);
  console.log(`\n${report.evidenceClass}: ${report.summary.pass} PASS, ${report.summary.fail} FAIL, ${report.summary.notRun} NOT RUN -> ${report.summary.verdict}\nEvidence: ${outDir}/report.json`);
  process.exit(report.summary.fail ? 1 : report.summary.notRun ? 3 : 0);
}
