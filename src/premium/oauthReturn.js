// BG-LAUNCH-CLOSURE-10: the browser's return from a social platform (LinkedIn, TikTok), parsed and checked BEFORE anything is sent to the backend.
// Two return shapes are accepted, both landing in the Studio itself (the private IAM-protected API never has to be reachable from a browser):
//   1. Studio-hosted callback  https://<studio origin>/customer/social/oauth/callback/<provider>?code=…&state=…   (the platform redirects straight to the Studio)
//   2. Legacy API relay        https://<studio origin>/?code=…&state=…                                              (the API answered the platform and 303-redirected here)
// No server is involved in shape 1: the Studio reads the query, removes it from the address bar at once, and completes the connection with the signed-in owner's
// session and the PKCE verifier that never left this browser. The backend still re-checks everything (state hash, single use, expiry, tenant/project/actor binding,
// redirect URI, PKCE verifier). This module never navigates, never logs, never echoes a query value and never builds a URL from the query (no open redirect).
import { PROVIDERS } from "./socialClient";

export const CALLBACK_PATH = /^\/customer\/social\/oauth\/callback\/([a-z]+)\/?$/;
const STATE = /^[A-Za-z0-9_-]{32,256}$/;    // the server issues 43-character base64url states and accepts 32–256
const CODE = /^[\x21-\x7e]{1,4096}$/;       // printable ASCII without spaces, at most the backend's 4096

export const looksLikeOAuthReturn = (pathname = "", search = "") => CALLBACK_PATH.test(pathname) || /(?:^|[?&])(?:code|error)=/.test(search || "");

// Fixed customer-facing text per outcome. Query values are never shown.
export const RETURN_MESSAGE = {
  provider_error: "Permission was not given on the platform, so nothing was connected.",
  NO_PENDING: "This sign-in attempt is not open any more (it was already used, or it was started in another window), so nothing was connected. Start again.",
  STATE_MISMATCH: "The platform's answer did not match this connection attempt, so nothing was connected.",
  PROVIDER_MISMATCH: "The platform's answer was for a different platform than the one you started, so nothing was connected.",
  SCOPE_MISMATCH: "This attempt was started in a different workspace, so nothing was connected. Start again from the workspace you want to connect.",
  EXPIRED: "That sign-in attempt expired, so nothing was connected. Start again.",
  MALFORMED: "The platform's answer was not in the expected form, so nothing was connected.",
  MISSING_PARAMS: "The platform's answer was incomplete, so nothing was connected.",
  UNKNOWN_PROVIDER: "That platform is not one BizGenie connects to, so nothing was connected.",
  NOT_OWNER: "Only the workspace owner can connect an account, so nothing was connected.",
  UNAVAILABLE: "Connecting accounts is not switched on, so nothing was connected.",
};

// pending = what this browser stored when the attempt started: { intentId, state, verifier, provider, expiresAt, scope? }. scope = the current workspace { tenantId, projectId, brandId }.
export function readOAuthReturn({ pathname = "/", search = "", pending = null, scope = null, now = Date.now() } = {}) {
  const m = CALLBACK_PATH.exec(pathname || "");
  const pathProvider = m ? m[1] : null;
  let p; try { p = new URLSearchParams(search || ""); } catch { return { kind: "invalid", reason: "MALFORMED" }; }
  if (!pathProvider && !p.has("code") && !p.has("state") && !p.has("error")) return { kind: "none" };
  if (pathProvider && !PROVIDERS.includes(pathProvider)) return { kind: "invalid", reason: "UNKNOWN_PROVIDER" };
  for (const k of ["code", "state", "error"]) if (p.getAll(k).length > 1) return { kind: "invalid", reason: "MALFORMED" }; // parameter pollution
  const code = p.get("code"), state = p.get("state"), error = p.get("error");
  if (error && !code) return { kind: "provider_error", provider: pathProvider || (pending && PROVIDERS.includes(pending.provider) ? pending.provider : null) };
  if (!code || !state) return { kind: "invalid", reason: "MISSING_PARAMS" };
  if (!CODE.test(code) || !STATE.test(state)) return { kind: "invalid", reason: "MALFORMED" };
  if (!pending || typeof pending !== "object" || typeof pending.state !== "string") return { kind: "invalid", reason: "NO_PENDING" };
  if (pending.state !== state) return { kind: "invalid", reason: "STATE_MISMATCH" };
  if (!PROVIDERS.includes(pending.provider) || (pathProvider && pathProvider !== pending.provider)) return { kind: "invalid", reason: "PROVIDER_MISMATCH" };
  if (Number.isFinite(Date.parse(pending.expiresAt)) && Date.parse(pending.expiresAt) <= now) return { kind: "invalid", reason: "EXPIRED" };
  if (pending.scope && scope && (pending.scope.tenantId !== scope.tenantId || pending.scope.projectId !== scope.projectId || pending.scope.brandId !== scope.brandId)) return { kind: "invalid", reason: "SCOPE_MISMATCH" };
  return { kind: "ready", provider: pending.provider, code, state };
}
