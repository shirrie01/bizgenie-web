import React, { useEffect, useRef, useState } from "react";
import { SECTORS, resolveSector, sectorOptions } from "./sectors";
import { SOURCE_LABEL } from "./workspaceModel";

// Production onboarding (BG-STUDIO-008-FE). Each step says exactly what it saves and where:
//  - Business identity: created through POST /customer/workspace/bootstrap (only when no workspace exists yet).
//  - Business description, customers and customer action: saved to the Brand Brain through the existing
//    PUT /customer/workspace/brand-brain, and only when the customer presses Save.
//  - Goal: used for the recommendation request; it is saved only when a campaign is created.
//  - Sector and channels: kept in this browser session only. The backend has no field for them.
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

export const CHANNELS = ["Instagram", "TikTok", "Facebook", "LinkedIn", "Email", "Website"];
const LIMITS = { businessName: 200, website: 500, challenge: 1000, description: 2000, audience: 2000, cta: 2000, goal: 2000, industryText: 200 };

const over = (value, key) => String(value || "").trim().length > LIMITS[key];
const tooLong = (key, label) => `${label} must be ${LIMITS[key]} characters or fewer.`;

function Field({ id, label, hint, children }) {
  return (<div className="ps-field"><label htmlFor={id}>{label}</label>{children}{hint && <p className="ps-hint" id={`${id}-hint`}>{hint}</p>}</div>);
}

function Truth({ children }) { return <p className="ps-truth">{children}</p>; }

