// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";
import { beforeAll, describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..", "..");
const OUT = "site-dist-vitest";
const dist = path.join(root, OUT);
const PAGES = ["index.html", "privacy/index.html", "terms/index.html", "data-deletion/index.html", "404.html"];
const dom = (rel) => new JSDOM(fs.readFileSync(path.join(dist, rel), "utf8")).window.document;
let home;
beforeAll(() => { execFileSync("node", ["site/build.mjs"], { cwd: root, env: { ...process.env, SITE_OUT: OUT, SITE_API_URL: "" }, stdio: "pipe" }); home = dom("index.html"); });

describe("pages", () => {
  it.each(PAGES)("%s has the document basics", (rel) => {
    const d = dom(rel);
    expect(d.documentElement.getAttribute("lang")).toBe("en-GB");
    expect(d.title.length).toBeGreaterThan(8); expect(d.querySelector('meta[name="description"]').content.length).toBeGreaterThan(20);
    expect(d.querySelectorAll("h1")).toHaveLength(1); expect(d.querySelectorAll("main")).toHaveLength(1);
    if (rel !== "404.html") { expect(d.querySelector("a.skip").getAttribute("href")).toBe("#main"); expect(d.querySelector("link[rel=canonical]").href).toMatch(/^https:\/\/getbizgenie\.com\//); }
  });
  it.each(PAGES)("%s uses no inline script, inline style, event-handler attribute or third-party URL (strict CSP, no tracking)", (rel) => {
    const d = dom(rel); const html = fs.readFileSync(path.join(dist, rel), "utf8");
    for (const s of d.querySelectorAll("script")) expect(s.getAttribute("src")).toBeTruthy();
    expect(d.querySelectorAll("[style]")).toHaveLength(0); expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    for (const el of d.querySelectorAll("[src],[href]:not(link[rel=canonical])")) { const v = el.getAttribute("src") || el.getAttribute("href"); expect(v, v).toMatch(/^(\/|#|mailto:)/); }
    expect(html).not.toMatch(/(src|href|action)="https?:/i); // visible words such as Facebook in the FAQ are fine; resources are not
  });
  it("every internal link and anchor resolves", () => {
    for (const rel of PAGES) for (const a of dom(rel).querySelectorAll("a[href^='/'],a[href^='#']")) {
      const [p, hash] = a.getAttribute("href").split("#"); const file = p === "" ? rel : p.endsWith("/") ? p.slice(1) + "index.html" : p.slice(1);
      expect(fs.existsSync(path.join(dist, file)), `${rel} -> ${a.getAttribute("href")}`).toBe(true);
      if (hash) expect(dom(file).getElementById(hash), `${rel} -> #${hash}`).toBeTruthy();
    }
  });
  it("images have alt text and dimensions, and every referenced file exists", () => {
    for (const img of home.querySelectorAll("img")) { expect(img.getAttribute("alt").length).toBeGreaterThan(20); expect(img.getAttribute("width")).toBeTruthy(); expect(img.getAttribute("height")).toBeTruthy(); expect(fs.existsSync(path.join(dist, img.getAttribute("src")))).toBe(true); }
  });
  it("the draft build is not indexable; headers reference has a strict CSP", () => {
    expect(fs.readFileSync(path.join(dist, "robots.txt"), "utf8")).toMatch(/Disallow: \//);
    const h = JSON.parse(fs.readFileSync(path.join(dist, "headers.reference.json"), "utf8")); expect(h["Content-Security-Policy"]).not.toMatch(/unsafe-inline|unsafe-eval|\*/); expect(h["Content-Security-Policy"]).toMatch(/frame-ancestors 'none'/);
  });
});

describe("truthful content", () => {
  const text = () => { const d = dom("index.html"); d.querySelectorAll(".ticks, #faq, script, style").forEach((e) => e.remove()); return d.body.textContent.replace(/\s+/g, " "); };
  it("makes no price, statistic, customer-count, testimonial, award or availability claim", () => {
    const t = text();
    const banned = [/[£$€]\s?\d/, /\d+\s?%/, /\b\d[\d,]*\+?\s+(customers|users|businesses|brands|teams|companies|agencies)\b/i, /trusted by|used by|loved by|award|best-in-class|world.?class|#\s?1\b|number one|testimonial|case study/i, /available now|now available|live now|now live|generally available|sign up now|start (your )?free|free trial|money.?back|guarantee[sd]? (results|roi|growth)/i, /\b(launch(es|ing)?|opens?)\s+(on|in)\s+(january|february|march|april|may|june|july|august|september|october|november|december|q[1-4]|20\d\d)/i];
    for (const re of banned) expect(t).not.toMatch(re);
  });
  it("states plainly that it is not open yet, and that registering guarantees nothing", () => {
    const all = dom("index.html").body.textContent.replace(/\s+/g, " ");
    for (const s of ["not yet open to the public", "does not guarantee that you will be invited", "no launch date", "No price, discount or special offer", "not asked to pay anything now"]) expect(all.toLowerCase()).toContain(s.toLowerCase().replace("not asked", "not asked"));
  });
  it("every capability card carries one honest status and none claims to be available", () => {
    const cards = [...home.querySelectorAll(".feature")]; expect(cards).toHaveLength(6);
    for (const c of cards) { const b = c.querySelectorAll(".badge"); expect(b).toHaveLength(1); expect(b[0].textContent).toMatch(/^(Pre-release build|In development|Planned)$/); }
    const pub = home.querySelector("#feature-publishing"), learn = home.querySelector("#feature-learning");
    expect(pub.textContent).toMatch(/In development/); expect(pub.textContent).toMatch(/platform approving|approval|approve/i); expect(learn.textContent).toMatch(/In development/);
  });
  it("shows the approved positioning", () => {
    const t = home.body.textContent; expect(home.querySelector("h1").textContent).toBe("Your AI Marketing Operating System."); expect(t).toContain("Make. Launch. Learn what converts.");
    expect(t).toContain("Bring brand intelligence, creative production, campaign planning, publishing workflows and performance learning together in one platform.");
    for (const s of ["Agencies", "Ecommerce", "Professional services", "Hospitality", "Product brands"]) expect(t).toContain(s);
  });
  it("previews are labelled as sample data from a pre-release product", () => { expect(home.querySelector("#previews").textContent).toMatch(/pre-release product with made-up sample businesses/); });
});

describe("registration form", () => {
  const f = () => home.getElementById("register-form");
  it("every control has a label; radios are in a fieldset with a legend; the honeypot is hidden from people and assistive technology", () => {
    for (const el of f().querySelectorAll("input:not([type=hidden]),select,textarea")) { if (el.id === "f-hp") continue; expect(f().querySelector(`label[for="${el.id}"]`), el.id).toBeTruthy(); }
    expect(f().querySelector('fieldset input[name="intention"]').closest("fieldset").querySelector("legend")).toBeTruthy();
    const hp = f().querySelector(".hp"); expect(hp.getAttribute("aria-hidden")).toBe("true"); expect(f().querySelector("#f-hp").getAttribute("tabindex")).toBe("-1");
  });
  it("offers both intentions, none preselected; two separate consents, only the contact one required, neither ticked", () => {
    expect([...f().querySelectorAll('input[name="intention"]')].map((i) => i.value)).toEqual(["early_access", "founding_customer"]);
    expect(f().querySelector('input[name="intention"]:checked')).toBeNull();
    const c1 = f().querySelector("#c-contact"), c2 = f().querySelector("#c-marketing");
    expect(c1.required).toBe(true); expect(c2.required).toBe(false); expect(c1.checked).toBe(false); expect(c2.checked).toBe(false);
    expect(f().querySelector("#c-marketing-label").textContent).toMatch(/optional/i);
  });
  it("asks for no credentials, tokens, passwords or social handles, and warns not to enter them", () => {
    const names = [...f().querySelectorAll("input,select,textarea")].map((e) => e.name).join(" "); expect(names).not.toMatch(/pass|token|secret|handle|instagram|facebook|meta|social|card|phone/i);
    expect(f().textContent).toMatch(/do not include passwords, social media logins/i); expect(f().querySelector("form,[type=password]")).toBeNull();
  });
  it("has accessible error and status regions and does not submit natively", () => {
    expect(f().querySelector("#form-error-summary").getAttribute("role")).toBe("alert"); expect(f().querySelector("#status").getAttribute("aria-live")).toBe("polite"); expect(f().hasAttribute("novalidate")).toBe(true);
  });
});

describe("company and legal information for reviewers", () => {
  it("names the company and links the privacy notice, terms and data deletion from the footer", () => {
    const t = home.body.textContent; expect(t).toContain("BizGenie Technologies Limited");
    for (const href of ["/privacy/", "/terms/", "/data-deletion/"]) expect(home.querySelector(`footer a[href="${href}"]`)).toBeTruthy();
  });
  it("the privacy notice covers purposes, basis, measurement, retention, rights and the ICO; it asks for no social credentials", () => {
    const t = dom("privacy/index.html").body.textContent.replace(/\s+/g, " ");
    for (const s of ["Your consent", "Legitimate interests", "does not use cookies", "How long we keep it", "Your rights", "Information Commissioner", "do not ask for social media passwords"]) expect(t.toLowerCase()).toContain(s.toLowerCase().replace("do not ask", "do not​ ask").replace("​", ""));
  });
  it("shows unresolved facts as 'to be confirmed' in a draft build, never invented values", () => {
    const html = fs.readFileSync(path.join(dist, "index.html"), "utf8"); expect(html).toMatch(/to be confirmed before publication/); expect(html).not.toMatch(/Company number<\/dt><dd>\d/);
  });
  it("a strict (publication) build refuses to run while founder-only facts are unresolved", () => {
    const r = spawnSync("node", ["site/build.mjs", "--strict"], { cwd: root, env: { ...process.env, SITE_OUT: OUT + "-strict" }, encoding: "utf8" });
    expect(r.status).toBe(2); expect(r.stderr).toMatch(/companyNumber/); expect(r.stderr).toMatch(/legalReviewed/); expect(fs.existsSync(path.join(root, OUT + "-strict"))).toBe(false);
  });
});
