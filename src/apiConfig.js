// BG-017C-05B: the one place that decides whether this build knows where its API is.
// Ten modules fall back to http://localhost:8080 when VITE_BIZGENIE_API_URL is unset. On a hosted page that would send a signed-in customer's requests (with their bearer token)
// to whatever is listening on their own machine, and the page would only show "couldn't reach BizGenie". The app therefore does not start on a hosted page unless the API origin
// is an explicit, well-formed https origin. The build-time guards (scripts/pages-headers.mjs, release workflow) already refuse a mismatched origin; this is the runtime backstop
// for a build made without them. Which origin is right (the staging API host or an approved bridge) is decided by the reviewed settings and the release workflow, never here.
const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]"]);

// -> { ok: true, origin } | { ok: false, reason: "missing" | "invalid" | "insecure" | "local_on_hosted_page" }
export function resolveApiConfig(raw, page = typeof window !== "undefined" ? window.location : { protocol: "http:", hostname: "localhost" }) {
  const hosted = page.protocol === "https:" && !LOCAL.has(page.hostname);
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return hosted ? { ok: false, reason: "missing" } : { ok: true, origin: "http://localhost:8080" }; // the development default, never on a hosted page
  let u;
  try { u = new URL(value); } catch { return { ok: false, reason: "invalid" }; }
  if (u.username || u.password || u.search || u.hash || (u.pathname !== "/" && u.pathname !== "")) return { ok: false, reason: "invalid" };
  if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false, reason: "invalid" };
  if (hosted) {
    if (u.protocol !== "https:") return { ok: false, reason: "insecure" };
    if (LOCAL.has(u.hostname)) return { ok: false, reason: "local_on_hosted_page" };
  }
  return { ok: true, origin: u.origin };
}
