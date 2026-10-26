import React, { useMemo, useState } from "react";
import { VIEWS, dayKey, dayLabel, dowShort, filterItems, findClashes, groupByDay, platformLabel, platformOptions, rangeFor, rangeTitle, statusLabel, statusOptions, stepAnchor, timeLabel, todayKey, undated, viewerTimeZone, windowCovers, windowFor, windowText } from "./workspaceCalendarModel";

// Workspace-wide calendar (BG-STUDIO-018-FE, DEC-025). Shows ONLY what the campaign APIs return. It does not schedule or publish
// anything. Its data is assembled from the most recently updated campaigns (see workspaceCalendarClient.js) and says so.
const VIEW_LABEL = { month: "Month", week: "Week", day: "Day" };

function Entry({ item, tz, clash, showDay, onOpen }) {
  return (
    <li className={`ps-wcal-entry st-${item.workflow || "unknown"}`}>
      {item.occurrenceAt && <strong>{showDay ? `${dayLabel(dayKey(item.occurrenceAt, tz), false)}, ` : ""}{timeLabel(item.occurrenceAt, tz)}</strong>}
      <span className="ps-wcal-what">{item.contentName}</span>
      <span className="ps-wcal-meta">{item.campaignName} · {platformLabel(item)}</span>
      <span className="ps-wcal-status">{statusLabel(item.workflow)}</span>
      {clash && <span className="ps-wcal-clash">Possible clash: another scheduled item has the same destination and time.</span>}
      {onOpen && <button type="button" className="secondary ps-wcal-open" onClick={() => onOpen(item.campaignId)} aria-label={`Open campaign ${item.campaignName}: ${item.contentName}`}>Open campaign</button>}
    </li>
  );
}

