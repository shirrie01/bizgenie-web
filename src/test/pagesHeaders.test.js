// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildHeaders, originOf } from "../../scripts/pages-headers.mjs";

const ok = { apiUrl: "https://staging-api.getbizgenie.com", supabaseUrl: "https://zrczojyxebwjgpymbmgu.supabase.co" };
describe("Cloudflare Pages response headers (BG-LAUNCH-011)", () => {
  it("limits connect-src to exactly the API and Supabase origins and allows no inline script, wildcard or framing", () => {
    const t = buildHeaders(ok);
    expect(t).toContain("connect-src 'self' https://staging-api.getbizgenie.com https://zrczojyxebwjgpymbmgu.supabase.co;");
    const csp = t.split("\n").find((l) => l.includes("Content-Security-Policy"));
    expect(csp).toContain("script-src 'self';"); expect(csp).not.toMatch(/script-src[^;]*unsafe/); expect(csp).not.toMatch(/\*/);
    expect(csp).toContain("frame-ancestors 'none'"); expect(csp).toContain("object-src 'none'");
    expect(t).toContain("X-Frame-Options: DENY"); expect(t).toContain("Referrer-Policy: no-referrer"); expect(t).toContain("X-Content-Type-Options: nosniff");
  });
  it("caches hashed assets for a year and never the HTML entry", () => {
    const t = buildHeaders(ok);
    expect(t).toMatch(/\/assets\/\*\n  Cache-Control: public, max-age=31536000, immutable/); expect(t).toMatch(/\/index\.html\n  Cache-Control: no-cache/);
    // BG-017C-06: HTML is no-cache on BOTH "/" (what a browser requests; the live smoke test failed on it) and "/index.html", and on the SPA-served checkout return pages
    const rules = Object.fromEntries(t.split("\n\n").map((b) => b.split("\n")).filter((l) => l.some((x) => /Cache-Control/.test(x))).map((l) => [l[0], l.find((x) => /Cache-Control/.test(x)).trim()]));
    expect(rules).toEqual({ "/assets/*": "Cache-Control: public, max-age=31536000, immutable", "/": "Cache-Control: no-cache", "/index.html": "Cache-Control: no-cache", "/billing/*": "Cache-Control: no-cache" });
    expect((t.match(/Cache-Control/g) || []).length).toBe(4); // never on /*, so rules cannot join into a conflicting value
    const star = t.split("\n\n").find((b) => b.startsWith("/*\n")); expect(star).toContain("Content-Security-Policy"); expect(star).not.toContain("Cache-Control"); // CSP stays on /*, cache rules do not
  });
  it("refuses anything that is not one https origin without credentials, query or wildcard", () => {
    for (const bad of ["", "not a url", "http://staging-api.getbizgenie.com", "https://user:pw@x.example", "https://x.example/?a=1", "https://x.example/#f", "https://*.example.com"]) expect(() => originOf("X", bad)).toThrow();
    expect(() => buildHeaders({ ...ok, apiUrl: "http://api.test" })).toThrow(/https/);
    expect(buildHeaders({ apiUrl: "http://api.test", supabaseUrl: "http://supabase.test", allowHttp: true })).toContain("connect-src 'self' http://api.test http://supabase.test;");
  });
  it("normalises a path or trailing slash to the origin", () => { expect(originOf("X", "https://staging-api.getbizgenie.com/")).toBe("https://staging-api.getbizgenie.com"); });
  it("environment guards: a staging project refuses another environment's API or Supabase project; noindex is opt-in", () => {
    const staging = { ...ok, expectApiOrigin: "https://staging-api.getbizgenie.com", expectSupabaseRef: "zrczojyxebwjgpymbmgu" };
    expect(buildHeaders(staging)).not.toContain("X-Robots-Tag"); expect(buildHeaders({ ...staging, noindex: true })).toContain("X-Robots-Tag: noindex, nofollow");
    expect(() => buildHeaders({ ...staging, apiUrl: "https://api.getbizgenie.com" })).toThrow(/not the API origin/);
    expect(() => buildHeaders({ ...staging, supabaseUrl: "https://uvgblmejpbswkvlqvqmz.supabase.co" })).toThrow(/not the Supabase project/);
  });
});
