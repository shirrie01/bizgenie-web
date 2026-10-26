import React, { useCallback, useEffect, useRef, useState } from "react";
import { SOURCE_EXPLAIN, SOURCE_LABEL, decideInsight as realDecide, fetchInsights as realFetchInsights, fetchResults as realFetchResults, newRequestId } from "./insightsClient";

// Results and the Learning Brain (BG-STUDIO-020-FE). The backend stores only numbers the customer typed in, so with the build gate off this page says
// that and defines the four kinds of statement the app will ever make. With the gate on it shows only what the server sends, each number or suggestion
// labelled with where it came from; a suggestion without evidence is not shown and nothing is called "learned" without it.
const API = () => import.meta.env.VITE_BIZGENIE_API_URL || "http://localhost:8080";
const when = (iso) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");
const METRIC_LABEL = { reach: "Reach", views: "Views", impressions: "Impressions", clicks: "Clicks", enquiries: "Enquiries", leads: "Leads", conversions: "Conversions", sales: "Sales", revenue: "Revenue", value: "Value" };

function Legend() {
  return (
    <details className="ps-legend" open>
      <summary>How results and suggestions are labelled</summary>
      <dl>{Object.keys(SOURCE_LABEL).map((k) => <div key={k}><dt>{SOURCE_LABEL[k]}</dt><dd>{SOURCE_EXPLAIN[k]}</dd></div>)}</dl>
    </details>
  );
}

