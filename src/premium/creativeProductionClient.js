// Image, video and hybrid (customer media + AI) creative production (BG-STUDIO-019-FE, workstream C).
//
// EXISTING backend capability (read from bizgenie-api): the campaign generate route accepts `execution_mode: "hybrid"` with `supplied_assets`
// for TEXT variants; image and video generation routes exist but are ADMIN-ONLY; there is no customer asset library, upload, job, revision or
// approval-of-media endpoint. This file is the contract-tested client for the PROPOSED customer endpoints and stays off until the build says
// they exist (`VITE_CUSTOMER_MEDIA_API=true`, strictly). Nothing here calls a provider; the browser only asks the backend, which authorises,
// quotes, reserves credits and runs the provider.
//   GET  /customer/creative-capabilities?tenant_id      -> { kinds: ["image"|"video"|"hybrid"], platforms: [{key,label,aspect_ratios:[..]}], max_assets, max_asset_bytes, content_types:[..], max_brief_chars }
//   GET  /customer/assets?tenant_id&project_id&brand_id -> { assets: [ { asset_id, kind, filename, content_type, bytes, width|null, height|null, duration_seconds|null, created_at, rights_confirmed } ] }
//   POST /customer/assets/uploads     { tenant_id, project_id, brand_id, filename, content_type, bytes, rights_confirmed:true, idempotency_key } -> 201 { asset_id, upload_url(https), upload_headers? }
//   POST /customer/assets/:id/complete { tenant_id, idempotency_key }                                                       -> 200 { asset: {...} }
//   POST /customer/campaigns/:cid/variants/:vid/creative-jobs { tenant_id, project_id, kind, execution_class, platform, aspect_ratio, brief,
//        supplied_asset_ids, expected_campaign_version, quote_id?, max_credits?, idempotency_key }                          -> 202 { job_id, status }
//   GET  /customer/creative-jobs/:job_id?tenant_id -> { job_id, kind, status: queued|running|ready_for_review|failed|cancelled|approved, failure: {code, message}|null,
//        credits_charged: int|null, outputs: [ { output_id, kind, url(https), width, height, duration_seconds|null,
//        provenance: { origin: "ai_generated"|"customer_supplied"|"hybrid", supplied_asset_ids: [..] } } ] }
//   POST /customer/creative-jobs/:job_id/revision { tenant_id, note, idempotency_key } -> 202 { job_id, status }
//   POST /customer/creative-jobs/:job_id/approval { tenant_id, output_id, idempotency_key } -> 200 { job_id, status: "approved" }
export const isCustomerMediaApiEnabled = (env = import.meta.env) => {
  const raw = env && env.VITE_CUSTOMER_MEDIA_API;
  return typeof raw === "string" && raw.trim().toLowerCase() === "true";
};

export class CreativeError extends Error {
  constructor(message, { kind = "error", status = 0, code = "" } = {}) { super(message); this.name = "CreativeError"; this.kind = kind; this.status = status; this.code = code; }
}

export const KIND_LABEL = { image: "Image", video: "Video", hybrid: "Hybrid: your media with AI" };
export const KIND_CLASS = { image: "image.normal", video: "video.normal", hybrid: "image.normal" };
export const PROVENANCE_LABEL = { ai_generated: "Made by AI", customer_supplied: "Supplied by you", hybrid: "Your media, edited with AI" };
const KINDS = ["image", "video", "hybrid"]; const STATUSES = ["queued", "running", "ready_for_review", "failed", "cancelled", "approved"];
const https = (v) => { try { return new URL(v).protocol === "https:"; } catch { return false; } };
const count = (v) => Number.isInteger(v) && v >= 0;
const str = (v) => typeof v === "string" && v.trim().length > 0;
const bad = (why) => new CreativeError("The server's answer was not in the expected form, so nothing is shown from it.", { kind: "invalid", code: `BAD_RESPONSE:${why}` });

export function normaliseCapabilities(body) {
  if (!body || !Array.isArray(body.kinds) || !Array.isArray(body.platforms) || !Array.isArray(body.content_types)) throw bad("capabilities");
  const kinds = body.kinds.filter((k) => KINDS.includes(k));
  const platforms = body.platforms.filter((p) => p && str(p.key) && str(p.label) && Array.isArray(p.aspect_ratios)).map((p) => ({ key: p.key, label: p.label, aspectRatios: p.aspect_ratios.filter((a) => /^\d{1,2}:\d{1,2}$/.test(a)) })).filter((p) => p.aspectRatios.length);
  if (!count(body.max_assets) || !count(body.max_asset_bytes) || !count(body.max_brief_chars) || body.max_brief_chars === 0) throw bad("limits");
  return { kinds, platforms, maxAssets: body.max_assets, maxAssetBytes: body.max_asset_bytes, contentTypes: body.content_types.filter(str), maxBriefChars: body.max_brief_chars };
}

