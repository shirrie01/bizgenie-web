import { useState } from "react";

export function createLocalLeadAdapter() {
  return {
    async submit(lead) {
      return { status: "preview-only", lead };
    },
  };
}

export default function Founding100Panel() {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState("idle");
  const [message, setMessage] = useState("");
  const adapter = createLocalLeadAdapter();

  async function submit(event) {
    event.preventDefault();
    if (!email.trim() || !consent) return;
    setState("loading");
    const result = await adapter.submit({
      email: email.trim(),
      consent_at: new Date().toISOString(),
      source: "founding-100-web",
    });
    setState("success");
    setMessage(result.status === "preview-only"
      ? "Thanks. This preview captured your interest locally; live Founding 100 registration is not enabled yet."
      : "Thanks. We received your interest.");
  }

  return (
    <section className="founding-panel" aria-labelledby="founding-title">
      <p className="eyebrow">Founding 100</p>
      <h2 id="founding-title">Be among the first to shape BizGenie.</h2>
      <p>Join the early-access list for practical, outcome-led marketing support built around your business.</p>
      {state === "success" ? (
        <p className="success" role="status">{message}</p>
      ) : (
        <form onSubmit={submit} className="lead-form">
          <label htmlFor="founding-email">Email address</label>
          <input id="founding-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
          <label className="consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> I agree to be contacted about BizGenie early access.</label>
          <button type="submit" disabled={!email.trim() || !consent || state === "loading"}>{state === "loading" ? "Joining…" : "Join the Founding 100"}</button>
          <small>Live registration is not enabled in this preview.</small>
        </form>
      )}
    </section>
  );
}