export default function PremiumInsights({ enabled, session, scope, campaignId = "", campaignName = "", isOwner, api = {}, onSessionEnded }) {
  const [results, setResults] = useState({ status: "idle", metrics: [], skipped: 0, error: "" });
  const [ins, setIns] = useState({ status: "idle", insights: [], skipped: 0, error: "" });
  const [busy, setBusy] = useState(""); const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const live = useRef(true); const ids = useRef({}); const token = useRef(0);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const base = { apiBaseUrl: API(), accessToken: session.accessToken, scope };
  const fail = useCallback((e) => { if (e && e.kind === "auth" && onSessionEnded) onSessionEnded(); }, [onSessionEnded]);
  const load = useCallback(() => {
    const mine = ++token.current; setIns((x) => ({ ...x, status: "loading", error: "" }));
    (api.fetchInsights || realFetchInsights)(base).then((r) => { if (live.current && mine === token.current) setIns({ status: "ready", ...r, error: "" }); }).catch((e) => { fail(e); if (live.current && mine === token.current) setIns({ status: "error", insights: [], skipped: 0, error: e.message }); });
    if (campaignId) { setResults((x) => ({ ...x, status: "loading", error: "" })); (api.fetchResults || realFetchResults)({ ...base, campaignId }).then((r) => { if (live.current && mine === token.current) setResults({ status: "ready", ...r, error: "" }); }).catch((e) => { fail(e); if (live.current && mine === token.current) setResults({ status: "error", metrics: [], skipped: 0, error: e.message }); }); }
  }, [scope.tenantId, scope.projectId, scope.brandId, session.accessToken, campaignId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (enabled) load(); }, [enabled, load]);

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
  const decide = async (i, decision) => {
    if (busy) return; setBusy(i.id); setMsg(""); setErr(""); const key = `${i.id}:${decision}`; ids.current[key] = ids.current[key] || newRequestId("decision");
    try { const r = await (api.decideInsight || realDecide)({ ...base, insightId: i.id, decision, id: ids.current[key] }); ids.current[key] = null; if (live.current) { setIns((x) => ({ ...x, insights: x.insights.map((y) => (y.id === i.id ? { ...y, status: r.status } : y)) })); setMsg(r.status === "accepted" ? "Accepted. This does not change your Brand Brain or any campaign by itself." : "Rejected. It will not be used."); } }
    catch (e) { fail(e); if (live.current) setErr(e.message); } finally { if (live.current) setBusy(""); }
  };
  return (
    <section className="ps-stage ps-insights" aria-labelledby="pin-h">
      <h2 id="pin-h">Results and insights</h2>
      <Legend />
      {msg && <p role="status">{msg}</p>}{err && <p className="error" role="alert">{err}</p>}
      <h3>Results{campaignName ? ` · ${campaignName}` : ""}</h3>
      {!campaignId && <p>Open a campaign to see its results.</p>}
      {campaignId && results.status === "loading" && <p role="status">Loading results…</p>}
      {campaignId && results.status === "error" && <div><p className="error" role="alert">{results.error}</p><button type="button" className="secondary" onClick={load}>Try again</button></div>}
      {campaignId && results.status === "ready" && results.metrics.length === 0 && <p>No results are recorded for this campaign yet.</p>}
      {campaignId && results.status === "ready" && results.skipped > 0 && <p className="ps-hint">{results.skipped} result{results.skipped === 1 ? "" : "s"} could not be shown because {results.skipped === 1 ? "its" : "their"} origin was missing or unreadable.</p>}
      {campaignId && results.status === "ready" && results.metrics.length > 0 && (
        <div className="ps-plans-scroll" role="region" aria-label="Results" tabIndex={0}>
          <table className="ps-plans-table">
            <caption className="visually-hidden">Results for this campaign</caption>
            <thead><tr><th scope="col">Measure</th><th scope="col">Value</th><th scope="col">Where it came from</th><th scope="col">Observed</th><th scope="col">Up to date as of</th></tr></thead>
            <tbody>{results.metrics.map((m, k) => <tr key={`${m.metric}-${m.observedAt}-${k}`}><th scope="row">{METRIC_LABEL[m.metric]}</th><td>{m.value}{m.unit && m.unit !== "count" ? ` ${m.unit}` : ""}</td><td><span className="ps-tag">{SOURCE_LABEL[m.source]}</span>{m.method ? ` · ${m.method}` : ""}</td><td>{when(m.observedAt)}</td><td>{m.freshAsOf ? when(m.freshAsOf) : "Not stated"}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      <h3>Suggestions from your results</h3>
      {ins.status === "loading" && <p role="status">Loading suggestions…</p>}
      {ins.status === "error" && <div><p className="error" role="alert">{ins.error}</p><button type="button" className="secondary" onClick={load}>Try again</button></div>}
      {ins.status === "ready" && ins.insights.length === 0 && <p>There are no suggestions yet. BizGenie only suggests something when it has results to base it on.</p>}
      {ins.status === "ready" && ins.skipped > 0 && <p className="ps-hint">{ins.skipped} suggestion{ins.skipped === 1 ? "" : "s"} were left out because they came without evidence.</p>}
      {ins.status === "ready" && ins.insights.length > 0 && (
        <ul className="ps-conn-list" aria-label="Suggestions">
          {ins.insights.map((i) => (
            <li key={i.id}>
              <span className="ps-tag">{SOURCE_LABEL.ai_recommendation}</span> <span>Confidence: {i.confidence}</span> · <span>{i.status === "proposed" ? "Waiting for your decision" : i.status === "accepted" ? "Accepted" : "Rejected"}</span>
              <p>{i.statement}</p>
              <details><summary>Evidence ({i.evidence.length})</summary><ul>{i.evidence.map((e, k) => <li key={k}>{METRIC_LABEL[e.metric]}, {SOURCE_LABEL[e.source].toLowerCase()}, {when(e.from)} to {when(e.to)}, {e.sampleSize} observation{e.sampleSize === 1 ? "" : "s"}</li>)}</ul></details>
              {i.status === "proposed" && (isOwner ? <div className="ps-camp-actions"><button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => decide(i, "accept")}>Accept</button><button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => decide(i, "reject")}>Reject</button></div> : <p className="ps-hint">Only the workspace owner can accept or reject a suggestion.</p>)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
