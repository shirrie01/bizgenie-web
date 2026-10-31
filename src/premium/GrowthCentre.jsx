import React, { useEffect, useMemo, useState } from "react";
import { OBJECTIVES, buildStrategy, suggestObjective } from "../intel/goalModel";
import { EXPERIMENT_TYPES, STATES, ExperimentError, createExperiment, evaluate, nextStep } from "../intel/experimentModel";
import { EXTRACTION_AVAILABLE, EXTRACTION_BLOCKER, FACT_KINDS, FIELDS, approveFact, newContext, proposeBrainUpdate, setFact, setWebsite, summary } from "../intel/productContext";
import { ANALYSIS_LEVEL, HOOK_TYPES, NARRATIVES, buildReference, directions } from "../intel/referenceBrief";
import { METRIC_LABEL, PLATFORM_LABEL, ATTRIBUTION_LABEL, describeRecommendation, freshness, readRecommendation, readSnapshot, summarise } from "../intel/performanceEvidence";
import { forget, recall, remember } from "./rememberedFacts";

// Growth Control Centre (BG-STUDIO-022-FE): ONE operating view inside the existing Premium workspace, not a second dashboard (bizgenie-api #129 G8).
// Hierarchy: objective -> current performance -> opportunities -> recommended action -> execution. Everything it shows is either read from the
// workspace the customer already has (campaigns, calendar, Brand Brain) or labelled as a plan kept ON THIS DEVICE. It never shows a synthetic or
// forecast figure as a customer result: with no platform data it says so. Experiments, product details and reference ideas are not stored by the
// backend yet (requests CI-01/CI-02), so they say "saved on this device only".
const TABS = [["overview", "Overview"], ["strategy", "Strategy"], ["experiments", "Experiments"], ["product", "Product details"], ["ideas", "Creative ideas"]];
const SAVED_HERE = "Saved on this device only. It is not stored in your BizGenie account yet.";

const useDeviceState = (scope, name, initial) => {
  const [value, setValue] = useState(() => recall(scope, "growth", "-", name) ?? initial);
  const save = (next) => { setValue(next); remember(scope, "growth", "-", name, next); };
  return [value, save, () => { forget(scope, "growth", "-", name); setValue(initial); }];
};
const Pill = ({ children, tone = "" }) => <span className={`ps-tag ${tone}`}>{children}</span>;
const fmt = (n) => (typeof n === "number" ? n.toLocaleString("en-GB") : "—");

