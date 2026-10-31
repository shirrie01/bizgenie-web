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

// Shape returned by GET .../creative-preview (campaign-creative-preview.v1): copy + media statuses.
export function normalizePreview(preview) {
  const copy = preview?.copy || {};
  const media = Array.isArray(preview?.media) ? preview.media.filter((m) => m && typeof m.asset_id === "string") : [];
  return {
    title: clean(copy.title), body: clean(copy.body), caption: clean(copy.caption), altText: clean(copy.alt_text),
    media: media.map((m) => ({ id: m.asset_id, role: m.role === "primary" ? "primary" : "supporting", kind: m.media_kind === "image" || m.media_kind === "video" ? m.media_kind : "", status: m.status, reason: m.reason })),
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
            if (renderMedia && canAttemptMedia(media)) return <React.Fragment key={media.id}>{renderMedia(media, creative.altText)}</React.Fragment>;
            const text = mediaLabel(media);
            return (
              <div className="creative-asset" key={media.id}>
                <strong>{text.head}</strong>
                <small>{text.note}</small>
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
