import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { getCustomerSession } from "./session";

const API_BASE_URL = import.meta.env.VITE_BIZGENIE_API_URL || "http://localhost:8080";

async function requestRecommendation({ accessToken, tenantId, projectId, brandId, goal, idempotencyKey }) {
  const response = await fetch(`${API_BASE_URL}/customer/campaign-recommendations`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + accessToken },
    body: JSON.stringify({
      tenant_id: tenantId,
      project_id: projectId,
      brand_id: brandId,
      goal,
      idempotency_key: idempotencyKey,
    }),
  });
  if (!response.ok) throw new Error("Recommendation could not be loaded yet.");
  return response.json();
}

function App() {
  const [goal, setGoal] = useState("");
  const [state, setState] = useState({ status: "idle", recommendation: null, error: "", accountRequired: false });

  async function submit(event) {
    event.preventDefault();
    if (!goal.trim()) return;
    const session = getCustomerSession();
    if (!session) {
      setState({ status: "account-required", recommendation: null, error: "", accountRequired: true });
      return;
    }
    setState({ status: "loading", recommendation: null, error: "", accountRequired: false });
    try {
      const result = await requestRecommendation({
        accessToken: session.accessToken,
        tenantId: session.tenantId,
        projectId: session.projectId,
        brandId: session.brandId,
        goal: goal.trim(),
        idempotencyKey: crypto.randomUUID(),
      });
      setState({ status: "ready", recommendation: result.recommendation, error: "", accountRequired: false });
    } catch (error) {
      setState({ status: "error", recommendation: null, error: error.message, accountRequired: false });
    }
  }

  return (
    <main className="shell">
      <nav className="topbar"><span className="wordmark">BizGenie</span><span className="status">Campaign workspace</span></nav>
      <section className="hero">
        <p className="eyebrow">Start with the outcome</p>
        <h1>What do you want your campaign to achieve?</h1>
        <p className="lede">Tell BizGenie the goal in your own words. We’ll suggest a clear first campaign shape for you to review.</p>
        <form onSubmit={submit} className="goal-form">
          <label htmlFor="goal">Your goal</label>
          <textarea id="goal" value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="e.g. Launch our new strawberry lemonade next Friday" maxLength={2000} />
          <button type="submit" disabled={!goal.trim() || state.status === "loading"}>{state.status === "loading" ? "Thinking…" : "Get my recommendation"}</button>
        </form>
        {state.accountRequired && <div className="account-prompt" role="status"><strong>Save this goal by creating your BizGenie account.</strong><p>Your goal stays on this screen until you continue. No campaign is created yet.</p><button type="button" onClick={() => window.alert("Account creation will be connected here.")}>Continue to account creation</button></div>}
        {state.status === "error" && <p className="error" role="alert">{state.error}</p>}
      </section>
      {state.recommendation && (
        <section className="recommendation" aria-live="polite">
          <div className="recommendation-header"><div><p className="eyebrow">Your starting point</p><h2>{state.recommendation.campaign_name}</h2></div><span className="pill">Review first</span></div>
          <p>{state.recommendation.explanation}</p>
          <div className="item-grid">{state.recommendation.suggested_items.map((item) => <article className="item" key={item.name}><span>{item.format}</span><h3>{item.name}</h3><p>{item.reason}</p><small>{item.destination_label}</small></article>)}</div>
          <button className="secondary" type="button" onClick={() => window.alert("Campaign creation will be connected after account creation.")}>Create campaign</button>
        </section>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<StrictMode><App /></StrictMode>);
