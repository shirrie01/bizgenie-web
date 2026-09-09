import { useState } from "react";

const submittedEmails = new Set();

export function createLocalLeadAdapter() {
  return {
    async submit(lead) {
      const email = lead.email.toLowerCase();
      if (submittedEmails.has(email)) return { status: "duplicate" };
      submittedEmails.add(email);
      return { status: "preview-only" };
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
    setMessage("");
    try {
      const result = await adapter.submit({
        email: email.trim(),
        consent_at: new Date().toISOString(),
        source: "founding-100-web",
      });
      if (result.status === "duplicate") {
        setState("duplicate");
        setMessage("That email is already in this preview session.");
      } else {
        setState("success");
        setMessage("Preview only: nothing was sent or stored. Live Founding 100 registration is not enabled yet.");
      }
    } catch {
      setState("error");
      setMessage("We could not process that request. Please try again.");
    }
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
          <input id="founding-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" aria-invalid={state === "error"} />
          <label className="consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> I agree to be contacted about BizGenie early access.</label>
          <button type="submit" disabled={!email.trim() || !consent || state === "loading"}>{state === "loading" ? "Joining…" : "Join the Founding 100"}</button>
          {message && <p className={state === "error" ? "error" : "notice"} role={state === "error" ? "alert" : "status"}>{message}</p>}
          <small>Preview only: no information is sent or stored.</small>
        </form>
      )}
    </section>
  );
}
