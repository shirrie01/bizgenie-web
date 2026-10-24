import React, { useEffect, useRef, useState } from "react";
import { SECTORS, sectorOptions } from "./sectors";
import { SOURCE_LABEL } from "./workspaceModel";
import { CHANNEL_LABELS, MISSING_GUIDANCE, confirmationReadiness, effectiveSector, isNotADescription } from "./onboardingModel";
import { roleLabel } from "./membershipClient";
import { changedBrainFields, describeBrainFailure } from "./brainClient";

// Production onboarding (BG-STUDIO-008-FE, persistent since BG-STUDIO-010-FE). Each step says exactly what it saves and where:
//  - Business identity: created through POST /customer/workspace/bootstrap (only when no workspace exists yet).
//  - Business description, customers and customer action: saved to the Brand Brain through the existing
//    PUT /customer/workspace/brand-brain, and only when the customer presses Save to Brand Brain.
//  - Sector, channels, the step you are on and unsaved typed answers: saved as setup progress through
//    PUT /customer/workspace/onboarding, only when the customer presses Save progress or Save and exit.
//  - Setup is "complete" only after the customer presses Confirm setup, which the server accepts only with a saved
//    sector and channel. Nothing is inferred to be complete.
// Nothing here pretends a step was saved.

export const STAGES = [
  { id: "welcome", label: "Welcome" },
  { id: "identity", label: "Your business" },
  { id: "about", label: "What you do" },
  { id: "customers", label: "Customers and goal" },
  { id: "channels", label: "Channels" },
  { id: "brain", label: "Brand Brain" },
  { id: "recommendation", label: "First recommendation" },
];

export const CHANNELS = CHANNEL_LABELS;
const LIMITS = { businessName: 200, website: 500, challenge: 1000, description: 2000, audience: 2000, cta: 2000, goal: 2000, industryText: 200 };

const over = (value, key) => String(value || "").trim().length > LIMITS[key];
const tooLong = (key, label) => `${label} must be ${LIMITS[key]} characters or fewer.`;

function Field({ id, label, hint, children }) {
  return (<div className="ps-field"><label htmlFor={id}>{label}</label>{children}{hint && <p className="ps-hint" id={`${id}-hint`}>{hint}</p>}</div>);
}

function Truth({ children }) { return <p className="ps-truth">{children}</p>; }

