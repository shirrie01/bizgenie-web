import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let AXE = null;
try { AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8"); } catch { /* optional locally; CI installs it */ }
const STUB = "http://127.0.0.1:4301";
const W = Number((process.env.BG_VIEWPORT || "1440x900").split("x")[0]);
const EVIDENCE = process.env.SITE_EVIDENCE || "";
const state = async () => (await fetch(`${STUB}/__dev/state`)).json();

async function checks(page, label) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), `${label}: horizontal overflow`).toBe(false);
  if (AXE) {
    await page.evaluate(AXE); // evaluated through the debugger protocol: the page's strict CSP (no inline script) stays in force
    const v = await page.evaluate(async () => (await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`));
    expect(v, `${label}: axe`).toEqual([]);
  }
}
const shot = async (page, name) => {
  if (!EVIDENCE) return;
  fs.mkdirSync(EVIDENCE, { recursive: true });
  const full = ["home", "privacy", "terms", "data-deletion"].includes(name);
  if (full) { // lazy images only load when scrolled to: force them to load so the evidence shows what a visitor sees
    await page.evaluate(async () => { await Promise.all([...document.images].map((i) => { i.loading = "eager"; return i.decode().catch(() => {}); })); window.scrollTo(0, 0); });
  }
  await page.screenshot({ path: `${EVIDENCE}/${W}-${name}.jpg`, type: "jpeg", quality: 55, fullPage: full });
};
const uniq = () => `qa.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.com`;
async function fill(page, { email = uniq(), intent = "early_access", name = "Ada Lovelace", company = "Analytical Engines Ltd", industry = "agency", marketing = false } = {}) {
  await page.getByRole("radio", { name: new RegExp(intent === "early_access" ? "^Early access" : "^Founding customer") }).check();
  await page.getByLabel(/^Your name/).fill(name); await page.getByLabel(/^Business email/).fill(email);
  await page.getByLabel(/^Business or company name/).fill(company); await page.getByLabel(/^Industry/).selectOption(industry);
  await page.getByLabel(/I agree that BizGenie may use these details/).check();
  if (marketing) await page.getByLabel(/occasional news about BizGenie/).check();
  return email;
}

test("pages render, are accessible, do not overflow, and make no third-party request", async ({ page }) => {
  const hosts = new Set(); page.on("request", (r) => hosts.add(new URL(r.url()).host));
  for (const [path, h1] of [["/", /Your AI Marketing Operating System/], ["/privacy/", /Privacy notice/], ["/terms/", /Website terms/], ["/data-deletion/", /delete/i]]) {
    await page.goto(path); await expect(page.getByRole("heading", { level: 1 })).toHaveText(h1);
    await checks(page, path); await shot(page, path === "/" ? "home" : path.replaceAll("/", ""));
  }
  expect([...hosts].filter((h) => !["127.0.0.1:4300", "127.0.0.1:4301"].includes(h))).toEqual([]);
});

test("home: positioning, honest availability, labelled previews and no invented numbers", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Make. Launch. Learn what converts.").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Join early access" }).first()).toBeVisible(); await expect(page.getByRole("link", { name: "Register as a founding customer" }).first()).toBeVisible();
  await expect(page.locator("#feature-publishing .badge")).toHaveText("In development"); await expect(page.locator("#feature-learning .badge")).toHaveText("In development");
  await expect(page.locator("#previews")).toContainText("made-up sample businesses");
  const text = await page.locator("main").innerText(); expect(text).not.toMatch(/[£$€]\s?\d|\d+\s?%|testimonial|trusted by/i);
  for (const img of await page.locator("img").all()) { await img.scrollIntoViewIfNeeded(); await expect.poll(() => img.evaluate((i) => i.complete && i.naturalWidth > 0)).toBe(true); }
});

test("early access: choose, fill, submit - recorded once with consent evidence, attribution and no unnecessary data", async ({ page }) => {
  await page.goto("/?utm_source=QA&utm_medium=test&utm_campaign=launch1");
  await page.getByRole("link", { name: "Join early access" }).first().click();
  await expect(page.getByRole("radio", { name: /^Early access/ })).toBeChecked();
  const reqs = []; page.on("request", (r) => { if (r.url().includes("/public/early-access-interest") && r.method() === "POST") reqs.push(r.postDataJSON()); });
  const email = await fill(page, { intent: "early_access" });
  await page.waitForTimeout(3100);
  await page.getByRole("button", { name: "Register my interest" }).click();
  await expect(page.getByRole("heading", { name: /We have recorded your interest/ })).toBeVisible();
  await expect(page.locator("#success")).toBeFocused(); await expect(page.locator("#success")).toContainText("does not guarantee");
  expect(reqs).toHaveLength(1); const b = reqs[0];
  expect(b).toMatchObject({ contract_version: "early-access-interest.v1", intention: "early_access", work_email: email, privacy_contact_consent: true, marketing_consent: false, industry: "agency", source: { utm_source: "qa", utm_medium: "test", utm_campaign: "launch1", landing_path: "/" } });
  expect(b.consent.contact_text_sha256).toMatch(/^[a-f0-9]{64}$/); expect(b.client.elapsed_ms).toBeGreaterThan(3000);
  expect(JSON.stringify(b)).not.toMatch(/password|token|cookie/i);
  const s = await state(); const rec = s.records.find((r) => r.work_email === email); expect(rec).toMatchObject({ intention: "early_access", marketing_consent: false, utm_source: "qa" }); expect(s.records.filter((r) => r.work_email === email)).toHaveLength(1);
  await checks(page, "success"); await shot(page, "early-access-success");
});

test("founding customer: recorded as a distinct intention; a repeat with the same email stays one canonical record", async ({ page }) => {
  await page.goto("/"); await page.getByRole("link", { name: "Register as a founding customer" }).first().click();
  await expect(page.getByRole("radio", { name: /^Founding customer/ })).toBeChecked();
  const email = await fill(page, { intent: "founding_customer", marketing: true, industry: "ecommerce" });
  await page.getByRole("button", { name: "Register my interest" }).click();
  await expect(page.locator("#success-text")).toContainText("founding customer"); await expect(page.locator("#success")).toContainText("does not guarantee");
  await page.goto("/"); await fill(page, { email, intent: "early_access" }); await page.getByRole("button", { name: "Register my interest" }).click();
  await expect(page.getByRole("heading", { name: /We have recorded your interest/ })).toBeVisible();
  const recs = (await state()).records.filter((r) => r.work_email === email); expect(recs).toHaveLength(1); expect(recs[0]).toMatchObject({ intention: "founding_customer", marketing_consent: true }); expect(recs[0].receipts).toHaveLength(2);
});

test("validation: an empty submit names every problem, focuses the summary, marks fields invalid and sends nothing", async ({ page }) => {
  await page.goto("/#register"); let posts = 0; page.on("request", (r) => { if (r.method() === "POST" && r.url().includes("/public/early-access-interest")) posts++; });
  await page.getByRole("button", { name: "Register my interest" }).click();
  const summary = page.locator("#form-error-summary"); await expect(summary).toBeVisible(); await expect(summary).toBeFocused();
  await expect(summary.locator("li")).toHaveCount(6); await expect(page.locator("#f-name")).toHaveAttribute("aria-invalid", "true"); await expect(page.locator("#name-error")).toHaveText("Enter your name.");
  await summary.getByRole("link", { name: "Enter your email address." }).click(); await expect(page.locator("#f-email")).toBeFocused();
  await page.getByLabel(/^Business email/).fill("nope"); await page.getByRole("button", { name: "Register my interest" }).click(); await expect(page.locator("#email-error")).toContainText("name@company.com");
  expect(posts).toBe(0); await checks(page, "validation"); await shot(page, "validation");
});

test("keyboard only: the whole registration can be completed and submitted without a mouse", async ({ page }) => {
  await page.goto("/#register"); const email = uniq();
  await page.locator("#intent-early_access").focus(); await page.keyboard.press("Space");
  await page.keyboard.press("Tab"); // out of the radio group to the name field
  await expect(page.locator("#f-name")).toBeFocused(); await page.keyboard.type("Grace Hopper");
  await page.keyboard.press("Tab"); await page.keyboard.type(email); await page.keyboard.press("Tab"); await page.keyboard.type("Navy Systems");
  await page.keyboard.press("Tab"); await page.keyboard.press("ArrowDown"); // industry select
  for (let i = 0; i < 12; i++) { await page.keyboard.press("Tab"); if (await page.locator("#c-contact").evaluate((e) => e === document.activeElement)) break; }
  await page.keyboard.press("Space"); await expect(page.locator("#c-contact")).toBeChecked();
  await page.locator("#submit-btn").focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: /We have recorded your interest/ })).toBeVisible();
  expect((await state()).records.some((r) => r.work_email === email)).toBe(true);
});

test("failures keep the answers and are worded plainly: rate limit, outage, network loss; a retry reuses the SAME submission id", async ({ page }) => {
  await page.goto("/#register"); await fill(page); const ids = []; let mode = "429";
  await page.route("**/public/early-access-interest", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    ids.push(route.request().postDataJSON().submission_id);
    if (mode === "429") return route.fulfill({ status: 429, headers: { "access-control-allow-origin": "http://127.0.0.1:4300", "retry-after": "900", "content-type": "application/json" }, body: "{}" });
    if (mode === "503") return route.fulfill({ status: 503, headers: { "access-control-allow-origin": "http://127.0.0.1:4300", "content-type": "application/json" }, body: "{}" });
    if (mode === "abort") return route.abort("connectionreset");
    return route.fallback();
  });
  const btn = page.getByRole("button", { name: "Register my interest" });
  await btn.click(); await expect(page.locator("#status")).toContainText("too many attempts"); await expect(btn).toBeEnabled(); await expect(page.getByLabel(/^Your name/)).toHaveValue("Ada Lovelace");
  mode = "503"; await btn.click(); await expect(page.locator("#status")).toContainText("not available right now");
  mode = "abort"; await btn.click(); await expect(page.locator("#status")).toContainText("could not reach");
  mode = "ok"; await btn.click(); await expect(page.getByRole("heading", { name: /We have recorded your interest/ })).toBeVisible();
  expect(ids).toHaveLength(4); expect(new Set(ids).size).toBe(1);
});

test("bots: a filled honeypot sends nothing; measurement respects Global Privacy Control", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: W, height: 800 } }); const page = await ctx.newPage();
  await page.addInitScript(() => { Object.defineProperty(navigator, "globalPrivacyControl", { value: true }); });
  const out = []; page.on("request", (r) => { if (r.method() === "POST") out.push(r.url()); });
  await page.goto("/#register"); await fill(page); await page.evaluate(() => { document.getElementById("f-hp").value = "http://spam.test"; });
  await page.getByRole("button", { name: "Register my interest" }).click(); await expect(page.locator("#success")).toBeVisible();
  expect(out).toEqual([]); await ctx.close();
});

test("measurement: real counters only, no personal data, funnel computed from them", async ({ page }) => {
  const before = (await state()).counters; const n = (c, k) => c[k] || 0;
  await page.goto("/?utm_source=measure"); await page.locator("#register-form").scrollIntoViewIfNeeded();
  await page.getByLabel(/^Your name/).fill("Tester"); await page.getByRole("button", { name: "Register my interest" }).click();
  await page.waitForTimeout(600); await expect(page.locator("#form-error-summary")).toBeVisible();
  await page.goto("/privacy/"); await page.waitForTimeout(500); // leaving the page after starting counts as an abandon
  const after = (await state()).counters;
  expect(n(after, "all|page_view")).toBeGreaterThan(n(before, "all|page_view")); expect(n(after, "all|form_start")).toBeGreaterThan(n(before, "all|form_start"));
  expect(n(after, "all|field_error")).toBeGreaterThan(n(before, "all|field_error")); expect(n(after, "all|form_abandon")).toBeGreaterThan(n(before, "all|form_abandon"));
  expect(Object.keys(after).join(" ")).not.toMatch(/@|tester/i);
});

test("a build without a registration endpoint says so, disables the button and sends nothing", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: W, height: 800 } }); const page = await ctx.newPage(); const posts = []; page.on("request", (r) => { if (r.method() === "POST") posts.push(r.url()); });
  await page.goto("http://127.0.0.1:4302/#register"); await expect(page.locator("#closed-note")).toBeVisible(); await expect(page.locator("#submit-btn")).toBeDisabled(); expect(posts).toEqual([]);
  await checks(page, "closed"); await ctx.close();
});
