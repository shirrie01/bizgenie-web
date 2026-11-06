// BG-LAUNCH-019: what to do with the part of the address a Supabase email link leaves behind.
// The Studio does not let supabase-js read the address (detectSessionInUrl is false), so without this a failed link left `#error=access_denied&error_code=otp_expired…`
// in the address bar for good, and a good link left an access token there. This reads only what kind of result the link had, removes every auth parameter from the
// address, and returns a plain-language notice. Token values are never read into the result, logged or returned.
const AUTH_KEYS = ["access_token", "refresh_token", "expires_at", "expires_in", "token_type", "provider_token", "provider_refresh_token", "type", "error", "error_code", "error_description", "sb"];

const parseParams = (raw) => { try { return new URLSearchParams(String(raw || "").replace(/^[#?]/, "")); } catch { return new URLSearchParams(); } };

// -> null (nothing to do) | { kind: "expired" | "failed" | "confirmed", message }
export function classifyAuthCallback(hash = "", search = "") {
  const h = parseParams(hash), s = parseParams(search);
  const get = (k) => h.get(k) ?? s.get(k);
  const code = String(get("error_code") || "").toLowerCase(), error = get("error"), description = String(get("error_description") || "").toLowerCase();
  if (error || code) {
    if (code === "otp_expired" || /expired/.test(description)) return { kind: "expired", message: "That confirmation link has expired or was already used. If your email is already confirmed, sign in below. If not, enter your email and ask for a new confirmation email." };
    return { kind: "failed", message: "That email link didn't work. Sign in below, or create the account again." };
  }
  if (get("access_token") || get("refresh_token")) return { kind: "confirmed", message: "Your email is confirmed. Sign in to continue." };
  return null;
}

export function scrubAuthParams(loc = window.location, history = window.history) {
  try {
    const s = parseParams(loc.search); let changed = false;
    for (const k of AUTH_KEYS) if (s.has(k)) { s.delete(k); changed = true; }
    const hash = parseParams(loc.hash); const hadHash = AUTH_KEYS.some((k) => hash.has(k));
    if (!changed && !hadHash) return false;
    const rest = new URLSearchParams(); for (const [k, v] of hash) if (!AUTH_KEYS.includes(k)) rest.set(k, v);
    const search = s.toString(), keptHash = rest.toString();
    history.replaceState(null, "", `${loc.pathname}${search ? `?${search}` : ""}${keptHash ? `#${keptHash}` : ""}`);
    return true;
  } catch { return false; }
}

// Called once per page load (React may render twice; the first answer is kept, because the address is cleaned the first time).
let cached;
export function consumeAuthCallback(loc = window.location, history = window.history) {
  if (cached !== undefined) return cached;
  cached = classifyAuthCallback(loc.hash, loc.search);
  scrubAuthParams(loc, history);
  return cached;
}
export const resetAuthCallbackForTests = () => { cached = undefined; };