function Overview({ model, campaigns, calendar, snapshot, recommendations, analyticsEnabled, onGo, onOpenCampaign, experiments }) {
  const counts = model.campaign ? model.campaign.counts : null;
  const upcoming = calendar && calendar.status === "ready" ? calendar.entries.filter((e) => e.workflow !== "published" && Date.parse(e.occurrence_at) >= Date.now()).sort((a, b) => a.occurrence_at.localeCompare(b.occurrence_at)).slice(0, 5) : null;
  const evidence = useMemo(() => { try { return snapshot ? readSnapshot(snapshot) : null; } catch { return { state: "invalid" }; } }, [snapshot]);
  const recs = useMemo(() => (recommendations || []).map((r) => { try { return readRecommendation(r); } catch { return null; } }).filter(Boolean), [recommendations]);
  const objective = model.goal.value;
  return (
    <div className="ps-growth-grid">
      <section aria-labelledby="gc-objective"><h3 id="gc-objective">1. Your objective</h3>
        {objective ? <p><strong>{objective}</strong> <Pill>Your words</Pill></p> : <p>No goal is set yet. A clear goal makes every other number on this page mean something.</p>}
        <button type="button" className="secondary" onClick={() => onGo({ view: "growth", tab: "strategy" })}>{objective ? "See how this reads for your business" : "Set your objective"}</button>
      </section>
      <section aria-labelledby="gc-perf"><h3 id="gc-perf">2. Current performance</h3>
        {!analyticsEnabled && <p>No platform results are available yet, because results are not connected. BizGenie shows no performance figures it has not received. Results you type in yourself are on <button type="button" className="link" onClick={() => onGo({ view: "insights" })}>Results and insights</button>.</p>}
        {analyticsEnabled && (!evidence || evidence.state === "unavailable") && <p>{evidence && evidence.reason === "stale" ? "The latest platform data is too old to use." : "No platform data has arrived yet."} Nothing is shown rather than a guess.</p>}
        {evidence && evidence.state === "invalid" && <p role="alert">The results could not be read, so none are shown.</p>}
        {evidence && evidence.state === "available" && (<>
          <p className="ps-hint">{freshness(evidence.observations).label}. Measured by the platform; attribution is shown per row.</p>
          <table className="ps-table"><caption className="visually-hidden">Latest platform-measured results</caption><thead><tr><th scope="col">Platform</th><th scope="col">Result</th><th scope="col">Latest</th><th scope="col">Period</th></tr></thead>
            <tbody>{summarise(evidence.observations).map((r) => <tr key={`${r.platform}${r.attribution}${r.metric}`}><th scope="row">{PLATFORM_LABEL[r.platform]} · {ATTRIBUTION_LABEL[r.attribution]}</th><td>{METRIC_LABEL[r.metric]}</td><td>{fmt(r.latest)}{r.unit !== "count" ? ` ${r.unit.toUpperCase()}` : ""}</td><td>{r.periodFrom.slice(0, 10)} to {r.periodTo.slice(0, 10)}</td></tr>)}</tbody></table>
          {evidence.skipped > 0 && <p className="ps-hint">{evidence.skipped} row{evidence.skipped === 1 ? "" : "s"} could not be shown and {evidence.skipped === 1 ? "was" : "were"} left out.</p>}
        </>)}
      </section>
      <section aria-labelledby="gc-pipe"><h3 id="gc-pipe">3. Content pipeline</h3>
        <p>{campaigns.length === 0 ? "You have no campaigns yet. Nothing has been created, scheduled or published." : `${campaigns.length} active campaign${campaigns.length === 1 ? "" : "s"}.`}</p>
        {counts && <ul><li>Draft: {counts.draft || 0}</li><li>Awaiting your review: {counts.review || 0}</li><li>Approved: {counts.approved || 0}</li><li>Published: {counts.published || 0}</li><li>Other (for example scheduled): {counts.other || 0}</li></ul>}
        {campaigns.slice(0, 4).map((c) => <p key={c.id}><button type="button" className="link" onClick={() => onOpenCampaign(c.id)}>{c.name}</button></p>)}
        {upcoming === null ? <p className="ps-hint">Upcoming publications appear once your calendar has loaded.</p> : upcoming.length === 0 ? <p>No upcoming publications are scheduled.</p> : <><h4>Upcoming</h4><ul>{upcoming.map((e) => <li key={`${e.variant_id}${e.occurrence_at}`}>{new Date(e.occurrence_at).toLocaleString("en-GB")} — {e.campaign_name || "Campaign"}</li>)}</ul></>}
      </section>
      <section aria-labelledby="gc-exp"><h3 id="gc-exp">4. Experiments</h3>
        {experiments.length === 0 ? <p>No experiments planned. Test one change at a time to learn what works.</p> : <ul>{experiments.map((x) => <li key={x.id}>{EXPERIMENT_TYPES[x.type].label}: {x.hypothesis.slice(0, 80)} <Pill>{STATES[x.state].label}</Pill></li>)}</ul>}
        <button type="button" className="secondary" onClick={() => onGo({ view: "growth", tab: "experiments" })}>Plan an experiment</button>
      </section>
      <section aria-labelledby="gc-rec"><h3 id="gc-rec">5. Recommended next actions</h3>
        {recs.length > 0 && <ul>{recs.map((r) => <li key={r.evidence.join()}>{describeRecommendation(r)} <Pill>Observed change</Pill></li>)}</ul>}
        {recs.length === 0 && <p>No evidence-based recommendations yet. They appear only when real platform results exist, and never change anything without your approval.</p>}
        {model.nextActions.length > 0 && <><h4>Setup</h4><ul>{model.nextActions.map((a) => <li key={a.id}><button type="button" className="link" onClick={() => onGo(a.target)}>{a.title}</button> — {a.detail}</li>)}</ul></>}
      </section>
      <section aria-labelledby="gc-cred"><h3 id="gc-cred">Credits and costs</h3><p>Prices are shown, and must be confirmed by you, before each image or video is created. See <button type="button" className="link" onClick={() => onGo({ view: "account" })}>Plan and billing</button>.</p></section>
    </div>
  );
}

