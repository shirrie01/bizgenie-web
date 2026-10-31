import React, { useEffect, useRef, useState } from "react";

// A chargeable generation with its cost disclosed first (BG-STUDIO-019-FE, workstream D). The customer sees the credit cost, their balance,
// whether it is fixed or an estimate (with the most it can cost), and when the price expires, and confirms explicitly. Checking the cost
// debits nothing and calls no provider. Every number comes from the backend's quote; none is computed here. When the quote API is not
// available the page says it cannot show the cost, rather than hiding it.
const clock = (ms) => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const credits = (n) => `${n} credit${n === 1 ? "" : "s"}`;

export default function GenerateWithQuote({ label = "Generate draft", quotesEnabled, disabled, busyText = "Generating…", onQuote, onGenerate, now = () => Date.now() }) {
  const [phase, setPhase] = useState("idle"); // idle | quoting | quoted | generating | done | problem
  const [quote, setQuote] = useState(null);
  const [problem, setProblem] = useState(null); // { kind, text }
  const inFlight = useRef(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    clearTimeout(timer.current);
    if (phase === "quoted" && quote) {
      const left = quote.expiresAt - now();
      if (left <= 0) { setProblem({ kind: "expired", text: "This price has expired. Nothing was charged. Check the cost again to continue." }); setPhase("problem"); return; }
      timer.current = setTimeout(() => { setProblem({ kind: "expired", text: "This price has expired. Nothing was charged. Check the cost again to continue." }); setPhase("problem"); }, Math.min(left, 2147483000));
    }
  }, [phase, quote, now]);

  async function check() {
    if (inFlight.current) return;
    inFlight.current = true; setPhase("quoting"); setProblem(null);
    try { const q = await onQuote(); setQuote(q); setPhase("quoted"); }
    catch (error) { setProblem({ kind: error.kind || "error", text: error.message || "The credit cost could not be checked yet. Nothing was started or charged." }); setPhase("problem"); }
    finally { inFlight.current = false; }
  }
  async function confirm(withQuote) {
    if (inFlight.current) return; // a second click while one is running does nothing
    inFlight.current = true; setPhase("generating"); setProblem(null);
    try {
      const result = await onGenerate(withQuote);
      if (result && result.ok) { setPhase("done"); setQuote(null); }
      else { setProblem({ kind: (result && result.kind) || "error", text: (result && result.text) || "That could not be done yet. Nothing was charged." }); setPhase("problem"); }
    } finally { inFlight.current = false; }
  }
  const cancel = () => { clearTimeout(timer.current); setQuote(null); setProblem(null); setPhase("idle"); };

  if (!quotesEnabled) {
    return (
      <div className="ps-quote">
        <button className="secondary" type="button" onClick={() => confirm(null)} disabled={disabled || phase === "generating"}>{phase === "generating" ? busyText : label}</button>
        <p className="ps-hint">BizGenie cannot show the credit cost of this action yet.</p>
        {phase === "problem" && problem && <p className="error" role="alert">{problem.text}</p>}
      </div>
    );
  }

  const stale = phase === "problem" && problem && ["expired", "changed"].includes(problem.kind);
  return (
    <div className="ps-quote">
      {(phase === "idle" || phase === "quoting" || phase === "done" || (phase === "problem" && !quote)) && (
        <>
          <button className="secondary" type="button" onClick={check} disabled={disabled || phase === "quoting"}>{phase === "quoting" ? "Checking the cost…" : "Check the credit cost"}</button>
          <p className="ps-hint">Checking the cost does not use any credits. You confirm before anything is generated.</p>
        </>
      )}
      {phase === "quoted" && quote && (
        <div role="group" aria-label="Credit cost" className="ps-quote-card">
          {quote.binding === false ? (
            <>
              <p><strong>Right now this uses {credits(quote.credits)}.</strong></p>
              <p>{quote.availableCredits === null ? "Your credit balance could not be shown." : `You have ${credits(quote.availableCredits)} available.`}</p>
              <p className="ps-hint">This is the current price, not a locked quote. No credits are reserved. The price and your balance are checked again when generation starts, so the amount used could differ if either changes. This check expires at {clock(quote.expiresAt)}.</p>
            </>
          ) : (
            <>
              <p><strong>{quote.kind === "estimate" ? `About ${credits(quote.credits)}, at most ${credits(quote.maxCredits)}` : credits(quote.credits)}</strong> will be used to generate this.</p>
              <p>{quote.availableCredits === null ? "Your credit balance could not be shown." : `You have ${credits(quote.availableCredits)} available.`}</p>
              <p className="ps-hint">{quote.kind === "estimate" ? "This is an estimate. You will never be charged more than the maximum shown." : "This is a fixed price."} Valid until {clock(quote.expiresAt)}.</p>
            </>
          )}
          {!quote.sufficient && <p className="error" role="alert">{quote.affordability === "spend_cap_exceeded" ? "This is above the limit that applies here. Nothing will be charged." : "You do not have enough credits for this. Nothing will be charged. Your balance is in Plan and billing."}</p>}
          <div className="ps-camp-actions">
            <button type="button" className="ps-primary" onClick={() => confirm(quote)} disabled={!quote.sufficient}>{quote.binding === false ? "Generate now" : `Use ${quote.kind === "estimate" ? `up to ${credits(quote.maxCredits)}` : credits(quote.credits)} and generate`}</button>
            <button type="button" className="secondary" onClick={cancel}>Cancel</button>
          </div>
        </div>
      )}
      {phase === "generating" && <p role="status">{busyText} Your credits are only used if it succeeds.</p>}
      {phase === "problem" && problem && (
        <div>
          <p className="error" role="alert">{problem.text}</p>
          <button type="button" className="secondary" onClick={stale || problem.kind === "insufficient" ? check : quote && quote.expiresAt > now() ? () => confirm(quote) : check}>{stale ? "Check the cost again" : problem.kind === "insufficient" ? "Check the cost again" : "Try again"}</button>
        </div>
      )}
    </div>
  );
}
