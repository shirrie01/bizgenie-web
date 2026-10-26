import React, { useCallback, useEffect, useRef, useState } from "react";
import { TERMINAL_STATES, buildQuoteRequest, cancelGenerationQuote, confirmGenerationQuote, confirmKey, fetchQuoteStatus, newNonce, requestFingerprint, requestGenerationQuote } from "./generationQuoteClient";

// The binding credit flow for image and video (BG-STUDIO-021-FE): get the price, confirm it explicitly, follow the queued job. Everything the customer
// reads comes from the server's quote and status; nothing is computed here. 202 from confirm means "a reservation and a queued job exist", never "made".
// One attempt = one nonce (reused only for a network retry of the same request) and one confirmation key (saved BEFORE it is sent and reused for every
// retry, so a lost response can never become a second charge). The attempt is remembered in this browser so a refresh resumes the same job; the server
// is asked for the truth on every resume.
const API = () => import.meta.env.VITE_BIZGENIE_API_URL || "http://localhost:8080";
const clock = (ms) => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const credits = (n) => `${n} credit${n === 1 ? "" : "s"}`;
const store = (key, value) => { try { if (value === undefined) return JSON.parse(window.localStorage.getItem(key) || "null"); if (value === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage may be blocked; the page works without it */ } return null; };

export const STATE_TEXT = {
  queued: (c) => `Waiting to start. ${credits(c)} are set aside for it and are only used if it succeeds.`,
  claimed: (c) => `Starting. ${credits(c)} are set aside and are only used if it succeeds.`,
  calling: (c) => `Being created. It can no longer be cancelled. ${credits(c)} are set aside and are only used if it succeeds.`,
  recovery_required: (c) => `BizGenie is checking the result with the provider. ${credits(c)} stay set aside until it is known, and nothing is sent again.`,
  succeeded: (c) => `Finished. ${credits(c)} used.`,
  failed: () => "It could not be made. You were not charged.",
  cancelled: () => "Cancelled. You were not charged.",
};

export default function QuotedGeneration({ enabled, session, inputs, label = "Get the price", disabled = false, api = {}, pollMs = 3000, now = () => Date.now(), onLockChange, onSettled, onSessionEnded }) {
  const k = inputs && inputs.campaign && inputs.variant ? `bg:quoted:${inputs.scope.tenantId}:${inputs.campaign.campaign_id}:${inputs.variant.variant_id}` : "";
  const [attempt, setAttempt] = useState(() => (k ? store(k) : null)); // { nonce, fingerprint, quote?, confirmKey?, jobId? }
  const [phase, setPhase] = useState("idle"); // idle | quoting | quoted | confirming | uncertain | tracking
  const [status, setStatus] = useState(null); // { state, reservedCredits, ... }
  const [message, setMessage] = useState({ kind: "", text: "" });
  const [, tick] = useState(0);
  const busy = useRef(false); const live = useRef(true); const guard = useRef(0); const settled = useRef(false);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const base = { apiBaseUrl: API(), accessToken: session.accessToken };
  const fns = { quote: api.requestGenerationQuote || requestGenerationQuote, confirm: api.confirmGenerationQuote || confirmGenerationQuote, status: api.fetchQuoteStatus || fetchQuoteStatus, cancel: api.cancelGenerationQuote || cancelGenerationQuote };
  const fail = useCallback((e) => { if (e && e.kind === "auth" && onSessionEnded) onSessionEnded(); }, [onSessionEnded]);
  const save = useCallback((next) => { setAttempt(next); if (k) store(k, next); }, [k]);

  let request = null; let needed = "";
  try { request = inputs ? buildQuoteRequest(inputs) : null; } catch (e) { needed = e.message; }
  const [fp, setFp] = useState("");
  useEffect(() => { let on = true; if (request) requestFingerprint(request).then((v) => { if (on) setFp(v); }); else setFp(""); return () => { on = false; }; }, [request && JSON.stringify(request)]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resume: a remembered attempt is checked against the server, never trusted.
  useEffect(() => {
    if (!enabled || !attempt) return;
    if (attempt.confirmKey && attempt.quote) {
      const mine = ++guard.current; setPhase("tracking");
      fns.status({ ...base, quoteId: attempt.quote.quoteId }).then((s) => { if (live.current && mine === guard.current) { setStatus(s); if (!attempt.jobId && s.jobId) save({ ...attempt, jobId: s.jobId }); } }).catch((e) => { fail(e); if (live.current && mine === guard.current) { if (e.kind === "unavailable") { save(null); setPhase("idle"); setMessage({ kind: "error", text: "That request is no longer available. Nothing is shown from it." }); } else { setPhase("uncertain"); setMessage({ kind: "warn", text: e.message }); } } });
    } else if (attempt.quote && !attempt.confirmKey) {
      if (attempt.quote.expiresAt <= now()) { save(null); setMessage({ kind: "warn", text: "The price expired. Nothing was charged. Get a new price to continue." }); } else setPhase("quoted");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // An unconfirmed price is only good for the exact request it was given for: any change to the brief, class, version or media discards it.
  useEffect(() => { if (attempt && !attempt.confirmKey && attempt.fingerprint && fp && attempt.fingerprint !== fp && ["quoted", "idle"].includes(phase)) { save(null); setPhase("idle"); setMessage({ kind: "warn", text: "Your choices changed, so the price was dropped. Get a new price." }); } }, [fp]); // eslint-disable-line react-hooks/exhaustive-deps
  // Expiry of an unconfirmed price.
  useEffect(() => {
    if (phase !== "quoted" || !attempt || !attempt.quote) return undefined;
    const left = attempt.quote.expiresAt - now();
    const expire = () => { save(null); setPhase("idle"); setMessage({ kind: "warn", text: "The price expired. Nothing was charged. Get a new price to continue." }); };
    if (left <= 0) { expire(); return undefined; }
    const t = setTimeout(() => { if (live.current) expire(); tick((n) => n + 1); }, Math.min(left, 2147483000)); return () => clearTimeout(t);
  }, [phase, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Follow the job until it is finished.
  const refresh = useCallback(async (a) => {
    const mine = ++guard.current;
    try { const s = await fns.status({ ...base, quoteId: a.quote.quoteId }); if (live.current && mine === guard.current) { setStatus(s); setMessage((m) => (m.kind === "warn-poll" ? { kind: "", text: "" } : m)); } }
    catch (e) { fail(e); if (live.current && mine === guard.current) setMessage({ kind: "warn-poll", text: `${e.message} Your request is safe; nothing is sent again.` }); }
  }, [session.accessToken]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (phase !== "tracking" || !attempt || !attempt.quote) return undefined;
    if (status && TERMINAL_STATES.includes(status.state)) {
      if (!settled.current) { settled.current = true; if (onSettled) onSettled({ ...status, credits: attempt.quote.credits }); }
      return undefined;
    }
    const t = setTimeout(() => refresh(attempt), status ? pollMs : 0); return () => clearTimeout(t);
  }, [phase, status, attempt, pollMs, refresh, onSettled]);
  useEffect(() => { if (onLockChange) onLockChange(phase === "confirming" || phase === "uncertain" || phase === "tracking"); }, [phase, onLockChange]);

  if (!enabled) return <div className="ps-quote"><p className="ps-hint">BizGenie cannot quote or start this yet. Nothing here uses credits.</p></div>;

  const getPrice = async () => {
    if (busy.current || !request || !fp) return; busy.current = true; setPhase("quoting"); setMessage({ kind: "", text: "" });
    // The nonce is kept for a network retry of the SAME request; a changed request or a dead quote gets a fresh one.
    const nonce = attempt && attempt.fingerprint === fp && !attempt.quote ? attempt.nonce : newNonce();
    try { const q = await fns.quote({ ...base, request, nonce, now: now() }); if (!live.current) return;
      if (q.expired || q.state !== "quoted") { save(null); setPhase("idle"); setMessage({ kind: "warn", text: q.state === "cancelled" ? "That price was cancelled. Get a new price." : "That price has already expired. Get a new price." }); }
      else { save({ nonce, fingerprint: fp, quote: q }); setPhase("quoted"); } }
    catch (e) { fail(e); if (live.current) { save({ nonce, fingerprint: fp }); setPhase("idle"); setMessage({ kind: "error", text: e.message }); } } finally { busy.current = false; }
  };
  const confirm = async () => {
    if (busy.current || !attempt || !attempt.quote) return; busy.current = true; setMessage({ kind: "", text: "" });
    const key = attempt.confirmKey || confirmKey(); const withKey = { ...attempt, confirmKey: key }; save(withKey); setPhase("confirming"); // saved BEFORE sending
    try { const r = await fns.confirm({ ...base, quote: attempt.quote, key }); if (!live.current) return; save({ ...withKey, jobId: r.jobId }); setStatus({ state: r.status === "queued" ? "queued" : r.status, reservedCredits: r.reservedCredits, jobId: r.jobId }); setPhase("tracking"); }
    catch (e) { fail(e); if (!live.current) return;
      if (e.kind === "uncertain") { setPhase("uncertain"); setMessage({ kind: "warn", text: e.message }); }
      else if (e.kind === "key_conflict") { setPhase("uncertain"); setMessage({ kind: "warn", text: e.message }); }
      else if (["expired", "changed", "cancelled", "conflict"].includes(e.kind)) { save(null); setPhase("idle"); setMessage({ kind: "warn", text: e.message }); }
      else if (e.kind === "insufficient") { save(null); setPhase("idle"); setMessage({ kind: "error", text: e.message }); }
      else { save({ ...withKey }); setPhase("uncertain"); setMessage({ kind: "warn", text: e.message }); } }
    finally { busy.current = false; }
  };
  const checkStatus = async () => {
    if (busy.current || !attempt || !attempt.quote) return; busy.current = true;
    try { const s = await fns.status({ ...base, quoteId: attempt.quote.quoteId }); if (!live.current) return;
      if (s.jobId || ["queued", "claimed", "calling", "recovery_required", "succeeded", "failed", "cancelled"].includes(s.state)) { save({ ...attempt, jobId: s.jobId || attempt.jobId }); setStatus(s); setPhase("tracking"); setMessage({ kind: "", text: "" }); }
      else setMessage({ kind: "warn", text: "It was not accepted yet. You can send the same confirmation again; it cannot run twice or charge you twice." }); }
    catch (e) { fail(e); if (live.current) setMessage({ kind: "warn", text: e.message }); } finally { busy.current = false; }
  };
  const cancel = async () => {
    if (busy.current || !attempt || !attempt.quote) return; busy.current = true; setMessage({ kind: "", text: "" });
    try { await fns.cancel({ ...base, quoteId: attempt.quote.quoteId }); if (!live.current) return; if (attempt.confirmKey) { setStatus((s) => ({ ...(s || {}), state: "cancelled", reservedCredits: 0 })); setPhase("tracking"); } else { save(null); setPhase("idle"); setMessage({ kind: "ok", text: "Cancelled. You were not charged." }); } }
    catch (e) { fail(e); if (live.current) { setMessage({ kind: e.kind === "started" ? "warn" : "error", text: e.message }); if (e.kind === "started") refresh(attempt); } } finally { busy.current = false; }
  };
  const forget = () => { save(null); setStatus(null); setPhase("idle"); setMessage({ kind: "", text: "" }); settled.current = false; };

  const q = attempt && attempt.quote; const st = status && status.state;
  const notice = message.text && <p className={message.kind === "error" ? "error" : message.kind.startsWith("warn") ? "ps-warn" : ""} role={message.kind === "error" ? "alert" : "status"}>{message.text}</p>;

  if (phase === "idle" || phase === "quoting") {
    return (
      <div className="ps-quote">
        {notice}
        {needed && <p className="ps-hint">{needed}</p>}
        <button type="button" className="secondary" onClick={getPrice} disabled={disabled || Boolean(needed) || !fp || phase === "quoting"}>{phase === "quoting" ? "Getting the price…" : label}</button>
        <p className="ps-hint">Getting a price does not use any credits and does not start anything. You confirm before anything is made.</p>
      </div>
    );
  }
  if (phase === "quoted" && q) {
    return (
      <div className="ps-quote">
        {notice}
        <div role="group" aria-label="Price" className="ps-quote-card">
          <p><strong>{credits(q.credits)}</strong> will be used if this succeeds.</p>
          <p>{`You have ${credits(q.availableCredits)} available.`}</p>
          <p className="ps-hint">This is a fixed price and the most you can be charged for this. It is valid until {clock(q.expiresAt)}. After you confirm, {credits(q.credits)} are set aside; they are used only if it succeeds and are released if it fails or you cancel before it starts.</p>
          {!q.sufficient && <p className="error" role="alert">You do not have enough credits for this. Nothing will be charged. Your balance is in Plan and billing.</p>}
          <div className="ps-camp-actions">
            <button type="button" className="ps-primary" onClick={confirm} disabled={!q.sufficient || disabled}>{`Confirm and set aside ${credits(q.credits)}`}</button>
            <button type="button" className="secondary" onClick={cancel}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }
  if (phase === "confirming") return <div className="ps-quote"><p role="status">Sending your confirmation…</p></div>;
  if (phase === "uncertain") {
    return (
      <div className="ps-quote">
        {notice}
        <p>We do not know yet whether your confirmation was received. Nothing is shown as started.</p>
        <div className="ps-camp-actions">
          <button type="button" className="secondary" onClick={checkStatus}>Check its status</button>
          {attempt && attempt.confirmKey && <button type="button" className="secondary" onClick={confirm}>Send the same confirmation again</button>}
        </div>
        <p className="ps-hint">Sending the same confirmation again uses the same reference, so it cannot start twice or charge you twice.</p>
      </div>
    );
  }
  // tracking
  const state = st || "queued"; const c = (q && q.credits) || 0;
  return (
    <div className="ps-quote" aria-live="polite">
      {notice}
      {!status && <p role="status">Checking its status…</p>}
      {status && <p role={TERMINAL_STATES.includes(state) ? "status" : undefined}><strong>{state === "succeeded" ? "Finished" : state === "failed" ? "Not made" : state === "cancelled" ? "Cancelled" : state === "recovery_required" ? "Being checked" : "In progress"}.</strong> {(STATE_TEXT[state] || STATE_TEXT.queued)(c)}</p>}
      {status && state === "succeeded" && <p className="ps-hint">Finished is not approved and not published. Review it before it can be used.</p>}
      {status && ["queued", "claimed"].includes(state) && <button type="button" className="secondary" onClick={cancel}>Cancel before it starts</button>}
      {status && TERMINAL_STATES.includes(state) && <button type="button" className="secondary" onClick={forget}>Start something new</button>}
    </div>
  );
}
