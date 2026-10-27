// Customer media intake (BG-STUDIO-025-FE): add your own photos and short videos, with proof of rights, on the REAL routes of bizgenie-api #218 (9346055)
// src/media-intake/{router,service}.js (unchanged in contract by draft #219). Off unless `VITE_CUSTOMER_MEDIA_INTAKE_API=true`; the backend answers 503
// MEDIA_INTAKE_UNAVAILABLE until storage, inspection and a rights policy are configured by an operator. Uploads, completion, revoke and delete are OWNER-only (404 for a member).
//   GET    /customer/assets?scope[&limit&cursor]                -> { assets:[ asset ], next_cursor|null }       (ready assets only)
//   POST   /customer/assets/uploads { scope, filename, content_type, bytes, rights_confirmed:true, idempotency_key } -> 201 { ...asset, upload_path }
//   PUT    {upload_path}?scope   raw bytes, Content-Type = the declared type     -> asset (state quarantined)   (422 UPLOAD_TYPE_OR_SIZE_INVALID if type/size/signature differ)
//   POST   /customer/assets/:id/complete { scope }                   -> asset (state ready | rejected)            (server-side inspection; 503 INSPECTION_UNAVAILABLE)
//   GET    /customer/assets/:id?scope                                -> asset
//   GET    /customer/assets/:id/preview?scope                        -> bytes (authenticated, no-store)
//   POST   /customer/assets/:id/revoke { scope } | DELETE /customer/assets/:id?scope -> asset (state revoked | deleted)
//   asset = { asset_id, filename, kind: image|video, content_type, bytes, state: initiated|quarantined|ready|rejected|revoked|deleted, rights_confirmed, rights_evidence_kind: "customer_attestation",
//             rights_policy_version, created_at, physical_deletion: null | "pending_retention_policy" }
// Accepted: image/png, image/jpeg, image/webp, video/mp4; up to 32 MiB. A file is usable only when its state is "ready". Rights are the customer's own attestation, labelled as such.
// OPEN CONTRACT GAP: the backend stores its own rights statement and policy version but gives the browser no endpoint to read the statement it will record, so the screen
// shows its own plain confirmation wording and the server's `rights_policy_version` only after the upload (see docs/studio/BG_STUDIO_025_FE_CREATIVE_JOBS.md).
export const isMediaIntakeApiEnabled = (env = import.meta.env) => {
  const raw = env && env.VITE_CUSTOMER_MEDIA_INTAKE_API;
  return typeof raw === "string" && raw.trim().toLowerCase() === "true";
};
export const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "video/mp4"];
export const MAX_BYTES = 32 * 1024 * 1024;
export const STATES = ["initiated", "quarantined", "ready", "rejected", "revoked", "deleted"];
export class MediaError extends Error {
  constructor(message, { kind = "error", status = 0, code = "" } = {}) { super(message); this.name = "MediaError"; this.kind = kind; this.status = status; this.code = code; }
}
const str = (v) => typeof v === "string" && v.trim().length > 0; const obj = (v) => v && typeof v === "object" && !Array.isArray(v);
const bad = () => new MediaError("The server's answer was not in the expected form, so nothing is shown from it.", { kind: "invalid", code: "BAD_RESPONSE" });
const q = (scope, extra = {}) => new URLSearchParams({ tenant_id: scope.tenantId, project_id: scope.projectId, brand_id: scope.brandId, ...extra });
const body = (scope, extra = {}) => ({ tenant_id: scope.tenantId, project_id: scope.projectId, brand_id: scope.brandId, ...extra });
const newKey = () => `up_${(globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replaceAll("-", "")}`;
export { newKey as newUploadKey };