export default function PremiumOnboarding({ stage, setStage, draft, setField, channels, toggleChannel, session, brainState, onLoadBrain, onSave, onBootstrap, onRecommend, recommendationState, onFinish, onOpenStudio, onboardingState, onLoadOnboarding, onSaveProgress, dirty = false, readOnly = false, membershipRole = null, onGoToStep, getBrainBaseline, onChooseWorkspace = null }) {
  const headingRef = useRef(null);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ kind: "", text: "" });
  const [errors, setErrors] = useState({});

  // Move focus to the step heading on every step change so keyboard and screen-reader users land in context.
  useEffect(() => { setMessage({ kind: "", text: "" }); setErrors({}); if (headingRef.current) headingRef.current.focus(); }, [stage]);

  const onboarding = onboardingState ? onboardingState.onboarding : null;
  const sector = effectiveSector({ sectorChoice: draft.sectorChoice, texts: [draft.industryText, draft.businessName, draft.description], onboarding });
  const sectorLabel = { customer: "You chose this · not saved yet", saved_customer: SOURCE_LABEL.saved_customer, inferred: "Inferred from what you typed · not saved yet · you can change it", saved_inferred: SOURCE_LABEL.saved_inferred, none: "Not identified. A neutral layout is used." }[sector.source];
  const scopeMissing = session.status === "scope-missing";
  const storage = onboardingState ? onboardingState.status : "idle";
  // View-only members keep read access to everything but cannot save or confirm (the API allows only the owner to write).
  const canSaveProgress = !scopeMissing && storage === "ready";
  const readiness = confirmationReadiness({ onboarding, brain: brainState.brain, brandNamePlaceholder: onboardingState ? onboardingState.brandNamePlaceholder : null });
  const brainReady = brainState.status === "ready" && brainState.brain;
  // A known non-owner cannot change the business name or description (DEC-021 / DEC-022); everything else stays editable.
  const identityLocked = readOnly && !scopeMissing;
  const brainEdits = brainReady ? changedBrainFields(draft, getBrainBaseline ? getBrainBaseline() : null) : {};
  if (identityLocked) { delete brainEdits.name; delete brainEdits.description; }
  const nothingToSaveBrain = Object.keys(brainEdits).length === 0;
  const storedName = brainReady ? brainState.brain.name || "" : "";
  const storedDescription = brainReady && brainState.brain.identity && !isNotADescription(brainState.brain.identity.description) ? brainState.brain.identity.description : "";

  async function guarded(task) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage({ kind: "", text: "" });
    try { await task(); } finally { inFlight.current = false; setBusy(false); }
  }

  function validate(keys) {
    const found = {};
    for (const [key, label] of keys) if (over(draft[key], key)) found[key] = tooLong(key, label);
    setErrors(found);
    return Object.keys(found).length === 0;
  }

  const next = () => setStage((current) => Math.min(STAGES.length - 1, current + 1));
  const back = () => setStage((current) => Math.max(0, current - 1));

  async function createWorkspace() {
    if (!draft.businessName.trim()) { setErrors({ businessName: "Enter your business name to continue." }); return; }
    if (!validate([["businessName", "Business name"], ["website", "Website"], ["challenge", "Your challenge"]])) return;
    await guarded(async () => {
      const result = await onBootstrap({ businessName: draft.businessName.trim(), website: draft.website.trim(), challenge: draft.challenge.trim() });
      if (result.ok) { setStage(2); } else setMessage({ kind: "error", text: result.message });
    });
  }

  async function saveBrain() {
    const keys = identityLocked ? [["audience", "Who it serves"], ["cta", "Customer action"]] : [["businessName", "Business name"], ["description", "Description"], ["audience", "Who it serves"], ["cta", "Customer action"]];
    if (!validate(keys)) return;
    // Only what was edited is sent, and it is applied to the latest stored Brand Brain (see App.premiumSaveBrain).
    const fields = changedBrainFields(draft, getBrainBaseline ? getBrainBaseline() : null);
    if (identityLocked) { delete fields.name; delete fields.description; }
    if (!Object.keys(fields).length) { setMessage({ kind: "error", text: "There is nothing new to save: you have not changed your Brand Brain details on this screen." }); return; }
    await guarded(async () => {
      const result = await onSave(fields);
      if (result.ok) { setMessage({ kind: "ok", text: identityLocked ? "Saved to your Brand Brain. Your business name and description are unchanged: only the workspace owner can change them." : "Saved to your Brand Brain. It is a draft until it is approved." }); return; }
      setMessage(describeBrainFailure(result));
    });
  }

  // How a failed save is shown. "unconfirmed" is NOT "not saved": the request may have been stored.
  function failureMessage(result) {
    if (result.unconfirmed) return { kind: "unconfirmed", text: result.message };
    if (result.missing && result.missing.length) return { kind: "incomplete", text: result.message, missing: result.missing };
    return { kind: "error", text: result.message };
  }

  async function saveProgress({ exit = false } = {}) {
    await guarded(async () => {
      const result = await onSaveProgress({});
      if (!result.ok) { setMessage(failureMessage(result)); return; }
      if (exit) { onFinish(); return; }
      setMessage({ kind: "ok", text: result.noop ? "Everything on this screen is already saved." : "Setup progress saved. You can leave and come back to continue." });
    });
  }

  async function confirmSetup() {
    await guarded(async () => {
      const result = await onSaveProgress({ complete: true });
      setMessage(result.ok ? { kind: "ok", text: "Setup confirmed and saved." } : failureMessage(result));
    });
  }

  async function recommend() {
    if (!draft.goal.trim()) { setErrors({ goal: "Tell us your goal first. You can add it on the Customers and goal step." }); return; }
    if (!validate([["goal", "Goal"]])) return;
    await guarded(async () => { await onRecommend(draft.goal.trim()); });
  }

  const current = STAGES[stage];
  const heading = (text) => <h2 ref={headingRef} tabIndex={-1}>{text}</h2>;

  let body = null;
  if (current.id === "welcome") {
    body = (<>
      {heading("Let’s set up your workspace")}
      <p className="ps-lede">A few short steps so BizGenie works from your own words, not a template.</p>
      <div className="ps-saved" role="group" aria-label="What is saved and what is not">
        <div><h3>Saved to your account</h3><ul><li>Your business name, and a website or challenge if you add them.</li><li>What your business does, who it serves and what customers should do next, when you press Save to Brand Brain.</li><li>Your sector, channels, the step you are on and any unsaved answers, when you press Save progress or Save and exit.</li></ul></div>
        <div><h3>Not saved until you act</h3><ul><li>Anything you type stays on this screen until you save it.</li><li>Your goal becomes a campaign only when you create one.</li></ul></div>
      </div>
      <Truth>Nothing is published, scheduled or connected by setting up. You approve everything before it goes anywhere.</Truth>
    </>);
  } else if (current.id === "identity") {
    body = (<>
      {heading("Tell us about your business")}
      <Field id="ps-name" label="Business name" hint={scopeMissing ? "Required. This creates your workspace." : identityLocked ? "Only the workspace owner can change the business name." : "Shown across your workspace. Saved with your Brand Brain on the Brand Brain step."}>
        <input id="ps-name" value={identityLocked ? storedName : draft.businessName} readOnly={identityLocked} maxLength={LIMITS.businessName + 20} onChange={(e) => setField("businessName", e.target.value)} aria-invalid={errors.businessName ? "true" : undefined} aria-describedby={errors.businessName ? "ps-name-error" : "ps-name-hint"} autoComplete="organization" />
        {errors.businessName && <p className="error" id="ps-name-error" role="alert">{errors.businessName}</p>}
      </Field>
      {scopeMissing && (<>
        <Field id="ps-site" label="Website or social profile (optional)" hint="We store the address you type. We do not read or import anything from it.">
          <input id="ps-site" value={draft.website} onChange={(e) => setField("website", e.target.value)} inputMode="url" autoComplete="url" placeholder="https://" />
          {errors.website && <p className="error" role="alert">{errors.website}</p>}
        </Field>
        <Field id="ps-challenge" label="What do you most want help with? (optional)">
          <textarea id="ps-challenge" rows={3} value={draft.challenge} onChange={(e) => setField("challenge", e.target.value)} />
          {errors.challenge && <p className="error" role="alert">{errors.challenge}</p>}
        </Field>
        <Truth>Pressing Create my workspace saves these details to your account.</Truth>
      </>)}
      {!scopeMissing && <Truth>Your workspace already exists. Changes to the name are saved only when you press Save on the Brand Brain step.</Truth>}
    </>);
  } else if (current.id === "about") {
    body = (<>
      {heading("What does your business do?")}
      <Field id="ps-industry" label="What kind of business is it? (optional)" hint="For example: vehicle leasing, aesthetics clinic, charity. Saved with your setup progress.">
        <input id="ps-industry" value={draft.industryText} onChange={(e) => setField("industryText", e.target.value)} maxLength={LIMITS.industryText + 20} />
      </Field>
      <Field id="ps-sector" label="Sector used for guidance">
        <select id="ps-sector" value={draft.sectorChoice} onChange={(e) => setField("sectorChoice", e.target.value)}>
          {sectorOptions().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>
      <p className="ps-sector-status" role="status">Sector: <strong>{SECTORS[sector.key].label}</strong> · {sectorLabel}</p>
      <Field id="ps-description" label="Describe what the business does" hint={identityLocked ? "Only the workspace owner can change the description of the business." : "Saved to your Brand Brain when you press Save. A website address alone is not a description."}>
        <textarea id="ps-description" rows={4} value={identityLocked ? storedDescription : draft.description} readOnly={identityLocked} onChange={(e) => setField("description", e.target.value)} aria-invalid={errors.description ? "true" : undefined} />
        {errors.description && <p className="error" role="alert">{errors.description}</p>}
      </Field>
      <Field id="ps-cta" label="What should a customer do next?" hint="For example: request a quote or book a consultation.">
        <textarea id="ps-cta" rows={2} value={draft.cta} onChange={(e) => setField("cta", e.target.value)} />
        {errors.cta && <p className="error" role="alert">{errors.cta}</p>}
      </Field>
    </>);
  } else if (current.id === "customers") {
    body = (<>
      {heading("Who do you serve, and what is your goal?")}
      <Field id="ps-audience" label="Who are your customers?" hint="Saved to your Brand Brain when you press Save.">
        <textarea id="ps-audience" rows={3} value={draft.audience} onChange={(e) => setField("audience", e.target.value)} />
        {errors.audience && <p className="error" role="alert">{errors.audience}</p>}
      </Field>
      <Field id="ps-goal" label="What do you want a campaign to achieve?" hint="Used for your first recommendation. It is saved only when you create a campaign.">
        <textarea id="ps-goal" rows={3} value={draft.goal} maxLength={LIMITS.goal + 50} onChange={(e) => setField("goal", e.target.value)} aria-invalid={errors.goal ? "true" : undefined} placeholder="e.g. Get more enquiries from small businesses" />
        {errors.goal && <p className="error" role="alert">{errors.goal}</p>}
      </Field>
    </>);
  } else if (current.id === "channels") {
    body = (<>
      {heading("Where would you like to reach customers?")}
      <p className="ps-lede">Pick the channels you are planning for. This helps you organise your plan; it does not connect an account.</p>
      <div className="ps-channels" role="group" aria-label="Channels you are planning for">
        {CHANNELS.map((name) => {
          const on = channels.has(name);
          return (<button key={name} type="button" className={`ps-channel${on ? " on" : ""}`} aria-pressed={on} onClick={() => toggleChannel(name)}>
            <span>{name}</span><small>{on ? "Planning for this" : "Not selected"} · Not connected</small>
          </button>);
        })}
      </div>
      <Truth>Planning only. Saved with your setup progress when you press Save progress or Save and exit. Connecting accounts is not available yet, and BizGenie never publishes without your approval.</Truth>
    </>);
  } else if (current.id === "brain") {
    body = (<>
      {heading("Your Brand Brain")}
      {brainState.status === "loading" && <p role="status">Loading your Brand Brain…</p>}
      {brainState.status === "error" && <p className="error" role="alert">{brainState.error || "Your Brand Brain could not be loaded yet."} Nothing has been changed.</p>}
      {brainReady && (<dl className="ps-facts" aria-label="Saved Brand Brain">
        <div><dt>Business name</dt><dd>{brainState.brain.name || "Not provided yet"}</dd></div>
        <div><dt>What it does</dt><dd>{isNotADescription(brainState.brain.identity?.description) && brainState.brain.identity?.description ? "Only a web address is stored here. That is not a description of what the business does." : brainState.brain.identity?.description || "Not provided yet"}</dd></div>
        <div><dt>Who it serves</dt><dd>{brainState.brain.audience?.summary || "Not provided yet"}</dd></div>
        <div><dt>Customer action</dt><dd>{brainState.brain.commercial?.primary_cta || "Not provided yet"}</dd></div>
        <div><dt>Status</dt><dd>{brainState.brain.metadata?.status || "Unknown"}</dd></div>
      </dl>)}
      {scopeMissing && <p className="ps-truth">Your Brand Brain is available once your workspace has been created on the Your business step.</p>}
      {identityLocked && <p className="ps-hint ps-readonly" role="status">Only the workspace owner can change the business name and description. You can still save who it serves and the customer action.</p>}
      <p className="ps-hint">What you typed on the earlier steps is not saved until you press Save below.</p>
      <button type="button" className="ps-primary" onClick={saveBrain} disabled={busy || !brainReady || nothingToSaveBrain} aria-describedby={brainReady && nothingToSaveBrain ? "ps-brain-nochange" : undefined}>{busy ? "Saving…" : identityLocked ? "Save who it serves and customer action" : "Save to Brand Brain"}</button>
      {brainReady && nothingToSaveBrain && !busy && <p className="ps-hint" id="ps-brain-nochange">Nothing new to save here. Change a detail on an earlier step to save it.</p>}
      {brainState.status === "error" && <button type="button" className="secondary" onClick={onLoadBrain}>Try loading again</button>}
      <section className="ps-confirm" aria-labelledby="ps-confirm-h">
        <h3 id="ps-confirm-h">Confirm your setup</h3>
        {onboarding && onboarding.status === "completed"
          ? <p className="ps-ok" role="status">You confirmed your setup. Reopen any step to change it.</p>
          : (<>
            <p className="ps-hint">Your setup counts as complete only when you confirm it, and only from details you have saved yourself. A website address or challenge given when the workspace was created does not count as a description.</p>
            {!readiness.ready && <ul className="ps-hint" aria-label="Still needed to confirm">{readiness.missing.map((m) => <li key={m}>{m}</li>)}</ul>}
            <button type="button" className="secondary" onClick={confirmSetup} disabled={busy || readOnly || !readiness.ready || !canSaveProgress || dirty} aria-describedby={dirty ? "ps-confirm-dirty" : undefined}>Confirm setup</button>
            {dirty && <p className="ps-hint" id="ps-confirm-dirty">Save your progress first so the confirmation matches what is saved.</p>}
          </>)}
      </section>
    </>);
  } else {
    const rec = recommendationState.recommendation;
    body = (<>
      {heading("Your first recommendation")}
      <p className="ps-lede">{draft.goal.trim() ? <>Goal you entered: <strong>{draft.goal.trim()}</strong></> : "Add a goal on the Customers and goal step to get a recommendation."}</p>
      <button type="button" className="ps-primary" onClick={recommend} disabled={busy || recommendationState.status === "loading" || !draft.goal.trim()}>{recommendationState.status === "loading" ? "Thinking…" : rec ? "Get a new recommendation" : "Get my recommendation"}</button>
      {errors.goal && <p className="error" role="alert">{errors.goal}</p>}
      {recommendationState.status === "error" && <p className="error" role="alert">{recommendationState.error}</p>}
      {rec && (<section className="ps-rec" aria-label="Recommendation from BizGenie" aria-live="polite">
        <p className="eyebrow">Suggested by BizGenie · review before anything is created</p>
        <h3>{rec.campaign_name}</h3>
        {rec.summary && <p><strong>Recommended approach:</strong> {rec.summary}</p>}
        {rec.explanation && <p>{rec.explanation}</p>}
        <ul className="ps-rec-items">{(rec.suggested_items || []).map((item) => <li key={item.name}><strong>{item.name}</strong> <span>{item.format} · {item.destination_label}</span></li>)}</ul>
        <p className="ps-truth">Nothing has been created, scheduled or published. Create the campaign in Campaign Studio when you are ready.</p>
        <button type="button" className="secondary" onClick={onOpenStudio}>Continue in Campaign Studio</button>
      </section>)}
    </>);
  }

  const last = stage === STAGES.length - 1;
  return (
    <section className="ps-onboarding" aria-label="Set up your workspace">
      <ol className="ps-progress" aria-label="Setup progress">
        {STAGES.map((s, i) => (<li key={s.id} aria-current={i === stage ? "step" : undefined} className={i < stage ? "done" : i === stage ? "current" : ""}><span className="ps-step-n">{i + 1}</span><span className="ps-step-l">{s.label}</span></li>))}
      </ol>
      <div className="ps-stage">
        {body}
        {message.text && (
          <div className={message.kind === "ok" ? "ps-ok" : message.kind === "unconfirmed" ? "ps-warn" : "error"} role={message.kind === "ok" ? "status" : "alert"} data-kind={message.kind}>
            <p>{message.text}</p>
            {message.kind === "unconfirmed" && <button type="button" className="secondary" onClick={message.recheck === "brain" ? onLoadBrain : onLoadOnboarding} disabled={busy}>Check what was saved</button>}
            {message.chooser && onChooseWorkspace && <button type="button" className="ps-primary" onClick={onChooseWorkspace}>Choose a workspace</button>}
            {message.kind === "incomplete" && (
              <ul className="ps-missing" aria-label="What is still needed">
                {message.missing.filter((path) => MISSING_GUIDANCE[path]).map((path) => (
                  <li key={path}><strong>{MISSING_GUIDANCE[path].label}.</strong> {MISSING_GUIDANCE[path].text}{onGoToStep && <> <button type="button" className="secondary" aria-label={`Go to the step for: ${MISSING_GUIDANCE[path].label}`} onClick={() => onGoToStep(MISSING_GUIDANCE[path].step)}>Go to this step</button></>}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {readOnly && !scopeMissing && (
          <p className="ps-hint ps-readonly" role="status">View only. Your role in this workspace is {roleLabel(membershipRole) || "not the owner"}. Only the workspace owner can save or confirm setup, so Save progress, Save and exit and Confirm setup are turned off for you. You can still read everything here.</p>
        )}
        {!scopeMissing && (storage === "unavailable" || storage === "error") && (
          <div className="ps-banner" role="alert">
            <p>{onboardingState.error || "Your saved setup could not be loaded."} {storage === "unavailable" ? "You can keep going, but your sector, channels and progress will not be remembered." : ""}</p>
            <button type="button" className="secondary" onClick={onLoadOnboarding}>Try again</button>
          </div>
        )}
        {canSaveProgress && !readOnly && <p className="ps-hint" role="status" aria-live="polite" data-testid="ps-save-state">{dirty ? "You have changes that are not saved yet." : onboarding && onboarding.version > 0 ? `Setup progress saved (version ${onboarding.version}).` : "Nothing saved yet."}</p>}
        {scopeMissing && stage > 0 && <p className="ps-hint">Save and exit becomes available after your workspace is created on the Your business step.</p>}
        <div className="ps-actions">
          {stage > 0 && <button type="button" className="secondary" onClick={back} disabled={busy}>Back</button>}
          {current.id === "identity" && scopeMissing
            ? <button type="button" className="ps-primary" onClick={createWorkspace} disabled={busy}>{busy ? "Creating your workspace…" : "Create my workspace"}</button>
            : !last && <button type="button" className="ps-primary" onClick={next} disabled={busy}>Continue</button>}
          {last && <button type="button" className="ps-primary" onClick={onFinish}>Go to my workspace</button>}
          {canSaveProgress && <button type="button" className="secondary" onClick={() => saveProgress({})} disabled={busy || readOnly}>Save progress</button>}
          {canSaveProgress && <button type="button" className="secondary" onClick={() => saveProgress({ exit: true })} disabled={busy || readOnly}>Save and exit</button>}
        </div>
      </div>
    </section>
  );
}