export function normaliseAsset(a) {
  if (!a || !str(a.asset_id) || !["image", "video"].includes(a.kind) || !str(a.filename) || !count(a.bytes) || !Number.isFinite(Date.parse(a.created_at)) || typeof a.rights_confirmed !== "boolean") return null;
  return { id: a.asset_id, kind: a.kind, filename: a.filename, contentType: str(a.content_type) ? a.content_type : "", bytes: a.bytes, width: count(a.width) ? a.width : null, height: count(a.height) ? a.height : null, durationSeconds: Number.isFinite(a.duration_seconds) ? a.duration_seconds : null, createdAt: a.created_at, rightsConfirmed: a.rights_confirmed };
}

export function normaliseJob(j) {
  if (!j || !str(j.job_id) || !KINDS.includes(j.kind) || !STATUSES.includes(j.status)) throw bad("job");
  const outputs = [];
  for (const o of Array.isArray(j.outputs) ? j.outputs : []) {
    const origin = o && o.provenance && o.provenance.origin;
    if (!o || !str(o.output_id) || !["image", "video"].includes(o.kind) || !https(o.url) || !Object.hasOwn(PROVENANCE_LABEL, origin)) continue; // an output without a known origin is never shown
    outputs.push({ id: o.output_id, kind: o.kind, url: new URL(o.url).toString(), width: count(o.width) ? o.width : null, height: count(o.height) ? o.height : null, durationSeconds: Number.isFinite(o.duration_seconds) ? o.duration_seconds : null, origin, suppliedAssetIds: Array.isArray(o.provenance.supplied_asset_ids) ? o.provenance.supplied_asset_ids.filter(str) : [] });
  }
  if (j.status === "ready_for_review" && outputs.length === 0) throw bad("ready_without_output");
  return { id: j.job_id, kind: j.kind, status: j.status, failure: j.failure && str(j.failure.message) ? { code: String(j.failure.code || ""), message: j.failure.message.trim() } : null, creditsCharged: count(j.credits_charged) ? j.credits_charged : null, outputs };
}

const auth = (t, json = false) => ({ authorization: `Bearer ${t}`, ...(json ? { "content-type": "application/json" } : {}) });
export const newKey = (prefix) => `${prefix}_${(globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replaceAll("-", "")}`;

async function send(fetchImpl, url, options, { action, unconfirmed = false } = {}) {
  let res;
  try { res = await fetchImpl(url, options); }
  catch { throw new CreativeError(unconfirmed ? `${action} may or may not have been received because the connection failed. Check before trying again; sending the same request again will not run it twice.` : `${action} could not be reached. Nothing was started or charged.`, { kind: unconfirmed ? "unconfirmed" : "network", code: "NETWORK" }); }
  let json = null; try { json = await res.json(); } catch { json = null; }
  const code = (json && json.error && json.error.code) || "";
  if (res.status === 401) throw new CreativeError("Your session has ended. Sign in again to continue. Nothing was started or charged.", { kind: "auth", status: 401, code });
  if (res.status === 403) throw new CreativeError("You do not have permission to do that in this workspace. Nothing was started or charged.", { kind: "forbidden", status: 403, code });
  if (res.status === 404) throw new CreativeError("That could not be found. It may have been removed. Nothing was started or charged.", { kind: "missing", status: 404, code });
  if (res.status === 402) throw new CreativeError("You do not have enough credits for this. Nothing was started and nothing was charged. Your balance is in Plan and billing.", { kind: "credits", status: 402, code });
  if (res.status === 409) throw new CreativeError(code === "QUOTE_EXPIRED" || code === "QUOTE_CHANGED" ? "The price changed or expired. Nothing was charged. Check the cost again." : "This campaign changed in the meantime, so nothing was started. Reload it and try again.", { kind: code.startsWith("QUOTE_") ? "quote" : "conflict", status: 409, code });
  if (res.status === 422) throw new CreativeError("The server could not accept these choices. Nothing was started or charged. Check the brief and media and try again.", { kind: "invalid-input", status: 422, code });
  if (res.status >= 500) throw new CreativeError(unconfirmed ? `${action} may or may not have been received because the service had a problem. Check before trying again; nothing is charged twice for one request.` : "The service had a problem. Nothing was started or charged.", { kind: unconfirmed ? "unconfirmed" : "error", status: res.status, code });
  if (!res.ok) throw new CreativeError("That could not be done yet. Nothing was started or charged.", { kind: "error", status: res.status, code });
  return json;
}