export function normaliseAsset(a) {
  if (!obj(a) || !str(a.asset_id) || !str(a.filename) || !["image", "video"].includes(a.kind) || !ACCEPTED_TYPES.includes(a.content_type) || !STATES.includes(a.state) || !Number.isFinite(a.bytes)) return null;
  return { id: a.asset_id, filename: a.filename, kind: a.kind, contentType: a.content_type, bytes: a.bytes, state: a.state, rightsPolicy: str(a.rights_policy_version) ? a.rights_policy_version : "", createdAt: Number.isFinite(Date.parse(a.created_at)) ? a.created_at : null, uploadPath: str(a.upload_path) && a.upload_path.startsWith("/customer/assets/uploads/") ? a.upload_path : "", usable: a.state === "ready" };
}
export function normaliseAssetList(b) {
  if (!obj(b) || !Array.isArray(b.assets)) throw bad();
  const assets = b.assets.map(normaliseAsset).filter(Boolean);
  return { assets, skipped: b.assets.length - assets.length, nextCursor: str(b.next_cursor) ? b.next_cursor : null };
}
// What a file must satisfy BEFORE any request is made (the server re-checks all of it, including the file signature).
export function checkFile(file) {
  if (!file || !str(file.name)) return "Choose a file first.";
  if (!ACCEPTED_TYPES.includes(file.type)) return "Only PNG, JPEG, WebP images and MP4 videos can be added.";
  if (!Number.isInteger(file.size) || file.size < 1) return "That file is empty.";
  if (file.size > MAX_BYTES) return "That file is larger than 32 MB.";
  if (!/^[^/\\\u0000-\u001f]{1,200}$/.test(file.name)) return "Rename the file: its name has characters that cannot be used or is too long.";
  return "";
}

const CODES = {
  UPLOAD_TYPE_OR_SIZE_INVALID: ["invalid_file", "That file did not match what you said it was (type, size or contents), so it was not added."],
  UPLOAD_TOO_LARGE: ["invalid_file", "That file is larger than 32 MB."],
  UPLOAD_INTEGRITY_MISMATCH: ["integrity", "The upload could not be verified, so it was not added. Try adding it again."],
  UPLOAD_STATE_CONFLICT: ["conflict", "That file is already being processed or was changed. Reload your media."],
  IDEMPOTENCY_KEY_CONFLICT: ["conflict", "That upload was already started with different details. Start it again."],
  MEDIA_INTAKE_BUSY: ["busy", "Too many uploads are waiting. Try again in a few minutes."],
  INSPECTION_UNAVAILABLE: ["inspection", "The safety check is not available right now. The file is kept privately and is not usable yet. Try again shortly."],
  RIGHTS_POLICY_CHANGED: ["rights_changed", "The rights terms changed while this was uploading, so it was not accepted. Add it again."],
  MEDIA_INTAKE_UNAVAILABLE: ["unavailable", "Adding your own media is not switched on for this workspace yet."],
};
async function call(fetchImpl, url, options, what, parse = true) {
  let res; try { res = await fetchImpl(url, options); } catch { throw new MediaError(`${what} could not be done because the connection failed.${options.method && options.method !== "GET" ? " Check your media before trying again." : ""}`, { kind: options.method && options.method !== "GET" ? "unconfirmed" : "network" }); }
  if (res.ok) { if (!parse) return res; try { return await res.json(); } catch { throw bad(); } }
  let json = null; try { json = await res.json(); } catch { json = null; }
  const code = json && json.error && typeof json.error.code === "string" ? json.error.code : "";
  if (res.status === 401) throw new MediaError("Your session has ended. Sign in again to continue.", { kind: "auth", status: 401, code });
  if (CODES[code]) throw new MediaError(CODES[code][1], { kind: CODES[code][0], status: res.status, code });
  if (res.status === 404) throw new MediaError("That is not available to you. Only the workspace owner can add or remove media.", { kind: "forbidden", status: 404, code });
  if (res.status === 413) throw new MediaError("That file is larger than 32 MB.", { kind: "invalid_file", status: 413, code });
  if (res.status === 429) throw new MediaError("Too many uploads are waiting. Try again in a few minutes.", { kind: "busy", status: 429, code });
  if (res.status === 503) throw new MediaError("Adding your own media is not switched on for this workspace yet.", { kind: "unavailable", status: 503, code });
  if (res.status >= 500) throw new MediaError(`${what} may not have completed because the service had a problem. Check your media before trying again.`, { kind: "unconfirmed", status: res.status, code });
  throw new MediaError(`${what} could not be done yet.`, { kind: "error", status: res.status, code });
}
const H = (t) => ({ authorization: `Bearer ${t}` }); const HJ = (t) => ({ ...H(t), "content-type": "application/json" }); const f0 = (...a) => fetch(...a);

