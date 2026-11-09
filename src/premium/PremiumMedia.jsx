import React, { useCallback, useEffect, useRef, useState } from "react";
import { MAX_BYTES, addFile, checkFile, deleteAsset as realDelete, fetchAssetPreview as realPreview, fetchAssets as realFetch, newUploadKey, revokeAsset as realRevoke } from "./mediaIntakeClient";

// Your own photos and short videos (BG-STUDIO-025-FE), on the real /customer/assets routes. A file is usable only when the server says "ready" after its own
// safety check; rights are the customer's own confirmation and are labelled that way. Add, withdraw and delete are owner-only (the server answers 404 to a member).
const API = () => import.meta.env.VITE_BIZGENIE_API_URL || "http://localhost:8080";
const STATE_TEXT = { ready: "Ready to use", quarantined: "Being checked", initiated: "Upload not finished", rejected: "Did not pass the safety check", revoked: "Withdrawn", deleted: "Deleted" };
const STEP_TEXT = { starting: "Starting the upload…", uploading: "Uploading…", checking: "Checking the file for safety…" };
const mb = (n) => `${(n / (1024 * 1024)).toFixed(1)} MB`;

function Thumb({ asset, base, api }) {
  const [url, setUrl] = useState(""); const [err, setErr] = useState(false);
  useEffect(() => {
    if (asset.kind !== "image" || !asset.usable) return undefined;
    const c = new AbortController(); let made = ""; setErr(false);
    (api.fetchAssetPreview || realPreview)({ ...base, assetId: asset.id, signal: c.signal }).then((u) => { made = u; setUrl(u); }).catch(() => { if (!c.signal.aborted) setErr(true); });
    return () => { c.abort(); if (made) URL.revokeObjectURL(made); };
  }, [asset.id, asset.usable]); // eslint-disable-line react-hooks/exhaustive-deps
  if (asset.kind === "video") return <span className="ps-hint">Video</span>;
  if (err) return <span className="ps-hint">Preview unavailable</span>;
  return url ? <img src={url} alt={`Your file ${asset.filename}`} width="96" height="96" style={{ objectFit: "cover" }} /> : <span className="ps-hint">{asset.usable ? "Loading preview…" : ""}</span>;
}