export async function fetchCapabilities({ apiBaseUrl, accessToken, tenantId, fetchImpl = (...a) => fetch(...a) }) {
  return normaliseCapabilities(await send(fetchImpl, `${apiBaseUrl}/customer/creative-capabilities?${new URLSearchParams({ tenant_id: tenantId })}`, { headers: auth(accessToken) }, { action: "Loading creative options" }));
}

export async function fetchAssets({ apiBaseUrl, accessToken, scope, fetchImpl = (...a) => fetch(...a) }) {
  const q = new URLSearchParams({ tenant_id: scope.tenantId, project_id: scope.projectId, brand_id: scope.brandId });
  const json = await send(fetchImpl, `${apiBaseUrl}/customer/assets?${q}`, { headers: auth(accessToken) }, { action: "Loading your media" });
  if (!json || !Array.isArray(json.assets)) throw bad("assets");
  const assets = json.assets.map(normaliseAsset).filter(Boolean);
  return { assets, skipped: json.assets.length - assets.length };
}

// Upload is three steps: ask for a signed https target, PUT the bytes straight to storage, then tell the backend it is complete.
// The customer must confirm they have the rights; the backend records that confirmation, the browser does not decide it.
export async function uploadAsset({ apiBaseUrl, accessToken, scope, file, rightsConfirmed, capabilities, fetchImpl = (...a) => fetch(...a) }) {
  if (rightsConfirmed !== true) throw new CreativeError("Confirm that you have the right to use this media before adding it.", { kind: "invalid-input" });
  if (!file || !str(file.name)) throw new CreativeError("Choose a file to add.", { kind: "invalid-input" });
  if (!capabilities.contentTypes.includes(file.type)) throw new CreativeError("That file type cannot be used. Choose one of the types listed.", { kind: "invalid-input" });
  if (file.size > capabilities.maxAssetBytes) throw new CreativeError(`That file is larger than the ${Math.floor(capabilities.maxAssetBytes / 1048576)} MB limit.`, { kind: "invalid-input" });
  if (file.size === 0) throw new CreativeError("That file is empty.", { kind: "invalid-input" });
  const key = newKey("upload");
  const init = await send(fetchImpl, `${apiBaseUrl}/customer/assets/uploads`, { method: "POST", headers: auth(accessToken, true), body: JSON.stringify({ tenant_id: scope.tenantId, project_id: scope.projectId, brand_id: scope.brandId, filename: file.name, content_type: file.type, bytes: file.size, rights_confirmed: true, idempotency_key: key }) }, { action: "Adding your media", unconfirmed: true });
  if (!init || !str(init.asset_id) || !https(init.upload_url)) throw bad("upload_init");
  let put;
  try { put = await fetchImpl(init.upload_url, { method: "PUT", headers: { "content-type": file.type, ...(init.upload_headers && typeof init.upload_headers === "object" ? init.upload_headers : {}) }, body: file }); }
  catch { throw new CreativeError("The file could not be sent. Nothing was added. Try again.", { kind: "network", code: "UPLOAD_NETWORK" }); }
  if (!put.ok) throw new CreativeError("The file could not be stored. Nothing was added. Try again.", { kind: "error", status: put.status, code: "UPLOAD_REJECTED" });
  const done = await send(fetchImpl, `${apiBaseUrl}/customer/assets/${encodeURIComponent(init.asset_id)}/complete`, { method: "POST", headers: auth(accessToken, true), body: JSON.stringify({ tenant_id: scope.tenantId, idempotency_key: newKey("complete") }) }, { action: "Finishing adding your media", unconfirmed: true });
  const asset = normaliseAsset(done && done.asset);
  if (!asset) throw bad("asset");
  return asset;
}

