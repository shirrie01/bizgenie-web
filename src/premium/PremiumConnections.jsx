import React, { useCallback, useEffect, useRef, useState } from "react";
import { PROVIDERS, PROVIDER_LABEL, cancelDispatch as realCancel, completeConnect as realComplete, disconnect as realDisconnect, fetchConnections as realFetchConnections, fetchDispatches as realFetchDispatches, startConnect as realConnect } from "./socialClient";

// Connected social accounts and publishing status (BG-STUDIO-024-FE, real contract of bizgenie-api #218 /customer/social/*). With the build gate off this page
// says exactly what BizGenie does today (publish by hand, then record it). With the gate on it shows only what the server reports; "Connected" and
// "Published" are never inferred, and a post is labelled platform-verified only when the platform said so (state published + evidence platform_api + https link).
// The OAuth verifier is kept in sessionStorage only for the round trip to the platform and removed as soon as the callback is handled.
const API = () => import.meta.env.VITE_BIZGENIE_API_URL || "http://localhost:8080";
const when = (iso) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const STATUS_TEXT = { connected: "Connected", needs_reauth: "Needs reconnecting", revoked: "Disconnected" };
const STATE_TEXT = { queued: "Waiting its turn", claimed: "Waiting its turn", sending: "Being sent", reconciliation_required: "Outcome being checked", published: "Published", failed: "Failed", cancelled: "Cancelled" };
const PENDING_KEY = "bizgenie.social.pending";
const redirectDefault = (url) => window.location.assign(url);
const store = () => { try { return window.sessionStorage; } catch { return null; } };
const readPending = () => { try { return JSON.parse(store()?.getItem(PENDING_KEY) || "null"); } catch { return null; } };
const writePending = (v) => { try { v ? store()?.setItem(PENDING_KEY, JSON.stringify(v)) : store()?.removeItem(PENDING_KEY); } catch { /* storage unavailable: the callback then reports a mismatch instead of connecting */ } };
const stripQuery = () => { try { window.history.replaceState(null, "", window.location.pathname + window.location.hash); } catch { /* ignore */ } };

