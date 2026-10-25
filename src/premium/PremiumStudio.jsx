import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PremiumOnboarding, { STAGES } from "./PremiumOnboarding";
import PremiumWorkspace from "./PremiumWorkspace";
import PremiumWorkspaces from "./PremiumWorkspaces";
import PremiumBrandBrain from "./PremiumBrandBrain";
import PremiumWorkspaceCalendar from "./PremiumWorkspaceCalendar";
import { todayKey, windowFor } from "./workspaceCalendarModel";
import { brainFormValues, rebaseDraft } from "./brainClient";
import { buildWorkspaceModel } from "./workspaceModel";
import { buildSavePayload, formFromOnboarding, hasUnsavedChanges, isSeededDescription } from "./onboardingModel";

// Premium Studio container (BG-STUDIO-008-FE), rendered only when VITE_PREMIUM_STUDIO_ENABLED is "true".
//
// It owns navigation and the session-only draft. Every network call is delegated to App through props, so
// authentication, tenancy, idempotency, entitlements and the review flow keep their existing implementations.
// The parent mounts this with key={tenant:project:brand}, so switching account or workspace discards the draft.
//
// Where the first screen opens is decided from BACKEND data when it loads: the saved onboarding record (status,
// sector, channels, step, unsaved-answer draft) and the Brand Brain. Never from a local "completed" flag, and never
// from a bootstrap-seeded web address or challenge, so a refresh or a new sign-in always matches what is saved.

const VIEWS = [
  ["overview", "Overview"],
  ["onboarding", "Set up"],
  ["studio", "Campaign Studio"],
  ["calendar", "Calendar"],
  ["brand", "Brand"],
  ["account", "Plan and billing"],
  ["workspaces", "Workspaces"],
];

// "from 25 September 2026 to 23 January 2027 (the last 30 days and the next 90 days)"
const windowText = ({ from, to }) => {
  const f = new Date(from).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const t = new Date(to).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return `activity from ${f} to ${t} (the last 30 days and the next 90 days)`;
};

const EMPTY_DRAFT = { businessName: "", website: "", challenge: "", industryText: "", sectorChoice: "", description: "", audience: "", cta: "", goal: "" };