function Strategy({ model, readOnly }) {
  const [objective, setObjective] = useState(""); const [source, setSource] = useState("chosen");
  const suggestion = suggestObjective(model.goal.value);
  const row = (k) => (model.profile.rows.find((r) => r.key === k) || {}).value || "";
  const strategy = objective ? buildStrategy({ objective, objectiveSource: source, sector: model.sector.key, sectorSource: model.sector.source, brainFacts: { audience: row("audience"), cta: row("cta") }, channels: model.plannedChannels }) : null;
  return (
    <div>
      <p>Start with the result you want. BizGenie then reads it for your kind of business. This is guidance, not a forecast.</p>
      {suggestion.objective && !objective && <p className="ps-hint">From your goal ("{model.goal.value}"): {suggestion.why} <button type="button" className="secondary" onClick={() => { setObjective(suggestion.objective); setSource("suggested"); }}>Use {OBJECTIVES[suggestion.objective].label}</button></p>}
      <label htmlFor="gc-objective-select">Objective</label>
      <select id="gc-objective-select" value={objective} onChange={(e) => { setObjective(e.target.value); setSource("chosen"); }}>
        <option value="">Choose an objective</option>{Object.entries(OBJECTIVES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select>
      {strategy && (
        <dl className="ps-strategy">
          <dt>Objective</dt><dd>{strategy.objective} <Pill>{strategy.objectiveSource === "suggested" ? "Suggested from your words" : "Chosen by you"}</Pill></dd>
          <dt>Target customer</dt><dd>{strategy.targetCustomer.text} <Pill>{strategy.targetCustomer.source}</Pill></dd>
          <dt>Offer</dt><dd>{strategy.offer.text} <Pill>{strategy.offer.source}</Pill></dd>
          <dt>Channels</dt><dd>{strategy.channels.length ? strategy.channels.join(", ") : "None chosen yet"}</dd>
          <dt>Why this creative approach</dt><dd>{strategy.creativeRationale}</dd>
          <dt>How it will be measured</dt><dd>{strategy.measurement}</dd>
          <dt>Evidence and assumptions</dt><dd><ul>{strategy.evidence.map((e) => <li key={e}>{e}</li>)}{strategy.assumptions.map((a) => <li key={a}><strong>Assumption:</strong> {a}</li>)}</ul></dd>
          <dt>Proposed next action</dt><dd>{strategy.nextAction}</dd>
          <dt>Forecast</dt><dd>BizGenie does not forecast results.</dd>
        </dl>
      )}
      {readOnly && <p className="ps-hint">You can read this. Changes to your business details are made by the owner.</p>}
    </div>
  );
}

function Experiments({ scope, readOnly, model, experiments, setExperiments }) {
  const [form, setForm] = useState({ type: "hook", hypothesis: "", outcomeMetric: "clicks", windowDays: 14, a: "", b: "", objective: model.goal.value ? "your goal" : "" });
  const [error, setError] = useState("");
  const t = EXPERIMENT_TYPES[form.type];
  function add(e) {
    e.preventDefault();
    try {
      const x = createExperiment({ type: form.type, objective: form.objective || "your goal", hypothesis: form.hypothesis, outcomeMetric: form.outcomeMetric, windowDays: Number(form.windowDays), variants: [{ key: "a", label: "A", attributes: { [t.variable]: form.a } }, { key: "b", label: "B", attributes: { [t.variable]: form.b } }] });
      setExperiments([...experiments, { ...x, state: "planned" }]); setError(""); setForm({ ...form, hypothesis: "", a: "", b: "" });
    } catch (err) { if (err instanceof ExperimentError) setError(err.message); else throw err; }
  }
  return (
    <div>
      <p>Test one change at a time. BizGenie will not call a winner without enough results, and never says why something worked. {SAVED_HERE}</p>
      {!readOnly && (
        <form onSubmit={add} aria-label="Plan an experiment">
          <label htmlFor="gx-type">What are you testing?</label>
          <select id="gx-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{Object.entries(EXPERIMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
          <label htmlFor="gx-hyp">What do you expect to happen, and why?</label>
          <textarea id="gx-hyp" rows={2} maxLength={400} value={form.hypothesis} onChange={(e) => setForm({ ...form, hypothesis: e.target.value })} />
          <label htmlFor="gx-a">Variant A: {t.variable.replaceAll("_", " ")}</label><input id="gx-a" value={form.a} maxLength={200} onChange={(e) => setForm({ ...form, a: e.target.value })} />
          <label htmlFor="gx-b">Variant B: {t.variable.replaceAll("_", " ")}</label><input id="gx-b" value={form.b} maxLength={200} onChange={(e) => setForm({ ...form, b: e.target.value })} />
          <label htmlFor="gx-m">Judge it by</label>
          <select id="gx-m" value={form.outcomeMetric} onChange={(e) => setForm({ ...form, outcomeMetric: e.target.value })}>{["clicks", "leads", "conversions", "sales", "views", "reach"].map((m) => <option key={m} value={m}>{METRIC_LABEL[m]}</option>)}</select>
          <label htmlFor="gx-w">Run for (days)</label><input id="gx-w" type="number" min={7} max={90} value={form.windowDays} onChange={(e) => setForm({ ...form, windowDays: e.target.value })} />
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" className="ps-primary">Add experiment</button>
        </form>
      )}
      {experiments.length === 0 ? <p>No experiments yet.</p> : (
        <ul className="ps-exp-list">{experiments.map((x) => { const out = evaluate(x, { published: 0 }); return (
          <li key={x.id}><strong>{EXPERIMENT_TYPES[x.type].label}</strong> <Pill>{STATES[x.state].label}</Pill>
            <p>{x.hypothesis}</p><p className="ps-hint">{STATES[x.state].help} {nextStep(x, { ...out, state: x.state })}</p>
            <p className="ps-hint">Results can only be counted after the variants are published and the platform reports them. That is not connected yet, so this stays at “planned”.</p>
            {!readOnly && <button type="button" className="secondary" onClick={() => setExperiments(experiments.filter((y) => y.id !== x.id))}>Remove</button>}</li>); })}</ul>
      )}
    </div>
  );
}

function ProductDetails({ scope, isOwner, readOnly, model }) {
  const [ctx, save] = useDeviceState(scope, "product-context", newContext());
  const [site, setSite] = useState(ctx.website || ""); const [msg, setMsg] = useState("");
  const sum = summary(ctx);
  const brain = Object.fromEntries(model.profile.rows.map((r) => [r.key === "cta" ? "cta" : r.key, r.value]));
  const proposals = proposeBrainUpdate(ctx, { audience: brain.audience, cta: brain.cta });
  return (
    <div>
      <p>Tell BizGenie about your product or service. Each detail shows who said it. Nothing here changes your Brand Brain on its own. {SAVED_HERE}</p>
      <label htmlFor="pc-site">Website address</label>
      <div className="ps-row"><input id="pc-site" value={site} disabled={readOnly} onChange={(e) => setSite(e.target.value)} placeholder="yourbusiness.co.uk" />
        <button type="button" className="secondary" disabled={readOnly} onClick={() => { const r = setWebsite(ctx, site); if (r.error) setMsg(r.error); else { save(r.context); setMsg("Address noted."); } }}>Save address</button></div>
      <button type="button" className="secondary" disabled={!EXTRACTION_AVAILABLE} aria-describedby="pc-blocked">Read my website</button>
      <p id="pc-blocked" className="ps-hint">{EXTRACTION_BLOCKER}</p>
      {msg && <p role="status">{msg}</p>}
      {FIELDS.map(([key, label]) => { const f = ctx.facts[key]; return (
        <div key={key} className="ps-fact">
          <label htmlFor={`pc-${key}`}>{label}</label>
          <textarea id={`pc-${key}`} rows={2} maxLength={1500} disabled={readOnly} defaultValue={f ? f.text : ""} onBlur={(e) => { if (e.target.value !== (f ? f.text : "")) save(setFact(ctx, key, e.target.value)); }} />
          {f && <p className="ps-hint"><Pill>{FACT_KINDS[f.kind].label}</Pill> {FACT_KINDS[f.kind].help}{!f.approved && isOwner && <> <button type="button" className="secondary" onClick={() => { const r = approveFact(ctx, key, { isOwner }); r.error ? setMsg(r.error) : save(r.context); }}>Approve</button></>}</p>}
        </div>); })}
      <p>{sum.approved} of {sum.total} details approved.{sum.missingRequired.length > 0 && ` Still needed: ${sum.missingRequired.join("; ")}.`}</p>
      {!isOwner && <p className="ps-hint">Only the owner can approve details.</p>}
      {proposals.length > 0 && <div role="note"><h4>Possible Brand Brain changes</h4><p>These are proposals only. Open Brand to review and save them yourself.</p><ul>{proposals.map((p) => <li key={p.field}>{p.field}: {p.kind === "replaces_existing" ? `replace “${p.current}” with “${p.proposed}”` : `add “${p.proposed}”`}</li>)}</ul></div>}
    </div>
  );
}

function Ideas({ model, onGo, readOnly }) {
  const [f, setF] = useState({ description: "", hook: "", narrative: "", cta: "", platform: "", audience: "", assetName: "", rightsConfirmed: false });
  const [result, setResult] = useState(null);
  const brain = { audience: (model.profile.rows.find((r) => r.key === "audience") || {}).value || "", cta: (model.profile.rows.find((r) => r.key === "cta") || {}).value || "" };
  const built = result && result.ok ? result.reference : null;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  return (
    <div>
      <p>Describe a style or advertising idea you like. You get original directions, not a copy. BizGenie cannot see anyone's ad: it works only from what you write.</p>
      <form onSubmit={(e) => { e.preventDefault(); setResult(buildReference(f)); }} aria-label="Reference description">
        <label htmlFor="rf-d">Describe the style or idea</label><textarea id="rf-d" rows={3} maxLength={2000} disabled={readOnly} value={f.description} onChange={set("description")} />
        <label htmlFor="rf-h">Hook style</label><select id="rf-h" value={f.hook} onChange={set("hook")}><option value="">Not sure</option>{HOOK_TYPES.map((h) => <option key={h}>{h}</option>)}</select>
        <label htmlFor="rf-n">Story structure</label><select id="rf-n" value={f.narrative} onChange={set("narrative")}><option value="">Not sure</option>{NARRATIVES.map((h) => <option key={h}>{h}</option>)}</select>
        <label htmlFor="rf-p">Platform</label><input id="rf-p" value={f.platform} maxLength={40} onChange={set("platform")} />
        <label htmlFor="rf-a">Audience</label><input id="rf-a" value={f.audience} maxLength={200} onChange={set("audience")} placeholder={brain.audience || ""} />
        <label htmlFor="rf-c">Call to action</label><input id="rf-c" value={f.cta} maxLength={160} onChange={set("cta")} placeholder={brain.cta || ""} />
        <label htmlFor="rf-f">A file you own (name only)</label><input id="rf-f" value={f.assetName} maxLength={120} onChange={set("assetName")} />
        <label className="ps-check"><input type="checkbox" checked={f.rightsConfirmed} onChange={set("rightsConfirmed")} /> I may use anything I have referenced as inspiration, and I understand BizGenie will not copy it.</label>
        <button type="submit" className="ps-primary" disabled={readOnly}>Create original directions</button>
      </form>
      {result && !result.ok && <p className="error" role="alert">{result.message}</p>}
      {built && (<>
        <p role="status"><strong>What was used:</strong> {ANALYSIS_LEVEL[built.analysis]}</p>
        {built.removed.length > 0 && <p className="ps-hint">Left out so the ideas stay original: {built.removed.join(", ")}.</p>}
        <ul className="ps-exp-list">{directions(built, brain).map((d) => <li key={d.key}><strong>{d.label}</strong><p>Structure: {d.narrative}. {d.suitability} Audience: {d.audience}.</p><textarea readOnly rows={3} aria-label={`Brief for ${d.label}`} value={d.brief} /></li>)}</ul>
        <p className="ps-hint">To create the image or video, open a campaign item in Campaign Studio, paste a brief, and confirm the price first.</p>
        <button type="button" className="secondary" onClick={() => onGo({ view: "studio" })}>Open Campaign Studio</button>
      </>)}
    </div>
  );
}

export default function GrowthCentre({ model, scope, isOwner = false, readOnly = false, campaignList, workspaceCalendarState, analyticsEnabled = false, snapshot = null, recommendations = [], tab = "overview", onGo, onOpenCampaign }) {
  const [current, setCurrent] = useState(TABS.some(([k]) => k === tab) ? tab : "overview");
  useEffect(() => { if (TABS.some(([k]) => k === tab)) setCurrent(tab); }, [tab]);
  const key = `exp:${scope.brandId || ""}`;
  const [stored, saveStored] = useDeviceState(scope, key, []);
  const experiments = stored.filter((x) => x && EXPERIMENT_TYPES[x.type]).map((x) => ({ ...x, state: x.state && STATES[x.state] ? x.state : "planned" }));
  const campaigns = model.campaigns || [];
  return (
    <section className="ps-growth" aria-label="Growth Control Centre">
      <header><p className="eyebrow">Growth Control Centre</p><h2>What you want, what is happening, what to do next</h2></header>
      <div role="group" aria-label="Growth sections" className="ps-wcal-views">{TABS.map(([k, label]) => <button key={k} type="button" className={current === k ? "on" : ""} aria-pressed={current === k} onClick={() => setCurrent(k)}>{label}</button>)}</div>
      {current === "overview" && <Overview model={model} campaigns={campaigns} calendar={workspaceCalendarState} snapshot={snapshot} recommendations={recommendations} analyticsEnabled={analyticsEnabled} onGo={(t) => (t.tab ? setCurrent(t.tab) : onGo(t))} onOpenCampaign={onOpenCampaign} experiments={experiments} />}
      {current === "strategy" && <Strategy model={model} readOnly={readOnly} />}
      {current === "experiments" && <Experiments scope={scope} readOnly={readOnly} model={model} experiments={experiments} setExperiments={saveStored} />}
      {current === "product" && <ProductDetails scope={scope} isOwner={isOwner} readOnly={readOnly} model={model} />}
      {current === "ideas" && <Ideas model={model} onGo={onGo} readOnly={readOnly} />}
    </section>
  );
}
