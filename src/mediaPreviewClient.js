import { currentRevisionId, refreshSessionOnce } from "./creativePreviewClient";

// Authenticated media delivery (bizgenie-api PR #207):
//   GET|HEAD /customer/campaigns/:campaign/variants/:variant/revisions/:revision/assets/:asset/preview
// The bearer token travels only in the Authorization header. The URL never carries a token, a bucket
// or a storage key, and nothing the server returns is treated as a URL to follow.

export const MAX_IMAGE_BYTES = 50 * 1024 * 1024; // server cap; also our in-memory ceiling
export const MAX_VIDEO_BYTES = 8 * 1024 * 1024; // server per-response cap: one request may carry at most this much
export const MAX_ASSEMBLED_VIDEO_BYTES = 32 * 1024 * 1024; // our in-memory ceiling for a video built from several ranges
const ALLOWED = { image: ["image/png", "image/jpeg", "image/webp"], video: ["video/mp4"] };
const MAX_CONCURRENT = 2; // the server allows four per process; stay well under it

export class MediaPreviewError extends Error {
  constructor(code, kind) {
    super(messageFor(code, kind));
    this.code = code;
  }
}

function messageFor(code, kind) {
  const noun = kind === "video" ? "video" : kind === "image" ? "image" : "media";
  switch (code) {
    case "stale": return "This campaign changed since you opened it. Reload the latest version to see the current media.";
    case "auth": return "Your session needs to be refreshed to show this " + noun + ".";
    case "missing": return "This " + noun + " is no longer available to you. It may have been removed, or you may not have access.";
    case "too_large": return kind === "video" ? "This video is too large to preview here yet." : "This image is too large to preview here.";
    case "range": return "The video transfer didn’t complete correctly, so it isn’t shown. Try again.";
    case "unsupported": return "This " + noun + " can’t be previewed here.";
    case "busy": return "Media previews are busy. Try again in a moment.";
    case "unavailable": return "The " + noun + " couldn’t be loaded right now. Try again.";
    default: return "The " + noun + " couldn’t be loaded.";
  }
}
export const isRetryable = (code) => ["busy", "unavailable", "failed", "range"].includes(code);

export function mediaPreviewUrl({ apiBaseUrl, session, campaign, variant, assetId }) {
  const revisionId = currentRevisionId(variant);
  const query = new URLSearchParams({ tenant_id: session.tenantId, project_id: session.projectId, expected_campaign_version: String(campaign.version) });
  return `${apiBaseUrl}/customer/campaigns/${campaign.campaign_id}/variants/${variant.variant_id}/revisions/${revisionId}/assets/${assetId}/preview?${query.toString()}`;
}

// Tiny semaphore so a campaign with several assets cannot trip the server's 429 on its own.
let active = 0;
const waiting = [];
async function withSlot(signal, run) {
  if (active >= MAX_CONCURRENT) {
    await new Promise((resolve, reject) => {
      const entry = { resolve };
      waiting.push(entry);
      signal?.addEventListener("abort", () => { const i = waiting.indexOf(entry); if (i >= 0) waiting.splice(i, 1); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
    });
  }
  active += 1;
  try { return await run(); } finally { active -= 1; waiting.shift()?.resolve(); }
}

const baseMime = (value) => String(value || "").split(";")[0].trim().toLowerCase();

export async function fetchMediaPreview({ apiBaseUrl, session, campaign, variant, media, signal, headOnly = false }) {
  const kind = media?.kind;
  if (kind !== "image" && kind !== "video") throw new MediaPreviewError("unsupported", kind);
  if (!campaign?.campaign_id || !variant?.variant_id || !currentRevisionId(variant) || !Number.isInteger(campaign.version) || !media.id) throw new MediaPreviewError("failed", kind);
  const url = mediaPreviewUrl({ apiBaseUrl, session, campaign, variant, assetId: media.id });

  return withSlot(signal, async () => {
    let token = session.accessToken;
    async function call(method, extra = {}) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        let response;
        try {
          response = await fetch(url, { method, headers: { authorization: "Bearer " + token, ...extra }, signal, credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", redirect: "error" });
        } catch (error) {
          if (error?.name === "AbortError") throw error;
          throw new MediaPreviewError("unavailable", kind);
        }
        if (response.status === 401 && attempt === 0) {
          const next = await refreshSessionOnce(); // the existing session path; no other credential
          if (next?.status !== "ready" || !next.accessToken) throw new MediaPreviewError("auth", kind);
          token = next.accessToken;
          continue;
        }
        if (response.ok) return response;
        const code = { 401: "auth", 404: "missing", 409: "stale", 413: "too_large", 416: "unsupported", 429: "busy" }[response.status] || (response.status >= 500 ? "unavailable" : "failed");
        throw new MediaPreviewError(code, kind);
      }
      throw new MediaPreviewError("auth", kind);
    }
    const ceiling = kind === "video" ? MAX_ASSEMBLED_VIDEO_BYTES : MAX_IMAGE_BYTES;
    const check = (response) => {
      const mime = baseMime(response.headers.get("content-type"));
      const length = Number(response.headers.get("content-length"));
      if (!ALLOWED[kind].includes(mime)) throw new MediaPreviewError("unsupported", kind);
      if (!Number.isSafeInteger(length) || length <= 0) throw new MediaPreviewError("failed", kind);
      if (length > ceiling) throw new MediaPreviewError("too_large", kind);
      return { mime, length };
    };
    const readBody = async (response, expected) => {
      let buffer;
      try { buffer = await response.arrayBuffer(); } catch (error) {
        if (error?.name === "AbortError") throw error;
        throw new MediaPreviewError("unavailable", kind); // truncated or reset transfer: discard everything
      }
      if (buffer.byteLength !== expected) throw new MediaPreviewError("unavailable", kind);
      return buffer;
    };

    // HEAD authorises and stats only; it lets us refuse oversize or wrong-type media before any bytes move.
    const head = check(await call("HEAD"));
    // Revalidation only: the server has re-authorised this exact scope, version, revision and asset and
    // reported the same type and size. No bytes move.
    if (headOnly) return { mime: head.mime, bytes: head.length };
    let parts;
    if (kind === "image" || head.length <= MAX_VIDEO_BYTES) {
      const response = await call("GET");
      const got = check(response);
      if (got.mime !== head.mime || got.length !== head.length) throw new MediaPreviewError("stale", kind);
      parts = [await readBody(response, got.length)];
    } else {
      // A larger MP4 is built from explicit single ranges of at most 8 MiB, each checked against the exact
      // Content-Range, and shown only after every byte has arrived. Any mismatch discards everything.
      parts = [];
      for (let start = 0; start < head.length; start += MAX_VIDEO_BYTES) {
        const end = Math.min(start + MAX_VIDEO_BYTES, head.length) - 1;
        const response = await call("GET", { range: `bytes=${start}-${end}` });
        if (response.status !== 206 || response.headers.get("content-range") !== `bytes ${start}-${end}/${head.length}`) throw new MediaPreviewError("range", kind);
        const got = check({ headers: { get: (name) => (name === "content-length" ? String(end - start + 1) : response.headers.get(name)) } });
        if (got.mime !== head.mime || Number(response.headers.get("content-length")) !== end - start + 1) throw new MediaPreviewError("range", kind);
        parts.push(await readBody(response, end - start + 1));
        signal?.throwIfAborted?.();
      }
    }
    return { blob: new Blob(parts, { type: head.mime }), mime: head.mime, bytes: head.length };
  });
}
