// @vitest-environment node
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkCsp, checkDir, checkUrl, scanText } from "../../scripts/smoke-pages.mjs";
import { TAGLINE } from "../brand/tagline.js";

const opts = { api: "https://staging-api.getbizgenie.com", supabaseRef: "zrczojyxebwjgpymbmgu", noindex: true };
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; connect-src 'self' https://staging-api.getbizgenie.com https://zrczojyxebwjgpymbmgu.supabase.co; frame-ancestors 'none'; object-src 'none'";
const headersFile = `/*\n  Content-Security-Policy: ${csp}\n  Strict-Transport-Security: max-age=3600\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: no-referrer\n  Permissions-Policy: camera=()\n  X-Robots-Tag: noindex, nofollow\n`;
const dist = (extra = {}) => { const d = mkdtempSync(join(tmpdir(), "smoke-")); mkdirSync(join(d, "assets")); writeFileSync(join(d, "index.html"), "<html></html>"); writeFileSync(join(d, "_headers"), headersFile); writeFileSync(join(d, "assets", "a.js"), "console.log(1)"); for (const [k, v] of Object.entries(extra)) writeFileSync(join(d, k), v); return d; };

describe("smoke-pages (BG-LAUNCH-013)", () => {
  it("the locked tagline is exact", () => expect(TAGLINE).toBe("Make. Launch. Learn what converts."));
  it("accepts a correct staging CSP and refuses wrong origins, wildcards and unsafe-eval", () => {
    expect(checkCsp(csp, opts)).toEqual([]);
    expect(checkCsp(csp.replace("https://staging-api.getbizgenie.com", "https://api.getbizgenie.com"), opts).length).toBeGreaterThan(0);
    expect(checkCsp(csp + "; img-src *", opts).join()).toMatch(/wildcard/);
    expect(checkCsp(csp.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'"), opts).join()).toMatch(/script-src/);
  });
  it("a clean build passes; a secret, another Supabase project, 404.html or missing noindex fails", () => {
    expect(checkDir(dist(), opts)).toEqual([]);
    expect(checkDir(dist({ "assets/b.js": 'x="service_role"' }), opts).join()).toMatch(/secret-like/);
    expect(checkDir(dist({ "assets/b.js": 'u="https://uvgblmejpbswkvlqvqmz.supabase.co"' }), opts).join()).toMatch(/another Supabase/);
    expect(checkDir(dist({ "assets/b.js": 'u="https://api.getbizgenie.com"' }), opts).join()).toMatch(/another BizGenie origin/);
    expect(checkDir(dist({ "404.html": "x" }), opts).join()).toMatch(/404\.html/);
    expect(checkDir(dist(), { ...opts, noindex: false }).join()).toMatch(/noindex present/);
    expect(scanText("t", "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZSJ9.abcdefghijk", opts).join()).toMatch(/secret-like/);
  });
  it("a live URL must answer with headers, SPA fallback and immutable assets", async () => {
    const html = '<script src="/assets/a.js"></script>';
    const mk = (over = {}) => async (u) => { const p = new URL(u).pathname; const h = { "content-security-policy": csp, "strict-transport-security": "x", "x-content-type-options": "nosniff", "x-frame-options": "DENY", "referrer-policy": "no-referrer", "permissions-policy": "x", "x-robots-tag": "noindex", "cache-control": p.startsWith("/assets/") ? "public, max-age=1, immutable" : "no-cache" };
      const body = p.startsWith("/assets/") ? "1" : html; const r = over[p] || { status: 200, body }; return new Response(r.body, { status: r.status, headers: { ...h, ...(r.headers || {}) } }); };
    expect(await checkUrl("https://staging-app.example", opts, mk())).toEqual([]);
    expect((await checkUrl("https://staging-app.example", opts, mk({ "/billing/checkout/success": { status: 404, body: "no" } }))).join()).toMatch(/fall back/);
    expect((await checkUrl("https://staging-app.example", opts, mk({ "/": { status: 200, body: html, headers: { "x-robots-tag": "" } } }))).join()).toMatch(/noindex/);
  });
});
