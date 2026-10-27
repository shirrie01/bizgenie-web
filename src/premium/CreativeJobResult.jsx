import React, { useCallback, useEffect, useRef, useState } from "react";
import MediaPreview from "../MediaPreview";
import { submitForReview as realSubmit } from "./campaignManagementClient";
import { attachCreativeJob as realAttach, cancelCreativeJob as realCancel, fetchCreativeJob as realFetch } from "./creativeJobsClient";

// One finished (or running) generation, as the server describes it (BG-STUDIO-025-FE). Text and media can be attached to the post they were made for; a strategy
// plan is shown as a plan and offers no attach. "Finished" is not approved and not published: approval and publication are shown only as the server reports them
// for the CURRENT version of the post, and the picture/video is shown only through the existing authenticated, revision-scoped delivery after it is attached.
const API = () => import.meta.env.VITE_BIZGENIE_API_URL || "http://localhost:8080";
const STATE_TEXT = { queued: "Waiting to start", claimed: "Starting", calling: "Being created", recovery_required: "Being checked with the provider", succeeded: "Finished", failed: "Not made", cancelled: "Cancelled" };
const ACTIVE = ["queued", "claimed", "calling", "recovery_required"];
const APPROVAL_TEXT = { approved: "Approved for this version", published: "Published", not_approved: "Not approved yet" };