export default function PremiumMedia({ enabled, session, scope, isOwner, api = {}, onSessionEnded }) {
  const [list, setList] = useState({ status: "idle", assets: [], skipped: 0, error: "" });
  const [msg, setMsg] = useState({ kind: "", text: "" }); const [step, setStep] = useState(""); const [rights, setRights] = useState(false); const [file, setFile] = useState(null);
  const [confirming, setConfirming] = useState(""); const [busy, setBusy] = useState("");
  const live = useRef(true); const seq = useRef(0); const key = useRef(""); const input = useRef(null);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const base = { apiBaseUrl: API(), accessToken: session.accessToken, scope };
  const fail = useCallback((e) => { if (e && e.kind === "auth" && onSessionEnded) onSessionEnded(); }, [onSessionEnded]);
  const load = useCallback(() => {
    const mine = ++seq.current; setList((l) => ({ ...l, status: "loading", error: "" }));
    (api.fetchAssets || realFetch)(base).then((r) => { if (live.current && mine === seq.current) setList({ status: "ready", ...r, error: "" }); }).catch((e) => { fail(e); if (live.current && mine === seq.current) setList({ status: "error", assets: [], skipped: 0, error: e.message }); });
  }, [scope.tenantId, scope.projectId, scope.brandId, session.accessToken]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (enabled) load(); }, [enabled, load]);

  if (!enabled) return (
    <section className="ps-stage ps-media" aria-labelledby="pmd-h"><h2 id="pmd-h">Your media</h2>
      <p>Adding your own photos and videos is not switched on in BizGenie yet. Nothing has been uploaded.</p></section>
  );
  const err = file ? checkFile(file) : "";
  const add = async () => {
    if (busy || !file || err || !rights) return; setBusy("add"); setMsg({ kind: "", text: "" }); key.current = key.current || newUploadKey();
    try { const done = await (api.addFile || addFile)({ ...base, file, key: key.current, onStep: (s) => live.current && setStep(s) }); key.current = "";
      if (!live.current) return; setFile(null); setRights(false); if (input.current) input.current.value = "";
      setMsg(done.state === "ready" ? { kind: "ok", text: `${done.filename} is ready to use. Your rights confirmation was recorded as entered by you${done.rightsPolicy ? ` (terms version ${done.rightsPolicy})` : ""}.` } : { kind: "error", text: `${done.filename} did not pass the safety check. It is kept privately and cannot be used.` }); load(); }
    catch (e) { fail(e); if (live.current) { if (e.kind === "invalid_file" || e.kind === "conflict") key.current = ""; setMsg({ kind: e.kind === "unconfirmed" ? "warn" : "error", text: e.message }); } }
    finally { if (live.current) { setBusy(""); setStep(""); } }
  };
  const act = (name, work, done) => async () => { if (busy) return; setBusy(name); setMsg({ kind: "", text: "" }); try { await work(); if (live.current) { setConfirming(""); setMsg({ kind: "ok", text: done }); load(); } } catch (e) { fail(e); if (live.current) setMsg({ kind: e.kind === "unconfirmed" ? "warn" : "error", text: e.message }); } finally { if (live.current) setBusy(""); } };

  return (
    <section className="ps-stage ps-media" aria-labelledby="pmd-h">
      <h2 id="pmd-h">Your media</h2>
      <p className="ps-hint">PNG, JPEG, WebP or MP4, up to {mb(MAX_BYTES)}. Files are kept privately for your workspace and checked before they can be used.</p>
      {msg.text && <p className={msg.kind === "error" ? "error" : msg.kind === "warn" ? "ps-warn" : ""} role={msg.kind === "ok" ? "status" : "alert"}>{msg.text}</p>}
      {isOwner ? (
        <form className="ps-media-add" onSubmit={(e) => { e.preventDefault(); add(); }} aria-label="Add a file">
          <label htmlFor="pmd-file">Choose a file</label>
          <input id="pmd-file" ref={input} type="file" accept="image/png,image/jpeg,image/webp,video/mp4" disabled={Boolean(busy)} onChange={(e) => { key.current = ""; setFile(e.target.files && e.target.files[0] ? e.target.files[0] : null); }} aria-describedby={err ? "pmd-err" : undefined} />
          {err && <p id="pmd-err" className="error" role="alert">{err}</p>}
          <label className="ps-check"><input type="checkbox" checked={rights} disabled={Boolean(busy)} onChange={(e) => setRights(e.target.checked)} /> I own this file or have the right to use it in my marketing, and anyone shown has agreed.</label>
          <p className="ps-hint">This is your own confirmation. BizGenie records it as entered by you; it does not verify it.</p>
          <button type="submit" className="ps-primary" disabled={Boolean(busy) || !file || Boolean(err) || !rights}>{busy === "add" ? STEP_TEXT[step] || "Adding…" : "Add file"}</button>
        </form>
      ) : <p className="ps-hint">Only the workspace owner can add or remove files.</p>}
      <h3>Files</h3>
      {list.status === "loading" && <p role="status">Loading your media…</p>}
      {list.status === "error" && <div><p className="error" role="alert">{list.error}</p><button type="button" className="secondary" onClick={load}>Try again</button></div>}
      {list.status === "ready" && list.assets.length === 0 && <p>You have not added any files yet.</p>}
      {list.status === "ready" && list.skipped > 0 && <p className="ps-hint">{list.skipped} file{list.skipped === 1 ? "" : "s"} could not be shown.</p>}
      {list.status === "ready" && list.assets.length > 0 && (
        <ul className="ps-conn-list" aria-label="Your files">
          {list.assets.map((a) => (
            <li key={a.id}>
              <Thumb asset={a} base={base} api={api} /> <strong>{a.filename}</strong> · {mb(a.bytes)} · <span>{STATE_TEXT[a.state]}</span>
              {isOwner && a.state === "ready" && (confirming === a.id
                ? <span role="group" aria-label={`Remove ${a.filename}`}> Remove {a.filename}? <button type="button" className="secondary" disabled={Boolean(busy)} onClick={act(`r:${a.id}`, () => (api.revokeAsset || realRevoke)({ ...base, assetId: a.id }), `${a.filename} was withdrawn. Posts that already use it are unchanged.`)}>Withdraw it</button> <button type="button" className="secondary" disabled={Boolean(busy)} onClick={act(`d:${a.id}`, () => (api.deleteAsset || realDelete)({ ...base, assetId: a.id }), `${a.filename} was deleted. Its stored copy is removed under the retention policy.`)}>Delete it</button> <button type="button" className="secondary" onClick={() => setConfirming("")}>Keep it</button></span>
                : <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => setConfirming(a.id)} aria-label={`Remove ${a.filename}`}>Remove</button>)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
