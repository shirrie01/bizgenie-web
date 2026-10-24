import React from "react";
import ProvenanceLegend from "./ProvenanceLegend";

// Production workspace overview (BG-STUDIO-008-FE). Everything shown is real or plainly labelled:
// the business and profile come from the Brand Brain, the campaign from the real campaign, and anything the
// customer typed this session says so. There are no invented metrics, posts, results or creative.

const PILL = { backend: "Saved", customer: "This session", inferred: "Inferred", missing: "Missing", seeded: "Web address only", saved_customer: "Saved · you chose", saved_inferred: "Saved · inferred" };
// Say a failure once: a thrown message that already states it is not appended to the headline.
const extra = (message, headline) => (message && !message.toLowerCase().includes(headline.toLowerCase().replace(/\.$/, "").slice(-22)) ? message : "");

function Tile({ label, value, detail, tone }) {
  return (<div className={`ps-tile${tone ? ` ${tone}` : ""}`}><small>{label}</small><strong>{value}</strong>{detail && <span>{detail}</span>}</div>);
}

export default function PremiumWorkspace({ model, brainState, campaignList, onGo, onRetryBrain, onRetryCampaigns, calendarState, onboardingState, onRetryOnboarding }) {
  const { campaign } = model;
  const brainFailed = brainState.status === "error";
  const brainLoading = brainState.status === "loading" || brainState.status === "idle";
  const reviewCount = campaign ? campaign.counts.review : 0;
  const onboardingFailed = onboardingState && (onboardingState.status === "error" || onboardingState.status === "unavailable");
  // The API says this account can no longer use the workspace: one clear message and the chooser, not a stack of "try again" banners.
  const workspaceGone = brainState.errorCode === "WORKSPACE_NOT_AUTHORIZED" || Boolean(onboardingState && onboardingState.errorCode === "WORKSPACE_NOT_AUTHORIZED");

  return (
    <div className="ps-workspace" style={{ "--ps-accent": model.sector.accent }}>
      <header className="ps-header">
        <div className="ps-avatar" aria-hidden="true">{model.brand.initial}</div>
        <div className="ps-header-text">
          <p className="eyebrow">Your workspace</p>
          <h2>{model.title}</h2>
          {!brainFailed && (
            <p className="ps-sub">
              <span className="ps-chip">{model.sector.label}</span>
              <span className="ps-chip-note">{model.sector.source === "missing" ? "Neutral layout. Choose a sector in Set up if one fits." : model.sector.sourceLabel}</span>
            </p>
          )}
          {model.goal.value && <p className="ps-goal"><strong>Goal:</strong> {model.goal.value} <span className="ps-chip-note">(entered this session)</span></p>}
        </div>
      </header>

      {workspaceGone && (
        <div className="ps-banner" role="alert">
          <p><strong>This workspace is not available to your account right now.</strong> Nothing from it is shown as saved or missing. Choose a workspace to continue.</p>
          <button type="button" className="ps-primary" onClick={() => onGo({ view: "workspaces" })}>Choose a workspace</button>
        </div>
      )}
      {brainFailed && !workspaceGone && (
        <div className="ps-banner" role="alert">
          <p><strong>Your Brand Brain could not be loaded.</strong> {extra(brainState.error, "could not be loaded")} Nothing is shown as saved until it loads.</p>
          {brainState.errorCode === "WORKSPACE_NOT_AUTHORIZED"
            ? <button type="button" className="ps-primary" onClick={() => onGo({ view: "workspaces" })}>Choose a workspace</button>
            : <button type="button" className="secondary" onClick={onRetryBrain}>Try again</button>}
        </div>
      )}
      {onboardingFailed && !workspaceGone && (
        <div className="ps-banner" role="alert">
          <p><strong>Your saved setup could not be loaded.</strong> {onboardingState.error} Setup is not shown as complete or incomplete until it loads.</p>
          {onboardingState.errorCode === "WORKSPACE_NOT_AUTHORIZED"
            ? <button type="button" className="ps-primary" onClick={() => onGo({ view: "workspaces" })}>Choose a workspace</button>
            : <button type="button" className="secondary" onClick={onRetryOnboarding}>Try again</button>}
        </div>
      )}
      {brainLoading && <p className="ps-loading" role="status">Loading your workspace…</p>}

      <section className="ps-tiles" aria-label="Status">
        <Tile label="Business profile" value={model.profile.complete ? "Complete" : brainFailed || model.profile.unknown ? "Unavailable" : "Needs your input"} detail={model.profile.complete ? (model.profile.missingDetails ? `Setup confirmed by you. ${model.profile.missingDetails} detail${model.profile.missingDetails === 1 ? " is" : "s are"} still not provided.` : "Confirmed by you and saved") : brainFailed ? "Shown once your Brand Brain loads" : model.profile.unknown ? "Shown once your saved setup loads" : "Finish setup and confirm it"} tone={model.profile.complete ? "ok" : "todo"} />
        <Tile label="Campaign" value={campaign ? campaign.name || "Saved" : "None yet"} detail={campaign ? `${campaign.total} item${campaign.total === 1 ? "" : "s"} saved` : "Nothing created or published"} />
        <Tile label="Creative review" value={campaign ? (reviewCount ? `${reviewCount} waiting` : "Nothing waiting") : "—"} detail="Approval never publishes" />
        <Tile label="Publishing" value="Manual only" detail="BizGenie records what you confirm" />
      </section>

      {campaignList && campaignList.status === "error" && !workspaceGone && (
        <div className="ps-banner" role="alert">
          <p><strong>Your campaigns could not be loaded.</strong> {extra(campaignList.error, "could not be loaded")} Nothing is shown as saved until they load.</p>
          <button type="button" className="secondary" onClick={onRetryCampaigns}>Try again</button>
        </div>
      )}

      {!brainFailed && (<section className="ps-actions-panel" aria-labelledby="ps-next-h">
        <h3 id="ps-next-h">Recommended next steps</h3>
        {model.nextActions.length === 0 ? <p className="ps-muted">You are up to date. Nothing is waiting on you.</p> : (
          <ul className="ps-next">
            {model.nextActions.map((a) => (
              <li key={a.id}><button type="button" onClick={() => onGo(a.target)}><strong>{a.title}</strong><span>{a.detail}</span></button></li>
            ))}
          </ul>
        )}
      </section>)}

      <div className="ps-two">
        <section aria-labelledby="ps-guide-h" className="ps-card">
          <h3 id="ps-guide-h">Where to focus · {model.guidance.sectorLabel}</h3>
          <ol className="ps-angles">
            {model.guidance.angles.map((a) => <li key={a.stage}><strong>{a.stage}</strong><span>{a.text}</span></li>)}
          </ol>
          <p className="ps-muted">{model.guidance.note}</p>
        </section>

        <section aria-labelledby="ps-inputs-h" className="ps-card">
          <h3 id="ps-inputs-h">What BizGenie knows</h3>
          {brainFailed ? <p className="ps-muted">Your saved details are shown once your Brand Brain loads. They are not missing; they are unavailable right now.</p> : (
            <dl className="ps-facts">
              {model.profile.rows.map((r) => (
                <div key={r.key}>
                  <dt>{r.label}</dt>
                  <dd><span>{r.value || "Not provided yet"}</span> <em className={`ps-src ${r.source}`}>{PILL[r.source]}</em>{r.note && <small>{r.note}</small>}</dd>
                </div>
              ))}
            </dl>
          )}
          {!brainFailed && <ProvenanceLegend />}
          <button type="button" className="secondary" onClick={() => onGo({ view: "onboarding", stage: 1 })}>Edit these details</button>
        </section>
      </div>

      <section className="ps-card ps-campaigns" aria-labelledby="ps-campaigns-h">
        <h3 id="ps-campaigns-h">Your campaigns</h3>
        {campaignList && campaignList.status === "ready" && model.campaigns.length === 0 && <p className="ps-muted">You have no campaigns yet. Nothing has been created, scheduled or published.</p>}
        {model.campaigns.length > 0 && (
          <ul className="ps-camp-list">
            {model.campaigns.map((c) => (
              <li key={c.id}><strong>{c.name}</strong>{c.status && <em className="ps-src backend">{c.status}</em>}{c.updatedAt && <small>Updated {new Date(c.updatedAt).toLocaleDateString()}</small>}</li>
            ))}
          </ul>
        )}
        {model.campaigns.length > 0 && <button type="button" className="secondary" onClick={() => onGo({ view: "studio" })}>Open Campaign Studio</button>}
      </section>

      <section className="ps-card" aria-labelledby="ps-results-h">
        <h3 id="ps-results-h">Results</h3>
        <p className="ps-muted">{model.analytics.text}</p>
        {calendarState && calendarState.status === "ready" && <p className="ps-muted">{calendarState.entries.length} scheduled or published item{calendarState.entries.length === 1 ? "" : "s"} recorded for this campaign in the current window.</p>}
      </section>
    </div>
  );
}
