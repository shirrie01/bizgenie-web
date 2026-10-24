// Persistent onboarding client (BG-STUDIO-010-FE) for the bizgenie-api `workspace-onboarding.v1` contract
// (API draft PR #213, docs/studio/FE_BE_CONTRACT_BG_STUDIO_010.md).
//
// Pure network code: no React, no storage. The workspace scope is never sent; the API reads it from the
// verified token. Every failure is mapped to an OnboardingError whose `outcome` says truthfully whether the
// answers were saved, so the UI never claims a save that did not happen.

import { MISSING_GUIDANCE } from "./onboardingModel";

export const CONTRACT_VERSION = "workspace-onboarding.v1";
export const ONBOARDING_PATH = "/customer/workspace/onboarding";

export class OnboardingError extends Error {
  constructor(message, { code = "ONBOARDING_ERROR", status = 0, outcome = "not_saved", currentVersion = null, details = [], missing = [], forbiddenWrite = false } = {}) {
    super(message);
    this.name = "OnboardingError";
    this.code = code;
    this.status = status;
    // "not_saved": the server refused or could not be reached before processing. "unknown": the request may have
    // completed (timeout / dropped connection); retrying the SAME request with the SAME key is safe.
    this.outcome = outcome;
    this.currentVersion = currentVersion;
    this.details = details;
    this.missing = missing; // 422: the paths the API says are still missing
    this.forbiddenWrite = forbiddenWrite; // 403 on a write
  }
}

// Shown whenever a write may or may not have been stored: a 503 can follow a commit whose acknowledgement was lost
// (confirmed against bizgenie-api PR #213 at 120a874), and so can a dropped connection or a timeout. Never say "NOT saved".
export const SAVE_NOT_CONFIRMED = "Save not confirmed — your changes may already have been saved.";
export const SAVE_NOT_CONFIRMED_RETRY = `${SAVE_NOT_CONFIRMED} Your answers are still on this screen. Press save again to retry safely: the same request is sent, so it cannot be saved twice. Or check what was saved first.`;

const validationText = (details) => {
  const first = Array.isArray(details) && details[0];
  return first && first.message ? ` (${first.path ? `${first.path}: ` : ""}${first.message})` : "";
};

function errorFor(status, body, { writing }) {
  const code = body && body.error && body.error.code;
  const details = (body && body.error && body.error.details) || [];
  const nothing = writing ? " Nothing was saved." : "";
  if (status === 401 || code === "AUTHENTICATION_REQUIRED") return new OnboardingError(`Your session has ended. Sign in again to continue.${nothing}`, { code: "AUTHENTICATION_REQUIRED", status });
  if (status === 403 || code === "WORKSPACE_NOT_AUTHORIZED") {
    // The API uses this one code both for "not a member" and, since the hardening, for "member without owner write
    // rights". On a write it cannot be told apart from the response alone; the caller checks the membership role.
    if (writing) return new OnboardingError("Saving was refused. Only the workspace owner can save or confirm setup, or your access to this workspace has ended. You can still view your setup. Nothing was saved.", { code: "WORKSPACE_NOT_AUTHORIZED", status, outcome: "not_saved", forbiddenWrite: true });
    return new OnboardingError("This workspace is not available to your account right now. Choose a workspace to continue.", { code: "WORKSPACE_NOT_AUTHORIZED", status });
  }
  if (code === "VERSION_CONFLICT") {
    const current = details && Number.isInteger(details.current_version) ? details.current_version : null;
    return new OnboardingError("Your saved setup was changed somewhere else (another tab or device). The latest saved version has been loaded; your typed answers are still here. Review them, then save again. Nothing was overwritten.", { code, status, currentVersion: current });
  }
  if (code === "IDEMPOTENCY_KEY_CONFLICT") return new OnboardingError("That save could not be matched to your earlier attempt. Press save again to send it as a new request. Nothing was changed.", { code, status });
  if (code === "ONBOARDING_INCOMPLETE") {
    const missing = Array.isArray(details) ? details.map((d) => d && d.path).filter((p) => typeof p === "string") : [];
    const known = missing.filter((p) => MISSING_GUIDANCE[p]);
    const list = known.length ? known.map((p) => MISSING_GUIDANCE[p].label).join(", ") : "required answers";
    return new OnboardingError(`Setup cannot be confirmed yet. Still needed: ${list}. Nothing was changed, and nothing on this screen has been marked as confirmed.`, { code, status, details, missing });
  }
  if (code === "ONBOARDING_VALIDATION_ERROR" || status === 400 || status === 422) return new OnboardingError(`Some answers could not be saved${validationText(details)}. Nothing was saved.`, { code: code || "ONBOARDING_VALIDATION_ERROR", status, details });
  // 503 from the API, or 404 from an API build/environment that does not have the onboarding routes or table yet.
  // 404 means the route or table is not there, so the request was not processed. 503 on a WRITE may follow a commit.
  if (writing && (status === 503 || code === "ONBOARDING_UNAVAILABLE")) return new OnboardingError(SAVE_NOT_CONFIRMED_RETRY, { code: "ONBOARDING_UNAVAILABLE", status, outcome: "unknown" });
  if (writing && status === 404) return new OnboardingError("Saving your setup progress is not available right now (the setup service was not found). Your answers are still on this screen but they are NOT saved.", { code: "ONBOARDING_UNAVAILABLE", status, outcome: "not_saved" });
  if (status === 503 || status === 404 || code === "ONBOARDING_UNAVAILABLE") return new OnboardingError("Your saved setup could not be loaded right now. Nothing has been changed. You can keep working, but progress will not be remembered until it loads.", { code: "ONBOARDING_UNAVAILABLE", status, outcome: "not_saved" });
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
      ? SAVE_NOT_CONFIRMED_RETRY
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
