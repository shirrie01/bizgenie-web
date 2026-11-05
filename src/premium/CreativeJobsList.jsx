import React, { useCallback, useEffect, useRef, useState } from "react";
import CreativeJobResult from "./CreativeJobResult";
import { fetchCreativeJobs as realList } from "./creativeJobsClient";

// Earlier results for one post (BG-STUDIO-025-FE), from GET /customer/creative-jobs filtered to the post. Opening one loads it from the server.
const API = () => import.meta.env.VITE_BIZGENIE_API_URL || "http://localhost:8080";
const STATE_TEXT = { queued: "Waiting to start", claimed: "Starting", calling: "Being created", recovery_required: "Being checked", succeeded: "Finished", failed: "Not made", cancelled: "Cancelled" };
const when = (iso) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

export default function CreativeJobsList({ session, scope, campaign, variant, canAttach, api = {}, onAttached, onSessionEnded, reloadKey = 0 }) {
  const [s, setS] = useState({ status: "loading", jobs: [], skipped: 0, error: "" }); const [open, setOpen] = useState("");
  const live = useRef(true); const seq = useRef(0);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const load = useCallback(() => {
    const mine = ++seq.current; setS((p) => ({ ...p, status: "loading", error: "" }));
    (api.fetchCreativeJobs || realList)({ apiBaseUrl: API(), accessToken: session.accessToken, scope }).then((r) => { if (live.current && mine === seq.current) setS({ status: "ready", ...r, error: "" }); })
      .catch((e) => { if (e && e.kind === "auth" && onSessionEnded) onSessionEnded(); if (live.current && mine === seq.current) setS({ status: "error", jobs: [], skipped: 0, error: e.message }); });
  }, [scope.tenantId, scope.projectId, scope.brandId, session.accessToken]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load, reloadKey]);
  const mine = s.jobs.filter((j) => j.variantId === variant.variant_id);
  return (
    <details className="ps-job-list"><summary>Earlier results for this post</summary>
      {s.status === "loading" && <p role="status">Loading earlier results…</p>}
      {s.status === "error" && <div><p className="error" role="alert">{s.error}</p><button type="button" className="secondary" onClick={load}>Try again</button></div>}
      {s.status === "ready" && mine.length === 0 && <p>Nothing has been made for this post yet.</p>}
      {s.status === "ready" && s.skipped > 0 && <p className="ps-hint">{s.skipped} result{s.skipped === 1 ? "" : "s"} could not be shown.</p>}
      {s.status === "ready" && mine.length > 0 && (
        <ul aria-label="Earlier results">
          {mine.map((j) => (
            <li key={j.id}>{when(j.createdAt)} · {j.executionClass} · <strong>{STATE_TEXT[j.state]}</strong>{" "}
              <button type="button" className="secondary" aria-expanded={open === j.id} onClick={() => setOpen(open === j.id ? "" : j.id)}>{open === j.id ? "Hide" : "Open"}</button>
              {open === j.id && <CreativeJobResult jobId={j.id} session={session} scope={scope} campaign={campaign} variant={variant} canAttach={canAttach} api={api} onAttached={onAttached} onSessionEnded={onSessionEnded} />}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
