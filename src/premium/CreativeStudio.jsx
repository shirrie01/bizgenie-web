import React, { useState } from "react";
import QuotedGeneration from "./QuotedGeneration";
import { ATTACH_BLOCKER, HYBRID_BLOCKER, KIND_LABEL, VIDEO_QUALITIES, executionClassFor } from "./creativeProductionClient";

// Image and video for one content item (BG-STUDIO-021-FE). The brief is the only creative input the server accepts; shape, length, provider and preview
// profile are the server's. Cost is a binding quote the customer confirms (QuotedGeneration). A job that has Finished is not approved and not published: the
// result becomes reviewable only when the campaign's current revision carries it (the review/approval flow and authenticated delivery already exist for
// that), and until the backend attaches outputs to the campaign this panel says so instead of faking a preview. Hybrid is named unavailable.
export default function CreativeStudio({ enabled, session, scope, campaign, variant, format, readOnly = false, attached = false, api = {}, pollMs, onSessionEnded, onFinished }) {
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState({ text: "", quality: "normal" });
  const [locked, setLocked] = useState(false);
  const [finished, setFinished] = useState(null);
  const summary = <summary>{format === "video" ? "Create the video for this post" : "Create the image for this post"}</summary>;
  if (!["image", "video"].includes(format)) return null;
  if (!enabled) {
    return (
      <details className="ps-creative">{summary}
        <p>Creating {format === "video" ? "videos" : "images"} is not available in BizGenie yet. Nothing here uses credits, and your text drafts are not affected.</p>
        <p className="ps-hint">{HYBRID_BLOCKER}</p>
      </details>
    );
  }
  const inputs = { scope, campaign, variant, executionClass: executionClassFor(format, brief.quality), executionMode: "ai", brief: brief.text };
  return (
    <details className="ps-creative" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>{summary}
      {readOnly && <p className="ps-hint">You can view creative here. Only an owner or editor can create it.</p>}
      {!readOnly && (
        <div className="ps-creative-form">
          <label htmlFor={`br-${variant.variant_id}`}>Brief</label>
          <textarea id={`br-${variant.variant_id}`} value={brief.text} maxLength={4000} disabled={locked} onChange={(e) => setBrief((b) => ({ ...b, text: e.target.value }))} aria-describedby={`brc-${variant.variant_id}`} />
          <small id={`brc-${variant.variant_id}`}>{brief.text.length} of 4000 characters. Describe the subject, mood and anything to avoid. Your approved Brand Brain and this campaign are used as context. The shape{format === "video" ? " and length are" : " is"} set by BizGenie for this destination.</small>
          {format === "video" && (
            <>
              <label htmlFor={`qu-${variant.variant_id}`}>Quality</label>
              <select id={`qu-${variant.variant_id}`} value={brief.quality} disabled={locked} onChange={(e) => setBrief((b) => ({ ...b, quality: e.target.value }))}>{VIDEO_QUALITIES.map((q) => <option key={q} value={q}>{q === "normal" ? "Standard" : "Premium"}</option>)}</select>
            </>
          )}
          <p className="ps-hint">{HYBRID_BLOCKER}</p>
          <QuotedGeneration key={`${session.tenantId}:${variant.variant_id}`} enabled session={session} inputs={inputs} label={`Get the price for the ${KIND_LABEL[format].toLowerCase()}`} api={api} pollMs={pollMs} onLockChange={setLocked} onSessionEnded={onSessionEnded} onSettled={(s) => { setFinished(s); if (s.state === "succeeded" && onFinished) onFinished(s); }} />
          {finished && finished.state === "succeeded" && !attached && <p className="ps-hint" role="status">{ATTACH_BLOCKER}</p>}
          {finished && finished.state === "succeeded" && attached && <p className="ps-hint" role="status">It is attached to this item below. Review it before it can be approved: finished is not approved, and approved is not published.</p>}
        </div>
      )}
    </details>
  );
}
