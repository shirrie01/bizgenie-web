import React, { useCallback, useEffect, useRef, useState } from "react";
import GenerateWithQuote from "./GenerateWithQuote";
import { HYBRID_BLOCKER, IMAGE_RATIOS, KIND_LABEL, PREVIEW_BLOCKER, VIDEO_DURATIONS, VIDEO_QUALITIES, VIDEO_RATIOS, executionClassFor, fetchVideo, newKey, startImage, startVideo, validateBrief } from "./creativeProductionClient";
import { costCheckAvailable, requestCostCheck } from "./costCheck";

// Image and video for one post (BG-STUDIO-020-FE), built on the REAL backend routes (see creativeProductionClient.js). The cost is checked first
// (workstream D). What the backend cannot do yet is said plainly instead of simulated: it returns no viewable address for a finished file and has no
// approval route for media, so a finished creative is reported as "created and stored privately", never shown and never marked approved here.
// Hybrid (customer media + AI) has no intake, rights or composition contract, so it is named as unavailable and is not offered as a choice.
// With the build gate off, nothing here calls the backend.
const API = () => import.meta.env.VITE_BIZGENIE_API_URL || "http://localhost:8080";
const memory = (key, value) => { try { if (value === undefined) return window.localStorage.getItem(key); if (value === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, value); } catch { /* storage may be blocked; the page works without it */ } return null; };
const TERMINAL = ["completed", "failed"];
const readAttempt = (key) => { try { const v = JSON.parse(memory(key) || "null"); return v && v.ids && v.ids.executionId && v.ids.generationId && ["image", "video"].includes(v.kind) ? v : null; } catch { return null; } };