export default function PremiumOnboarding({ stage, setStage, draft, setField, channels, toggleChannel, session, brainState, onLoadBrain, onSave, onBootstrap, onRecommend, recommendationState, onFinish, onOpenStudio }) {
  const headingRef = useRef(null);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ kind: "", text: "" });
  const [errors, setErrors] = useState({});

  // Move focus to the step heading on every step change so keyboard and screen-reader users land in context.
  useEffect(() => { setMessage({ kind: "", text: "" }); setErrors({}); if (headingRef.current) headingRef.current.focus(); }, [stage]);

  const sector = resolveSector({ choice: draft.sectorChoice, texts: [draft.industryText, draft.businessName, draft.description] });
  const scopeMissing = session.status === "scope-missing";
  const brainReady = brainState.status === "ready" && brainState.brain;

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
    if (!validate([["businessName", "Business name"], ["description", "Description"], ["audience", "Who it serves"], ["cta", "Customer action"]])) return;
    const fields = {};
    if (draft.businessName.trim()) fields.name = draft.businessName.trim();
    if (draft.description.trim()) fields.description = draft.description.trim();
    if (draft.audience.trim()) fields.audience = draft.audience.trim();
    if (draft.cta.trim()) fields.cta = draft.cta.trim();
    if (!Object.keys(fields).length) { setMessage({ kind: "error", text: "There is nothing to save yet. Add a description, who it serves or a customer action first." }); return; }
    await guarded(async () => {
      const result = await onSave(fields);
      setMessage(result.ok ? { kind: "ok", text: "Saved to your Brand Brain. It is a draft until it is approved." } : { kind: "error", text: result.message });
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
        <div><h3>Saved to your account</h3><ul><li>Your business name, and a website or challenge if you add them.</li><li>What your business does, who it serves and what customers should do next, when you press Save.</li></ul></div>
        <div><h3>Kept in this session only</h3><ul><li>Your sector and the channels you plan for.</li><li>Your goal, until you create a campaign from it.</li></ul></div>
      </div>
      <Truth>Nothing is published, scheduled or connected by setting up. You approve everything before it goes anywhere.</Truth>
    </>);
  } else if (current.id === "identity") {
    body = (<>
      {heading("Tell us about your business")}
      <Field id="ps-name" label="Business name" hint={scopeMissing ? "Required. This creates your workspace." : "Shown across your workspace. Saved with your Brand Brain on the Brand Brain step."}>
        <input id="ps-name" value={draft.businessName} maxLength={LIMITS.businessName + 20} onChange={(e) => setField("businessName", e.target.value)} aria-invalid={errors.businessName ? "true" : undefined} aria-describedby={errors.businessName ? "ps-name-error" : "ps-name-hint"} autoComplete="organization" />
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
      <Field id="ps-industry" label="What kind of business is it? (optional)" hint="For example: vehicle leasing, aesthetics clinic, charity. Kept in this session only.">
        <input id="ps-industry" value={draft.industryText} onChange={(e) => setField("industryText", e.target.value)} maxLength={LIMITS.industryText + 20} />
      </Field>
      <Field id="ps-sector" label="Sector used for guidance">
        <select id="ps-sector" value={draft.sectorChoice} onChange={(e) => setField("sectorChoice", e.target.value)}>
          {sectorOptions().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>
      <p className="ps-sector-status" role="status">Sector: <strong>{SECTORS[sector.key].label}</strong> · {sector.source === "chosen" ? SOURCE_LABEL.customer : sector.source === "inferred" ? SOURCE_LABEL.inferred : "Not identified. A neutral layout is used."}</p>
      <Field id="ps-description" label="Describe what the business does" hint="Saved to your Brand Brain when you press Save. A website address alone is not a description.">
        <textarea id="ps-description" rows={4} value={draft.description} onChange={(e) => setField("description", e.target.value)} aria-invalid={errors.description ? "true" : undefined} />
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
      <Truth>Planning only, kept in this session. Connecting accounts is not available yet, and BizGenie never publishes without your approval.</Truth>
    </>);
  } else if (current.id === "brain") {
    body = (<>
      {heading("Your Brand Brain")}
      {brainState.status === "loading" && <p role="status">Loading your Brand Brain…</p>}
      {brainState.status === "error" && <p className="error" role="alert">{brainState.error || "Your Brand Brain could not be loaded yet."} Nothing has been changed.</p>}
      {brainReady && (<dl className="ps-facts" aria-label="Saved Brand Brain">
        <div><dt>Business name</dt><dd>{brainState.brain.name || "Not provided yet"}</dd></div>
        <div><dt>What it does</dt><dd>{brainState.brain.identity?.description || "Not provided yet"}</dd></div>
        <div><dt>Who it serves</dt><dd>{brainState.brain.audience?.summary || "Not provided yet"}</dd></div>
        <div><dt>Customer action</dt><dd>{brainState.brain.commercial?.primary_cta || "Not provided yet"}</dd></div>
        <div><dt>Status</dt><dd>{brainState.brain.metadata?.status || "Unknown"}</dd></div>
      </dl>)}
      {scopeMissing && <p className="ps-truth">Your Brand Brain is available once your workspace has been created on the Your business step.</p>}
      <p className="ps-hint">What you typed on the earlier steps is not saved until you press Save below.</p>
      <button type="button" className="ps-primary" onClick={saveBrain} disabled={busy || !brainReady}>{busy ? "Saving…" : "Save to Brand Brain"}</button>
      {brainState.status === "error" && <button type="button" className="secondary" onClick={onLoadBrain}>Try loading again</button>}
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
        {message.text && <p className={message.kind === "ok" ? "ps-ok" : "error"} role={message.kind === "ok" ? "status" : "alert"}>{message.text}</p>}
        <div className="ps-actions">
          {stage > 0 && <button type="button" className="secondary" onClick={back} disabled={busy}>Back</button>}
          {current.id === "identity" && scopeMissing
            ? <button type="button" className="ps-primary" onClick={createWorkspace} disabled={busy}>{busy ? "Creating your workspace…" : "Create my workspace"}</button>
            : !last && <button type="button" className="ps-primary" onClick={next} disabled={busy}>Continue</button>}
          {last && <button type="button" className="ps-primary" onClick={onFinish}>Go to my workspace</button>}
        </div>
      </div>
    </section>
  );
}