export const fetchAssets = async ({ apiBaseUrl, accessToken, scope, cursor, fetchImpl = f0 }) => normaliseAssetList(await call(fetchImpl, `${apiBaseUrl}/customer/assets?${q(scope, cursor ? { cursor } : {})}`, { headers: H(accessToken) }, "Your media"));
const one = (j) => { const a = normaliseAsset(j); if (!a) throw bad(); return a; };
export const initiateUpload = async ({ apiBaseUrl, accessToken, scope, file, key = newKey(), fetchImpl = f0 }) => {
  const why = checkFile(file); if (why) throw new MediaError(why, { kind: "invalid_file" });
  const a = one(await call(fetchImpl, `${apiBaseUrl}/customer/assets/uploads`, { method: "POST", headers: HJ(accessToken), body: JSON.stringify(body(scope, { filename: file.name, content_type: file.type, bytes: file.size, rights_confirmed: true, idempotency_key: key })) }, "Adding the file"));
  if (!a.uploadPath) throw bad(); return a;
};
export const uploadBytes = async ({ apiBaseUrl, accessToken, scope, asset, file, fetchImpl = f0 }) => one(await call(fetchImpl, `${apiBaseUrl}${asset.uploadPath}?${q(scope)}`, { method: "PUT", headers: { ...H(accessToken), "content-type": asset.contentType }, body: file }, "Uploading the file"));
export const completeUpload = async ({ apiBaseUrl, accessToken, scope, assetId, fetchImpl = f0 }) => one(await call(fetchImpl, `${apiBaseUrl}/customer/assets/${encodeURIComponent(assetId)}/complete`, { method: "POST", headers: HJ(accessToken), body: JSON.stringify(body(scope)) }, "Checking the file"));
export const revokeAsset = async ({ apiBaseUrl, accessToken, scope, assetId, fetchImpl = f0 }) => { const a = one(await call(fetchImpl, `${apiBaseUrl}/customer/assets/${encodeURIComponent(assetId)}/revoke`, { method: "POST", headers: HJ(accessToken), body: JSON.stringify(body(scope)) }, "Withdrawing the file")); if (a.state !== "revoked") throw new MediaError("The change could not be confirmed. Check your media.", { kind: "unconfirmed" }); return a; };
export const deleteAsset = async ({ apiBaseUrl, accessToken, scope, assetId, fetchImpl = f0 }) => { const a = one(await call(fetchImpl, `${apiBaseUrl}/customer/assets/${encodeURIComponent(assetId)}?${q(scope)}`, { method: "DELETE", headers: H(accessToken) }, "Deleting the file")); if (a.state !== "deleted") throw new MediaError("The deletion could not be confirmed. Check your media.", { kind: "unconfirmed" }); return a; };
// Whole upload: initiate -> bytes -> server inspection. Each step is reported so the screen can say where it is; a failure leaves the file private and unusable.
export async function addFile({ file, onStep, ...ctx }) {
  onStep?.("starting"); const started = await initiateUpload({ ...ctx, file });
  onStep?.("uploading"); const stored = await uploadBytes({ ...ctx, asset: started, file });
  onStep?.("checking"); const done = await completeUpload({ ...ctx, assetId: stored.id });
  onStep?.(done.state); return done;
}
// Authenticated preview of a READY asset as an object URL (never a server-supplied URL). The caller revokes it.
export async function fetchAssetPreview({ apiBaseUrl, accessToken, scope, assetId, signal, fetchImpl = f0 }) {
  const res = await call(fetchImpl, `${apiBaseUrl}/customer/assets/${encodeURIComponent(assetId)}/preview?${q(scope)}`, { headers: H(accessToken), signal, credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" }, "The preview", false);
  const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase(); if (!["image/png", "image/jpeg", "image/webp"].includes(type)) throw new MediaError("That file cannot be previewed here.", { kind: "unsupported" });
  const blob = await res.blob(); if (blob.size > MAX_BYTES) throw new MediaError("That file is too large to preview here.", { kind: "unsupported" });
  return URL.createObjectURL(blob);
}
