// Brand Brain save for the Premium Studio (BG-STUDIO-013-FE, founder decisions DEC-021 / LOCK-019 and DEC-022 / LOCK-020).
//
// Only the workspace OWNER may create or change the authoritative business name and `identity.description`. Members keep
// every other Brand Brain edit. This file follows the backend draft PR bizgenie-api #214 at 2319e5e8 (read from its code
// and its report, not assumed):
//   PUT /customer/workspace/brand-brain  replaces the whole editable document (omitted optional fields are removed).
//   403 BRAND_BRAIN_WRITE_FORBIDDEN      a non-owner changed or removed the name/description, OR the caller is not a member
//                                        (any more) of the selected approved workspace. Atomic: nothing is saved. One code
//                                        covers both causes, so the caller re-reads the role.
//   409 BRAND_BRAIN_VERSION_CONFLICT     the record changed between the server's read and its locked commit. Reload; do not
//                                        resend a stale document blindly. There is no client version token.
//   503 / dropped connection / timeout   a write may have committed before the answer was lost.
// The backend compares the name and description byte for byte, so a member's save must repeat the STORED values exactly.
//
// Nothing here is used by the flag-off app: App.jsx keeps its own, unchanged, Brand Brain function for that path.

export const FORBIDDEN_CODE = "BRAND_BRAIN_WRITE_FORBIDDEN";
export const CONFLICT_CODE = "BRAND_BRAIN_VERSION_CONFLICT";

export const BRAIN_SAVE_UNCONFIRMED = "Save not confirmed — your changes may already have been saved. Your answers are still on this screen. Check what was saved before trying again.";

export class BrainSaveError extends Error {
  constructor(message, { kind = "error", status = 0, code = "", outcome = "" } = {}) {
    super(message);
    this.name = "BrainSaveError";
    this.kind = kind;
    this.status = status;
    this.code = code;
    this.outcome = outcome;
  }
}

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const section = (current, key, value) => (value ? { ...(current || {}), [key]: value } : current);

// The document to send. `canChangeIdentity` is false for a member known to be a non-owner: such a save never touches the
// name or description, and repeats the stored values exactly. The input brain is never modified.
export function mergeBrainFields(brain, fields, { canChangeIdentity = true } = {}) {
  const merged = { ...brain };
  if (canChangeIdentity && fields.name) merged.name = fields.name;
  const identity = canChangeIdentity ? section(brain.identity, "description", fields.description) : null;
  const audience = section(brain.audience, "summary", fields.audience);
  const commercial = section(brain.commercial, "primary_cta", fields.cta);
  if (identity) merged.identity = identity;
  if (audience) merged.audience = audience;
  if (commercial) merged.commercial = commercial;
  return merged;
}

// What the request body carries: the editable document without ids and metadata (as for every other Brand Brain save).
export function editableBrain(brain) {
  const { brand_id: _brandId, project_id: _projectId, metadata: _metadata, ...editable } = brain;
  return editable;
}

// Did the owner (or anything else) change the protected fields since this snapshot was loaded?
export function identityChanged(before, after) {
  if (!before || !after) return false;
  const b = before.identity && hasOwn(before.identity, "description") ? before.identity.description : undefined;
  const a = after.identity && hasOwn(after.identity, "description") ? after.identity.description : undefined;
  return before.name !== after.name || b !== a;
}

function errorFor(status, body) {
  const code = body && body.error && body.error.code;
  if (status === 401) return new BrainSaveError("Your session has ended. Sign in again to continue. Nothing was saved.", { kind: "auth", status, code: code || "AUTHENTICATION_REQUIRED" });
  if (status === 403) return new BrainSaveError("Saving was refused. Nothing was saved.", { kind: "forbidden", status, code: code || FORBIDDEN_CODE });
  if (status === 409 && code === CONFLICT_CODE) return new BrainSaveError("Your Brand Brain was changed somewhere else, so this save was not applied. Nothing was overwritten.", { kind: "conflict", status, code });
  if (status === 503 || (status >= 500 && status < 600)) return new BrainSaveError(BRAIN_SAVE_UNCONFIRMED, { kind: "unconfirmed", status, code: code || "BRAND_BRAIN_UNAVAILABLE", outcome: "unknown" });
  return new BrainSaveError("Brand Brain changes could not be saved yet.", { kind: "error", status, code });
}

export async function putBrandBrain({ apiBaseUrl, accessToken, brandBrain, fetchImpl = (...a) => fetch(...a) }) {
  let response;
  try {
    response = await fetchImpl(`${apiBaseUrl}/customer/workspace/brand-brain`, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(editableBrain(brandBrain)),
    });
  } catch {
    throw new BrainSaveError(BRAIN_SAVE_UNCONFIRMED, { kind: "unconfirmed", code: "NETWORK", outcome: "unknown" });
  }
  let json = null;
  try { json = await response.json(); } catch { json = null; }
  if (!response.ok) throw errorFor(response.status, json);
  if (!json || !json.brand_brain) throw new BrainSaveError(BRAIN_SAVE_UNCONFIRMED, { kind: "unconfirmed", status: response.status, code: "BAD_RESPONSE", outcome: "unknown" });
  return json;
}

// ---- Reading the Brand Brain (Premium Studio). Typed, so a revoked workspace is not mistaken for an outage. ----
// bizgenie-api #214 (Q3): GET answers an unauthorised selected workspace with 400 WORKSPACE_VALIDATION_ERROR and a
// `trusted_scope` detail, a missing session with 401, and a persistence fault with 503.
export const BRAIN_WORKSPACE_UNAVAILABLE = "This workspace is not available to your account right now. Choose a workspace to continue.";
export const BRAIN_LOAD_FAILED = "Brand Brain could not be loaded yet.";

