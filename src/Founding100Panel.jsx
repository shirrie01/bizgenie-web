import { useState } from "react";

const API_BASE_URL = import.meta.env.VITE_BIZGENIE_API_URL || "http://localhost:8080";

export function createPaidBetaLeadAdapter({ fetchImpl = fetch, apiBaseUrl = API_BASE_URL } = {}) {
  return {
    async submit(lead) {
      const response = await fetchImpl(apiBaseUrl + "/public/paid-beta-interest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...lead,
          privacy_contact_consent: true,
          source: "founding-100-web",
          submission_id: crypto.randomUUID(),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(body?.error?.message || "We could not process that request.");
        error.code = body?.error?.code;
        throw error;
      }
      return body;
    },
  };
}

export default function Founding100Panel() {
  const [form, setForm] = useState({ name: "", work_email: "", business_name: "", website_or_social_profile: "", business_stage: "pre-revenue", primary_marketing_challenge: "" });
  const [state, setState] = useState("idle");
  const [message, setMessage] = useState("");
  const adapter = createPaidBetaLeadAdapter();

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setState("loading");
    setMessage("");
    try {
      const result = await adapter.submit(form);
      setState("success");
      setMessage(result?.replay ? "We already have your Founding 100 interest recorded." : "Thanks. We received your Founding 100 interest.");
    } catch {
      setState("error");
      setMessage("We could not process that request. Please check your details and try again.");
    }
  }

  return (
    <section className="founding-panel" aria-labelledby="founding-title">
      <p className="eyebrow">Founding 100</p>
      <h2 id="founding-title">Be among the first to shape BizGenie.</h2>
      <p>Join the early-access list for practical, outcome-led marketing support built around your business.</p>
      {state === "success" ? <p className="success" role="status">{message}</p> : (
        <form onSubmit={submit} className="lead-form">
          <label htmlFor="founding-name">Name</label>
          <input id="founding-name" value={form.name} onChange={(e) => update("name", e.target.value)} required autoComplete="name" />
          <label htmlFor="founding-email">Work email</label>
          <input id="founding-email" type="email" value={form.work_email} onChange={(e) => update("work_email", e.target.value)} required autoComplete="email" />
          <label htmlFor="founding-business">Business name</label>
          <input id="founding-business" value={form.business_name} onChange={(e) => update("business_name", e.target.value)} required />
          <label htmlFor="founding-site">Website or social profile</label>
          <input id="founding-site" type="url" value={form.website_or_social_profile} onChange={(e) => update("website_or_social_profile", e.target.value)} required />
          <label htmlFor="founding-stage">Business stage</label>
          <select id="founding-stage" value={form.business_stage} onChange={(e) => update("business_stage", e.target.value)}>
            <option value="pre-revenue">Pre-revenue</option><option value="under-250k">Under £250k</option><option value="250k-1m">£250k–£1m</option><option value="1m-5m">£1m–£5m</option><option value="5m-plus">£5m+</option>
          </select>
          <label htmlFor="founding-challenge">Primary marketing challenge</label>
          <textarea id="founding-challenge" value={form.primary_marketing_challenge} onChange={(e) => update("primary_marketing_challenge", e.target.value)} required maxLength={1000} />
          <label className="consent"><input type="checkbox" required /> I agree that BizGenie may use these details to contact me about the paid beta.</label>
          <button type="submit" disabled={state === "loading"}>{state === "loading" ? "Joining…" : "Join the Founding 100"}</button>
          {message && <p className="error" role="alert">{message}</p>}
        </form>
      )}
    </section>
  );
}
