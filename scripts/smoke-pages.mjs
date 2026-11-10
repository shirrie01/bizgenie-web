// BG-LAUNCH-013: checks a built Studio (--dir) or a deployed one (--url). Read-only; sends no credentials.
// node scripts/smoke-pages.mjs --dir dist --api https://staging-api.getbizgenie.com --supabase-ref zrczojyxebwjgpymbmgu [--noindex]
// node scripts/smoke-pages.mjs --url https://staging-app.getbizgenie.com --api ... --supabase-ref ... [--noindex]
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const SECRET_MARKERS = [/service_role/i, /sk_(live|test)_[A-Za-z0-9]/, /client_secret/i, /TIKTOK_CLIENT_SECRET/, /BEGIN [A-Z ]*PRIVATE KEY/, /whsec_[A-Za-z0-9]/, /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/];
const REQUIRED_HEADERS = ["content-security-policy", "strict-transport-security", "x-content-type-options", "x-frame-options", "referrer-policy", "permissions-policy"];

export function checkCsp(csp, { api, supabaseRef, supabaseOrigin }) {
  const bad = []; const d = Object.fromEntries(String(csp || "").split(";").map((s) => s.trim()).filter(Boolean).map((s) => { const [k, ...v] = s.split(/\s+/); return [k, v]; }));
  if (!d["script-src"] || d["script-src"].join(" ") !== "'self'") bad.push("script-src must be 'self' only");
  if (JSON.stringify(d["object-src"]) !== '["\'none\'"]') bad.push("object-src must be 'none'");
  if (JSON.stringify(d["frame-ancestors"]) !== '["\'none\'"]') bad.push("frame-ancestors must be 'none'");
  const connect = d["connect-src"] || [];
  const allowed = new Set(["'self'", api, supabaseOrigin || `https://${supabaseRef}.supabase.co`]);
  for (const c of connect) if (!allowed.has(c)) bad.push(`connect-src has an unexpected origin: ${c}`);
  for (const a of allowed) if (!connect.includes(a)) bad.push(`connect-src is missing ${a}`);
  if (/\*/.test(csp) || /unsafe-eval/.test(csp)) bad.push("wildcard or unsafe-eval in CSP");
  return bad;
}
export function scanText(name, text, { api, supabaseRef }) {
  const bad = [];
  for (const re of SECRET_MARKERS) if (re.test(text)) bad.push(`${name}: secret-like content (${re})`);
  for (const m of text.matchAll(/https:\/\/([a-z0-9-]+)\.supabase\.co/g)) if (m[1] !== supabaseRef) bad.push(`${name}: another Supabase project (${m[1]})`);
  // The Studio source names the two reviewed TikTok callback hosts (it checks a connect URL against them), so those two are always present in every build.
  const BUILT_IN = new Set(["https://getbizgenie.com", "https://staging-api.getbizgenie.com"]);
  for (const m of text.matchAll(/https:\/\/[a-z0-9.-]*getbizgenie\.com/g)) { if (m[0] !== api && !BUILT_IN.has(m[0]) && !/^https:\/\/(www\.|staging-app\.)/.test(m[0])) bad.push(`${name}: another BizGenie origin (${m[0]})`); }
  return bad;
}
function walk(dir) { return readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; }); }
export function checkDir(dir, opts) {
  const bad = [];
  if (!existsSync(join(dir, "index.html"))) return ["index.html is missing"];
  if (existsSync(join(dir, "404.html"))) bad.push("404.html would turn off SPA fallback on Pages");
  if (existsSync(join(dir, "_redirects"))) bad.push("_redirects is not expected (SPA fallback is the Pages default)");
  const hp = join(dir, "_headers");
  if (!existsSync(hp)) bad.push("_headers is missing");
  else {
    const h = readFileSync(hp, "utf8"); const csp = (h.match(/Content-Security-Policy:\s*(.+)/) || [])[1];
    bad.push(...checkCsp(csp, opts));
    for (const k of REQUIRED_HEADERS) if (!new RegExp(`^\\s+${k}:`, "im").test(h)) bad.push(`_headers lacks ${k}`);
    if (opts.noindex && !/X-Robots-Tag:\s*noindex/i.test(h)) bad.push("_headers lacks X-Robots-Tag noindex");
    if (!opts.noindex && /X-Robots-Tag:\s*noindex/i.test(h)) bad.push("noindex present on a build not marked staging");
  }
  for (const f of walk(dir)) if (/\.(js|css|html|map|json|txt)$/.test(f)) bad.push(...scanText(f.replace(dir, ""), readFileSync(f, "utf8"), opts));
  return bad;
}
export async function checkUrl(base, opts, fetchImpl = fetch) {
  const bad = []; const get = (p) => fetchImpl(new URL(p, base), { redirect: "manual", credentials: "omit" });
  const root = await get("/"); const rootHtml = await root.text();
  if (root.status !== 200) bad.push(`/ answered ${root.status}`);
  for (const k of REQUIRED_HEADERS) if (!root.headers.get(k)) bad.push(`/ lacks ${k}`);
  bad.push(...checkCsp(root.headers.get("content-security-policy"), opts));
  const robots = root.headers.get("x-robots-tag") || "";
  if (opts.noindex && !/noindex/i.test(robots)) bad.push("/ lacks X-Robots-Tag noindex");
  if (!opts.noindex && /noindex/i.test(robots)) bad.push("noindex on a build not marked staging");
  if (!/no-cache/i.test(root.headers.get("cache-control") || "")) bad.push("/ is not no-cache");
  for (const p of ["/billing/checkout/success", "/billing/checkout/cancel", "/some/deep/link"]) {
    const r = await get(p); const t = await r.text();
    if (r.status !== 200 || t !== rootHtml) bad.push(`${p} does not fall back to index.html (status ${r.status})`);
  }
  const asset = (rootHtml.match(/\/assets\/[^"']+\.js/) || [])[0];
  if (!asset) bad.push("no script asset referenced by index.html");
  else { const a = await get(asset); const body = await a.text(); if (a.status !== 200) bad.push(`${asset} answered ${a.status}`); if (!/immutable/.test(a.headers.get("cache-control") || "")) bad.push(`${asset} is not immutable-cached`); bad.push(...scanText(asset, body, opts)); }
  return bad;
}
function arg(n) { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; }
if (import.meta.url === `file://${process.argv[1]}`) {
  const opts = { api: arg("api"), supabaseRef: arg("supabase-ref"), noindex: process.argv.includes("--noindex") };
  if (!opts.api || !opts.supabaseRef || !(arg("dir") || arg("url"))) { console.error("smoke-pages: --dir|--url, --api and --supabase-ref are required"); process.exit(2); }
  const bad = arg("dir") ? checkDir(arg("dir"), opts) : await checkUrl(arg("url"), opts);
  if (bad.length) { console.error(bad.map((b) => `FAIL ${b}`).join("\n")); process.exit(1); }
  console.log(`smoke-pages: PASS (${arg("dir") ? "dir " + arg("dir") : "url " + arg("url")})`);
}