export default function CreativeStudio({ enabled, session, scope, campaign, variant, topic = "", contentItemId = "", readOnly = false, api = {}, pollMs = 4000, onSessionEnded }) {
  const memKey = `bg:creative:${scope.tenantId}:${variant.variant_id}`;
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState({ kind: "", aspectRatio: "", duration: 8, quality: "normal", text: "" });
  const [attempt, setAttempt] = useState(() => readAttempt(memKey)); // { kind, ids, record? }
  const [error, setError] = useState("");
  const live = useRef(true); const token = useRef(0); const pending = useRef(null);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const base = { apiBaseUrl: API(), accessToken: session.accessToken };
  const fail = useCallback((e) => { if (e && e.kind === "auth" && onSessionEnded) onSessionEnded(); }, [onSessionEnded]);
  const image = api.startImage || startImage; const video = api.startVideo || startVideo; const read = api.fetchVideo || fetchVideo; const cost = api.requestCostCheck || requestCostCheck;
  const save = (next) => { setAttempt(next); memory(memKey, next ? JSON.stringify(next) : null); };

  // Follow a video until it finishes. Polling stops for any finished state and when this component goes away or the workspace changes.
  const refresh = useCallback(async (a) => {
    const mine = ++token.current;
    try { const record = await read({ ...base, generationId: a.ids.generationId }); if (live.current && mine === token.current) { const next = { ...a, record }; setAttempt(next); memory(memKey, JSON.stringify(next)); setError(""); } }
    catch (e) { fail(e); if (live.current && mine === token.current) setError(e.message); }
  }, [session.accessToken, memKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (enabled && open && attempt && attempt.kind === "video" && !attempt.record) refresh(attempt); }, [enabled, open, attempt && attempt.ids.generationId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const r = attempt && attempt.record;
    if (!open || !attempt || attempt.kind !== "video" || !r || TERMINAL.includes(r.status)) return undefined;
    const t = setTimeout(() => refresh(attempt), pollMs); return () => clearTimeout(t);
  }, [open, attempt, pollMs, refresh]);

  const summary = <summary>Create an image or video for this post</summary>;
  if (!enabled) {
    return (
      <details className="ps-creative">{summary}
        <p>Creating images and videos is not available in BizGenie yet. Nothing here uses credits, and your text drafts are not affected.</p>
        <p className="ps-hint">{HYBRID_BLOCKER}</p>
      </details>
    );
  }
  const problems = brief.kind ? validateBrief(brief) : [];
  const set = (patch) => setBrief((b) => ({ ...b, ...patch }));
  const ratios = brief.kind === "video" ? VIDEO_RATIOS : IMAGE_RATIOS;
  const execClass = executionClassFor(brief.kind || "image", brief.quality);
  const quote = () => cost({ ...base, scope, campaign, variant, executionClass: execClass, executionMode: "ai", suppliedAssets: [] });
  const generate = async () => {
    // One attempt = one pair of ids, reused by every retry of that attempt so a retry replays the same job instead of creating a second paid one.
    if (!pending.current) pending.current = { kind: brief.kind, brief: { ...brief }, ids: { executionId: newKey("exec"), generationId: newKey("gen") } };
    const a = pending.current; memory(memKey, JSON.stringify({ kind: a.kind, ids: a.ids, brief: a.brief })); // remembered before sending, so a reload mid-request can replay the same job
    try {
      const start = a.kind === "video" ? video : image;
      const record = await start({ ...base, scope, campaign, contentItemId, topic, platform: variant.platform, brief: a.brief, ids: a.ids });
      pending.current = null; if (live.current) { save({ kind: a.kind, ids: a.ids, brief: a.brief, record }); setError(""); }
      return { ok: true };
    } catch (e) {
      fail(e);
      if (e.kind !== "unconfirmed") { pending.current = null; memory(memKey, null); } // nothing was started: the next try is a fresh attempt
      return { ok: false, kind: e.kind === "credits" ? "insufficient" : e.kind, text: e.message };
    }
  };
  const [sending, setSending] = useState(false);
  const resend = async () => {
    if (sending || !attempt || !attempt.brief) return; setSending(true); setError("");
    pending.current = { kind: attempt.kind, brief: attempt.brief, ids: attempt.ids };
    const out = await generate(); if (live.current) { setSending(false); if (!out.ok) setError(out.text); }
  };
  const again = () => { pending.current = null; save(null); setError(""); };
  const r = attempt && attempt.record;

  return (
    <details className="ps-creative" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>{summary}
      {readOnly && <p className="ps-hint">You can view creative here. Only an owner or editor can create it.</p>}
      {!attempt && !readOnly && (
        <form className="ps-creative-form" onSubmit={(e) => e.preventDefault()} aria-label="New creative">
          <fieldset><legend>What to create</legend>
            {["image", "video"].map((k) => <label key={k} className="ps-radio"><input type="radio" name={`kind-${variant.variant_id}`} checked={brief.kind === k} onChange={() => set({ kind: k, aspectRatio: "" })} /> {KIND_LABEL[k]}</label>)}
            <p className="ps-hint">{HYBRID_BLOCKER}</p>
          </fieldset>
          {brief.kind && (
            <>
              <label htmlFor={`ar-${variant.variant_id}`}>Shape</label>
              <select id={`ar-${variant.variant_id}`} value={brief.aspectRatio} onChange={(e) => set({ aspectRatio: e.target.value })}><option value="">Choose a shape</option>{ratios.map((a) => <option key={a} value={a}>{a}</option>)}</select>
              {brief.kind === "video" && (
                <>
                  <label htmlFor={`du-${variant.variant_id}`}>Length</label>
                  <select id={`du-${variant.variant_id}`} value={brief.duration} onChange={(e) => set({ duration: Number(e.target.value) })}>{VIDEO_DURATIONS.map((d) => <option key={d} value={d}>{d} seconds</option>)}</select>
                  <label htmlFor={`qu-${variant.variant_id}`}>Quality</label>
                  <select id={`qu-${variant.variant_id}`} value={brief.quality} onChange={(e) => set({ quality: e.target.value })}>{VIDEO_QUALITIES.map((q) => <option key={q} value={q}>{q === "normal" ? "Standard" : "Premium"}</option>)}</select>
                </>
              )}
              <label htmlFor={`br-${variant.variant_id}`}>Brief</label>
              <textarea id={`br-${variant.variant_id}`} value={brief.text} maxLength={2000} onChange={(e) => set({ text: e.target.value })} aria-describedby={`brc-${variant.variant_id}`} />
              <small id={`brc-${variant.variant_id}`}>{brief.text.length} of 2000 characters. Describe the subject, mood and anything to avoid. Your Brand Brain and this campaign are used as context.</small>
            </>
          )}
          {problems.length > 0 && brief.kind && <ul className="ps-hint" aria-label="What is still needed">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
          {brief.kind && <GenerateWithQuote key={`${brief.kind}:${brief.quality}:${campaign.version}`} label={`Create ${brief.kind}`} busyText="Starting…" quotesEnabled={costCheckAvailable()} disabled={problems.length > 0} onQuote={quote} onGenerate={generate} />}
        </form>
      )}

      {attempt && (
        <div className="ps-creative-job" aria-live="polite">
          {!r && attempt.kind === "video" && !error && <p role="status">Checking your video…</p>}
          {!r && attempt.kind === "image" && (
            <div>
              <p role="alert" className="error">The result of your image request is not known. Sending the same request again is safe: it cannot run twice or charge you twice.</p>
              {attempt.brief && <button type="button" className="secondary" disabled={sending} onClick={resend}>{sending ? "Sending…" : "Send the same request again"}</button>}
              <p className="ps-hint">Starting again instead abandons that request and may use credits again if the first one went through.</p>
              <button type="button" className="secondary" onClick={again}>Start again</button>
            </div>
          )}
          {error && <div><p className="error" role="alert">{error}</p><button type="button" className="secondary" onClick={() => refresh(attempt)}>Check again</button></div>}
          {r && ["queued", "submitted", "processing"].includes(r.status) && <p role="status">Being made. Credits are used only if it succeeds.{r.kind === "image" ? " This page cannot check an image's progress yet." : ""}</p>}
          {r && r.status === "failed" && <div><p className="error" role="alert">This could not be made. You are not charged for a failed attempt.</p><button type="button" className="secondary" onClick={again}>Start again</button></div>}
          {r && r.status === "completed" && (
            <div>
              <h4>{KIND_LABEL[r.kind]} created</h4>
              <p>{PREVIEW_BLOCKER}</p>
              <p className="ps-hint">Approval status on the server: {r.approvalStatus === "pending" ? "waiting for approval" : r.approvalStatus}. It is not scheduled or published.</p>
              <button type="button" className="secondary" onClick={again}>Create another</button>
            </div>
          )}
        </div>
      )}
    </details>
  );
}
