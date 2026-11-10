import React, { useEffect, useState } from "react";
import { CONTENT_PLATFORMS } from "./campaignManagementClient";

// Add an image or video item to the open campaign (BG-STUDIO-021-FE). The quote/confirm flow can only make creative for such an item, and only where the
// backend has an approved preview profile for its destination; if it has none, the price step says so and nothing is charged.
const PLATFORM_LABEL = { linkedin: "LinkedIn", instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", youtube: "YouTube", email: "Email", other: "Other" };

export default function AddCreativeItem({ busy = false, error = "", notice = "", onAdd, loadConnections = null }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", format: "image", platform: "instagram", placement: "feed", destinationLabel: "", connectionId: "" });
  // Connected accounts (BG-LAUNCH-006). Only a connection the server reports as connected can be chosen; the choice becomes the item's destination key, which is what later
  // lets BizGenie send it to that account. Choosing none keeps the manual route.
  const [connections, setConnections] = useState([]);
  useEffect(() => { if (!open || typeof loadConnections !== "function") return undefined; let live = true; Promise.resolve(loadConnections()).then((c) => { if (live) setConnections(Array.isArray(c) ? c : []); }).catch(() => { if (live) setConnections([]); }); return () => { live = false; }; }, [open, loadConnections]);
  const usable = connections.filter((c) => c.provider === f.platform && c.status === "connected");
  const set = (k) => (e) => setF((cur) => ({ ...cur, [k]: e.target.value, ...(k === "platform" ? { connectionId: "" } : {}) }));
  const pick = (e) => { const c = usable.find((x) => x.id === e.target.value); setF((cur) => ({ ...cur, connectionId: c ? c.id : "", destinationLabel: c && !cur.destinationLabel.trim() ? c.name : cur.destinationLabel })); };
  const ready = f.name.trim() && f.destinationLabel.trim() && f.placement.trim();
  return (
    <details className="ps-creative" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Add an image or video to this campaign</summary>
      <form className="ps-creative-form" aria-label="New image or video item" onSubmit={async (e) => { e.preventDefault(); const r = await onAdd({ ...f, destinationKey: f.connectionId || null }); if (r && r.ok) setF((cur) => ({ ...cur, name: "" })); }}>
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
        {usable.length > 0 && <>
          <label htmlFor="aci-conn">Connected account</label>
          <select id="aci-conn" value={f.connectionId} onChange={pick} aria-describedby="aci-conn-hint">
            <option value="">None: I will publish it myself</option>
            {usable.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <small id="aci-conn-hint">Choose the connected account this is for if you want BizGenie to be able to send it there. This does not send anything.</small>
        </>}
        {error && <p className="error" role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        <button type="submit" className="secondary" disabled={busy || !ready}>{busy ? "Adding…" : "Add to the campaign"}</button>
        <p className="ps-hint">This adds an empty item. Nothing is made and no credits are used until you get a price and confirm it.</p>
      </form>
    </details>
  );
}
