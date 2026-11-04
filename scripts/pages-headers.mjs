// BG-LAUNCH-011: writes dist/_headers for Cloudflare Pages from the SAME build-time values the app uses (VITE_BIZGENIE_API_URL, VITE_SUPABASE_URL), so the Content-Security-Policy
// names exactly the two origins the app may call and nothing else. Browser-safe values only; this script never reads or prints a secret.
//   npm run build:pages            (build, then write dist/_headers)
//   node scripts/pages-headers.mjs [outDir]
// A non-https origin is refused unless PAGES_ALLOW_HTTP_ORIGINS=1 (used only by the local/CI browser check against placeholder test origins).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function originOf(name, value, { allowHttp = false } = {}) {
  let u;
  try { u = new URL(String(value || "")); } catch { throw new Error(`${name} must be an absolute URL`); }
  if (u.protocol !== "https:" && !(allowHttp && u.protocol === "http:")) throw new Error(`${name} must be https`);
  if (u.username || u.password) throw new Error(`${name} must not contain credentials`);
  if (u.search || u.hash) throw new Error(`${name} must not contain a query or fragment`);
  if (!u.hostname || u.hostname.includes("*")) throw new Error(`${name} must name one host`);
  return u.origin;
}

// Optional environment guards so a staging project can never be built with another environment's values (tenant-safe configuration):
//   PAGES_EXPECT_API_ORIGIN       the API origin this project must call, e.g. https://staging-api.getbizgenie.com
//   PAGES_EXPECT_SUPABASE_REF     the one Supabase project this project must use, e.g. zrczojyxebwjgpymbmgu (its origin is https://<ref>.supabase.co)
//   PAGES_NOINDEX=1               adds X-Robots-Tag: noindex, nofollow (a pre-launch staging site must not be indexed)
export function buildHeaders({ apiUrl, supabaseUrl, allowHttp = false, hstsSeconds = 3600, expectApiOrigin = "", expectSupabaseRef = "", noindex = false }) {
  const api = originOf("VITE_BIZGENIE_API_URL", apiUrl, { allowHttp });
  const supabase = originOf("VITE_SUPABASE_URL", supabaseUrl, { allowHttp });
  if (expectApiOrigin && api !== originOf("PAGES_EXPECT_API_ORIGIN", expectApiOrigin, { allowHttp })) throw new Error(`VITE_BIZGENIE_API_URL (${api}) is not the API origin this project is configured for`);
  if (expectSupabaseRef && supabase !== `https://${expectSupabaseRef}.supabase.co`) throw new Error("VITE_SUPABASE_URL is not the Supabase project this project is configured for");
  // The app: one module script (no inline script), inline style attributes, Google Fonts (CSS import + font files), blob: URLs for authenticated media previews, and fetches to the
  // BizGenie API and Supabase Auth only. Navigations to a platform's sign-in page or Stripe Checkout are top-level and are not governed by connect-src or form-action.
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    `connect-src 'self' ${api} ${supabase}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
  return [
    "/*",
    `  Content-Security-Policy: ${csp}`,
    `  Strict-Transport-Security: max-age=${hstsSeconds}`,
    "  X-Content-Type-Options: nosniff",
    "  X-Frame-Options: DENY",
    "  Referrer-Policy: no-referrer",
    "  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    ...(noindex ? ["  X-Robots-Tag: noindex, nofollow"] : []),
    "",
    "/assets/*",
    "  Cache-Control: public, max-age=31536000, immutable",
    "",
    "/index.html",
    "  Cache-Control: no-cache",
    "",
  ].join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = process.argv[2] || "dist";
  try {
    const text = buildHeaders({ apiUrl: process.env.VITE_BIZGENIE_API_URL, supabaseUrl: process.env.VITE_SUPABASE_URL, allowHttp: process.env.PAGES_ALLOW_HTTP_ORIGINS === "1",
      expectApiOrigin: process.env.PAGES_EXPECT_API_ORIGIN || "", expectSupabaseRef: process.env.PAGES_EXPECT_SUPABASE_REF || "", noindex: process.env.PAGES_NOINDEX === "1" });
    if (!fs.existsSync(path.join(out, "index.html"))) throw new Error(`${out}/index.html not found: build first`);
    fs.writeFileSync(path.join(out, "_headers"), text);
    console.log(`wrote ${out}/_headers (connect-src limited to ${originOf("api", process.env.VITE_BIZGENIE_API_URL, { allowHttp: process.env.PAGES_ALLOW_HTTP_ORIGINS === "1" })} and the Supabase origin)`);
  } catch (e) { console.error(`pages-headers: ${e.message}`); process.exit(1); }
}
