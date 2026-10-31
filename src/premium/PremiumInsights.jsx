import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ATTRIBUTION_LABEL, METRIC_LABEL, PLATFORM_LABEL, buildFeedback, describeRecommendation, freshness, readRecommendation, readSnapshot, summarise } from "../intel/performanceEvidence";

// Results and the Learning Brain (BG-STUDIO-022-FE, wired to the real routes in BG-STUDIO-027-FE), on the backend's canonical models: performance-observation.v1,
// performance-snapshot.v1 and evidence-recommendation.v1. The parent supplies the `api` (see insightsClient.makeInsightsApi, bizgenie-api #220). Two shapes are supported:
//  * test/reference: `api.fetchSnapshot` reads a snapshot on load;
//  * real: `api.refreshSnapshot` (POST, stores a snapshot, OWNER only, only when asked), `api.createRecommendation` (owner) and `api.fetchRecommendations` (every member).
// There is no read route for the latest snapshot, so after a reload an owner presses Refresh; members see the shared suggestions.
// Rules carried over from the contract: only platform_api data is shown as measured; retracted evidence is not shown as zero; a recommendation is an
// OBSERVED CHANGE ONLY (never a cause, never a forecast) and nothing changes unless the customer accepts it.
const when = (iso) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");
const LABELS = [
  ["Measured by the platform", "Read from the social platform's own reporting through a connected account."],
  ["Entered by you", "You typed this in. BizGenie has not checked it. It is never mixed into measured results."],
  ["Observed change", "A difference between two periods. It does not show what caused it and it is not a forecast."],
  ["Sample data", "Made-up numbers used only to test the screen. Never shown as your results."],
];
function Legend() {
  return (
    <details className="ps-legend" open>
      <summary>How results and suggestions are labelled</summary>
      <dl>{LABELS.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    </details>
  );
}
const DEFS = { reach: "People who saw the post at least once.", views: "Times the post or video was played or shown.", impressions: "Times the post appeared on screen, including repeats.", clicks: "Taps or clicks on a link in the post.", leads: "Enquiries the platform attributes to the post.", conversions: "Actions the platform attributes to the post.", sales: "Orders the platform attributes to the post.", revenue: "Money the platform attributes to the post." };

export default function PremiumInsights({ enabled, session, scope, campaignName = "", isOwner, api = {}, onSessionEnded, now = Date.now() }) {
  const [snap, setSnap] = useState({ status: "idle", data: null, error: "" });
  const [recs, setRecs] = useState({ status: "idle", items: [], skipped: 0, error: "" });
  const [platform, setPlatform] = useState(""); const [decisions, setDecisions] = useState({}); const [sending, setSending] = useState(""); const [decideError, setDecideError] = useState(""); const keys = useRef({});
  const live = useRef(true); const token = useRef(0);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const wired = Boolean(api.fetchSnapshot || api.refreshSnapshot || api.fetchRecommendations);
  const [busy, setBusy] = useState(""); const [note, setNote] = useState({ kind: "", text: "" });
  const load = useCallback(() => {
    if (!api.fetchSnapshot && !api.fetchRecommendations) return; const mine = ++token.current;
    if (api.fetchSnapshot) setSnap((x) => ({ ...x, status: "loading", error: "" }));
    if (api.fetchRecommendations) setRecs((x) => ({ ...x, status: "loading", error: "" }));
    if (api.fetchSnapshot) api.fetchSnapshot({ accessToken: session.accessToken, scope }).then((body) => { if (live.current && mine === token.current) { try { setSnap({ status: "ready", data: readSnapshot(body), error: "" }); } catch (e) { setSnap({ status: "error", data: null, error: e.message }); } } })
      .catch((e) => { if (e && e.kind === "auth" && onSessionEnded) onSessionEnded(); if (live.current && mine === token.current) setSnap({ status: "error", data: null, error: (e && e.message) || "Results could not be loaded yet." }); });
    if (api.fetchRecommendations) api.fetchRecommendations({ accessToken: session.accessToken, scope }).then((list) => {
      if (!live.current || mine !== token.current) return; const items = []; let skipped = 0;
      for (const b of Array.isArray(list) ? list : []) { try { items.push(readRecommendation(b)); } catch { skipped += 1; } }
      setRecs({ status: "ready", items, skipped, error: "" });
    }).catch((e) => { if (e && e.kind === "auth" && onSessionEnded) onSessionEnded(); if (live.current && mine === token.current) setRecs({ status: "error", items: [], skipped: 0, error: (e && e.message) || "Suggestions could not be loaded yet." }); });
  }, [api, session.accessToken, scope.tenantId, scope.projectId, scope.brandId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (enabled && wired) load(); }, [enabled, wired, load]);

  async function refresh() {
    if (busy || !api.refreshSnapshot) return; setBusy("refresh"); setNote({ kind: "", text: "" }); setSnap((x) => ({ ...x, status: "loading", error: "" }));
    try { const body = await api.refreshSnapshot({ accessToken: session.accessToken, scope }); if (live.current) { setSnap({ status: "ready", data: readSnapshot(body), error: "" }); setNote({ kind: "ok", text: "The results were refreshed from what the platforms reported." }); } }
    catch (e) { if (e && e.kind === "auth" && onSessionEnded) onSessionEnded(); if (live.current) setSnap((x) => ({ status: x.data ? "ready" : "error", data: x.data, error: (e && e.message) || "Results could not be refreshed yet." })); }
    finally { if (live.current) setBusy(""); }
  }
  async function compare(series) {
    if (busy || !api.createRecommendation || !snap.data || !snap.data.snapshotId) return; setBusy(`c:${series.key}`); setNote({ kind: "", text: "" });
    try { await api.createRecommendation({ accessToken: session.accessToken, scope, snapshotId: snap.data.snapshotId, previousId: series.previous.id, currentId: series.current.id }); if (live.current) { setNote({ kind: "ok", text: "A change to review was added below." }); load(); } }
    catch (e) { if (e && e.kind === "auth" && onSessionEnded) onSessionEnded(); if (live.current) setNote({ kind: e && e.kind === "unconfirmed" ? "warn" : "error", text: (e && e.message) || "Nothing was added." }); }
    finally { if (live.current) setBusy(""); }
  }
  // A decision is sent to the backend only when the recommendation is a persisted one (has its id), its evidence is still current, and a sender was supplied.
  // The idempotency key is made once per decision and reused for every retry, so a lost answer can never record two decisions.
  async function decide(r, decision) {
    const k = r.evidence.join(); setDecideError("");
    if (!(api.sendFeedback && r.id && r.evidenceState === "current")) { setDecisions((d) => ({ ...d, [k]: decision })); return; }
    const slot = `${r.id}:${decision}`; keys.current[slot] = keys.current[slot] || (globalThis.crypto?.randomUUID?.() || `fb-${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);
    const body = buildFeedback(r.id, decision, { expectedVersion: r.feedbackVersion || 0, idempotencyKey: keys.current[slot] }); if (!body) return;
    setSending(k);
    try { await api.sendFeedback({ accessToken: session.accessToken, scope, body }); if (live.current) { setDecisions((d) => ({ ...d, [k]: `${decision}:saved` })); if (api.fetchRecommendations) load(); } }
    catch (e) { if (e && e.kind === "auth" && onSessionEnded) onSessionEnded(); if (live.current) setDecideError((e && e.message) || "Your decision could not be saved. It was not recorded; try again."); }
    finally { if (live.current) setSending(""); }
  }
  const rows = useMemo(() => (snap.data && snap.data.state === "available" ? summarise(snap.data.observations).filter((r) => !platform || r.platform === platform) : []), [snap.data, platform]);
  const series = useMemo(() => {
    if (!snap.data || snap.data.state !== "available" || !api.createRecommendation) return [];
    const groups = new Map(); for (const o of snap.data.observations) { const key = `${o.platform}|${o.attribution}|${o.metric}|${o.unit}|${o.campaignId}`; groups.set(key, [...(groups.get(key) || []), o]); }
    return [...groups.entries()].map(([key, list]) => { const sorted = list.slice().sort((a, b) => a.periodTo.localeCompare(b.periodTo)); return { key, previous: sorted.at(-2), current: sorted.at(-1), platform: sorted[0].platform, metric: sorted[0].metric, attribution: sorted[0].attribution, n: sorted.length }; }).filter((x) => x.n >= 2 && x.previous && x.current && x.previous.periodTo <= x.current.periodFrom);
  }, [snap.data, api.createRecommendation]);
  const platforms = useMemo(() => (snap.data ? [...new Set(snap.data.observations.map((o) => o.platform))] : []), [snap.data]);
  const fresh = snap.data && snap.data.state === "available" ? freshness(snap.data.observations, now) : null;
  const synthetic = Boolean(api.synthetic);

  if (!enabled) {
    return (
      <section className="ps-stage ps-insights" aria-labelledby="pin-h">
        <h2 id="pin-h">Results and insights</h2>
        <p>Performance analytics and learning from your results are not available in BizGenie yet. BizGenie has not measured anything for you, and it has not learned from your performance.</p>
        <p>What exists today: you can enter results yourself on a campaign. They are recorded as <strong>entered by you</strong>, and BizGenie does not check them.</p>
        <Legend />
      </section>
    );
  }
  return (
    <section className="ps-stage ps-insights" aria-labelledby="pin-h">
      <h2 id="pin-h">Results and insights</h2>
      <Legend />
      {synthetic && <p className="ps-banner" role="note"><strong>Sample data.</strong> These numbers are made up to test the screen. They are not your results.</p>}
      {!wired && <p>Platform results are not connected yet, so there is nothing to show. BizGenie will show nothing rather than a guess. Results you type in yourself stay on your campaign page, labelled “entered by you”.</p>}
      {wired && (<>
        <h3>Measured by the platform{campaignName ? ` · ${campaignName}` : ""}</h3>
        {note.text && <p className={note.kind === "error" ? "error" : note.kind === "warn" ? "ps-warn" : ""} role={note.kind === "ok" ? "status" : "alert"}>{note.text}</p>}
        {api.refreshSnapshot && (isOwner
          ? <p><button type="button" className="secondary" disabled={Boolean(busy)} onClick={refresh}>{busy === "refresh" ? "Refreshing…" : snap.data ? "Refresh results" : "Read the latest platform results"}</button></p>
          : <p className="ps-hint">The workspace owner refreshes platform results. The suggestions below are shared with every member.</p>)}
        {api.refreshSnapshot && snap.status === "idle" && isOwner && <p className="ps-hint">Nothing is read until you ask. Each refresh stores a record of what the platforms reported at that moment.</p>}
        {snap.status === "loading" && <p role="status">Loading results…</p>}
        {snap.status === "error" && <div><p className="error" role="alert">{snap.error}</p><button type="button" className="secondary" onClick={load}>Try again</button></div>}
        {snap.status === "ready" && snap.data.state === "unavailable" && <p>{snap.data.reason === "stale" ? "The latest platform data is too old to show. Nothing is shown rather than out-of-date numbers." : "No platform results have been received, or they were withdrawn. Nothing is shown rather than a zero."}</p>}
        {snap.status === "ready" && snap.data.state === "available" && (<>
          <p className="ps-hint">{fresh.label}. Reporting periods are shown on each row. Corrected figures replace the earlier ones; withdrawn figures are left out.</p>
          {platforms.length > 1 && <div><label htmlFor="pin-platform">Platform</label><select id="pin-platform" value={platform} onChange={(e) => setPlatform(e.target.value)}><option value="">All platforms</option>{platforms.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}</select></div>}
          <div className="ps-plans-scroll" role="region" aria-label="Platform results" tabIndex={0}>
            <table className="ps-plans-table">
              <caption className="visually-hidden">Latest platform-measured results</caption>
              <thead><tr><th scope="col">Platform</th><th scope="col">Measure</th><th scope="col">Latest</th><th scope="col">Period</th><th scope="col">Where it came from</th></tr></thead>
              <tbody>{rows.map((r) => <tr key={`${r.platform}${r.attribution}${r.metric}${r.unit}`}><th scope="row">{PLATFORM_LABEL[r.platform]} · {ATTRIBUTION_LABEL[r.attribution]}</th><td>{METRIC_LABEL[r.metric]}</td><td>{r.latest.toLocaleString("en-GB")}{r.unit !== "count" ? ` ${r.unit.toUpperCase()}` : ""}</td><td>{when(r.periodFrom)} to {when(r.periodTo)}{r.periods > 1 ? ` (${r.periods} periods held)` : ""}</td><td><span className="ps-tag">{synthetic ? "Sample data" : "Measured by the platform"}</span></td></tr>)}</tbody>
            </table>
          </div>
          {snap.data.skipped > 0 && <p className="ps-hint">{snap.data.skipped} row{snap.data.skipped === 1 ? "" : "s"} could not be shown because {snap.data.skipped === 1 ? "it was" : "they were"} withdrawn, replaced, or not readable.</p>}
          <details><summary>What each measure means</summary><dl>{[...new Set(rows.map((r) => r.metric))].map((m) => <div key={m}><dt>{METRIC_LABEL[m]}</dt><dd>{DEFS[m]}</dd></div>)}</dl><p className="ps-hint">Paid and organic results are kept apart. Platforms count some measures differently, so compare platforms with care. Attribution is the platform's, not BizGenie's.</p></details>
        </>)}
        {series.length > 0 && isOwner && (<div><h3>Compare two periods</h3><ul className="ps-conn-list" aria-label="Periods that can be compared">{series.map((x) => <li key={x.key}>{PLATFORM_LABEL[x.platform]} · {ATTRIBUTION_LABEL[x.attribution]} · {METRIC_LABEL[x.metric]} <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => compare(x)} aria-label={`Look for a change in ${PLATFORM_LABEL[x.platform]} ${METRIC_LABEL[x.metric]}`}>{busy === `c:${x.key}` ? "Checking…" : "Look for a change"}</button></li>)}</ul><p className="ps-hint">This compares the two most recent periods of the same measure. It shows what changed, never why.</p></div>)}
        <h3>Changes worth reviewing</h3>
        {api.fetchRecommendations ? (<>
          {recs.status === "loading" && <p role="status">Loading…</p>}
          {recs.status === "error" && <div><p className="error" role="alert">{recs.error}</p><button type="button" className="secondary" onClick={load}>Try again</button></div>}
          {recs.status === "ready" && recs.items.length === 0 && <p>Nothing to review yet. A change is suggested only when two comparable periods of platform results exist.</p>}
          {recs.status === "ready" && recs.skipped > 0 && <p className="ps-hint">{recs.skipped} suggestion{recs.skipped === 1 ? " was" : "s were"} left out because {recs.skipped === 1 ? "it" : "they"} did not say clearly that it was an observed change only.</p>}
          {decideError && <p className="error" role="alert">{decideError}</p>}
          {recs.items.length > 0 && <ul className="ps-conn-list" aria-label="Changes worth reviewing">{recs.items.map((r) => { const k = r.evidence.join(); const server = r.decision === "accepted" || r.decision === "rejected" ? `${r.decision}:saved` : ""; const d = decisions[k] || server; const saved = d && d.endsWith(":saved"); const invalid = r.decision === "invalidated"; const word = d ? d.split(":")[0] : ""; const stale = r.evidenceState === "unavailable"; return (
            <li key={k}><span className="ps-tag">Observed change</span> <span>{invalid ? "Your earlier decision no longer applies" : d ? (saved ? `${word === "accepted" ? "Accepted" : "Rejected"} by you and saved` : `${word === "accepted" ? "Accepted" : "Rejected"} by you on this device`) : stale ? "No longer available" : "Waiting for your decision"}</span>
              <p>{describeRecommendation(r)}</p>
              {stale && <p className="ps-hint">The platform results behind this were withdrawn or are out of date, so it can no longer be accepted.</p>}
              <details><summary>Evidence (2 records)</summary><p className="ps-hint">Based on two platform records. Record references: {r.evidence.map((h) => h.slice(0, 8)).join(", ")}.</p></details>
              {!d && !stale && !invalid && (isOwner ? <div className="ps-camp-actions"><button type="button" className="secondary" disabled={Boolean(sending)} onClick={() => decide(r, "accepted")}>Accept</button><button type="button" className="secondary" disabled={Boolean(sending)} onClick={() => decide(r, "rejected")}>Reject</button></div> : <p className="ps-hint">Only the owner can decide.</p>)}
              {d && !saved && <p className="ps-hint">Your decision is kept on this device only. It is not sent to BizGenie yet and changes nothing.</p>}
              {saved && <p className="ps-hint">Saved. It does not change your Brand Brain or any campaign by itself.</p>}
            </li>); })}</ul>}
        </>) : <p>No suggestions are connected yet. BizGenie suggests something only when it has platform results to base it on, and never changes anything without your approval.</p>}
      </>)}
    </section>
  );
}
