import React, { useCallback, useEffect, useMemo, useState } from "react";
import PremiumOnboarding, { STAGES } from "./PremiumOnboarding";
import PremiumWorkspace from "./PremiumWorkspace";
import { buildWorkspaceModel } from "./workspaceModel";

// Premium Studio container (BG-STUDIO-008-FE), rendered only when VITE_PREMIUM_STUDIO_ENABLED is "true".
//
// It owns navigation and the session-only draft. Every network call is delegated to App through props, so
// authentication, tenancy, idempotency, entitlements and the review flow keep their existing implementations.
// The parent mounts this with key={tenant:project:brand}, so switching account or workspace discards the draft.
//
// Where the first screen opens is decided from BACKEND data when it loads (a real business name and description
// in the Brand Brain), never from a local "completed" flag, so a refresh is always consistent with what is saved.

const VIEWS = [
  ["overview", "Overview"],
  ["onboarding", "Set up"],
  ["studio", "Campaign Studio"],
  ["calendar", "Calendar"],
  ["brand", "Brand"],
  ["account", "Plan and billing"],
];

const EMPTY_DRAFT = { businessName: "", website: "", challenge: "", industryText: "", sectorChoice: "", description: "", audience: "", cta: "", goal: "" };

export default function PremiumStudio({ session, brainState, onLoadBrain, onSaveBrain, onBootstrap, recommendationState, onRecommend, campaign, campaignList, onLoadCampaigns, calendarState, onLoadCalendar, sections }) {
  const [view, setView] = useState(null); // null until the starting point has been decided
  const [stage, setStage] = useState(0);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [channels, setChannels] = useState(() => new Set());
  const [prefilled, setPrefilled] = useState(false);

  const ready = session.status === "ready";
  const scopeMissing = session.status === "scope-missing";

  // Load the Brand Brain once a fully scoped session exists.
  useEffect(() => { if (ready && brainState.status === "idle") onLoadBrain(); }, [ready, brainState.status, onLoadBrain]);
  // Load the real campaigns once, alongside the Brand Brain. A failure is shown, never hidden.
  useEffect(() => { if (ready && campaignList.status === "idle") onLoadCampaigns(); }, [ready, campaignList.status, onLoadCampaigns]);

  // Prefill empty draft fields from what the backend holds, once, without overwriting anything the customer typed.
  useEffect(() => {
    if (prefilled || brainState.status !== "ready" || !brainState.brain) return;
    const b = brainState.brain;
    setDraft((d) => ({
      ...d,
      businessName: d.businessName || (b.name && b.name !== "Customer Campaign Workspace" ? b.name : ""),
      description: d.description || b.identity?.description || "",
      audience: d.audience || b.audience?.summary || "",
      cta: d.cta || b.commercial?.primary_cta || "",
    }));
    setPrefilled(true);
  }, [brainState, prefilled]);

  const model = useMemo(() => buildWorkspaceModel({
    brain: brainState.brain,
    draft,
    goal: draft.goal,
    channels: [...channels],
    sectorChoice: draft.sectorChoice,
    campaign,
    campaigns: campaignList.campaigns,
    hasRecommendation: Boolean(recommendationState.recommendation),
  }), [brainState.brain, draft, channels, campaign, campaignList.campaigns, recommendationState.recommendation]);

  // Decide the starting view exactly once.
  useEffect(() => {
    if (view !== null) return;
    if (scopeMissing) { setView("onboarding"); setStage(0); return; }
    if (!ready) return;
    if (brainState.status === "ready") {
      if (model.profile.complete) setView("overview");
      else { setView("onboarding"); setStage(model.brand.source === "backend" ? 2 : 1); }
    } else if (brainState.status === "error") setView("overview");
  }, [view, scopeMissing, ready, brainState.status, model.profile.complete, model.brand.source]);

  const setField = useCallback((key, value) => setDraft((d) => ({ ...d, [key]: value })), []);
  const toggleChannel = useCallback((name) => setChannels((current) => { const next = new Set(current); if (next.has(name)) next.delete(name); else next.add(name); return next; }), []);
  const go = useCallback((target) => { if (target.view === "onboarding" && typeof target.stage === "number") setStage(target.stage); setView(target.view); if (typeof window !== "undefined") window.scrollTo(0, 0); }, []);

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
        recommendationState={recommendationState} onRecommend={onRecommend}
        onFinish={() => go({ view: "overview" })} onOpenStudio={() => go({ view: "studio" })}
      />
    );
  } else if (view === "overview") {
    content = <PremiumWorkspace model={model} brainState={brainState} campaignList={campaignList} onGo={go} onRetryBrain={onLoadBrain} onRetryCampaigns={onLoadCampaigns} calendarState={calendarState} />;
  } else if (view === "studio") {
    content = (sections.recommendation || sections.campaign) ? (<>{sections.recommendation}{sections.campaign}</>) : (
      <section className="ps-empty" aria-label="Campaign Studio">
        <h2>Campaign Studio</h2>
        <p>There is no campaign yet. Get a recommendation first, then create the campaign here. Nothing is created, scheduled or published until you choose.</p>
        <button type="button" className="ps-primary" onClick={() => go({ view: "onboarding", stage: draft.goal.trim() ? STAGES.length - 1 : 3 })}>{draft.goal.trim() ? "Get my recommendation" : "Tell us your goal"}</button>
      </section>
    );
  } else if (view === "calendar") {
    content = (
      <section className="ps-empty" aria-label="Campaign calendar">
        <h2>Calendar</h2>
        {!campaign ? <p>Create a campaign to see its calendar. Only activity recorded for a real campaign appears here.</p> : (<>
          <p>Scheduled and published activity recorded for <strong>{campaign.name}</strong>.</p>
          <button type="button" className="secondary" onClick={onLoadCalendar} disabled={calendarState.status === "loading"}>{calendarState.status === "loading" ? "Loading calendar…" : "Load campaign calendar"}</button>
          {calendarState.status === "ready" && (calendarState.entries.length === 0
            ? <p>No scheduled or published activity is recorded for this campaign in this window.</p>
            : <ul>{calendarState.entries.map((e) => <li key={`${e.variant_id}:${e.occurrence_at}`}><strong>{e.workflow === "published" ? "Published" : "Scheduled"}</strong>{" — "}{new Date(e.occurrence_at).toLocaleString()}</li>)}</ul>)}
          {calendarState.status === "error" && <p className="error" role="alert">{calendarState.error}</p>}
        </>)}
      </section>
    );
  } else if (view === "brand") {
    content = sections.brand;
  } else if (view === "account") {
    content = sections.account;
  }

  return (
    <div className="ps-shell">
      {nav}
      <div className="ps-content">{content}</div>
    </div>
  );
}
