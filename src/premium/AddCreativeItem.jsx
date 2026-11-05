import React, { useState } from "react";
import { CONTENT_PLATFORMS } from "./campaignManagementClient";

// Add an image or video item to the open campaign (BG-STUDIO-021-FE). The quote/confirm flow can only make creative for such an item, and only where the
// backend has an approved preview profile for its destination; if it has none, the price step says so and nothing is charged.
const PLATFORM_LABEL = { linkedin: "LinkedIn", instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", youtube: "YouTube", email: "Email", other: "Other" };

export default function AddCreativeItem({ busy = false, error = "", notice = "", onAdd }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", format: "image", platform: "instagram", placement: "feed", destinationLabel: "" });
  const set = (k) => (e) => setF((cur) => ({ ...cur, [k]: e.target.value }));
  const ready = f.name.trim() && f.destinationLabel.trim() && f.placement.trim();
  return (
    <details className="ps-creative" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Add an image or video to this campaign</summary>
      <form className="ps-creative-form" aria-label="New image or video item" onSubmit={async (e) => { e.preventDefault(); const r = await onAdd(f); if (r && r.ok) setF((cur) => ({ ...cur, name: "" })); }}>
        <label htmlFor="aci-name">Name</label>
        <input id="aci-name" value={f.name} maxLength={200} onChange={set("name")} />
        <fieldset><legend>What is it?</legend>
          {["image", "video"].map((k) => <label key={k} className="ps-radio"><input type="radio" name="aci-format" value={k} checked={f.format === k} onChange={set("format")} /> {k === "image" ? "Image" : "Video"}</label>)}
        </fieldset>
        <label htmlFor="aci-platform">Platform</label>
        <select id="aci-platform" value={f.platform} onChange={set("platform")}>{CONTENT_PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}</select>
        <label htmlFor="aci-placement">Where on the platform</label>
        <input id="aci-placement" value={f.placement} maxLength={128} onChange={set("placement")} aria-describedby="aci-placement-hint" />
        <small id="aci-placement-hint">For example feed. Letters, numbers and . _ : - only.</small>
        <label htmlFor="aci-dest">Account or page</label>
        <input id="aci-dest" value={f.destinationLabel} maxLength={200} onChange={set("destinationLabel")} />
        {error && <p className="error" role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        <button type="submit" className="secondary" disabled={busy || !ready}>{busy ? "Adding…" : "Add to the campaign"}</button>
        <p className="ps-hint">This adds an empty item. Nothing is made and no credits are used until you get a price and confirm it.</p>
      </form>
    </details>
  );
}
