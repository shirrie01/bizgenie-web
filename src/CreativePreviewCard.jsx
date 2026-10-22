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

export default function CreativePreviewCard({ variant }) {
  const creative = normalizeCreative(variant.current_content);
  const platform = PLATFORMS[variant.platform] || { label: variant.destination_label || "Content", kind: "generic" };
  const placement = variant.placement ? String(variant.placement).replace(/[_-]+/g, " ") : "";
  const primary = creative.assets.filter((asset) => asset.role === "primary");
  const supporting = creative.assets.filter((asset) => asset.role !== "primary");
  const isEmail = platform.kind === "email";
  const hasText = creative.title || creative.body || creative.caption;

  return (
    <figure className={`creative-card creative-${platform.kind}`} aria-label={`Creative preview for ${platform.label}`}>
      <figcaption className="creative-head">
        <span className="creative-platform">{platform.label}</span>
        {placement && <span className="creative-placement">{placement}</span>}
        {variant.destination_label && variant.destination_label !== platform.label && <span className="creative-destination">{variant.destination_label}</span>}
      </figcaption>
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
      {creative.assets.length > 0 ? (
        <div className="creative-assets">
          {primary.map((asset) => (
            <div className="creative-asset" key={asset.id}>
              <strong>Primary visual attached</strong>
              <small>Reference {shortId(asset.id)}. The image itself can’t be shown here yet.</small>
            </div>
          ))}
          {supporting.length > 0 && <p className="notice">{supporting.length} supporting visual{supporting.length === 1 ? "" : "s"} attached (references only).</p>}
        </div>
      ) : (
        <p className="notice creative-noasset">No visual is attached to this version.</p>
      )}
      {creative.assets.length > 0 && (
        <p className="creative-alt">
          <span>Image description (alt text)</span>
          {creative.altText || "None provided. Add one before approving if this will be posted with an image."}
        </p>
      )}
    </figure>
  );
}