export default function PremiumWorkspaceCalendar({ state, onLoad, onOpenCampaign, tz = viewerTimeZone(), now = new Date() }) {
  const [view, setView] = useState("month");
  const [anchor, setAnchor] = useState(() => todayKey(now, tz));
  const [filters, setFilters] = useState({ campaignId: "", platform: "", status: "" });
  const days = useMemo(() => rangeFor(view, anchor), [view, anchor]);
  const all = state.items || [];
  const shown = useMemo(() => filterItems(all, filters), [all, filters]);
  const byDay = useMemo(() => groupByDay(shown, tz), [shown, tz]);
  const clashes = useMemo(() => findClashes(shown), [shown]);
  const notScheduled = useMemo(() => undated(shown), [shown]);
  const campaigns = useMemo(() => [...new Map(all.map((i) => [i.campaignId, i.campaignName])).entries()], [all]);
  const today = todayKey(now, tz);
  const ready = state.status === "ready";
  const covered = ready && windowCovers(state.window, days);
  const inView = days.reduce((n, k) => n + (byDay.get(k) || []).length, 0);
  const set = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));

  const go = (dir) => setAnchor((a) => stepAnchor(view, a, dir));
  const cell = (key) => {
    const list = byDay.get(key) || [];
    return (
      <td key={key} className={`${key === today ? "is-today " : ""}${view === "month" && key.slice(0, 7) !== anchor.slice(0, 7) ? "is-outside " : ""}${list.length ? "has-items" : ""}`}>
        <span className="ps-wcal-date"><span className="ps-wcal-dow" aria-hidden="true">{dowShort(key)} </span><time dateTime={key}>{Number(key.slice(8))}</time><span className="visually-hidden"> {dayLabel(key)}{key === today ? ", today" : ""}</span></span>
        {list.length > 0 && <ul>{list.map((item) => <Entry key={item.key} item={item} tz={tz} clash={clashes.has(item.key)} onOpen={onOpenCampaign} />)}</ul>}
      </td>
    );
  };

  return (
    <section className="ps-wcal" aria-labelledby="ps-wcal-h">
      <h2 id="ps-wcal-h">Calendar · all campaigns</h2>
      <p className="ps-hint">{state.source === "api" ? "Scheduled and published activity from all your campaigns." : "Scheduled and published activity from your campaigns, most recently updated first."} BizGenie records schedules and what you confirm; it does not publish for you. Times are shown in {tz}, with clock changes applied.</p>

      <div className="ps-wcal-bar">
        <div role="group" aria-label="Calendar view" className="ps-wcal-views">
          {VIEWS.map((v) => <button key={v} type="button" className={view === v ? "on" : ""} aria-pressed={view === v} onClick={() => setView(v)}>{VIEW_LABEL[v]}</button>)}
        </div>
        <div role="group" aria-label="Move through the calendar" className="ps-wcal-nav">
          <button type="button" onClick={() => go(-1)} aria-label={`Previous ${view}`}>Previous</button>
          <button type="button" onClick={() => setAnchor(today)}>Today</button>
          <button type="button" onClick={() => go(1)} aria-label={`Next ${view}`}>Next</button>
        </div>
        <button type="button" className="secondary" onClick={() => onLoad(state.window || windowFor(anchor))} disabled={state.status === "loading"}>{state.status === "loading" ? "Refreshing…" : "Refresh"}</button>
      </div>

      {ready && all.length > 0 && (
        <div className="ps-wcal-filters" role="group" aria-label="Filter the calendar">
          <label>Campaign<select value={filters.campaignId} onChange={set("campaignId")}><option value="">All campaigns</option>{campaigns.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
          <label>Channel<select value={filters.platform} onChange={set("platform")}><option value="">All channels</option>{platformOptions(all).map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
          <label>Status<select value={filters.status} onChange={set("status")}><option value="">All statuses</option>{statusOptions(all).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
        </div>
      )}

      {state.status === "loading" && <p role="status">Loading your campaigns' calendars…</p>}
      {state.status === "error" && <p className="error" role="alert">{state.error} <button type="button" className="secondary" onClick={() => onLoad(state.window || windowFor(anchor))}>Try again</button></p>}

      {ready && (
        <>
          <p className="ps-hint" role="status">
            Read {state.campaignsRead} of {state.campaignsTotal} {state.campaignsTotal === 1 ? "campaign" : "campaigns"} for {windowText(state.window, tz)}.
            {state.truncated && ` ${state.campaignsTotal - state.campaignsChosen} more ${state.campaignsTotal - state.campaignsChosen === 1 ? "campaign has" : "campaigns have"} not been read yet.`}
          </p>
          {state.nextOffset != null && <p><button type="button" className="secondary" onClick={() => onLoad(state.window, { more: true })} disabled={state.loadingMore}>{state.loadingMore ? "Loading more campaigns…" : `Load the next ${Math.min(8, state.campaignsTotal - state.campaignsChosen)} campaigns`}</button></p>}
          {state.moreError && <p className="error" role="alert">{state.moreError} The campaigns already shown are unchanged.</p>}
          {state.failures.length > 0 && <p className="error" role="alert">Could not read: {state.failures.map((f) => f.campaignName).join(", ")}. Their activity is missing below. Press Refresh to try again.</p>}
          {state.campaignsTotal === 0 && <p>Create a campaign to see its calendar. Only activity recorded for a real campaign appears here.</p>}

          {state.campaignsTotal > 0 && (
            <>
              <h3 className="ps-wcal-title" aria-live="polite">{rangeTitle(view, anchor)}</h3>
              {!covered && <p className="ps-banner"><span>This period has not been loaded, so an empty day here does not mean nothing is planned.</span> <button type="button" className="secondary" onClick={() => onLoad(windowFor(anchor))}>Load this period</button></p>}
              {covered && inView === 0 && <p>No scheduled or published activity in this {view}{shown.length < all.length ? " for these filters" : ""}.</p>}
              {view === "day" ? (
                <ul className="ps-wcal-daylist" aria-label={dayLabel(anchor)}>{(byDay.get(anchor) || []).map((item) => <Entry key={item.key} item={item} tz={tz} clash={clashes.has(item.key)} onOpen={onOpenCampaign} />)}</ul>
              ) : (
                <table className={`ps-wcal-grid v-${view}`}>
                  <caption className="visually-hidden">{rangeTitle(view, anchor)}</caption>
                  <thead><tr>{["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((d) => <th key={d} scope="col" abbr={d}>{d.slice(0, 3)}</th>)}</tr></thead>
                  <tbody>{Array.from({ length: days.length / 7 }, (_, w) => <tr key={days[w * 7]}>{days.slice(w * 7, w * 7 + 7).map(cell)}</tr>)}</tbody>
                </table>
              )}
              <details className="ps-wcal-undated" open>
                <summary>Not yet scheduled ({notScheduled.length})</summary>
                {notScheduled.length === 0 ? <p>Everything you have is scheduled or published.</p> : (
                  <><p className="ps-hint">Drafts, items in review and approved items without a schedule. They have no date, so they are not placed on a day.</p>
                    <ul>{notScheduled.map((item) => <Entry key={item.key} item={item} tz={tz} clash={false} onOpen={onOpenCampaign} />)}</ul></>
                )}
              </details>
            </>
          )}
        </>
      )}
    </section>
  );
}
