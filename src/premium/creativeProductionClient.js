// Image and video creative production (BG-STUDIO-019-FE C, rebuilt in BG-STUDIO-020-FE against the REAL backend routes).
//
// Sources (bizgenie-api PR #216 head f8d81bf): src/image-generation/{schema,router}.js, src/video-generation/{schema,router}.js,
// src/authentication/customerGenerationBoundary.js, src/authentication/customerVideoStatusBoundary.js, index.js (mounts), and the checkpoint
// docs/studio/BG_STUDIO_019_BACKEND_HANDOFF.md. What exists:
//   POST /customer/generate-image   { tenant_id, project_id, brand_id?, campaign_id?, content_item_id?, execution_id, generation_id, topic,
//        image_purpose, aspect_ratio: 1:1|4:5|9:16|16:9, platform?, audience?, goal?, product_service_context?, additional_context?,
//        reference_assets?: [{asset_id}] }   (strict; user_id is set from the verified token, tenant_id is consumed by the boundary)
//        -> 200 { status: queued|processing|completed|failed, execution_id, generation_id, media: { provider, provider_job_id, asset,
//        aspect_ratio, approval_status: pending|approved|rejected, created_at, completed_at } }
//   POST /customer/generate-video   { ...same context, video_purpose, quality: normal|premium, aspect_ratio: 16:9|9:16, duration_seconds: 4|6|8,
//        input_image?: {asset_id} | reference_assets?: 1-3 [{asset_id}] (needs 8 s) }  -> 202 { status, execution_id, generation_id, video: {...} }
//   GET  /customer/generate-video/:generationId (read the stored state) and POST .../:generationId/poll (ask the provider and settle)  -> { status: queued|submitted|processing|completed|failed, ... }
//   Errors: 401 AUTHENTICATION_REQUIRED, 404 RESOURCE_NOT_AVAILABLE, 503 AUTHORIZATION_UNAVAILABLE / GENERATION_JOB_UNAVAILABLE,
//   402 GENERATION_CREDITS_UNAVAILABLE, 503 GENERATION_BILLING_UNAVAILABLE, 400 validation. Billing is applied per execution class
//   (image.normal, video.normal, video.premium) by the server; the browser never sends a price.
// What does NOT exist, so is not built and is named in the UI: a customer upload / asset library / rights-attestation contract, a private media
// DELIVERY contract (the `asset.location` the routes return can be a private storage address such as gs://, so this app never displays or fetches
// it), a customer image/video approval route, and any audiovisual hybrid composition. `execution_mode: "hybrid"` on the campaign generate route
// only attaches existing reference images to a TEXT draft. The gate `VITE_CUSTOMER_MEDIA_API` therefore means only "the backend operator has
// activated the customer image/video routes"; it stays off by default. No provider is named or assumed anywhere in this file.
export const isCustomerMediaApiEnabled = (env = import.meta.env) => {
  const raw = env && env.VITE_CUSTOMER_MEDIA_API;
  return typeof raw === "string" && raw.trim().toLowerCase() === "true";
};

export class CreativeError extends Error {
  constructor(message, { kind = "error", status = 0, code = "" } = {}) { super(message); this.name = "CreativeError"; this.kind = kind; this.status = status; this.code = code; }
}

// Static facts copied from the backend schemas above (enum values), not provider options.
export const IMAGE_RATIOS = ["1:1", "4:5", "9:16", "16:9"];
export const VIDEO_RATIOS = ["16:9", "9:16"];
export const VIDEO_DURATIONS = [4, 6, 8];
export const VIDEO_QUALITIES = ["normal", "premium"];
export const KIND_LABEL = { image: "Image", video: "Video" };
export const executionClassFor = (kind, quality = "normal") => (kind === "video" ? `video.${quality}` : "image.normal");
export const HYBRID_BLOCKER = "Hybrid (your own photos or videos combined with AI) is not available yet. It needs a way to add your own media with proof of your rights, private storage, and an AI composition step, and none of those exist in BizGenie yet.";
export const PREVIEW_BLOCKER = "It was created and stored privately. Viewing and approving it here needs private media delivery, which is not available yet, so nothing is shown and nothing is approved.";