export default function CreativeJobResult({ jobId, session, scope, campaign, variant, canAttach = false, api = {}, pollMs = 3000, onAttached, onSubmitted, onSessionEnded }) {
  const [s, setS] = useState({ status: "loading", job: null, error: "" });
  const [msg, setMsg] = useState({ kind: "", text: "" }); const [busy, setBusy] = useState("");
  const live = useRef(true); const seq = useRef(0);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const base = { apiBaseUrl: API(), accessToken: session.accessToken, scope };
  const fail = useCallback((e) => { if (e && e.kind === "auth" && onSessionEnded) onSessionEnded(); }, [onSessionEnded]);
  const load = useCallback(() => {
    const mine = ++seq.current;
    return (api.fetchCreativeJob || realFetch)({ ...base, jobId }).then((job) => { if (live.current && mine === seq.current) setS({ status: "ready", job, error: "" }); return job; })
      .catch((e) => { fail(e); if (live.current && mine === seq.current) setS((p) => ({ status: p.job ? "ready" : "error", job: p.job, error: e.message })); return null; });
  }, [jobId, scope.tenantId, scope.projectId, scope.brandId, session.accessToken]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setS({ status: "loading", job: null, error: "" }); load(); }, [load]);
  useEffect(() => { // follow a running job
    if (!s.job || !ACTIVE.includes(s.job.state)) return undefined;
    const t = setTimeout(load, pollMs); return () => clearTimeout(t);
  }, [s.job, pollMs, load]);

  const run = async (name, work) => { if (busy) return; setBusy(name); setMsg({ kind: "", text: "" }); try { await work(); } catch (e) { fail(e); if (live.current) setMsg({ kind: e.kind === "unconfirmed" ? "warn" : "error", text: e.message }); } finally { if (live.current) setBusy(""); } };
  const attach = () => run("attach", async () => { const job = await (api.attachCreativeJob || realAttach)({ ...base, jobId }); if (!live.current) return; setS({ status: "ready", job, error: "" }); setMsg({ kind: "ok", text: "Attached to the post. Review it below before it can be approved." }); if (onAttached) await onAttached(job); });
  const submit = () => run("review", async () => { await (api.submitForReview || realSubmit)({ apiBaseUrl: API(), accessToken: session.accessToken, scope, campaign, variant, revisionId: s.job.association.revisionId }); if (!live.current) return; setMsg({ kind: "ok", text: "Sent for review. Preview it and decide below; sending for review approves and publishes nothing." }); if (onSubmitted) await onSubmitted(); });
  const cancel = () => run("cancel", async () => { await (api.cancelCreativeJob || realCancel)({ ...base, jobId }); if (live.current) { setMsg({ kind: "ok", text: "Cancelled. You were not charged." }); load(); } });

  if (s.status === "loading") return <p role="status">Loading the result…</p>;
  if (s.status === "error" || !s.job) return <div><p className="error" role="alert">{s.error || "This result could not be loaded."}</p><button type="button" className="secondary" onClick={() => { setS({ status: "loading", job: null, error: "" }); load(); }}>Try again</button></div>;
  const j = s.job; const a = j.association;
  const inCurrent = (id) => Boolean(a && a.current && variant && variant.current_content && Array.isArray(variant.current_content.asset_refs) && variant.current_content.asset_refs.some((r) => r.asset_id === id));
  return (
    <section className="ps-job" aria-label="Creative result">
      <p><strong>{STATE_TEXT[j.state]}.</strong> {j.state === "succeeded" ? "Finished is not approved and not published." : null}</p>
      {s.error && <p className="ps-warn" role="status">{s.error} Showing the last known state.</p>}
      {msg.text && <p className={msg.kind === "error" ? "error" : msg.kind === "warn" ? "ps-warn" : ""} role={msg.kind === "ok" ? "status" : "alert"}>{msg.text}</p>}
      {j.state === "failed" && <p className="error" role="alert">It could not be made. You were not charged. {j.retry === "new_quote" ? "Get a new price to try again." : ""}</p>}
      {j.state === "recovery_required" && <p className="ps-hint">BizGenie is checking the result with the provider. Do not start it again; nothing is sent twice.</p>}
      {j.outputs.map((o, i) => {
        if (o.type === "strategy_plan") return (
          <article key={i} className="ps-job-strategy" aria-label="Strategy plan">
            <h4>Strategy plan <small>(a plan, not creative)</small></h4>
            <p><strong>Chosen angle:</strong> {o.angle}</p>
            {o.specificity && <p>{o.specificity}</p>}{o.execution && <p><strong>How it would run:</strong> {o.execution}</p>}
            {o.candidates.length > 1 && <details><summary>Other angles considered ({o.candidates.length - 1})</summary><ul>{o.candidates.filter((c) => c !== o.angle).map((c) => <li key={c}>{c}</li>)}</ul></details>}
            {o.rationale && <p className="ps-hint">Why: {o.rationale}</p>}
            <p className="ps-hint">A plan cannot be attached to a post. It guides the draft that follows it.</p>
          </article>
        );
        if (o.type === "text") return (
          <article key={i} className="ps-job-text" aria-label="Written draft">
            <h4>Written draft</h4>{o.title && <p><strong>{o.title}</strong></p>}<p style={{ whiteSpace: "pre-wrap" }}>{o.body}</p>{o.caption && <p className="ps-hint">Caption: {o.caption}</p>}
          </article>
        );
        return (
          <article key={i} className="ps-job-media" aria-label={`${o.kind === "video" ? "Video" : "Image"} result`}>
            <h4>{o.kind === "video" ? "Video" : "Image"}</h4>
            {inCurrent(o.assetId) && variant && campaign
              ? <MediaPreview apiBaseUrl={API()} session={session} campaign={campaign} variant={variant} media={{ id: o.assetId, kind: o.kind, role: "primary" }} altText="" />
              : <p className="ps-hint">{j.state === "succeeded" && !a ? "It is stored privately. Attach it to the post to review it." : a && !a.current ? "A newer version of the post replaced this one, so it is not shown as the current version." : ""}</p>}
          </article>
        );
      })}
      {j.skippedOutputs > 0 && <p className="ps-hint">{j.skippedOutputs} output{j.skippedOutputs === 1 ? "" : "s"} could not be shown.</p>}
      {j.state === "succeeded" && j.outputs.length === 0 && <p className="ps-hint">The job finished, but nothing that can be shown came with it.</p>}
      {a && <p role="status"><strong>{a.current ? APPROVAL_TEXT[a.approval] : "Replaced by a newer version of the post"}.</strong>{a.current ? " Approval applies only to the current version." : ""}</p>}
      {j.canAttach && canAttach && <button type="button" className="ps-primary" disabled={Boolean(busy)} onClick={attach}>{busy === "attach" ? "Attaching…" : "Attach to this post"}</button>}
      {a && a.current && a.approval === "not_approved" && canAttach && variant && variant.workflow === "draft" && inCurrent((j.outputs.find((o) => o.type === "media") || {}).assetId) && <button type="button" className="ps-primary" disabled={Boolean(busy)} onClick={submit}>{busy === "review" ? "Sending…" : "Send for review"}</button>}
      {j.canAttach && !canAttach && <p className="ps-hint">Only the workspace owner can attach a result to a post.</p>}
      {!j.canAttach && !a && j.state === "succeeded" && j.outputs.length > 0 && j.outputs.every((o) => !o.attachable) && <p className="ps-hint">Nothing here can be attached to a post.</p>}
      {j.canCancel && canAttach && <button type="button" className="secondary" disabled={Boolean(busy)} onClick={cancel}>Cancel before it starts</button>}
    </section>
  );
}