export default function PremiumConnections({ enabled, session, scope, isOwner, api = {}, onSessionEnded, onRedirect = redirectDefault, search = typeof window === "undefined" ? "" : window.location.search }) {
  const [conns, setConns] = useState({ status: "idle", connections: [], skipped: 0, error: "" });
  const [list, setList] = useState({ status: "idle", items: [], skipped: 0, error: "" });
  const [busy, setBusy] = useState(""); const [msg, setMsg] = useState({ kind: "", text: "" }); const [confirming, setConfirming] = useState("");
  const live = useRef(true); const token = useRef(0); const handled = useRef(false);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const base = { apiBaseUrl: API(), accessToken: session.accessToken, scope };
  const fail = useCallback((e) => { if (e && e.kind === "auth" && onSessionEnded) onSessionEnded(); }, [onSessionEnded]);
  const load = useCallback(() => {
    const mine = ++token.current; setConns((a) => ({ ...a, status: "loading", error: "" })); setList((q) => ({ ...q, status: "loading", error: "" }));
    (api.fetchConnections || realFetchConnections)(base).then((r) => { if (live.current && mine === token.current) setConns({ status: "ready", ...r, error: "" }); }).catch((e) => { fail(e); if (live.current && mine === token.current) setConns({ status: "error", connections: [], skipped: 0, error: e.message }); });
    (api.fetchDispatches || realFetchDispatches)(base).then((r) => { if (live.current && mine === token.current) setList({ status: "ready", ...r, error: "" }); }).catch((e) => { fail(e); if (live.current && mine === token.current) setList({ status: "error", items: [], skipped: 0, error: e.message }); });
  }, [scope.tenantId, scope.projectId, scope.brandId, session.accessToken]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (enabled && conns.status === "idle") load(); }, [enabled, conns.status, load]);
  useEffect(() => { setConns({ status: "idle", connections: [], skipped: 0, error: "" }); setList({ status: "idle", items: [], skipped: 0, error: "" }); }, [scope.tenantId, scope.projectId, scope.brandId]);
  // Returning from the platform: ?code=...&state=... is accepted only against the attempt this browser started.
  useEffect(() => {
    if (!enabled || !isOwner || handled.current) return;
    const p = new URLSearchParams(search || ""); const code = p.get("code"); const state = p.get("state"); if (!code || !state) return;
    handled.current = true; const pending = readPending(); writePending(null); stripQuery();
    setBusy("complete");
    (api.completeConnect || realComplete)({ ...base, pending, code, state }).then(() => { if (live.current) { setMsg({ kind: "ok", text: `${PROVIDER_LABEL[pending.provider]} is connected.` }); load(); } }).catch((e) => { fail(e); if (live.current) setMsg({ kind: e.kind === "unconfirmed" ? "warn" : "error", text: e.message }); }).finally(() => { if (live.current) setBusy(""); });
  }, [enabled, isOwner, search]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!enabled) {
    return (
      <section className="ps-stage ps-connections" aria-labelledby="pcn-h">
        <h2 id="pcn-h">Connected accounts and publishing</h2>
        <p>Connecting social accounts and publishing automatically are not switched on in BizGenie yet. Nothing is connected, and BizGenie does not publish for you.</p>
        <p>For now you publish approved content yourself, then record it in the campaign: when it went live, where, and a link as evidence. Those records are labelled as entered by you, because BizGenie has not checked the platform.</p>
      </section>
    );
  }
  const run = async (name, work) => { if (busy) return; setBusy(name); setMsg({ kind: "", text: "" }); try { await work(); } catch (e) { fail(e); if (live.current) setMsg({ kind: e.kind === "unconfirmed" ? "warn" : "error", text: e.message }); } finally { if (live.current) setBusy(""); } };
  const connect = (provider) => run(`c:${provider}`, async () => { const r = await (api.startConnect || realConnect)({ ...base, provider }); writePending(r.pending); setMsg({ kind: "ok", text: `Taking you to ${PROVIDER_LABEL[provider]} to give permission. The account shows as connected only after ${PROVIDER_LABEL[provider]} confirms it to BizGenie.` }); onRedirect(r.url); });
  const remove = (a) => run(`d:${a.id}`, async () => { await (api.disconnect || realDisconnect)({ ...base, connectionId: a.id }); setConfirming(""); setMsg({ kind: "ok", text: `${PROVIDER_LABEL[a.provider]} · ${a.name} was disconnected. Anything already published stays on the platform.` }); load(); });
  const cancel = (d) => run(`x:${d.id}`, async () => { await (api.cancelDispatch || realCancel)({ ...base, dispatchId: d.id }); setMsg({ kind: "ok", text: "That post was cancelled and will not be sent." }); load(); });
  const connectedProviders = new Set(conns.connections.filter((a) => a.status === "connected").map((a) => a.provider));

  return (
    <section className="ps-stage ps-connections" aria-labelledby="pcn-h">
      <h2 id="pcn-h">Connected accounts and publishing</h2>
      {msg.text && <p className={msg.kind === "error" ? "error" : msg.kind === "warn" ? "ps-warn" : ""} role={msg.kind === "ok" ? "status" : "alert"}>{msg.text}</p>}
      <h3>Accounts</h3>
      {conns.status === "loading" && <p role="status">Loading your connected accounts…</p>}
      {conns.status === "error" && <div><p className="error" role="alert">{conns.error}</p><button type="button" className="secondary" onClick={load}>Try again</button></div>}
      {conns.status === "ready" && conns.connections.length === 0 && <p>No accounts are connected yet.</p>}
      {conns.status === "ready" && conns.skipped > 0 && <p className="ps-hint">{conns.skipped} account{conns.skipped === 1 ? "" : "s"} could not be shown because the server sent {conns.skipped === 1 ? "it" : "them"} in an unreadable form.</p>}
      {conns.status === "ready" && conns.connections.length > 0 && (
        <ul className="ps-conn-list" aria-label="Connected accounts">
          {conns.connections.map((a) => (
            <li key={a.id}>
              <strong>{PROVIDER_LABEL[a.provider]}</strong> · {a.name} · <span>{STATUS_TEXT[a.status]}</span>
              {a.status === "connected" && <small> · permission renews by {when(a.expiresAt)}</small>}
              {a.status === "needs_reauth" && isOwner && <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => connect(a.provider)}>Reconnect</button>}
              {isOwner && a.status !== "revoked" && (confirming === a.id
                ? <span role="group" aria-label={`Disconnect ${a.name}`}> Disconnect {a.name}? <button type="button" className="ps-primary" disabled={Boolean(busy)} onClick={() => remove(a)}>Yes, disconnect</button> <button type="button" className="secondary" onClick={() => setConfirming("")}>Keep it</button></span>
                : <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => setConfirming(a.id)} aria-label={`Disconnect ${a.name}`}>Disconnect</button>)}
            </li>
          ))}
        </ul>
      )}
      {isOwner ? (
        <div className="ps-camp-actions" role="group" aria-label="Connect an account">
          {PROVIDERS.filter((p) => !connectedProviders.has(p)).map((p) => <button key={p} type="button" className="secondary" disabled={Boolean(busy)} onClick={() => connect(p)}>{busy === `c:${p}` ? "Opening…" : `Connect ${PROVIDER_LABEL[p]}`}</button>)}
        </div>
      ) : <p className="ps-hint">Only the workspace owner can connect or disconnect accounts.</p>}

      <h3>Publishing</h3>
      {list.status === "loading" && <p role="status">Loading the publishing list…</p>}
      {list.status === "error" && <div><p className="error" role="alert">{list.error}</p><button type="button" className="secondary" onClick={load}>Try again</button></div>}
      {list.status === "ready" && list.items.length === 0 && <p>Nothing is waiting to be published.</p>}
      {list.status === "ready" && list.skipped > 0 && <p className="ps-hint">{list.skipped} item{list.skipped === 1 ? "" : "s"} could not be shown.</p>}
      {list.status === "ready" && list.items.length > 0 && (
        <ul className="ps-conn-list" aria-label="Publishing list">
          {list.items.map((d) => (
            <li key={d.id}>
              <strong>{STATE_TEXT[d.state]}</strong>{d.scheduledFor ? ` · planned ${when(d.scheduledFor)}` : ""}
              {d.state === "failed" && <span className="error"> · The platform refused it. Nothing was published.</span>}
              {d.state === "reconciliation_required" && <span> · BizGenie cannot yet tell whether this reached the platform, so it will not send it again until that is checked.</span>}
              {d.state === "published" && (d.platformVerified ? <span> · <em className="ps-src backend">Confirmed by the platform</em> <a href={d.postUrl} target="_blank" rel="noopener noreferrer">View post</a></span> : <span> · <em className="ps-src">Not confirmed by the platform</em></span>)}
              {isOwner && (d.state === "queued" || d.state === "claimed") && <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => cancel(d)}>Cancel</button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
