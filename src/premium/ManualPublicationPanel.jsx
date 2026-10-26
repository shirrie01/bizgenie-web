import React, { useState } from "react";

// Manual publication (BG-STUDIO-019-FE, workstream E). BizGenie does not publish: the customer publishes elsewhere and tells BizGenie
// how it went. Three outcomes exist in the backend and all are offered: published, failed, cancelled. Whatever the customer enters is
// kept as THEIR statement ("customer attestation"); the platform has not been asked, and the page says so. The waiting handoff is read
// from the saved campaign when it carries one (variant.pending_attempt_id), else from the id this browser was given when it was prepared.
const localNow = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const OUTCOMES = [
  { id: "confirm", label: "I published it" },
  { id: "fail", label: "I tried, but it did not publish" },
  { id: "cancel", label: "I am not going ahead" },
];

export function publicationFor(campaign, variant) {
  if (!campaign || !variant || !variant.publication_id || !Array.isArray(campaign.publications)) return null;
  return campaign.publications.find((p) => p.publication_id === variant.publication_id) || null;
}

export default function ManualPublicationPanel({ campaign, variant, pendingAttemptId = "", state, contentText, onStart, onRecord }) {
  // The real campaign detail does not carry the waiting attempt, so the caller supplies the id it was given when the handoff was prepared.
  const pending = pendingAttemptId || variant.pending_attempt_id || "";
  const mine = state.variantId === variant.variant_id;
  const busy = mine && (state.status === "starting" || state.status === "recording");
  const [outcome, setOutcome] = useState("confirm");
  const [f, setF] = useState({ publishedAt: localNow(), url: "", reference: "", note: "", reason: "" });
  const set = (k) => (e) => setF((cur) => ({ ...cur, [k]: e.target.value }));
  const id = `mp-${variant.variant_id}`;
  const record = publicationFor(campaign, variant);

  if (variant.workflow === "published") {
    return record ? (
      <div className="ps-manual" role="group" aria-label="Publication record">
        <p><strong>Recorded by you as published</strong>{record.published_at ? ` on ${new Date(record.published_at).toLocaleString()}` : ""}. BizGenie has not checked the platform: this is your own statement.</p>
        {record.publication_url && <p><a href={record.publication_url} target="_blank" rel="noopener noreferrer">Open the post you recorded</a></p>}
      </div>
    ) : null;
  }

  if (!pending) {
    return (
      <div className="ps-manual">
        <p>Manual publication required. BizGenie will not claim this was published until you tell it so, and then only as your own statement.</p>
        {mine && state.status === "done" && state.notice && <p role="status">{state.notice}</p>}
        {mine && state.status === "error" && <p className="error" role="alert">{state.error}</p>}
        <button type="button" className="secondary" onClick={() => onStart(variant)} disabled={busy}>{busy ? "Preparing handoff…" : "Prepare manual publication"}</button>
      </div>
    );
  }

  return (
    <form className="ps-manual" aria-label="Record the manual publication" onSubmit={(e) => { e.preventDefault(); onRecord(variant, outcome, { ...f, attemptId: pending, publishedAt: f.publishedAt ? new Date(f.publishedAt).toISOString() : "" }); }}>
      <p>Ready to publish to <strong>{variant.destination_label || "your channel"}</strong>. Publish the approved content yourself, then tell BizGenie how it went.</p>
      <label htmlFor={`${id}-copy`}>Approved content</label>
      <textarea id={`${id}-copy`} readOnly rows={5} value={contentText || ""} />
      <fieldset>
        <legend>How did it go?</legend>
        {OUTCOMES.map((o) => <label key={o.id} className="ps-radio"><input type="radio" name={`${id}-outcome`} value={o.id} checked={outcome === o.id} onChange={() => setOutcome(o.id)} /> {o.label}</label>)}
      </fieldset>
      {outcome === "confirm" ? (
        <>
          <label htmlFor={`${id}-at`}>When you published it</label>
          <input id={`${id}-at`} type="datetime-local" value={f.publishedAt} max={localNow()} onChange={set("publishedAt")} />
          <label htmlFor={`${id}-url`}>Public address of the post</label>
          <input id={`${id}-url`} type="url" inputMode="url" placeholder="https://…" value={f.url} onChange={(e) => setF((cur) => ({ ...cur, url: e.target.value }))} />
          <label htmlFor={`${id}-ref`}>Reference (optional)</label>
          <input id={`${id}-ref`} value={f.reference} maxLength={128} onChange={set("reference")} aria-describedby={`${id}-ref-hint`} />
          <p className="ps-hint" id={`${id}-ref-hint`}>For example the platform's post number. Letters, numbers and . _ : - only.</p>
          <label htmlFor={`${id}-note`}>Note (optional)</label>
          <textarea id={`${id}-note`} rows={2} value={f.note} onChange={set("note")} />
          <p className="ps-hint">This records what you tell BizGenie. It does not check the platform and it does not publish anything.</p>
        </>
      ) : (
        <>
          <label htmlFor={`${id}-reason`}>{outcome === "fail" ? "What went wrong?" : "Why are you not going ahead?"}</label>
          <textarea id={`${id}-reason`} rows={3} value={f.reason} onChange={set("reason")} />
          <p className="ps-hint">{outcome === "fail" ? "Your approval stays, any planned time is cleared, and you can prepare the handoff again." : "The handoff is closed. Your approval stays."}</p>
        </>
      )}
      {mine && state.status === "error" && <p className="error" role="alert">{state.error}</p>}
      <button type="submit" className="secondary" disabled={busy}>{busy ? "Saving…" : outcome === "confirm" ? "Record that I published it" : outcome === "fail" ? "Record the failure" : "Close the handoff"}</button>
    </form>
  );
}
