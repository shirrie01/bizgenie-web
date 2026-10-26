import React, { useCallback, useEffect, useRef, useState } from "react";
import { PROVIDERS, PROVIDER_LABEL, disconnect as realDisconnect, fetchAccounts as realFetchAccounts, fetchQueue as realFetchQueue, startConnect as realConnect, newRequestId } from "./socialClient";

// Connected social accounts and the publishing queue (BG-STUDIO-020-FE). The backend cannot connect an account or publish yet, so with the build gate
// off this page says exactly that and what the customer does today (publish by hand, then record it). With the gate on it shows only what the server
// reports; "Connected" and "Published" are never inferred, and a post is labelled platform-verified only when the platform said so.
const API = () => import.meta.env.VITE_BIZGENIE_API_URL || "http://localhost:8080";
const when = (iso) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const STATUS_TEXT = { connected: "Connected", needs_reauth: "Needs reconnecting", revoked: "Disconnected", error: "Problem with this account" };
const QUEUE_TEXT = { queued: "Waiting its turn", dispatching: "Being sent", published: "Published", failed: "Failed", needs_reconciliation: "Outcome being checked" };
const redirectDefault = (url) => window.location.assign(url);

export default function PremiumConnections({ enabled, session, scope, isOwner, api = {}, onSessionEnded, onRedirect = redirectDefault }) {
  const [accts, setAccts] = useState({ status: "idle", accounts: [], skipped: 0, error: "" });
  const [queue, setQueue] = useState({ status: "idle", items: [], skipped: 0, error: "" });
  const [busy, setBusy] = useState(""); const [msg, setMsg] = useState({ kind: "", text: "" }); const [confirming, setConfirming] = useState("");
  const live = useRef(true); const ids = useRef({}); const token = useRef(0);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const base = { apiBaseUrl: API(), accessToken: session.accessToken, scope };
  const fail = useCallback((e) => { if (e && e.kind === "auth" && onSessionEnded) onSessionEnded(); }, [onSessionEnded]);
  const load = useCallback(() => {
    const mine = ++token.current; setAccts((a) => ({ ...a, status: "loading", error: "" })); setQueue((q) => ({ ...q, status: "loading", error: "" }));
    (api.fetchAccounts || realFetchAccounts)(base).then((r) => { if (live.current && mine === token.current) setAccts({ status: "ready", ...r, error: "" }); }).catch((e) => { fail(e); if (live.current && mine === token.current) setAccts({ status: "error", accounts: [], skipped: 0, error: e.message }); });
    (api.fetchQueue || realFetchQueue)(base).then((r) => { if (live.current && mine === token.current) setQueue({ status: "ready", ...r, error: "" }); }).catch((e) => { fail(e); if (live.current && mine === token.current) setQueue({ status: "error", items: [], skipped: 0, error: e.message }); });
  }, [scope.tenantId, scope.projectId, scope.brandId, session.accessToken]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (enabled && accts.status === "idle") load(); }, [enabled, accts.status, load]);
  useEffect(() => { setAccts({ status: "idle", accounts: [], skipped: 0, error: "" }); setQueue({ status: "idle", items: [], skipped: 0, error: "" }); }, [scope.tenantId, scope.projectId, scope.brandId]);

  if (!enabled) {
    return (
      <section className="ps-stage ps-connections" aria-labelledby="pcn-h">
        <h2 id="pcn-h">Connected accounts and publishing</h2>
        <p>Connecting social accounts and publishing automatically are not available in BizGenie yet. Nothing is connected, and BizGenie does not publish for you.</p>
        <p>For now you publish approved content yourself, then record it in the campaign: when it went live, where, and a link as evidence. Those records are labelled as entered by you, because BizGenie has not checked the platform.</p>
      </section>
    );
  }
  const run = async (name, work) => { if (busy) return; setBusy(name); setMsg({ kind: "", text: "" }); try { await work(); } catch (e) { fail(e); if (live.current) setMsg({ kind: e.kind === "unconfirmed" ? "warn" : "error", text: e.message }); } finally { if (live.current) setBusy(""); } };
  const connect = (provider) => run(`c:${provider}`, async () => { ids.current[provider] = ids.current[provider] || newRequestId("connect"); const r = await (api.startConnect || realConnect)({ ...base, provider, id: ids.current[provider] }); ids.current[provider] = null; setMsg({ kind: "ok", text: `Taking you to ${PROVIDER_LABEL[provider]} to give permission. The account shows as connected only after ${PROVIDER_LABEL[provider]} confirms it to BizGenie.` }); onRedirect(r.url); });
  const remove = (a) => run(`d:${a.id}`, async () => { ids.current[a.id] = ids.current[a.id] || newRequestId("disconnect"); await (api.disconnect || realDisconnect)({ ...base, accountId: a.id, id: ids.current[a.id] }); ids.current[a.id] = null; setConfirming(""); setMsg({ kind: "ok", text: `${a.name} was disconnected. Anything already published stays on the platform.` }); load(); });
  const connectedProviders = new Set(accts.accounts.filter((a) => a.status === "connected").map((a) => a.provider));
  const nameOf = (id) => { const a = accts.accounts.find((x) => x.id === id); return a ? `${PROVIDER_LABEL[a.provider]} · ${a.name}` : ""; };

  return (
    <section className="ps-stage ps-connections" aria-labelledby="pcn-h">
      <h2 id="pcn-h">Connected accounts and publishing</h2>
      {msg.text && <p className={msg.kind === "error" ? "error" : msg.kind === "warn" ? "ps-warn" : ""} role={msg.kind === "ok" ? "status" : "alert"}>{msg.text}</p>}
      <h3>Accounts</h3>
      {accts.status === "loading" && <p role="status">Loading your connected accounts…</p>}
      {accts.status === "error" && <div><p className="error" role="alert">{accts.error}</p><button type="button" className="secondary" onClick={load}>Try again</button></div>}
      {accts.status === "ready" && accts.accounts.length === 0 && <p>No accounts are connected yet.</p>}
      {accts.status === "ready" && accts.skipped > 0 && <p className="ps-hint">{accts.skipped} account{accts.skipped === 1 ? "" : "s"} could not be shown because the server sent {accts.skipped === 1 ? "it" : "them"} in an unreadable form.</p>}
      {accts.status === "ready" && accts.accounts.length > 0 && (
        <ul className="ps-conn-list" aria-label="Connected accounts">
          {accts.accounts.map((a) => (
            <li key={a.id}>
              <strong>{PROVIDER_LABEL[a.provider]}</strong> · {a.name} · <span>{STATUS_TEXT[a.status]}</span>
              {a.tokenExpiresAt && a.status === "connected" && <small> · permission renews by {when(a.tokenExpiresAt)}</small>}
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

      <h3>Publishing queue</h3>
      {queue.status === "loading" && <p role="status">Loading the publishing queue…</p>}
      {queue.status === "error" && <div><p className="error" role="alert">{queue.error}</p><button type="button" className="secondary" onClick={load}>Try again</button></div>}
      {queue.status === "ready" && queue.items.length === 0 && <p>Nothing is waiting to be published.</p>}
      {queue.status === "ready" && queue.skipped > 0 && <p className="ps-hint">{queue.skipped} item{queue.skipped === 1 ? "" : "s"} could not be shown.</p>}
      {queue.status === "ready" && queue.items.length > 0 && (
        <ul className="ps-conn-list" aria-label="Publishing queue">
          {queue.items.map((i) => (
            <li key={i.id}>
              <strong>{QUEUE_TEXT[i.status]}</strong>{i.scheduledFor ? ` · planned ${when(i.scheduledFor)}` : ""}{nameOf(i.accountId) ? ` · ${nameOf(i.accountId)}` : ""}
              {i.status === "failed" && <span className="error"> · {i.errorCode ? `Reason code ${i.errorCode}.` : "No reason was given."} {i.attempts} attempt{i.attempts === 1 ? "" : "s"} made.</span>}
              {i.status === "needs_reconciliation" && <span> · BizGenie cannot yet tell whether this reached the platform, so it will not send it again until that is checked.</span>}
              {i.status === "published" && (i.platformVerified ? <span> · <em className="ps-src backend">Confirmed by the platform</em> <a href={i.postUrl} target="_blank" rel="noopener noreferrer">View post</a></span> : <span> · <em className="ps-src">Not confirmed by the platform</em></span>)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
