// Persistent onboarding client (BG-STUDIO-010-FE) for the bizgenie-api `workspace-onboarding.v1` contract
// (API draft PR #213, docs/studio/FE_BE_CONTRACT_BG_STUDIO_010.md).
//
// Pure network code: no React, no storage. The workspace scope is never sent; the API reads it from the
// verified token. Every failure is mapped to an OnboardingError whose `outcome` says truthfully whether the
// answers were saved, so the UI never claims a save that did not happen.

export const CONTRACT_VERSION = "workspace-onboarding.v1";
export const ONBOARDING_PATH = "/customer/workspace/onboarding";

export class OnboardingError extends Error {
  constructor(message, { code = "ONBOARDING_ERROR", status = 0, outcome = "not_saved", currentVersion = null, details = [] } = {}) {
    super(message);
    this.name = "OnboardingError";
    this.code = code;
    this.status = status;
    // "not_saved": the server refused or could not be reached before processing. "unknown": the request may have
    // completed (timeout / dropped connection); retrying the SAME request with the SAME key is safe.
    this.outcome = outcome;
    this.currentVersion = currentVersion;
    this.details = details;
  }
}

const validationText = (details) => {
  const first = Array.isArray(details) && details[0];
  return first && first.message ? ` (${first.path ? `${first.path}: ` : ""}${first.message})` : "";
};

function errorFor(status, body, { writing }) {
  const code = body && body.error && body.error.code;
  const details = (body && body.error && body.error.details) || [];
  const nothing = writing ? " Nothing was saved." : "";
  if (status === 401 || code === "AUTHENTICATION_REQUIRED") return new OnboardingError(`Your session has ended. Sign in again to continue.${nothing}`, { code: "AUTHENTICATION_REQUIRED", status });
  if (status === 403 || code === "WORKSPACE_NOT_AUTHORIZED") return new OnboardingError(`This workspace is not available to your account right now. Reload to choose again.${nothing}`, { code: "WORKSPACE_NOT_AUTHORIZED", status });
  if (code === "VERSION_CONFLICT") {
    const current = details && Number.isInteger(details.current_version) ? details.current_version : null;
    return new OnboardingError("Your saved setup was changed somewhere else (another tab or device). The latest saved version has been loaded; your typed answers are still here. Review them, then save again. Nothing was overwritten.", { code, status, currentVersion: current });
  }
  if (code === "IDEMPOTENCY_KEY_CONFLICT") return new OnboardingError("That save could not be matched to your earlier attempt. Press save again to send it as a new request. Nothing was changed.", { code, status });
  if (code === "ONBOARDING_INCOMPLETE") return new OnboardingError(`Setup cannot be completed yet: ${Array.isArray(details) && details.length ? details.map((d) => (d.path === "channels" ? "choose at least one channel" : d.path === "sector_key" ? "choose a sector" : d.path)).join(" and ") : "required answers are missing"}. Nothing was changed.`, { code, status, details });
  if (code === "ONBOARDING_VALIDATION_ERROR" || status === 400 || status === 422) return new OnboardingError(`Some answers could not be saved${validationText(details)}. Nothing was saved.`, { code: code || "ONBOARDING_VALIDATION_ERROR", status, details });
  // 503 from the API, or 404 from an API build/environment that does not have the onboarding routes or table yet.
  if (status === 503 || status === 404 || code === "ONBOARDING_UNAVAILABLE") return new OnboardingError(`Saving your setup progress is not available right now. Your answers are still on this screen but they are NOT saved.${writing ? "" : " You can keep working; progress will not be remembered."}`, { code: "ONBOARDING_UNAVAILABLE", status, outcome: "not_saved" });
  return new OnboardingError(`Your setup progress could not ${writing ? "be saved" : "be loaded"} (error ${status || "unknown"}).${nothing}`, { code: code || "ONBOARDING_ERROR", status });
}

// The API's response is checked before it is trusted: an unexpected shape is an error, never "empty".
export function parseOnboardingResponse(body) {
  const o = body && body.onboarding;
  const ok = o && typeof o === "object" && o.contract_version === CONTRACT_VERSION && Number.isInteger(o.version) && o.version >= 0
    && ["not_started", "in_progress", "completed"].includes(o.status) && o.sector && o.channels && Array.isArray(o.channels.values);
  if (!ok) throw new OnboardingError("The server sent an unexpected answer about your setup, so nothing is shown as saved.", { code: "ONBOARDING_BAD_RESPONSE" });
  return { onboarding: o, brandNamePlaceholder: typeof body.brand_name_placeholder === "boolean" ? body.brand_name_placeholder : null, replayed: body.replayed === true };
}

async function call({ apiBaseUrl, accessToken, method, body, fetchImpl, writing }) {
  let response;
  try {
    response = await fetchImpl(`${apiBaseUrl}${ONBOARDING_PATH}`, {
      method,
      headers: { ...(body ? { "content-type": "application/json" } : {}), authorization: `Bearer ${accessToken}` },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new OnboardingError(writing
      ? "We could not confirm that your setup was saved (the connection failed). It may or may not have been saved. Press save again: sending it again is safe and will not duplicate anything."
      : "Your saved setup could not be reached.", { code: "NETWORK", outcome: writing ? "unknown" : "not_saved" });
  }
  let json = null;
  try { json = await response.json(); } catch { json = null; }
  if (!response.ok) throw errorFor(response.status, json, { writing });
  return parseOnboardingResponse(json);
}

export const fetchOnboarding = ({ apiBaseUrl, accessToken, fetchImpl = (...a) => fetch(...a) }) =>
  call({ apiBaseUrl, accessToken, method: "GET", fetchImpl, writing: false });

export const putOnboarding = ({ apiBaseUrl, accessToken, body, fetchImpl = (...a) => fetch(...a) }) =>
  call({ apiBaseUrl, accessToken, method: "PUT", body, fetchImpl, writing: true });

// One idempotency key per user action. The same payload (including expected_version) reuses its key, so a retry
// after a timeout is recognised by the server as a replay. A different payload gets a new key. Cleared on success.
const newKey = () => `onb-${(globalThis.crypto && globalThis.crypto.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`)}`;
export function createSaveKeeper() {
  let last = null;
  return {
    keyFor(payload) {
      const fingerprint = JSON.stringify(payload);
      if (!last || last.fingerprint !== fingerprint) last = { fingerprint, key: newKey() };
      return last.key;
    },
    clear() { last = null; },
  };
}
