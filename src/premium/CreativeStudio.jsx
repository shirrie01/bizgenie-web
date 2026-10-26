import React, { useCallback, useEffect, useRef, useState } from "react";
import GenerateWithQuote from "./GenerateWithQuote";
import { KIND_CLASS, KIND_LABEL, PROVENANCE_LABEL, approveOutput, fetchAssets, fetchCapabilities, fetchJob, requestRevision, startCreativeJob, uploadAsset, validateBrief } from "./creativeProductionClient";
import { requestGenerationQuote } from "./generationQuoteClient";

// Image, video and hybrid creative for one post (BG-STUDIO-019-FE, workstream C). Everything offered (kinds, platforms, shapes, limits, file
// types) comes from the server's capabilities; nothing is assumed. Cost is shown and confirmed first (workstream D). Each result says where it
// came from: made by AI, supplied by you, or your media edited with AI. "Hybrid" is only ever your own media plus AI; text written by AI is
// never labelled hybrid. With the build gate off this says plainly that media creation is not available yet.
const API = () => import.meta.env.VITE_BIZGENIE_API_URL || "http://localhost:8080";
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
const memory = (key, value) => { try { if (value === undefined) return window.localStorage.getItem(key); if (value === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, value); } catch { /* storage may be blocked; the page works without it */ } return null; };

