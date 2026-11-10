import React from "react";

const PLATFORMS = {
  instagram: { label: "Instagram", kind: "social" },
  facebook: { label: "Facebook", kind: "social" },
  linkedin: { label: "LinkedIn", kind: "social" },
  tiktok: { label: "TikTok", kind: "social" },
  youtube: { label: "YouTube", kind: "social" },
  email: { label: "Email", kind: "email" },
};

const clean = (value) => (typeof value === "string" && value.trim() ? value : "");

// The campaign API persists revision content as { title, body, caption, alt_text, asset_refs }.
// A plain string is accepted for older fixtures and is treated as the body.
export function normalizeCreative(content) {
  if (typeof content === "string") return { title: "", body: clean(content), caption: "", altText: "", assets: [] };
  if (!content || typeof content !== "object") return { title: "", body: "", caption: "", altText: "", assets: [] };
  const assets = Array.isArray(content.asset_refs)
    ? content.asset_refs.filter((ref) => ref && typeof ref.asset_id === "string").map((ref) => ({ id: ref.asset_id, role: ref.role === "primary" ? "primary" : "supporting" }))
    : [];
  return { title: clean(content.title), body: clean(content.body), caption: clean(content.caption), altText: clean(content.alt_text), assets };
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
function normalizeFacts(m) {
  const width = num(m.width), height = num(m.height), seconds = num(m.duration_ms) === null ? null : m.duration_ms / 1000, bytes = num(m.byte_size);
  return { width, height, seconds, bytes };
}
// The backend's verdict (BG-LAUNCH-002): only an explicit `suitable: true` counts as a fit; anything missing or unknown is "not checked".
function normalizeFit(fit) {
  if (!fit || typeof fit !== "object") return { state: "unchecked", reasons: [] };
  const reasons = Array.isArray(fit.reasons) ? fit.reasons.filter((r) => r && typeof r.code === "string").slice(0, 8).map((r) => ({ code: r.code, detail: typeof r.detail === "string" ? r.detail.slice(0, 120) : "" })) : [];
  if (fit.status === "suitable" && fit.suitable === true) return { state: "suitable", reasons: [], profile: typeof fit.profile_id === "string" ? fit.profile_id : "" };
  if (fit.status === "not_suitable" && fit.suitable === false) return { state: "not_suitable", reasons, profile: typeof fit.profile_id === "string" ? fit.profile_id : "" };
  if (fit.status === "no_profile") return { state: "no_profile", reasons: [] };
  return { state: "unchecked", reasons: [] };
}

// Plain-English wording for the backend's reason codes (an unknown code still shows, generically).
export const FIT_REASONS = {
  MEDIA_KIND_MISMATCH: "This is the wrong kind of media for this slot.",
  DIMENSIONS_UNKNOWN: "The size of this file is unknown, so it cannot be checked.",
  DIMENSIONS_TOO_SMALL: "The picture is smaller than this placement needs.",
  ASPECT_RATIO_UNSUPPORTED: "The shape (aspect ratio) is outside what this placement accepts.",
  FILE_TOO_LARGE: "The file is larger than this placement allows.",
  DURATION_UNKNOWN: "The length of this video is unknown, so it cannot be checked.",
  DURATION_UNSUPPORTED: "The video length is outside what this placement accepts.",
  CONTAINER_UNSUPPORTED: "The file format is not supported.",
  VIDEO_CODEC_UNSUPPORTED: "The video encoding is not supported.",
  AUDIO_UNSUPPORTED: "This placement expects a video without an audio track.",
  MIME_TYPE_UNSUPPORTED: "The file type is not supported.",
  NO_MEDIA_PROFILE: "No requirements are defined for this placement yet.",
};
export const fitReasonText = (code) => FIT_REASONS[code] || "This file does not meet the placement's requirements.";

// Shape returned by GET .../creative-preview (campaign-creative-preview.v1): copy + media statuses.
export function normalizePreview(preview) {
  const copy = preview?.copy || {};
  const media = Array.isArray(preview?.media) ? preview.media.filter((m) => m && typeof m.asset_id === "string") : [];
  return {
    title: clean(copy.title), body: clean(copy.body), caption: clean(copy.caption), altText: clean(copy.alt_text),
    media: media.map((m) => ({ id: m.asset_id, role: m.role === "primary" ? "primary" : "supporting", kind: m.media_kind === "image" || m.media_kind === "video" ? m.media_kind : "", status: m.status, reason: m.reason,
      facts: normalizeFacts(m), fit: normalizeFit(m.platform_suitability) })),
    revisionNumber: Number.isInteger(preview?.revision_number) ? preview.revision_number : null,
  };
}

export const hasCreativeText = (content) => {
  const creative = normalizeCreative(content);
  return Boolean(creative.title || creative.body || creative.caption);
};

// One plain-text string for places that need a single value (e.g. the copy box for manual publishing).
export function creativeAsText(content) {
  const creative = normalizeCreative(content);
  return [creative.title, creative.body, creative.caption].filter(Boolean).join("\n\n");
}

const shortId = (id) => String(id).slice(0, 8);

// Media the delivery endpoint can be asked for. #205 reports media it cannot deliver as
// PRIVATE_MEDIA_DELIVERY_UNAVAILABLE; once delivery exists that is the case to try. A revoked or foreign
// reference (ASSET_NOT_AVAILABLE) is never requested.
export const canAttemptMedia = (media) => (media.kind === "image" || media.kind === "video") && (media.status === "available" || media.reason === "PRIVATE_MEDIA_DELIVERY_UNAVAILABLE");

const factsLine = ({ width, height, seconds, bytes }) => [
  width && height ? `${width}×${height}` : "", seconds !== null ? `${Math.round(seconds * 10) / 10} s` : "", bytes !== null ? `${Math.round(bytes / 1024 / 102.4) / 10} MB` : "",
].filter(Boolean).join(" · ");

// Platform fit. This is BizGenie's own check from stored facts; the platform still decides at publishing time, and that is said every time.
function PlatformFit({ media, platformLabel }) {
  const { fit } = media;
  if (fit.state === "suitable") return <p className="creative-fit creative-fit-ok" role="status"><strong>Suits {platformLabel}.</strong> Passed BizGenie’s checks for this placement; {platformLabel} makes the final decision when it is published.</p>;
  if (fit.state === "not_suitable") return (
    <div className="creative-fit creative-fit-bad" role="alert">
      <p><strong>Doesn’t suit {platformLabel} yet.</strong> It can’t be previewed or approved until this is fixed:</p>
      <ul>{fit.reasons.map((r) => <li key={r.code}>{fitReasonText(r.code)}{r.detail ? <small> ({r.detail})</small> : null}</li>)}</ul>
    </div>
  );
  return <p className="creative-fit creative-fit-unknown">Not checked against {platformLabel}’s requirements yet.</p>;
}

const mediaLabel = (media) => {
  const what = media.kind || "visual";
  const which = media.role === "primary" ? "Primary " : "Supporting ";
  if (media.reason === "PRIVATE_MEDIA_DELIVERY_UNAVAILABLE") return { head: which + what + " attached", note: "It can’t be displayed here yet, so it has not been reviewed in this view." };
  return { head: "A referenced " + what + " is not available", note: "It may have been removed or you may not have access. It has not been reviewed in this view." };
};

export default function CreativePreviewCard({ variant, preview = null, status = "ready", renderMedia = null }) {
  const server = preview ? normalizePreview(preview) : null;
  const creative = server ? { ...server, assets: [] } : normalizeCreative(variant.current_content);
  const platform = PLATFORMS[variant.platform] || { label: variant.destination_label || "Content", kind: "generic" };
  const placement = variant.placement ? String(variant.placement).replace(/[_-]+/g, " ") : "";
  const primary = creative.assets.filter((asset) => asset.role === "primary");
  const supporting = creative.assets.filter((asset) => asset.role !== "primary");
  const isEmail = platform.kind === "email";
  const hasText = creative.title || creative.body || creative.caption;
  const frame = `creative-card creative-${platform.kind}`;
  const label = `Creative preview for ${platform.label}`;
  const head = (
    <figcaption className="creative-head">
      <span className="creative-platform">{platform.label}</span>
      {placement && <span className="creative-placement">{placement}</span>}
      {variant.destination_label && variant.destination_label !== platform.label && <span className="creative-destination">{variant.destination_label}</span>}
    </figcaption>
  );

  if (!server && status === "loading") {
    return (
      <figure className={frame} aria-label={label} aria-busy="true">
        {head}
        <p className="notice" role="status">Loading the saved content…</p>
      </figure>
    );
  }
  if (!server && status === "error") {
    return (
      <figure className={frame} aria-label={label}>
        {head}
        <p className="notice">The saved content could not be loaded, so nothing is shown here.</p>
      </figure>
    );
  }

  return (
    <figure className={frame} aria-label={label}>
      {head}
      {!hasText ? (
        <p className="notice">This version has no saved text.</p>
      ) : (
        <div className="creative-copy">
          {creative.title && (isEmail
            ? <p className="creative-subject"><span>Subject</span> {creative.title}</p>
            : <h4 className="creative-title">{creative.title}</h4>)}
          {creative.body && <p className="creative-body">{creative.body}</p>}
          {creative.caption && <p className="creative-caption"><span>Caption</span>{creative.caption}</p>}
        </div>
      )}
      {server ? (
        <div className="creative-assets">
          {server.media.length === 0 && <p className="notice creative-noasset">No visual is attached to this version.</p>}
          {server.media.map((media) => {
            const fitLine = media.kind ? <PlatformFit media={media} platformLabel={platform.label} /> : null;
            const facts = factsLine(media.facts);
            if (renderMedia && canAttemptMedia(media)) return <React.Fragment key={media.id}>{renderMedia(media, creative.altText)}{facts && <p className="creative-facts">{facts}</p>}{fitLine}</React.Fragment>;
            const text = mediaLabel(media);
            return (
              <div className="creative-asset" key={media.id}>
                <strong>{text.head}</strong>
                <small>{text.note}</small>
                {facts && <small className="creative-facts">{facts}</small>}
                {fitLine}
              </div>
            );
          })}
          {server.media.length > 0 && (
            <p className="creative-alt"><span>Image description (alt text)</span>{creative.altText || "None provided. Add one before approving if this will be posted with an image."}</p>
          )}
          <p className="notice creative-foot">Saved content{server.revisionNumber ? `, revision ${server.revisionNumber}` : ""}. Shown in a generic layout; this is not an exact platform rendering.</p>
        </div>
      ) : creative.assets.length > 0 ? (
        <>
          <div className="creative-assets">
            {primary.map((asset) => (
              <div className="creative-asset" key={asset.id}>
                <strong>Primary visual attached</strong>
                <small>Reference {shortId(asset.id)}. The image itself can’t be shown here yet.</small>
              </div>
            ))}
            {supporting.length > 0 && <p className="notice">{supporting.length} supporting visual{supporting.length === 1 ? "" : "s"} attached (references only).</p>}
          </div>
          <p className="creative-alt">
            <span>Image description (alt text)</span>
            {creative.altText || "None provided. Add one before approving if this will be posted with an image."}
          </p>
        </>
      ) : (
        <p className="notice creative-noasset">No visual is attached to this version.</p>
      )}
    </figure>
  );
}
