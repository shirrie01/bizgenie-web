// @vitest-environment node
// BG-WEB-LAUNCH-CLOSURE-14: the strict build must never publish a blank or dangling legal section, and `site:check` must name exactly what is missing.
// Fixture values below are placeholders for the test only (example.test); they are never written to site/config.mjs.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { company, unresolved } from "../config.mjs";
import { deletionPage, privacyPage, supportPage, termsPage } from "../templates.mjs";

const root = path.resolve(import.meta.dirname, "..", "..");
const original = structuredClone(company);
afterEach(() => { for (const k of Object.keys(company)) delete company[k]; Object.assign(company, structuredClone(original)); });
const complete = () => Object.assign(company, { companyNumber: "TEST-0001", registeredOffice: "1 Example Street, Testville", contactEmail: "help@example.test", privacyContactEmail: "privacy@example.test",
  legalReviewed: true, retentionDecision: "Fixture retention sentence.", processors: [{ name: "Fixture Host Ltd", purpose: "hosting" }, { name: "Fixture Mail Ltd", purpose: "email delivery" }],
  internationalTransfers: "Fixture transfers sentence.", governingLaw: "Fixture governing law sentence." });
const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const sections = (html) => [...html.matchAll(/<h2>([^<]+)<\/h2>\s*(<p>[\s\S]*?<\/p>|<ul>[\s\S]*?<\/ul>|<ol>[\s\S]*?<\/ol>)/g)].map((m) => [m[1], text(m[2]).trim()]);

describe("what is missing", () => {
  it("names every fact the privacy notice and terms need, including processors, transfers and governing law", () => {
    const open = unresolved().join("|");
    for (const k of ["companyNumber", "registeredOffice", "contactEmail", "privacyContactEmail", "retentionDecision", "processors", "internationalTransfers", "governingLaw", "legalReviewed", "SITE_API_URL"]) expect(open, k).toContain(k);
  });
  it("is empty only when every one of them is supplied", () => {
    complete(); expect(unresolved().filter((i) => !i.startsWith("SITE_API_URL"))).toEqual([]);
    for (const k of ["processors", "internationalTransfers", "governingLaw"]) { complete(); company[k] = null; expect(unresolved().join("|"), k).toContain(k); }
    complete(); company.processors = [{ name: "Only a name" }]; expect(unresolved().join("|")).toContain("processors");
  });
  it("`site:check` lists the outstanding items by owner, exits 2, and `--json` is machine-readable", () => {
    const r = spawnSync("node", ["site/check.mjs"], { cwd: root, encoding: "utf8" });
    expect(r.status).toBe(2); expect(r.stdout).toMatch(/Company facts \(founder\)[\s\S]*companyNumber/); expect(r.stdout).toMatch(/Terms \(adviser\)[\s\S]*governingLaw/);
    const j = JSON.parse(spawnSync("node", ["site/check.mjs", "--json"], { cwd: root, encoding: "utf8" }).stdout);
    expect(j.ready).toBe(false); expect(j.outstanding).toBeGreaterThan(5); expect(j.report.every((g) => g.items.length > 0)).toBe(true);
  });
});

describe("a fully supplied strict build publishes no blank or dangling section", () => {
  it("every section of privacy, terms, deletion and support has text, shows the supplied facts, and nothing says 'to be confirmed' or 'see below' without content", () => {
    complete();
    const pages = { privacy: privacyPage({ strict: true }), terms: termsPage({ strict: true }), deletion: deletionPage({ strict: true }), support: supportPage({ strict: true }) };
    for (const [name, html] of Object.entries(pages)) {
      for (const [h, body] of sections(html)) expect(body.length, `${name}: "${h}" is blank`).toBeGreaterThan(3);
      expect(text(html), name).not.toMatch(/to be confirmed|Draft for legal review/i);
    }
    const priv = text(pages.privacy);
    expect(priv).toContain("Fixture Host Ltd"); expect(priv).toContain("email delivery"); expect(priv).toContain("Fixture transfers sentence."); expect(priv).toContain("Fixture retention sentence.");
    expect(priv).not.toMatch(/see below/); expect(text(pages.terms)).toContain("Fixture governing law sentence.");
    expect(pages.support).toContain('href="mailto:help@example.test"'); expect(pages.deletion).toContain('href="mailto:privacy@example.test"');
  });
  it("escapes supplied text (a provider name cannot inject markup)", () => {
    complete(); company.processors = [{ name: "<img src=x onerror=1>", purpose: "a & b" }];
    const html = privacyPage({ strict: true }); expect(html).not.toContain("<img src=x"); expect(html).toContain("&lt;img src=x onerror=1&gt;"); expect(html).toContain("a &amp; b");
  });
  it("the draft build still shows visible 'to be confirmed' markers where facts are missing", () => {
    const html = privacyPage({ strict: false }); expect(text(html)).toMatch(/to be confirmed before publication/); expect(text(termsPage({ strict: false }))).toMatch(/to be confirmed before publication/);
  });
});
