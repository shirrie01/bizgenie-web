import { useEffect, useState } from "react";
import { getCustomerSession, refreshCustomerSession } from "./session";
import { onAuthStateChange, signOut } from "./authClient";
import AuthPanel from "./AuthPanel";
import Founding100Panel from "./Founding100Panel";

const API_BASE_URL = import.meta.env.VITE_BIZGENIE_API_URL || "http://localhost:8080";

function authorizationHeader(accessToken) {
  return { authorization: "Bearer " + accessToken };
}

function firstUrlFromText(text) {
  return text.match(/https?:\/\/\S+/i)?.[0] || "";
}

function businessNameFromGoal(goalText) {
  const goal = goalText.toLowerCase();
  if (goal.includes("leaseexpert") || goal.includes("lease expert")) return "Lease Expert";
  return "Customer Campaign Workspace";
}

async function requestRecommendation({ accessToken, tenantId, projectId, brandId, goal, idempotencyKey }) {
  const response = await fetch(`${API_BASE_URL}/customer/campaign-recommendations`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authorizationHeader(accessToken) },
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

async function getCustomerWorkspace(accessToken) {
  const response = await fetch(`${API_BASE_URL}/customer/workspace`, {
    headers: authorizationHeader(accessToken),
  });
  if (!response.ok) throw new Error("Workspace could not be checked yet.");
  return response.json();
}

async function bootstrapCustomerWorkspace({ accessToken, goal }) {
  const response = await fetch(`${API_BASE_URL}/customer/workspace/bootstrap`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authorizationHeader(accessToken) },
    body: JSON.stringify({
      business_name: businessNameFromGoal(goal),
      website_or_social_profile: firstUrlFromText(goal),
      primary_marketing_challenge: goal,
    }),
  });
  if (!response.ok) throw new Error("Workspace could not be created yet.");
  return response.json();
}

export default function App() {
  const [goal, setGoal] = useState("");
  const [state, setState] = useState({ status: "idle", recommendation: null, error: "" });
  const [session, setSession] = useState({ status: "loading" });
  const [pendingSubmit, setPendingSubmit] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function refreshSession() {
      const next = await getCustomerSession();
      if (!cancelled) setSession(next);
    }
    refreshSession();
    const unsubscribe = onAuthStateChange(refreshSession);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Once a session can be used, automatically continue a goal
  // submission that was blocked pending sign-in or workspace setup.
  useEffect(() => {
    if (pendingSubmit && (session.status === "ready" || session.status === "scope-missing")) {
      setPendingSubmit(false);
      runRecommendation(session);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSubmit, session]);

  async function ensureReadySession(currentSession) {
    if (currentSession.status === "ready") return currentSession;
    if (currentSession.status !== "scope-missing") return currentSession;

    const currentWorkspace = await getCustomerWorkspace(currentSession.accessToken);
    if (currentWorkspace.status !== "ready" && currentWorkspace.status !== "missing_workspace") {
      return currentSession;
    }

    // Bootstrap is idempotent: when the workspace already exists, the backend
    // can still use this call to provision trusted app_metadata scope.
    const bootstrapResult = await bootstrapCustomerWorkspace({
      accessToken: currentSession.accessToken,
      goal: goal.trim(),
    });

    if (bootstrapResult.status !== "ready") return currentSession;

    const refreshed = bootstrapResult.requires_session_refresh
      ? await refreshCustomerSession()
      : await getCustomerSession();
    setSession(refreshed);
    return refreshed;
  }

  async function runRecommendation(activeSession) {
    setState({ status: "loading", recommendation: null, error: "" });
    try {
      const readySession = await ensureReadySession(activeSession);
      if (readySession.status !== "ready") {
        throw new Error("Your workspace is ready. Please sign out and sign back in, then press Get my recommendation again.");
      }
      const result = await requestRecommendation({
        accessToken: readySession.accessToken,
        tenantId: readySession.tenantId,
        projectId: readySession.projectId,
        brandId: readySession.brandId,
        goal: goal.trim(),
        idempotencyKey: crypto.randomUUID(),
      });
      setState({ status: "ready", recommendation: result.recommendation, error: "" });
    } catch (error) {
      setState({ status: "error", recommendation: null, error: error.message });
    }
  }

  function submit(event) {
    event.preventDefault();
    if (!goal.trim()) return;
    if (session.status !== "ready" && session.status !== "scope-missing") {
      // The goal stays on screen; no recommendation request is made
      // until a fully authenticated session exists.
      setPendingSubmit(true);
      return;
    }
    runRecommendation(session);
  }

  async function handleSignOut() {
    await signOut();
    setState({ status: "idle", recommendation: null, error: "" });
    setPendingSubmit(false);
  }

  return (
    <main className="shell">
      <nav className="topbar">
        <span className="wordmark">BizGenie</span>
        {session.status === "ready" ? (
          <button type="button" className="secondary" onClick={handleSignOut}>Sign out</button>
        ) : (
          <span className="status">Campaign workspace</span>
        )}
      </nav>
      <section className="hero">
        <p className="eyebrow">Start with the outcome</p>
        <h1>What do you want your campaign to achieve?</h1>
        <p className="lede">Tell BizGenie the goal in your own words. We’ll suggest a clear first campaign shape for you to review.</p>
        <form onSubmit={submit} className="goal-form">
          <label htmlFor="goal">Your goal</label>
          <textarea id="goal" value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="e.g. Launch our new strawberry lemonade next Friday" maxLength={2000} />
          <button type="submit" disabled={!goal.trim() || state.status === "loading"}>{state.status === "loading" ? "Thinking…" : "Get my recommendation"}</button>
        </form>

        {pendingSubmit && (session.status === "signed-out" || session.status === "unconfigured") && (
          <div className="account-prompt" role="status">
            <strong>Sign in to get your recommendation.</strong>
            <p>Your goal stays right here — nothing is created until you sign in.</p>
            <AuthPanel onAuthenticated={() => {}} />
          </div>
        )}

        {state.status === "error" && <p className="error" role="alert">{state.error}</p>}
      </section>
      <Founding100Panel />
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