const str = (v) => typeof v === "string" && v.trim().length > 0;
const bad = () => new CreativeError("The server's answer was not in the expected form, so nothing is shown from it.", { kind: "invalid", code: "BAD_RESPONSE" });
export const newKey = (prefix) => `${prefix}_${(globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replaceAll("-", "")}`;

// Problems with the customer's choices, in plain language. The server re-validates everything.
export function validateBrief(brief) {
  const problems = [];
  if (!["image", "video"].includes(brief.kind)) problems.push("Choose image or video.");
  if (!str(brief.text)) problems.push("Describe what you want in the brief.");
  else if (brief.text.trim().length > 2000) problems.push("Shorten the brief to 2000 characters or fewer.");
  if (brief.kind === "image" && !IMAGE_RATIOS.includes(brief.aspectRatio)) problems.push("Choose a shape.");
  if (brief.kind === "video") {
    if (!VIDEO_RATIOS.includes(brief.aspectRatio)) problems.push("Choose a shape.");
    if (!VIDEO_DURATIONS.includes(brief.duration)) problems.push("Choose a length.");
    if (!VIDEO_QUALITIES.includes(brief.quality)) problems.push("Choose a quality.");
  }
  return problems;
}

async function send(fetchImpl, url, options, { paid = false } = {}) {
  let res;
  try { res = await fetchImpl(url, options); }
  catch { throw new CreativeError(paid ? "The request may or may not have been received because the connection failed. Check before trying again: sending the same request again will not run it twice and will not charge you twice." : "The request could not be reached. Nothing was started or charged.", { kind: paid ? "unconfirmed" : "network", code: "NETWORK" }); }
  let json = null; try { json = await res.json(); } catch { json = null; }
  const code = (json && json.error && json.error.code) || "";
  if (res.status === 401) throw new CreativeError("Your session has ended. Sign in again to continue. Nothing was started or charged.", { kind: "auth", status: 401, code });
  if (res.status === 404) throw new CreativeError("This workspace or item is not available to you. Nothing was started or charged.", { kind: "missing", status: 404, code });
  if (res.status === 402 || code === "GENERATION_CREDITS_UNAVAILABLE") throw new CreativeError("You do not have enough credits for this. Nothing was started and nothing was charged. Your balance is in Plan and billing.", { kind: "credits", status: res.status, code });
  if (code === "GENERATION_BILLING_UNAVAILABLE") throw new CreativeError("Credits cannot be checked right now, so nothing was started or charged. Try again shortly.", { kind: "unavailable", status: res.status, code });
  if (res.status === 400) throw new CreativeError("The server could not accept these choices. Nothing was started or charged. Check the brief and try again.", { kind: "invalid-input", status: 400, code });
  if (res.status === 409) throw new CreativeError("This was already started with different choices, so nothing new was started. Start again.", { kind: "conflict", status: 409, code });
  if (res.status === 503) throw new CreativeError(paid ? "The service is not available right now. If you were charged, it will be settled automatically. Check before trying again." : "The service is not available right now. Nothing was started or charged.", { kind: paid ? "unconfirmed" : "unavailable", status: 503, code });
  if (res.status >= 500) throw new CreativeError(paid ? "The service had a problem and the outcome is not known. Check before trying again; the same request will not charge you twice." : "The service had a problem. Nothing was started or charged.", { kind: paid ? "unconfirmed" : "error", status: res.status, code });
  if (!res.ok && !(res.status === 202)) throw new CreativeError("That could not be done yet. Nothing was started or charged.", { kind: "error", status: res.status, code });
  return json;
}

const IMAGE_STATUS = ["queued", "processing", "completed", "failed"]; const VIDEO_STATUS = ["queued", "submitted", "processing", "completed", "failed"]; const APPROVAL = ["pending", "approved", "rejected"];