// Validate the customer's choices against the SERVER's offered options before anything is sent. Returns a list of plain-language problems.
export function validateBrief(brief, caps) {
  const problems = [];
  if (!caps.kinds.includes(brief.kind)) problems.push("Choose what to create.");
  const platform = caps.platforms.find((p) => p.key === brief.platform);
  if (!platform) problems.push("Choose where it will be used.");
  else if (!platform.aspectRatios.includes(brief.aspectRatio)) problems.push("Choose a shape that suits that platform.");
  if (!str(brief.text)) problems.push("Describe what you want in the brief.");
  else if (brief.text.length > caps.maxBriefChars) problems.push(`Shorten the brief to ${caps.maxBriefChars} characters or fewer.`);
  const n = (brief.assetIds || []).length;
  if (brief.kind === "hybrid" && n === 0) problems.push("Hybrid needs at least one of your own images or videos. Add one, or choose Image or Video for AI only.");
  if (brief.kind !== "hybrid" && n > 0) problems.push("Your media is used only with Hybrid. Remove it, or choose Hybrid.");
  if (n > caps.maxAssets) problems.push(`Use at most ${caps.maxAssets} media files.`);
  return problems;
}

export async function startCreativeJob({ apiBaseUrl, accessToken, scope, campaign, variant, brief, capabilities, quote, key = newKey("creative"), fetchImpl = (...a) => fetch(...a) }) {
  const problems = validateBrief(brief, capabilities);
  if (problems.length) throw new CreativeError(problems[0], { kind: "invalid-input" });
  const body = { tenant_id: scope.tenantId, project_id: scope.projectId, kind: brief.kind, execution_class: KIND_CLASS[brief.kind], platform: brief.platform, aspect_ratio: brief.aspectRatio, brief: brief.text.trim(), supplied_asset_ids: brief.kind === "hybrid" ? [...brief.assetIds] : [], expected_campaign_version: campaign.version, idempotency_key: key, ...(quote ? { quote_id: quote.quoteId, max_credits: quote.authorisedCredits } : {}) };
  const json = await send(fetchImpl, `${apiBaseUrl}/customer/campaigns/${encodeURIComponent(campaign.campaign_id)}/variants/${encodeURIComponent(variant.variant_id)}/creative-jobs`, { method: "POST", headers: auth(accessToken, true), body: JSON.stringify(body) }, { action: "Starting your creative", unconfirmed: true });
  if (!json || !str(json.job_id)) throw new CreativeError("The creative may or may not have started. Check before trying again; sending the same request again will not run it twice.", { kind: "unconfirmed", code: "BAD_RESPONSE" });
  return { jobId: json.job_id };
}

export async function fetchJob({ apiBaseUrl, accessToken, tenantId, jobId, fetchImpl = (...a) => fetch(...a) }) {
  return normaliseJob(await send(fetchImpl, `${apiBaseUrl}/customer/creative-jobs/${encodeURIComponent(jobId)}?${new URLSearchParams({ tenant_id: tenantId })}`, { headers: auth(accessToken) }, { action: "Checking your creative" }));
}
export async function requestRevision({ apiBaseUrl, accessToken, tenantId, jobId, note, key = newKey("revision"), fetchImpl = (...a) => fetch(...a) }) {
  if (!str(note) || note.length > 2000) throw new CreativeError("Say what to change, in 2000 characters or fewer.", { kind: "invalid-input" });
  const json = await send(fetchImpl, `${apiBaseUrl}/customer/creative-jobs/${encodeURIComponent(jobId)}/revision`, { method: "POST", headers: auth(accessToken, true), body: JSON.stringify({ tenant_id: tenantId, note: note.trim(), idempotency_key: key }) }, { action: "Your change request", unconfirmed: true });
  if (!json || !str(json.job_id)) throw bad("revision");
  return { jobId: json.job_id };
}
export async function approveOutput({ apiBaseUrl, accessToken, tenantId, jobId, outputId, key = newKey("approve"), fetchImpl = (...a) => fetch(...a) }) {
  const json = await send(fetchImpl, `${apiBaseUrl}/customer/creative-jobs/${encodeURIComponent(jobId)}/approval`, { method: "POST", headers: auth(accessToken, true), body: JSON.stringify({ tenant_id: tenantId, output_id: outputId, idempotency_key: key }) }, { action: "Your approval", unconfirmed: true });
  if (!json || json.status !== "approved") throw new CreativeError("The approval may or may not have been recorded. Check before trying again.", { kind: "unconfirmed", code: "BAD_RESPONSE" });
  return { jobId };
}