export default function CreativeStudio({ enabled, quotesEnabled, session, scope, campaign, variant, readOnly = false, api = {}, pollMs = 4000, onSessionEnded }) {
  const caps_ = api.fetchCapabilities || fetchCapabilities; const assets_ = api.fetchAssets || fetchAssets; const upload_ = api.uploadAsset || uploadAsset;
  const start_ = api.startCreativeJob || startCreativeJob; const job_ = api.fetchJob || fetchJob; const revise_ = api.requestRevision || requestRevision; const approve_ = api.approveOutput || approveOutput; const quote_ = api.requestGenerationQuote || requestGenerationQuote;
  const base = { apiBaseUrl: API(), accessToken: session.accessToken };
  const memKey = `bg:creative-job:${scope.tenantId}:${variant.variant_id}`;
  const [open, setOpen] = useState(false);
  const [caps, setCaps] = useState({ status: "idle", value: null, error: "" });
  const [lib, setLib] = useState({ status: "idle", assets: [], skipped: 0, error: "" });
  const [brief, setBrief] = useState({ kind: "", platform: "", aspectRatio: "", text: "", assetIds: [] });
  const [job, setJob] = useState({ id: memory(memKey) || "", data: null, error: "", loading: false });
  const [rights, setRights] = useState(false); const [uploading, setUploading] = useState(""); const [uploadError, setUploadError] = useState("");
  const [note, setNote] = useState(""); const [action, setAction] = useState({ busy: "", message: "", error: "", confirming: "" });
  const live = useRef(true); const token = useRef(0);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const fail = useCallback((e) => { if (e && e.kind === "auth" && onSessionEnded) onSessionEnded(); }, [onSessionEnded]);

  useEffect(() => {
    if (!enabled || !open || caps.status !== "idle") return;
    setCaps({ status: "loading", value: null, error: "" });
    caps_({ ...base, tenantId: scope.tenantId }).then((value) => { if (live.current) setCaps({ status: "ready", value, error: "" }); }).catch((e) => { fail(e); if (live.current) setCaps({ status: "error", value: null, error: e.message }); });
  }, [enabled, open, caps.status]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadLib = useCallback(() => {
    setLib((l) => ({ ...l, status: "loading", error: "" }));
    assets_({ ...base, scope }).then((r) => { if (live.current) setLib({ status: "ready", assets: r.assets, skipped: r.skipped, error: "" }); }).catch((e) => { fail(e); if (live.current) setLib({ status: "error", assets: [], skipped: 0, error: e.message }); });
  }, [scope.tenantId, scope.projectId, scope.brandId, session.accessToken]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (brief.kind === "hybrid" && lib.status === "idle") loadLib(); }, [brief.kind, lib.status, loadLib]);

  // Follow a running job. Polling stops on its own for any finished state and when this component goes away.
  const refresh = useCallback(async (id) => {
    const mine = ++token.current;
    try { const data = await job_({ ...base, tenantId: scope.tenantId, jobId: id }); if (live.current && mine === token.current) setJob((j) => ({ ...j, id, data, error: "", loading: false })); }
    catch (e) { fail(e); if (live.current && mine === token.current) setJob((j) => ({ ...j, error: e.message, loading: false })); }
  }, [scope.tenantId, session.accessToken]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (enabled && open && job.id && !job.data && !job.error) { setJob((j) => ({ ...j, loading: true })); refresh(job.id); } }, [enabled, open, job.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!job.data || !["queued", "running"].includes(job.data.status)) return undefined;
    const t = setTimeout(() => refresh(job.id), pollMs); return () => clearTimeout(t);
  }, [job.data, job.id, pollMs, refresh]);

  const summary = <summary>Create an image or video for this post</summary>;
  if (!enabled) {
    return (
      <details className="ps-creative">{summary}
        <p>Creating images, videos and hybrid creative (your own media edited with AI) is not available in BizGenie yet. Nothing here uses credits. Your text drafts are not affected.</p>
      </details>
    );
  }
  const c = caps.value; const problems = c ? validateBrief(brief, c) : [];
  const platform = c && c.platforms.find((p) => p.key === brief.platform);
  const set = (patch) => setBrief((b) => ({ ...b, ...patch }));
  const toggleAsset = (id) => set({ assetIds: brief.assetIds.includes(id) ? brief.assetIds.filter((x) => x !== id) : [...brief.assetIds, id] });

  async function doUpload(file) {
    if (!file) return; setUploading(file.name); setUploadError("");
    try { const asset = await upload_({ ...base, scope, file, rightsConfirmed: rights, capabilities: c }); if (live.current) { setLib((l) => ({ ...l, assets: [asset, ...l.assets.filter((a) => a.id !== asset.id)] })); set({ assetIds: [...brief.assetIds, asset.id] }); } }
    catch (e) { fail(e); if (live.current) setUploadError(e.message); } finally { if (live.current) setUploading(""); }
  }
  const quote = () => quote_({ ...base, scope, campaign, variant, executionClass: KIND_CLASS[brief.kind], executionMode: brief.kind === "hybrid" ? "hybrid" : "ai", suppliedAssets: brief.kind === "hybrid" ? brief.assetIds : [] });
  const generate = async (q) => {
    try { const { jobId } = await start_({ ...base, scope, campaign, variant, brief, capabilities: c, quote: q }); memory(memKey, jobId); if (live.current) { setJob({ id: jobId, data: null, error: "", loading: true }); refresh(jobId); } return { ok: true }; }
    catch (e) { fail(e); return { ok: false, kind: e.kind === "credits" ? "insufficient" : e.kind === "quote" ? "expired" : e.kind, text: e.message }; }
  };
  const run = async (name, work) => {
    if (action.busy) return; setAction({ busy: name, message: "", error: "", confirming: "" });
    try { const message = await work(); if (live.current) setAction({ busy: "", message, error: "", confirming: "" }); }
    catch (e) { fail(e); if (live.current) setAction({ busy: "", message: "", error: e.message, confirming: "" }); }
  };
  const forget = () => { memory(memKey, null); setJob({ id: "", data: null, error: "", loading: false }); setAction({ busy: "", message: "", error: "", confirming: "" }); setNote(""); };
  const d = job.data;
  const creditsLine = d && (d.creditsCharged === null ? "BizGenie has not reported how many credits this used." : d.creditsCharged === 0 ? "No credits were used." : `${d.creditsCharged} credit${d.creditsCharged === 1 ? "" : "s"} used.`);

  return (
    <details className="ps-creative" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>{summary}
      {readOnly && <p className="ps-hint">You can view creative here. Only an owner or editor can create or approve it.</p>}
      {caps.status === "loading" && <p role="status">Loading what can be created…</p>}
      {caps.status === "error" && <div><p className="error" role="alert">{caps.error}</p><button type="button" className="secondary" onClick={() => setCaps({ status: "idle", value: null, error: "" })}>Try again</button></div>}
      {c && c.kinds.length === 0 && <p>No image or video options are available for this workspace yet.</p>}
      {c && c.kinds.length > 0 && !job.id && !readOnly && (
        <form className="ps-creative-form" onSubmit={(e) => e.preventDefault()} aria-label="New creative">
          <fieldset><legend>What to create</legend>
            {c.kinds.map((k) => <label key={k} className="ps-radio"><input type="radio" name={`kind-${variant.variant_id}`} checked={brief.kind === k} onChange={() => set({ kind: k, assetIds: k === "hybrid" ? brief.assetIds : [] })} /> {KIND_LABEL[k]}</label>)}
            {!c.kinds.includes("hybrid") && <p className="ps-hint">Hybrid (your own media with AI) is not offered for this workspace yet.</p>}
          </fieldset>
          <label htmlFor={`pl-${variant.variant_id}`}>Where will it be used?</label>
          <select id={`pl-${variant.variant_id}`} value={brief.platform} onChange={(e) => set({ platform: e.target.value, aspectRatio: "" })}><option value="">Choose a platform</option>{c.platforms.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select>
          <label htmlFor={`ar-${variant.variant_id}`}>Shape</label>
          <select id={`ar-${variant.variant_id}`} value={brief.aspectRatio} onChange={(e) => set({ aspectRatio: e.target.value })} disabled={!platform}><option value="">{platform ? "Choose a shape" : "Choose a platform first"}</option>{platform && platform.aspectRatios.map((a) => <option key={a} value={a}>{a}</option>)}</select>
          <label htmlFor={`br-${variant.variant_id}`}>Brief</label>
          <textarea id={`br-${variant.variant_id}`} value={brief.text} maxLength={c.maxBriefChars} onChange={(e) => set({ text: e.target.value })} aria-describedby={`brc-${variant.variant_id}`} />
          <small id={`brc-${variant.variant_id}`}>{brief.text.length} of {c.maxBriefChars} characters. Describe the subject, mood and anything to avoid.</small>

          {brief.kind === "hybrid" && (
            <fieldset><legend>Your media</legend>
              {lib.status === "loading" && <p role="status">Loading your media…</p>}
              {lib.status === "error" && <div><p className="error" role="alert">{lib.error}</p><button type="button" className="secondary" onClick={loadLib}>Try again</button></div>}
              {lib.status === "ready" && lib.assets.length === 0 && <p>You have not added any media yet. Add an image or video below.</p>}
              {lib.status === "ready" && lib.assets.map((a) => <label key={a.id} className="ps-radio"><input type="checkbox" checked={brief.assetIds.includes(a.id)} onChange={() => toggleAsset(a.id)} /> {a.filename} <span className="ps-hint">({a.kind}, {mb(a.bytes)}{a.rightsConfirmed ? "" : ", rights not confirmed"})</span></label>)}
              {lib.skipped > 0 && <p className="ps-hint">{lib.skipped} file{lib.skipped === 1 ? "" : "s"} could not be shown.</p>}
              <label className="ps-radio"><input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} /> I have the right to use this media, including any people shown in it.</label>
              <label htmlFor={`up-${variant.variant_id}`}>Add media</label>
              <input id={`up-${variant.variant_id}`} type="file" accept={c.contentTypes.join(",")} disabled={!rights || Boolean(uploading)} onChange={(e) => { doUpload(e.target.files && e.target.files[0]); e.target.value = ""; }} />
              <small>Up to {mb(c.maxAssetBytes)} each, and up to {c.maxAssets} files per creative. Confirm your rights first.</small>
              {uploading && <p role="status">Adding {uploading}…</p>}
              {uploadError && <p className="error" role="alert">{uploadError}</p>}
            </fieldset>
          )}

          {problems.length > 0 && brief.kind && <ul className="ps-hint" aria-label="What is still needed">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
          <GenerateWithQuote key={`${brief.kind}:${brief.assetIds.join(",")}:${campaign.version}`} label={brief.kind ? `Create ${brief.kind === "hybrid" ? "hybrid creative" : brief.kind}` : "Create"} busyText="Starting…" quotesEnabled={quotesEnabled} disabled={problems.length > 0} onQuote={quote} onGenerate={generate} />
        </form>
      )}

      {job.id && (
        <div className="ps-creative-job" aria-live="polite">
          {job.loading && !d && <p role="status">Checking your creative…</p>}
          {job.error && <div><p className="error" role="alert">{job.error}</p><button type="button" className="secondary" onClick={() => { setJob((j) => ({ ...j, error: "", loading: true })); refresh(job.id); }}>Check again</button></div>}
          {d && d.status === "queued" && <p role="status">Waiting in the queue. Credits are used only if it succeeds.</p>}
          {d && d.status === "running" && <p role="status">Being created. Credits are used only if it succeeds.</p>}
          {d && d.status === "failed" && <div><p className="error" role="alert">{d.failure ? d.failure.message : "This could not be created."} {creditsLine}</p><button type="button" className="secondary" onClick={forget}>Start again</button></div>}
          {d && d.status === "cancelled" && <div><p>This was cancelled. {creditsLine}</p><button type="button" className="secondary" onClick={forget}>Start again</button></div>}
          {d && (d.status === "ready_for_review" || d.status === "approved") && (
            <div>
              <h4>{d.status === "approved" ? "Approved creative" : "Ready for your review"}</h4>
              {d.outputs.map((o) => (
                <figure key={o.id} className="ps-creative-output">
                  {o.kind === "image" ? <img src={o.url} alt={`${KIND_LABEL[d.kind]} created for this post`} width={o.width || undefined} height={o.height || undefined} loading="lazy" /> : <video src={o.url} controls preload="metadata" aria-label="Video created for this post" />}
                  <figcaption><span className="ps-tag">{PROVENANCE_LABEL[o.origin]}</span>{o.suppliedAssetIds.length > 0 && ` Uses ${o.suppliedAssetIds.length} of your file${o.suppliedAssetIds.length === 1 ? "" : "s"}.`}</figcaption>
                </figure>
              ))}
              <p className="ps-hint">{creditsLine} The preview above is what BizGenie created. Check it carefully before approving.</p>
              {d.status === "ready_for_review" && !readOnly && (
                <div>
                  {action.confirming === "approve" ? (
                    <div role="group" aria-label="Confirm approval"><p>Approve this creative for use in your post? Approving does not publish anything.</p><div className="ps-camp-actions"><button type="button" className="ps-primary" disabled={Boolean(action.busy)} onClick={() => run("approve", async () => { await approve_({ ...base, tenantId: scope.tenantId, jobId: job.id, outputId: d.outputs[0].id }); await refresh(job.id); return "Approved. It has not been published."; })}>{action.busy === "approve" ? "Approving…" : "Yes, approve"}</button><button type="button" className="secondary" onClick={() => setAction((a) => ({ ...a, confirming: "" }))}>Not yet</button></div></div>
                  ) : (
                    <div className="ps-camp-actions"><button type="button" className="ps-primary" disabled={Boolean(action.busy)} onClick={() => setAction({ busy: "", message: "", error: "", confirming: "approve" })}>Approve</button></div>
                  )}
                  <label htmlFor={`rv-${variant.variant_id}`}>Ask for a change</label>
                  <textarea id={`rv-${variant.variant_id}`} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
                  <small>A change creates a new version. BizGenie cannot show the cost of a change in advance yet.</small>
                  <div className="ps-camp-actions"><button type="button" className="secondary" disabled={!note.trim() || Boolean(action.busy)} onClick={() => run("revise", async () => { const r = await revise_({ ...base, tenantId: scope.tenantId, jobId: job.id, note }); memory(memKey, r.jobId); setNote(""); setJob({ id: r.jobId, data: null, error: "", loading: true }); refresh(r.jobId); return "Your change was requested."; })}>{action.busy === "revise" ? "Sending…" : "Request this change"}</button></div>
                </div>
              )}
              {d.status === "approved" && <p>Approved by you. It has not been published.</p>}
            </div>
          )}
          {action.message && <p role="status">{action.message}</p>}
          {action.error && <p className="error" role="alert">{action.error}</p>}
        </div>
      )}
    </details>
  );
}
