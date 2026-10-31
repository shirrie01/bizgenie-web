import React, { useRef, useState } from "react";
import { changedBrainFields, describeBrainFailure } from "./brainClient";
import { isNotADescription } from "./onboardingModel";
import { roleLabel } from "./membershipClient";
import PremiumBrandStrategy from "./PremiumBrandStrategy";

// Brand Brain tab of the Premium Studio (BG-STUDIO-015-FE). It replaces, for the flag-on Studio only, the shared legacy
// "Review Brand Brain" panel (which edited the whole document, ignored who may change what, and turned every refused save
// into a "could not be loaded" state). The flag-off app still uses its own, unchanged panel.
//
// Rules (founder decisions DEC-021 / DEC-022, bizgenie-api #214):
//  - only the workspace OWNER may change the business name and description; a known non-owner sees them read-only and can
//    still change the other fields;
//  - only the fields the customer changed are sent, applied to the latest stored Brand Brain (App.premiumSaveBrain);
//  - the backend has no compare-and-set for these writes, so the page says plainly that a field edited here replaces the stored one.
const LIMITS = { businessName: 200, description: 2000, audience: 2000, cta: 2000 };
const FIELD_LABELS = { businessName: "Business name", description: "What the business does", audience: "Who it serves", cta: "What a customer should do next" };

export default function PremiumBrandBrain({ brainState, onLoadBrain, onSave, draft, setField, getBrainBaseline, readOnly = false, membershipRole = null, onChooseWorkspace }) {
  const [message, setMessage] = useState({ kind: "", text: "" });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const brain = brainState.status === "ready" ? brainState.brain : null;
  const locked = readOnly;
  const stored = {
    businessName: brain ? brain.name || "" : "",
    description: brain && brain.identity && !isNotADescription(brain.identity.description) ? brain.identity.description : "",
  };
  const changed = changedBrainFields(draft, getBrainBaseline ? getBrainBaseline() : null);
  if (locked) { delete changed.name; delete changed.description; }
  const nothingToSave = Object.keys(changed).length === 0;

  async function save() {
    if (inFlight.current) return;
    const found = {};
    for (const key of locked ? ["audience", "cta"] : Object.keys(LIMITS)) if (String(draft[key] || "").trim().length > LIMITS[key]) found[key] = `${FIELD_LABELS[key]} must be ${LIMITS[key]} characters or fewer.`;
    setErrors(found);
    if (Object.keys(found).length) return;
    if (nothingToSave) { setMessage({ kind: "error", text: "There is nothing new to save: you have not changed anything on this screen." }); return; }
    inFlight.current = true; setBusy(true); setMessage({ kind: "", text: "" });
    try {
      const result = await onSave(changed);
      if (result.ok) setMessage({ kind: "ok", text: locked ? "Saved to your Brand Brain. Your business name and description are unchanged: only the workspace owner can change them." : "Saved to your Brand Brain. It is a draft until it is approved." });
      else setMessage(describeBrainFailure(result));
    } finally { inFlight.current = false; setBusy(false); }
  }

  const field = (key, label, hint, control) => (
    <div className="ps-field"><label htmlFor={`pb-${key}`}>{label}</label>{control}{errors[key] && <p className="error" role="alert">{errors[key]}</p>}{hint && <p className="ps-hint" id={`pb-${key}-hint`}>{hint}</p>}</div>
  );

  return (
    <section className="ps-stage ps-brain" aria-labelledby="pb-h">
      <h2 id="pb-h">Brand Brain</h2>
      <p className="ps-lede">What BizGenie knows about your business. Nothing is saved until you press Save, and only the details you change are sent.</p>
      {brainState.status === "loading" && <p className="ps-loading" role="status">Loading your Brand Brain…</p>}
      {brainState.status === "idle" && <p className="ps-loading" role="status">Loading your Brand Brain…</p>}
      {brainState.status === "error" && (
        <div className="ps-banner" role="alert">
          <p><strong>Your Brand Brain could not be loaded.</strong> {brainState.error} Nothing has been changed.</p>
          {brainState.errorCode === "WORKSPACE_NOT_AUTHORIZED" && onChooseWorkspace
            ? <button type="button" className="ps-primary" onClick={onChooseWorkspace}>Choose a workspace</button>
            : <button type="button" className="secondary" onClick={onLoadBrain}>Try again</button>}
        </div>
      )}
      {brain && (<>
        <p className="ps-hint">Status: <strong>{(brain.metadata && brain.metadata.status) || "Unknown"}</strong></p>
        {locked && <p className="ps-hint ps-readonly" role="status">Only the workspace owner can change the business name and description{membershipRole ? ` (your role is ${roleLabel(membershipRole)})` : ""}. You can still change who it serves and what a customer should do next.</p>}
        {field("businessName", FIELD_LABELS.businessName, locked ? "Only the workspace owner can change the business name." : null,
          <input id="pb-businessName" value={locked ? stored.businessName : draft.businessName} readOnly={locked} onChange={(e) => setField("businessName", e.target.value)} maxLength={LIMITS.businessName + 20} autoComplete="organization" aria-describedby={locked ? "pb-businessName-hint" : undefined} />)}
        {field("description", FIELD_LABELS.description, locked ? "Only the workspace owner can change the description of the business." : "A website address alone is not a description.",
          <textarea id="pb-description" rows={4} value={locked ? stored.description : draft.description} readOnly={locked} onChange={(e) => setField("description", e.target.value)} aria-describedby="pb-description-hint" />)}
        {field("audience", FIELD_LABELS.audience, null, <textarea id="pb-audience" rows={3} value={draft.audience} onChange={(e) => setField("audience", e.target.value)} />)}
        {field("cta", FIELD_LABELS.cta, "For example: request a quote or book a consultation.", <textarea id="pb-cta" rows={3} value={draft.cta} onChange={(e) => setField("cta", e.target.value)} />)}
        <p className="ps-truth">If someone else changed a detail you also edit here, your edit replaces it. Details you leave alone are kept as they are saved now.</p>
        <button type="button" className="ps-primary" onClick={save} disabled={busy || nothingToSave} aria-describedby={nothingToSave ? "pb-nochange" : undefined}>{busy ? "Saving…" : locked ? "Save who it serves and customer action" : "Save to Brand Brain"}</button>
        {nothingToSave && !busy && <p className="ps-hint" id="pb-nochange">Change a detail above to save it.</p>}
      </>)}
      {brain && <PremiumBrandStrategy brain={brain} onSave={onSave} />}
      {message.text && (
        <div className={message.kind === "ok" ? "ps-ok" : message.kind === "unconfirmed" ? "ps-warn" : "error"} role={message.kind === "ok" ? "status" : "alert"} data-kind={message.kind}>
          <p>{message.text}</p>
          {message.kind === "unconfirmed" && <button type="button" className="secondary" onClick={onLoadBrain} disabled={busy}>Check what was saved</button>}
          {message.chooser && onChooseWorkspace && <button type="button" className="ps-primary" onClick={onChooseWorkspace}>Choose a workspace</button>}
        </div>
      )}
    </section>
  );
}
