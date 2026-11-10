// BG-017C-05B: customer wording for the refusals the trusted staging bridge itself can send (API PR #229, src/studio-bridge/service.js). They carry the standard
// `{ error: { code } }` body, so a client can tell "this test environment is read-only" from a real permission problem. None of the wording names infrastructure.
// Each text is true for the case it describes: the bridge refuses these BEFORE forwarding, so nothing was started, saved or charged.
export const BRIDGE_REFUSALS = Object.freeze({
  STAGING_WRITES_DISABLED: { kind: "readonly", text: "Changes are switched off in this test environment, so nothing was saved. Your details are still here." },
  GENERATION_CONFIRMATION_DISABLED: { kind: "disabled", text: "Starting a generation is switched off in this test environment. Nothing was started and nothing was charged." },
  STRIPE_CHECKOUT_DISABLED: { kind: "disabled", text: "Subscribing isn't switched on in this test environment yet. Nothing was charged." },
  SOCIAL_WRITES_DISABLED: { kind: "disabled", text: "Connecting and publishing are switched off in this test environment. Nothing was changed." },
  BRIDGE_RATE_LIMITED: { kind: "busy", text: "Too many requests just now. Wait a moment, then try again." },
  STUDIO_BRIDGE_TIMEOUT: { kind: "unavailable", text: "BizGenie took too long to answer. If you were saving something, check that it saved before trying again." },
  PRIVATE_API_UNAVAILABLE: { kind: "unavailable", text: "BizGenie's service is temporarily unavailable. If you were saving something, check that it saved before trying again." },
  ORIGIN_FORBIDDEN: { kind: "configuration", text: "This address isn't set up to use BizGenie yet. Nothing was changed. Please contact support." },
  HEADERS_FORBIDDEN: { kind: "configuration", text: "This address isn't set up to use BizGenie yet. Nothing was changed. Please contact support." },
  SERVER_HEADERS_FORBIDDEN: { kind: "configuration", text: "This address isn't set up to use BizGenie yet. Nothing was changed. Please contact support." },
  BRIDGE_REQUEST_TOO_LARGE: { kind: "invalid", text: "That was too large to send. Shorten it and try again." },
});
export const bridgeRefusal = (code) => (typeof code === "string" && Object.hasOwn(BRIDGE_REFUSALS, code) ? BRIDGE_REFUSALS[code] : null);

// The error code of a failed response, or "" (no body, not JSON). Never throws.
export async function responseCode(response) {
  try { const j = await (typeof response.clone === "function" ? response.clone() : response).json(); return (j && j.error && typeof j.error.code === "string" && j.error.code) || ""; } catch { return ""; }
}