export class BrainLoadError extends Error {
  constructor(message, { kind = "unavailable", status = 0, code = "" } = {}) {
    super(message);
    this.name = "BrainLoadError";
    this.kind = kind;
    this.status = status;
    this.code = code;
  }
}

export async function fetchBrandBrain({ apiBaseUrl, accessToken, fetchImpl = (...a) => fetch(...a) }) {
  let response;
  try {
    response = await fetchImpl(`${apiBaseUrl}/customer/workspace/brand-brain`, { headers: { authorization: `Bearer ${accessToken}` } });
  } catch {
    throw new BrainLoadError(BRAIN_LOAD_FAILED, { kind: "unavailable", code: "NETWORK" });
  }
  let json = null;
  try { json = await response.json(); } catch { json = null; }
  if (!response.ok) {
    if (response.status === 401) throw new BrainLoadError("Your session has ended. Sign in again to continue.", { kind: "auth", status: 401, code: "AUTHENTICATION_REQUIRED" });
    const details = json && json.error && Array.isArray(json.error.details) ? json.error.details : [];
    const scoped = details.some((d) => d && d.path === "trusted_scope");
    if (response.status === 403 || (response.status === 400 && scoped)) throw new BrainLoadError(BRAIN_WORKSPACE_UNAVAILABLE, { kind: "workspace_unavailable", status: response.status, code: "WORKSPACE_NOT_AUTHORIZED" });
    throw new BrainLoadError(BRAIN_LOAD_FAILED, { kind: "unavailable", status: response.status });
  }
  if (!json || !json.brand_brain || typeof json.brand_brain !== "object") throw new BrainLoadError("The server sent an unexpected answer, so nothing is shown as saved.", { kind: "unavailable", status: response.status, code: "BAD_RESPONSE" });
  return json;
}

// ---- Which fields the customer actually changed ----
// A save sends only what was edited, applied to the LATEST stored Brand Brain. The backend has no compare-and-set for
// Brand Brain writes (#214, Q6): a whole-document PUT built from a screen that is hours old would silently overwrite
// anyone else's later edits. Reading first and sending only the edited fields keeps that window to a single round trip.
const norm = (value) => String(value == null ? "" : value).trim();

// What the form shows for a Brand Brain. A placeholder name and a bootstrap-seeded "description" are never the customer's words.
export function brainFormValues(brain, { isSeededDescription = () => false, placeholderName = false } = {}) {
  const b = brain || {};
  const description = b.identity && b.identity.description ? b.identity.description : "";
  return {
    businessName: b.name && !placeholderName ? b.name : "",
    description: description && !isSeededDescription(description) ? description : "",
    audience: (b.audience && b.audience.summary) || "",
    cta: (b.commercial && b.commercial.primary_cta) || "",
  };
}

// Edited fields only: the draft differs from what it was last known to be, and is not empty.
export function changedBrainFields(draft, baseline) {
  const fields = {};
  const map = [["businessName", "name"], ["description", "description"], ["audience", "audience"], ["cta", "cta"]];
  for (const [key, out] of map) {
    const now = norm(draft[key]);
    if (now && now !== norm(baseline ? baseline[key] : "")) fields[out] = now;
  }
  return fields;
}

// A draft field the customer has not touched follows the stored value when it changes; a field they typed in stays.
export function rebaseDraft(draft, baseline, next) {
  const out = { ...draft };
  for (const key of ["businessName", "description", "audience", "cta"]) {
    if (norm(draft[key]) === norm(baseline ? baseline[key] : "")) out[key] = next[key];
  }
  return out;
}

// #214 (Q1): the backend trims what it receives and then compares EXACTLY with what is stored. A stored name or
// description that carries leading or trailing whitespace therefore can never be repeated by a member, so every member
// save would be refused. Only the owner can clean it up.
export const hasUntrimmedIdentity = (brain) => {
  if (!brain) return false;
  const d = brain.identity && typeof brain.identity.description === "string" ? brain.identity.description : null;
  return (typeof brain.name === "string" && brain.name !== brain.name.trim()) || (d !== null && d !== d.trim());
};

// ---- How a failed Brand Brain save is told to the customer. Typed answers always stay on screen. ----
export function describeBrainFailure(result) {
  if (result.unconfirmed) return { kind: "unconfirmed", recheck: "brain", text: result.message };
  if (result.ownerMustFix || result.workspaceUnavailable) return { kind: "error", text: result.message, chooser: Boolean(result.workspaceUnavailable) };
  if (result.conflict) return { kind: "error", text: `${result.message} ${result.reloaded ? "The latest saved version has been loaded and your typed answers are still here. Review them, then save again." : "Reload your Brand Brain to see what is saved, then save again."}` };
  if (result.forbidden) {
    if (result.identityChanged) return { kind: "error", text: "Saving was refused because the business name or description was changed by the workspace owner after this screen loaded. The latest version has been loaded, and your other answers are still here. Review them, then save again. Nothing was saved." };
    return { kind: "error", text: "Saving was refused. Only the workspace owner can change the business name and description, and anyone whose access to this workspace has ended cannot save. Your other answers are still here. Nothing was saved." };
  }
  return { kind: "error", text: result.message };
}
