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
  if (!json || !json.brand_brain) throw new BrainSaveError("The server sent an unexpected answer, so nothing is shown as saved. Check what was saved.", { kind: "unconfirmed", status: response.status, code: "BAD_RESPONSE", outcome: "unknown" });
  return json;
}