export default function PremiumStudio({ session, brainState, onLoadBrain, onSaveBrain, onBootstrap, membershipRole, readOnly = false, workspaceState, onLoadWorkspaces, onSelectWorkspace, sessionEnded = false, onSignOut, onboardingState, onLoadOnboarding, onSaveOnboarding, recommendationState, onRecommend, campaign, campaignList, onLoadCampaigns, calendarState, onLoadCalendar, workspaceCalendarState, onLoadWorkspaceCalendar, sections }) {
  const [view, setView] = useState(null); // null until the starting point has been decided
  const [stage, setStage] = useState(0);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [channels, setChannels] = useState(() => new Set());
  const [prefilled, setPrefilled] = useState(false);
  // What the Brand Brain form fields were last known to be stored as. Only fields that differ from this are "edits" and are sent on Save.
  const brainBaseline = useRef({ businessName: "", description: "", audience: "", cta: "" });
  const lastBrain = useRef(null);
  const getBrainBaseline = useCallback(() => brainBaseline.current, []);

  const ready = session.status === "ready";
  const scopeMissing = session.status === "scope-missing";

  // Load the Brand Brain once a fully scoped session exists.
  useEffect(() => { if (ready && brainState.status === "idle") onLoadBrain(); }, [ready, brainState.status, onLoadBrain]);
  // Load the real campaigns once, alongside the Brand Brain. A failure is shown, never hidden.
  useEffect(() => { if (ready && campaignList.status === "idle") onLoadCampaigns(); }, [ready, campaignList.status, onLoadCampaigns]);

  // Load the saved onboarding record alongside the Brand Brain. A failure is shown, never treated as "not started".
  useEffect(() => { if (ready && onboardingState.status === "idle") onLoadOnboarding(); }, [ready, onboardingState.status, onLoadOnboarding]);

  const onboardingSettled = onboardingState.status === "ready" || onboardingState.status === "error" || onboardingState.status === "unavailable";
  const brainSettled = brainState.status === "ready" || brainState.status === "error";

  // Restore the form once, from what the backend holds, without overwriting anything typed on this screen.
  // Priority per field: typed now > saved setup draft (answers typed but not yet saved to the Brand Brain) > Brand Brain.
  // A placeholder name and a bootstrap-seeded web-address "description" are never prefilled as the customer's words.
  useEffect(() => {
    if (prefilled || !ready || !brainSettled || !onboardingSettled) return;
    const saved = onboardingState.status === "ready" ? formFromOnboarding(onboardingState.onboarding) : formFromOnboarding(null);
    const b = brainState.status === "ready" ? brainState.brain : null;
    const placeholder = onboardingState.brandNamePlaceholder === true;
    brainBaseline.current = brainFormValues(b, { isSeededDescription, placeholderName: placeholder });
    lastBrain.current = b;
    const brainDescription = b && b.identity && b.identity.description && !isSeededDescription(b.identity.description) ? b.identity.description : "";
    setDraft((d) => ({
      ...d,
      businessName: d.businessName || saved.draft.businessName || (b && b.name && !placeholder ? b.name : ""),
      website: d.website || saved.draft.website || "",
      challenge: d.challenge || saved.draft.challenge || "",
      description: d.description || saved.draft.description || brainDescription,
      audience: d.audience || saved.draft.audience || (b && b.audience && b.audience.summary) || "",
      cta: d.cta || saved.draft.cta || (b && b.commercial && b.commercial.primary_cta) || "",
      goal: d.goal || saved.draft.goal || "",
      industryText: d.industryText || saved.industryText,
      sectorChoice: d.sectorChoice || saved.sectorChoice,
    }));
    setChannels((current) => (current.size ? current : new Set(saved.channels)));
    setPrefilled(true);
  }, [prefilled, ready, brainSettled, onboardingSettled, brainState, onboardingState]);

  // When the stored Brand Brain changes after the form was restored (reloaded, saved, re-read after a refusal or a conflict),
  // fields the customer has not touched follow the stored value, and fields they typed in stay as typed.
  useEffect(() => {
    if (!prefilled || brainState.status !== "ready" || !brainState.brain || lastBrain.current === brainState.brain) return;
    const next = brainFormValues(brainState.brain, { isSeededDescription, placeholderName: onboardingState.brandNamePlaceholder === true });
    setDraft((d) => rebaseDraft(d, brainBaseline.current, next));
    brainBaseline.current = next;
    lastBrain.current = brainState.brain;
  }, [prefilled, brainState.status, brainState.brain, onboardingState.brandNamePlaceholder]);

  const model = useMemo(() => buildWorkspaceModel({
    brain: brainState.brain,
    draft,
    goal: draft.goal,
    channels: [...channels],
    sectorChoice: draft.sectorChoice,
    campaign,
    campaigns: campaignList.campaigns,
    hasRecommendation: Boolean(recommendationState.recommendation),
    onboarding: onboardingState.onboarding,
    onboardingStatus: onboardingState.status,
    brandNamePlaceholder: onboardingState.brandNamePlaceholder,
  }), [brainState.brain, draft, channels, campaign, campaignList.campaigns, recommendationState.recommendation, onboardingState]);

  // The form as the contract sees it, and whether it differs from what is saved. Only meaningful once restored.
  const form = useMemo(() => ({ sectorChoice: draft.sectorChoice, industryText: draft.industryText, businessName: draft.businessName, description: draft.description, channels: [...channels], draft }), [draft, channels]);
  // A read-only member cannot save setup, so unsaved typing is not "unsaved work" for them (no warnings about it).
  const dirty = prefilled && !readOnly && onboardingState.status === "ready" && hasUnsavedChanges({ onboarding: onboardingState.onboarding, form, brain: brainState.brain });
  // Warn before a refresh or tab close throws away answers that are not saved.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Decide the starting view exactly once, from saved data only. Resume at the saved step when setup is unfinished.
  useEffect(() => {
    if (view !== null) return;
    if (scopeMissing) {
      // A customer with more than one workspace must choose; wait for the answer before deciding anything.
      if (workspaceState.status === "idle" || workspaceState.status === "loading") return;
      if (workspaceState.status === "ready" && (workspaceState.selectionRequired || workspaceState.notice)) { setView("workspaces"); return; }
      setView("onboarding"); setStage(0); return;
    }
    if (!ready || !prefilled) return;
    if (brainState.status === "error" || onboardingState.status !== "ready") { setView("overview"); return; }
    if (model.profile.complete) { setView("overview"); return; }
    const saved = onboardingState.onboarding;
    const resume = saved.status === "in_progress" && Number.isInteger(saved.current_step) && saved.current_step >= 0 && saved.current_step < STAGES.length ? saved.current_step : null;
    setView("onboarding");
    setStage(resume !== null ? resume : model.brand.source === "backend" ? 2 : 1);
  }, [view, scopeMissing, workspaceState.status, workspaceState.selectionRequired, workspaceState.notice, ready, prefilled, brainState.status, onboardingState.status, onboardingState.onboarding, model.profile.complete, model.brand.source]);

  // The customer must choose (discovered while creating a workspace): go to the chooser.
  useEffect(() => {
    if (scopeMissing && view === "onboarding" && workspaceState.status === "ready" && workspaceState.selectionRequired) setView("workspaces");
  }, [scopeMissing, view, workspaceState.status, workspaceState.selectionRequired]);

  // Save setup progress (and optionally confirm completion). Returns { ok, message, noop }.
  const saveProgress = useCallback(async ({ complete } = {}) => {
    if (readOnly) return { ok: false, message: "Your role cannot save or confirm setup. Only the workspace owner can. Nothing was saved." };
    if (onboardingState.status !== "ready") return { ok: false, message: "Saving your setup progress is not available right now. Nothing was saved." };
    const { body, errors, hasChanges } = buildSavePayload({ onboarding: onboardingState.onboarding, form, brain: brainState.brain, step: stage, complete });
    if (errors.length) return { ok: false, message: errors.join(" ") };
    if (!hasChanges) return { ok: true, noop: true };
    return onSaveOnboarding(body);
  }, [readOnly, onboardingState.status, onboardingState.onboarding, form, brainState.brain, stage, onSaveOnboarding]);

  const setField = useCallback((key, value) => setDraft((d) => ({ ...d, [key]: value })), []);
  const toggleChannel = useCallback((name) => setChannels((current) => { const next = new Set(current); if (next.has(name)) next.delete(name); else next.add(name); return next; }), []);
  const go = useCallback((target) => { if (target.view === "onboarding" && typeof target.stage === "number") setStage(target.stage); setView(target.view); if (typeof window !== "undefined") window.scrollTo(0, 0); }, []);

  // BG-STUDIO-017-FE (DEC-023): the calendar loads by itself when it is opened for a campaign. Only from "idle", so a failure is
  // never retried in a loop; "Refresh" is the customer's choice.
  const calendarIdle = calendarState.status === "idle";
  const [calScope, setCalScope] = useState("all"); // "all" campaigns (BG-STUDIO-018-FE) or "campaign": the open one
  const wcIdle = Boolean(workspaceCalendarState) && workspaceCalendarState.status === "idle";
  useEffect(() => { if (view === "calendar" && calScope === "campaign" && campaign && calendarIdle && onLoadCalendar) onLoadCalendar(); }, [view, calScope, campaign, calendarIdle, onLoadCalendar]);
  useEffect(() => { if (view === "calendar" && calScope === "all" && wcIdle && onLoadWorkspaceCalendar) onLoadWorkspaceCalendar(windowFor(todayKey())); }, [view, calScope, wcIdle, onLoadWorkspaceCalendar]);

  if (session.status === "loading") return <p className="ps-loading" role="status">Checking your account…</p>;
  if (!ready && !scopeMissing) return sections.auth;
  if (view === null) return <p className="ps-loading" role="status">Loading your workspace…</p>;

  const nav = ready ? (
    <nav className="ps-nav" aria-label="Workspace sections">
      {VIEWS.map(([id, label]) => <button key={id} type="button" aria-current={view === id ? "page" : undefined} className={view === id ? "on" : ""} onClick={() => go({ view: id })}>{label}</button>)}
    </nav>
  ) : null;

  let content = null;
  if (view === "onboarding") {
    content = (
      <PremiumOnboarding
        stage={stage} setStage={setStage} draft={draft} setField={setField} channels={channels} toggleChannel={toggleChannel}
        session={session} brainState={brainState} onLoadBrain={onLoadBrain} onSave={onSaveBrain} onBootstrap={onBootstrap}
        onboardingState={onboardingState} onLoadOnboarding={onLoadOnboarding} onSaveProgress={saveProgress} dirty={dirty} readOnly={readOnly} membershipRole={membershipRole} onGoToStep={setStage} onChooseWorkspace={() => go({ view: "workspaces" })} getBrainBaseline={getBrainBaseline}
        recommendationState={recommendationState} onRecommend={onRecommend}
        onFinish={() => go({ view: "overview" })} onOpenStudio={() => go({ view: "studio" })}
      />
    );
  } else if (view === "overview") {
    content = <PremiumWorkspace model={model} brainState={brainState} campaignList={campaignList} onGo={go} onRetryBrain={onLoadBrain} onRetryCampaigns={onLoadCampaigns} calendarState={calendarState} onboardingState={onboardingState} onRetryOnboarding={onLoadOnboarding} />;
  } else if (view === "studio") {
    content = (sections.recommendation || sections.campaign) ? (<>{sections.recommendation}{sections.campaign}</>) : (
      <section className="ps-empty" aria-label="Campaign Studio">
        <h2>Campaign Studio</h2>
        <p>There is no campaign yet. Get a recommendation first, then create the campaign here. Nothing is created, scheduled or published until you choose.</p>
        <button type="button" className="ps-primary" onClick={() => go({ view: "onboarding", stage: draft.goal.trim() ? STAGES.length - 1 : 3 })}>{draft.goal.trim() ? "Get my recommendation" : "Tell us your goal"}</button>
      </section>
    );
  } else if (view === "calendar") {
    const campaignCalendar = (
      <section className="ps-empty" aria-label="Campaign calendar">
        <h2>Calendar · this campaign</h2>
        {!campaign ? <p>Create a campaign to see its calendar. Only activity recorded for a real campaign appears here.</p> : (<>
          <p>Scheduled and published activity recorded for <strong>{campaign.name}</strong> only. A calendar across all your campaigns is not available yet.</p>
          {calendarState.status === "loading" && <p role="status">Loading this campaign's calendar…</p>}
          {calendarState.status === "ready" && (<>
            {calendarState.window && <p className="ps-hint">Showing {windowText(calendarState.window)}.</p>}
            {calendarState.entries.length === 0
              ? <p>No scheduled or published activity is recorded for this campaign in this period.</p>
              : <ul>{calendarState.entries.map((e) => <li key={`${e.variant_id}:${e.occurrence_at}`}><strong>{e.workflow === "published" ? "Published" : "Scheduled"}</strong>{" — "}{new Date(e.occurrence_at).toLocaleString()}</li>)}</ul>}
          </>)}
          {calendarState.status === "error" && <p className="error" role="alert">{calendarState.error}</p>}
          {(calendarState.status === "ready" || calendarState.status === "error") && <button type="button" className="secondary" onClick={onLoadCalendar}>{calendarState.status === "error" ? "Try again" : "Refresh"}</button>}
        </>)}
      </section>
    );
    content = (
      <div className="ps-wcal-wrap">
        <div role="group" aria-label="Calendar scope" className="ps-wcal-views">
          <button type="button" className={calScope === "all" ? "on" : ""} aria-pressed={calScope === "all"} onClick={() => setCalScope("all")}>All campaigns</button>
          <button type="button" className={calScope === "campaign" ? "on" : ""} aria-pressed={calScope === "campaign"} onClick={() => setCalScope("campaign")}>This campaign{campaign ? `: ${campaign.name}` : ""}</button>
        </div>
        {calScope === "all" ? <PremiumWorkspaceCalendar state={workspaceCalendarState} onLoad={onLoadWorkspaceCalendar} /> : campaignCalendar}
      </div>
    );
  } else if (view === "workspaces") {
    content = <PremiumWorkspaces session={session} workspaceState={workspaceState} onLoad={onLoadWorkspaces} onSelect={onSelectWorkspace} unsavedAnswers={dirty} required={scopeMissing} />;
  } else if (view === "brand") {
    content = <PremiumBrandBrain brainState={brainState} onLoadBrain={onLoadBrain} onSave={onSaveBrain} draft={draft} setField={setField} getBrainBaseline={getBrainBaseline} readOnly={readOnly} membershipRole={membershipRole} onChooseWorkspace={() => go({ view: "workspaces" })} />;
  } else if (view === "account") {
    content = sections.account;
  }

  return (
    <div className="ps-shell">
      {nav}
      {sessionEnded && onSignOut && (
        <div className="ps-banner" role="status">
          <p><strong>Your session has ended.</strong> Sign in again to continue. Answers you have typed but not saved on this screen may be lost when you do.</p>
          <button type="button" className="ps-primary" onClick={onSignOut}>Sign in again</button>
        </div>
      )}
      <div className="ps-content">{content}</div>
    </div>
  );
}
