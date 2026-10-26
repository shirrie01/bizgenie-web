import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ATTRIBUTION_LABEL, METRIC_LABEL, PLATFORM_LABEL, describeRecommendation, freshness, readRecommendation, readSnapshot, summarise } from "../intel/performanceEvidence";

// Results and the Learning Brain (BG-STUDIO-022-FE), rebuilt on the backend's canonical reference models: performance-observation.v1,
// performance-snapshot.v1 and evidence-recommendation.v1 (bizgenie-api @ 23f4903). THERE IS NO BACKEND ROUTE FOR THEM YET (request R12), so this view
// never fetches by itself: the parent supplies `api.fetchSnapshot` / `api.fetchRecommendations` only when real routes exist (App supplies none today).
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
  const [platform, setPlatform] = useState(""); const [decisions, setDecisions] = useState({});
  const live = useRef(true); const token = useRef(0);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const wired = Boolean(api.fetchSnapshot);
  const load = useCallback(() => {
    if (!api.fetchSnapshot) return; const mine = ++token.current;
    setSnap((x) => ({ ...x, status: "loading", error: "" }));
    api.fetchSnapshot({ accessToken: session.accessToken, scope }).then((body) => { if (live.current && mine === token.current) { try { setSnap({ status: "ready", data: readSnapshot(body), error: "" }); } catch (e) { setSnap({ status: "error", data: null, error: e.message }); } } })
      .catch((e) => { if (e && e.kind === "auth" && onSessionEnded) onSessionEnded(); if (live.current && mine === token.current) setSnap({ status: "error", data: null, error: (e && e.message) || "Results could not be loaded yet." }); });
    if (api.fetchRecommendations) api.fetchRecommendations({ accessToken: session.accessToken, scope }).then((list) => {
      if (!live.current || mine !== token.current) return; const items = []; let skipped = 0;
      for (const b of Array.isArray(list) ? list : []) { try { items.push(readRecommendation(b)); } catch { skipped += 1; } }
      setRecs({ status: "ready", items, skipped, error: "" });
    }).catch((e) => { if (live.current && mine === token.current) setRecs({ status: "error", items: [], skipped: 0, error: (e && e.message) || "Suggestions could not be loaded yet." }); });
  }, [api, session.accessToken, scope.tenantId, scope.projectId, scope.brandId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (enabled && wired) load(); }, [enabled, wired, load]);

  const rows = useMemo(() => (snap.data && snap.data.state === "available" ? summarise(snap.data.observations).filter((r) => !platform || r.platform === platform) : []), [snap.data, platform]);
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
        <h3>Changes worth reviewing</h3>
        {api.fetchRecommendations ? (<>
          {recs.status === "loading" && <p role="status">Loading…</p>}
          {recs.status === "error" && <p className="error" role="alert">{recs.error}</p>}
          {recs.status === "ready" && recs.items.length === 0 && <p>Nothing to review yet. A change is suggested only when two comparable periods of platform results exist.</p>}
          {recs.status === "ready" && recs.skipped > 0 && <p className="ps-hint">{recs.skipped} suggestion{recs.skipped === 1 ? " was" : "s were"} left out because {recs.skipped === 1 ? "it" : "they"} did not say clearly that it was an observed change only.</p>}
          {recs.items.length > 0 && <ul className="ps-conn-list" aria-label="Changes worth reviewing">{recs.items.map((r) => { const k = r.evidence.join(); const d = decisions[k]; return (
            <li key={k}><span className="ps-tag">Observed change</span> <span>{d ? (d === "accepted" ? "Accepted by you on this device" : "Rejected by you on this device") : "Waiting for your decision"}</span>
              <p>{describeRecommendation(r)}</p>
              <details><summary>Evidence (2 records)</summary><p className="ps-hint">Based on two platform records. Record references: {r.evidence.map((h) => h.slice(0, 8)).join(", ")}.</p></details>
              {!d && (isOwner ? <div className="ps-camp-actions"><button type="button" className="secondary" onClick={() => setDecisions({ ...decisions, [k]: "accepted" })}>Accept</button><button type="button" className="secondary" onClick={() => setDecisions({ ...decisions, [k]: "rejected" })}>Reject</button></div> : <p className="ps-hint">Only the owner can decide.</p>)}
              {d && <p className="ps-hint">Your decision is kept on this device only. It is not sent to BizGenie yet and changes nothing.</p>}
            </li>); })}</ul>}
        </>) : <p>No suggestions are connected yet. BizGenie suggests something only when it has platform results to base it on, and never changes anything without your approval.</p>}
      </>)}
    </section>
  );
}