// Reduce a server record to what the customer may be told. The asset address is deliberately dropped.
export function normaliseRecord(kind, body) {
  const media = body && (kind === "video" ? body.video : body.media);
  const statuses = kind === "video" ? VIDEO_STATUS : IMAGE_STATUS;
  if (!body || !statuses.includes(body.status) || !str(body.execution_id) || !str(body.generation_id)) throw bad();
  if (body.status === "completed" && (!media || typeof media !== "object" || !media.asset || typeof media.asset !== "object")) throw bad(); // "completed" with nothing stored is never shown as an image
  return { kind, status: body.status, executionId: body.execution_id, generationId: body.generation_id, approvalStatus: media && APPROVAL.includes(media.approval_status) ? media.approval_status : "pending", stored: body.status === "completed", completedAt: media && Number.isFinite(Date.parse(media.completed_at)) ? media.completed_at : null };
}

function context({ scope, campaign, contentItemId, topic, platform }) {
  return { tenant_id: scope.tenantId, project_id: scope.projectId, ...(scope.brandId ? { brand_id: scope.brandId } : {}), ...(campaign && campaign.campaign_id ? { campaign_id: campaign.campaign_id } : {}), ...(contentItemId ? { content_item_id: contentItemId } : {}), topic: String(topic || "").trim().slice(0, 2000), ...(platform ? { platform: String(platform).slice(0, 2000) } : {}) };
}
const headers = (t) => ({ "content-type": "application/json", authorization: `Bearer ${t}` });

// ids: { executionId, generationId } are chosen ONCE per attempt by the caller and reused for any retry of that attempt, so a retry replays the
// same immutable job instead of creating a second paid one.
export async function startImage({ apiBaseUrl, accessToken, scope, campaign, contentItemId, topic, platform, brief, ids, fetchImpl = (...a) => fetch(...a) }) {
  const problems = validateBrief({ ...brief, kind: "image" }); if (problems.length) throw new CreativeError(problems[0], { kind: "invalid-input" });
  if (!str(topic)) throw new CreativeError("This item needs a name before an image can be made for it.", { kind: "invalid-input" });
  const body = { ...context({ scope, campaign, contentItemId, topic, platform }), execution_id: ids.executionId, generation_id: ids.generationId, image_purpose: brief.text.trim(), aspect_ratio: brief.aspectRatio };
  return normaliseRecord("image", await send(fetchImpl, `${apiBaseUrl}/customer/generate-image`, { method: "POST", headers: headers(accessToken), body: JSON.stringify(body) }, { paid: true }));
}
export async function startVideo({ apiBaseUrl, accessToken, scope, campaign, contentItemId, topic, platform, brief, ids, fetchImpl = (...a) => fetch(...a) }) {
  const problems = validateBrief({ ...brief, kind: "video" }); if (problems.length) throw new CreativeError(problems[0], { kind: "invalid-input" });
  if (!str(topic)) throw new CreativeError("This item needs a name before a video can be made for it.", { kind: "invalid-input" });
  const body = { ...context({ scope, campaign, contentItemId, topic, platform }), execution_id: ids.executionId, generation_id: ids.generationId, video_purpose: brief.text.trim(), quality: brief.quality, aspect_ratio: brief.aspectRatio, duration_seconds: brief.duration };
  return normaliseRecord("video", await send(fetchImpl, `${apiBaseUrl}/customer/generate-video`, { method: "POST", headers: headers(accessToken), body: JSON.stringify(body) }, { paid: true }));
}
// GET only READS the stored state. It does not ask the provider anything, so a video never finishes by being read: POST .../poll is what resumes the
// accepted operation, asks the provider and settles the credits (found by running this client against the real route; one debit per job, not per poll).
export async function pollVideo({ apiBaseUrl, accessToken, generationId, fetchImpl = (...a) => fetch(...a) }) {
  return normaliseRecord("video", await send(fetchImpl, `${apiBaseUrl}/customer/generate-video/${encodeURIComponent(generationId)}/poll`, { method: "POST", headers: { authorization: `Bearer ${accessToken}` } }));
}
export async function fetchVideo({ apiBaseUrl, accessToken, generationId, fetchImpl = (...a) => fetch(...a) }) {
  return normaliseRecord("video", await send(fetchImpl, `${apiBaseUrl}/customer/generate-video/${encodeURIComponent(generationId)}`, { headers: { authorization: `Bearer ${accessToken}` } }));
}
