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

async function createCampaignFromRecommendation({ accessToken, session, recommendation }) {
  const payload = recommendation?.create_campaign_payload;
  if (!payload || !recommendation?.recommendation_id) {
    throw new Error("This recommendation cannot be turned into a campaign yet.");
  }

  const campaignResponse = await fetch(`${API_BASE_URL}/customer/campaigns`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authorizationHeader(accessToken) },
    body: JSON.stringify({
      tenant_id: session.tenantId,
      project_id: session.projectId,
      brand_id: recommendation.brand_id,
      name: payload.name,
      goal: payload.goal,
      display_timezone: payload.display_timezone,
      idempotency_key: `rec:${recommendation.recommendation_id}:campaign`,
    }),
  });
  if (!campaignResponse.ok) throw new Error("Campaign could not be created yet.");

  let created = await campaignResponse.json();
  const campaignId = created?.campaign?.campaign_id;
  if (!campaignId || !created?.result?.campaign_version) {
    throw new Error("Campaign could not be created yet.");
  }

  for (const [index, item] of recommendation.suggested_items.entries()) {
    const itemResponse = await fetch(`${API_BASE_URL}/customer/campaigns/${campaignId}/content-items`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authorizationHeader(accessToken) },
      body: JSON.stringify({
        tenant_id: session.tenantId,
        project_id: session.projectId,
        expected_campaign_version: created.result.campaign_version,
        name: item.name,
        format: item.format,
        platform: item.platform,
        placement: item.placement,
        destination_label: item.destination_label,
        idempotency_key: `rec:${recommendation.recommendation_id}:item:${index + 1}`,
      }),
    });
    if (!itemResponse.ok) throw new Error("Campaign was created, but its suggested items could not all be added yet.");
    created = await itemResponse.json();
  }

  return created.campaign;
}

async function generateCampaignVariant({ accessToken, session, campaign, variant, executionMode = "ai", executionBrief = "" }) {
  if (session.status !== "ready" || !campaign?.campaign_id || !variant?.variant_id || variant.workflow !== "draft") {
    throw new Error("This draft is not ready to generate yet.");
  }
  const campaignVersion = campaign.version;
  if (!Number.isInteger(campaignVersion)) throw new Error("Campaign version could not be checked yet.");
  const response = await fetch(`${API_BASE_URL}/customer/campaigns/${campaign.campaign_id}/variants/${variant.variant_id}/generate`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authorizationHeader(accessToken) },
    body: JSON.stringify({
      tenant_id: session.tenantId,
      project_id: session.projectId,
      expected_campaign_version: campaignVersion,
      idempotency_key: `campaign:${campaign.campaign_id}:variant:${variant.variant_id}:version:${campaignVersion}:generate`,
      execution_mode: executionMode,
      ...(executionBrief.trim() ? { execution_brief: executionBrief.trim() } : {}),
    }),
  });
  if (!response.ok) throw new Error("Content could not be generated yet. Your draft is still safe to retry.");
  const result = await response.json();
  if (!result?.campaign?.campaign_id) throw new Error("Generated content could not be confirmed yet.");
  return result.campaign;
}

function currentRevisionFor(variant) {
  return variant?.current_revision_id || variant?.current_revision?.revision_id;
}

function operationKey(campaign, variant, operation) {
  return `campaign:${campaign.campaign_id}:variant:${variant.variant_id}:revision:${currentRevisionFor(variant)}:${operation}`;
}

function campaignVariant(campaign, variantId) {
  return campaign?.items?.flatMap((item) => item.variants || []).find((item) => item.variant_id === variantId);
}

async function renderCampaignPreview({ accessToken, session, campaign, variant }) {
  const revisionId = currentRevisionFor(variant);
  if (!campaign?.campaign_id || !variant?.variant_id || variant.workflow !== "review" || !revisionId) {
    throw new Error("This content is not ready for preview yet.");
  }
  const response = await fetch(`${API_BASE_URL}/customer/campaigns/${campaign.campaign_id}/variants/${variant.variant_id}/preview-renders`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authorizationHeader(accessToken) },
    body: JSON.stringify({ tenant_id: session.tenantId, project_id: session.projectId, revision_id: revisionId, idempotency_key: operationKey(campaign, variant, "preview-render") }),
  });
  if (!response.ok) throw new Error("Preview could not be rendered yet. Your content is still safe.");
  const result = await response.json();
  if (!result?.preview?.render_receipt_id) throw new Error("Preview could not be confirmed yet.");
  return result.preview;
}

async function acknowledgeCampaignPreview({ accessToken, session, campaign, variant, receipt }) {
  const revisionId = currentRevisionFor(variant);
  if (!receipt?.render_receipt_id || receipt.revision_id !== revisionId) throw new Error("Preview is no longer current. Render it again.");
  const response = await fetch(`${API_BASE_URL}/customer/campaigns/${campaign.campaign_id}/variants/${variant.variant_id}/preview-acknowledgements`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authorizationHeader(accessToken) },
    body: JSON.stringify({ tenant_id: session.tenantId, project_id: session.projectId, expected_campaign_version: campaign.version, revision_id: revisionId, render_receipt_id: receipt.render_receipt_id, acknowledged: true, idempotency_key: operationKey(campaign, variant, "preview-acknowledgement") }),
  });
  if (!response.ok) throw new Error("Preview could not be acknowledged yet. Please retry from the current campaign.");
  const result = await response.json();
  if (!result?.campaign?.campaign_id) throw new Error("Preview acknowledgement could not be confirmed yet.");
  return { campaign: result.campaign, previewId: result.result?.created_ids?.preview_ids?.[0] };
}

async function approveCampaignVariant({ accessToken, session, campaign, variant, previewId }) {
  const revisionId = currentRevisionFor(variant);
  if (!previewId || !revisionId) throw new Error("A current acknowledged preview is required before approval.");
  const response = await fetch(`${API_BASE_URL}/customer/campaigns/${campaign.campaign_id}/variants/${variant.variant_id}/approval`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authorizationHeader(accessToken) },
    body: JSON.stringify({ tenant_id: session.tenantId, project_id: session.projectId, expected_campaign_version: campaign.version, revision_id: revisionId, preview_id: previewId, approved: true, idempotency_key: operationKey(campaign, variant, "approval") }),
  });
  if (!response.ok) throw new Error("Approval could not be completed yet. Your content is still safe.");
  const result = await response.json();
  if (!result?.campaign?.campaign_id) throw new Error("Approval could not be confirmed yet.");
  return result.campaign;
}

async function beginManualPublication({ accessToken, session, campaign, variant }) {
  const revisionId = currentRevisionFor(variant);
  if (!revisionId || variant.workflow !== "approved") throw new Error("Only approved content can be prepared for manual publication.");
  const response = await fetch(`${API_BASE_URL}/customer/campaigns/${campaign.campaign_id}/variants/${variant.variant_id}/manual-publication`, {
    method: "POST", headers: { "content-type": "application/json", ...authorizationHeader(accessToken) },
    body: JSON.stringify({ tenant_id: session.tenantId, project_id: session.projectId, expected_campaign_version: campaign.version, revision_id: revisionId, idempotency_key: operationKey(campaign, variant, "manual-publication") }),
  });
  if (!response.ok) throw new Error("Manual publication could not be prepared yet. Your approval is still safe.");
  const result = await response.json();
  const attemptId = result?.result?.created_ids?.attempt_ids?.[0];
  if (!attemptId || !result?.campaign?.campaign_id) throw new Error("Manual publication could not be confirmed yet.");
  return { campaign: result.campaign, attemptId };
}

async function getCampaignMeasurements({ accessToken, session, campaign }) {
  const query = new URLSearchParams({ tenant_id: session.tenantId, project_id: session.projectId });
  const response = await fetch(`${API_BASE_URL}/customer/campaigns/${campaign.campaign_id}/measurements?${query.toString()}`, {
    headers: authorizationHeader(accessToken),
  });
  if (!response.ok) throw new Error("Results could not be loaded yet.");
  const result = await response.json();
  return Array.isArray(result?.measurements) ? result.measurements : [];
}

async function recordCampaignMeasurement({ accessToken, session, campaign, variant, input }) {
  const response = await fetch(`${API_BASE_URL}/customer/campaigns/${campaign.campaign_id}/variants/${variant.variant_id}/measurements`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authorizationHeader(accessToken) },
    body: JSON.stringify({
      tenant_id: session.tenantId,
      project_id: session.projectId,
      idempotency_key: `measurement:${campaign.campaign_id}:${variant.variant_id}:${input.metric}:${input.observed_at}`,
      metric: input.metric,
      value: Number(input.value),
      unit: input.unit,
      observed_at: input.observed_at,
      note: input.note || null,
    }),
  });
  if (!response.ok) throw new Error("This result could not be recorded yet.");
  return response.json();
}

async function getCampaignCalendar({ accessToken, session, campaign, from, to }) {
  const query = new URLSearchParams({ tenant_id: session.tenantId, project_id: session.projectId, from, to });
  const response = await fetch(`${API_BASE_URL}/customer/campaigns/${campaign.campaign_id}/calendar?${query.toString()}`, {
    headers: authorizationHeader(accessToken),
  });
  if (!response.ok) throw new Error("Calendar activity could not be loaded yet.");
  const result = await response.json();
  return Array.isArray(result?.entries) ? result.entries : [];
}

async function confirmManualPublication({ accessToken, session, campaign, variant, attemptId, publicationUrl }) {
  if (!attemptId || !publicationUrl) throw new Error("Enter the public URL after you publish the approved content.");
  const response = await fetch(`${API_BASE_URL}/customer/campaigns/${campaign.campaign_id}/variants/${variant.variant_id}/manual-publication/confirm`, {
    method: "POST", headers: { "content-type": "application/json", ...authorizationHeader(accessToken) },
    body: JSON.stringify({ tenant_id: session.tenantId, project_id: session.projectId, expected_campaign_version: campaign.version, attempt_id: attemptId, published_at: new Date().toISOString(), publication_url: publicationUrl, idempotency_key: operationKey(campaign, variant, "manual-publication-confirm") }),
  });
  if (!response.ok) throw new Error("Publication evidence could not be recorded yet. Nothing was marked published.");
  return response.json();
}

export default function App() {
  const [goal, setGoal] = useState("");
  const [state, setState] = useState({ status: "idle", recommendation: null, error: "" });
  const [campaignState, setCampaignState] = useState({ status: "idle", campaign: null, error: "" });
  const [generationState, setGenerationState] = useState({ status: "idle", error: "" });
  const [executionMode, setExecutionMode] = useState("ai");
  const [executionBrief, setExecutionBrief] = useState("");
  const [reviewState, setReviewState] = useState({ status: "idle", variantId: "", receipt: null, previewId: "", error: "" });
  const [manualState, setManualState] = useState({ status: "idle", variantId: "", attemptId: "", url: "", error: "" });
  const [calendarState, setCalendarState] = useState({ status: "idle", entries: [], error: "" });
  const [resultsState, setResultsState] = useState({ status: "idle", entries: [], variantId: "", metric: "views", value: "", unit: "count", observedAt: "", note: "", error: "" });
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
    setCampaignState({ status: "idle", campaign: null, error: "" });
    setGenerationState({ status: "idle", error: "" });
    setReviewState({ status: "idle", variantId: "", receipt: null, previewId: "", error: "" });
    setManualState({ status: "idle", variantId: "", attemptId: "", url: "", error: "" });
    setCalendarState({ status: "idle", entries: [], error: "" });
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

  async function runCreateCampaign() {
    if (session.status !== "ready" || !state.recommendation || campaignState.status === "loading") return;
    setCampaignState({ status: "loading", campaign: null, error: "" });
    try {
      const campaign = await createCampaignFromRecommendation({
        accessToken: session.accessToken,
        session,
        recommendation: state.recommendation,
      });
      setCampaignState({ status: "ready", campaign, error: "" });
    } catch (error) {
      setCampaignState({ status: "error", campaign: null, error: error.message });
    }
  }

  async function runGenerateVariant(variant) {
    if (generationState.status === "loading" || !campaignState.campaign || variant.workflow !== "draft") return;
    setGenerationState({ status: "loading", error: "" });
    try {
      const campaign = await generateCampaignVariant({ accessToken: session.accessToken, session, campaign: campaignState.campaign, variant, executionMode, executionBrief });
      setCampaignState({ status: "ready", campaign, error: "" });
      setGenerationState({ status: "ready", error: "" });
    } catch (error) {
      setGenerationState({ status: "error", error: error.message });
    }
  }

  async function runPreview(variant) {
    if (reviewState.status !== "idle" || !campaignState.campaign || variant.workflow !== "review") return;
    setReviewState({ status: "rendering", variantId: variant.variant_id, receipt: null, previewId: "", error: "" });
    try {
      const receipt = await renderCampaignPreview({ accessToken: session.accessToken, session, campaign: campaignState.campaign, variant });
      setReviewState({ status: "rendered", variantId: variant.variant_id, receipt, previewId: "", error: "" });
    } catch (error) { setReviewState({ status: "error", variantId: variant.variant_id, receipt: null, previewId: "", error: error.message }); }
  }

  async function runAcknowledge(variant) {
    if (reviewState.status !== "rendered" || reviewState.variantId !== variant.variant_id) return;
    setReviewState((current) => ({ ...current, status: "acknowledging", error: "" }));
    try {
      const acknowledged = await acknowledgeCampaignPreview({ accessToken: session.accessToken, session, campaign: campaignState.campaign, variant, receipt: reviewState.receipt });
      const campaign = acknowledged.campaign;
      const previewId = acknowledged.previewId;
      if (!previewId) throw new Error("Preview acknowledgement could not be confirmed yet.");
      setCampaignState({ status: "ready", campaign, error: "" });
      setReviewState((current) => ({ ...current, status: "acknowledged", previewId, error: "" }));
    } catch (error) { setReviewState((current) => ({ ...current, status: "error", error: error.message })); }
  }

  async function runApprove(variant) {
    if (reviewState.status !== "acknowledged" || reviewState.variantId !== variant.variant_id) return;
    setReviewState((current) => ({ ...current, status: "approving", error: "" }));
    try {
      const campaign = await approveCampaignVariant({ accessToken: session.accessToken, session, campaign: campaignState.campaign, variant, previewId: reviewState.previewId });
      setCampaignState({ status: "ready", campaign, error: "" });
      if (campaignVariant(campaign, variant.variant_id)?.workflow !== "approved") {
        throw new Error("Approval could not be confirmed yet. The campaign did not return approved status.");
      }
      setReviewState((current) => ({ ...current, status: "approved", error: "" }));
    } catch (error) { setReviewState((current) => ({ ...current, status: "error", error: error.message })); }
  }

  async function runManualStart(variant) {
    if (!campaignState.campaign || manualState.status === "starting") return;
    setManualState({ status: "starting", variantId: variant.variant_id, attemptId: "", url: "", error: "" });
    try {
      const result = await beginManualPublication({ accessToken: session.accessToken, session, campaign: campaignState.campaign, variant });
      setCampaignState({ status: "ready", campaign: result.campaign, error: "" });
      setManualState({ status: "prepared", variantId: variant.variant_id, attemptId: result.attemptId, url: "", error: "" });
    } catch (error) { setManualState((current) => ({ ...current, status: "error", error: error.message })); }
  }

  async function loadResults() {
    if (!campaignState.campaign || resultsState.status === "loading") return;
    setResultsState((current) => ({ ...current, status: "loading", error: "" }));
    try {
      const entries = await getCampaignMeasurements({ accessToken: session.accessToken, session, campaign: campaignState.campaign });
      setResultsState((current) => ({ ...current, status: "ready", entries, error: "" }));
    } catch (error) {
      setResultsState((current) => ({ ...current, status: "error", error: error.message }));
    }
  }

  async function saveResult(variant) {
    if (!campaignState.campaign || resultsState.status === "saving" || !resultsState.value || !resultsState.observedAt) return;
    setResultsState((current) => ({ ...current, status: "saving", variantId: variant.variant_id, error: "" }));
    try {
      await recordCampaignMeasurement({
        accessToken: session.accessToken, session, campaign: campaignState.campaign, variant,
        input: { metric: resultsState.metric, value: resultsState.value, unit: resultsState.unit, observed_at: new Date(resultsState.observedAt).toISOString(), note: resultsState.note },
      });
      const entries = await getCampaignMeasurements({ accessToken: session.accessToken, session, campaign: campaignState.campaign });
      setResultsState((current) => ({ ...current, status: "ready", entries, variantId: "", value: "", note: "", error: "" }));
    } catch (error) {
      setResultsState((current) => ({ ...current, status: "error", error: error.message }));
    }
  }

  async function runCalendar() {
    if (!campaignState.campaign || calendarState.status === "loading") return;
    setCalendarState({ status: "loading", entries: [], error: "" });
    try {
      const now = new Date();
      const from = new Date(now);
      from.setUTCDate(from.getUTCDate() - 30);
      const to = new Date(now);
      to.setUTCDate(to.getUTCDate() + 90);
      const entries = await getCampaignCalendar({ accessToken: session.accessToken, session, campaign: campaignState.campaign, from: from.toISOString(), to: to.toISOString() });
      setCalendarState({ status: "ready", entries, error: "" });
    } catch (error) {
      setCalendarState({ status: "error", entries: [], error: error.message });
    }
  }

  async function runManualConfirm(variant) {
    if (manualState.status !== "prepared" || manualState.variantId !== variant.variant_id) return;
    setManualState((current) => ({ ...current, status: "confirming", error: "" }));
    try {
      const result = await confirmManualPublication({ accessToken: session.accessToken, session, campaign: campaignState.campaign, variant, attemptId: manualState.attemptId, publicationUrl: manualState.url });
      setCampaignState({ status: "ready", campaign: result.campaign, error: "" });
      setManualState((current) => ({ ...current, status: "published", error: "" }));
      setCalendarState({ status: "idle", entries: [], error: "" });
    } catch (error) { setManualState((current) => ({ ...current, status: "error", error: error.message })); }
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
    setCampaignState({ status: "idle", campaign: null, error: "" });
    setGenerationState({ status: "idle", error: "" });
    setReviewState({ status: "idle", variantId: "", receipt: null, previewId: "", error: "" });
    setManualState({ status: "idle", variantId: "", attemptId: "", url: "", error: "" });
    setCalendarState({ status: "idle", entries: [], error: "" });
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
          <button className="secondary" type="button" onClick={runCreateCampaign} disabled={campaignState.status === "loading" || campaignState.status === "ready"}>
            {campaignState.status === "loading" ? "Creating campaign…" : campaignState.status === "ready" ? "Campaign created" : "Create campaign"}
          </button>
          {campaignState.status === "error" && <p className="error" role="alert">{campaignState.error}</p>}
        </section>
      )}
      {campaignState.campaign && (
        <section className="recommendation" aria-live="polite">
          <div className="recommendation-header"><div><p className="eyebrow">Saved to your workspace</p><h2>{campaignState.campaign.name}</h2></div><span className="pill">Draft</span></div>
          <p>Your campaign and recommended starting items are now saved. Nothing has been scheduled or published.</p>
          <div className="item" aria-label="Generation setup">
            <span>Creative direction</span>
            <h3>How should BizGenie build this?</h3>
            <label htmlFor="execution-mode">Execution mode</label>
            <select id="execution-mode" value={executionMode} onChange={(event) => setExecutionMode(event.target.value)}>
              <option value="ai">AI — create from Brand Brain and your brief</option>
              <option value="hybrid" disabled>Hybrid — use your media + AI (add-media picker coming next)</option>
            </select>
            <label htmlFor="execution-brief">Execution brief (optional)</label>
            <textarea id="execution-brief" maxLength={4000} value={executionBrief} onChange={(event) => setExecutionBrief(event.target.value)} placeholder="Temporary direction for this execution, e.g. focus on the founder story and keep the opening conversational." />
            <small>This brief applies only to this generation. It does not change your approved Brand Brain.</small>
          </div>
          <div className="item-grid">
            {campaignState.campaign.items.map((item) => (
              <article className="item" key={item.content_item_id}>
                <span>{item.format}</span>
                <h3>{item.name}</h3>
                {item.variants.map((variant) => (
                  <div key={variant.variant_id}>
                    <p>{variant.current_content || (variant.workflow === "draft" ? "Draft ready to generate." : variant.workflow)}</p>
                    <small>{variant.destination_label}</small>
                    {variant.workflow === "draft" && (
                      <button className="secondary" type="button" onClick={() => runGenerateVariant(variant)} disabled={generationState.status === "loading"}>
                        {generationState.status === "loading" ? "Generating…" : "Generate draft"}
                      </button>
                    )}
                    {variant.workflow === "approved" && <p><strong>Approved</strong></p>}
                    {variant.workflow === "approved" && <div>
                      <p>Manual publication required. BizGenie will not claim this was published until you confirm it.</p>
                      <button className="secondary" type="button" onClick={() => runManualStart(variant)} disabled={manualState.status === "starting"}>{manualState.status === "starting" ? "Preparing handoff…" : "Prepare manual publication"}</button>
                    </div>}
                    {manualState.variantId === variant.variant_id && ["prepared", "confirming"].includes(manualState.status) && <div>
                      <p>Approved content is ready to copy and publish to <strong>{variant.destination_label}</strong>.</p>
                      <textarea aria-label="Approved content" readOnly value={variant.current_content || ""} />
                      <label htmlFor={`publication-url-${variant.variant_id}`}>Public URL after publishing</label>
                      <input id={`publication-url-${variant.variant_id}`} value={manualState.url} onChange={(event) => setManualState((current) => ({ ...current, url: event.target.value }))} placeholder="https://…" />
                      <button className="secondary" type="button" onClick={() => runManualConfirm(variant)} disabled={manualState.status === "confirming"}>{manualState.status === "confirming" ? "Recording evidence…" : "I published this — record evidence"}</button>
                    </div>}
                    {variant.workflow === "published" && (<div>
                      <p><strong>Published by customer attestation</strong>. BizGenie has recorded the supplied publication evidence.</p>
                      <details>
                        <summary>Record a real result</summary>
                        <p>Only enter an outcome you actually observed. BizGenie will keep it as customer-attested evidence.</p>
                        <label htmlFor={`metric-${variant.variant_id}`}>Result</label>
                        <select id={`metric-${variant.variant_id}`} value={resultsState.metric} onChange={(event) => setResultsState((current) => ({ ...current, metric: event.target.value }))}>
                          <option value="views">Views</option><option value="reach">Reach</option><option value="impressions">Impressions</option><option value="clicks">Clicks</option><option value="enquiries">Enquiries</option><option value="leads">Leads</option><option value="conversions">Conversions</option><option value="sales">Sales</option><option value="revenue">Revenue</option><option value="value">Value</option>
                        </select>
                        <label htmlFor={`value-${variant.variant_id}`}>Observed value</label>
                        <input id={`value-${variant.variant_id}`} type="number" min="0" step="any" value={resultsState.value} onChange={(event) => setResultsState((current) => ({ ...current, value: event.target.value }))} />
                        <label htmlFor={`unit-${variant.variant_id}`}>Unit</label>
                        <select id={`unit-${variant.variant_id}`} value={resultsState.unit} onChange={(event) => setResultsState((current) => ({ ...current, unit: event.target.value }))}>
                          <option value="count">Count</option><option value="gbp">GBP</option><option value="usd">USD</option><option value="eur">EUR</option><option value="percent">Percent</option><option value="other">Other</option>
                        </select>
                        <label htmlFor={`observed-${variant.variant_id}`}>Observed at</label>
                        <input id={`observed-${variant.variant_id}`} type="datetime-local" value={resultsState.observedAt} onChange={(event) => setResultsState((current) => ({ ...current, observedAt: event.target.value }))} />
                        <label htmlFor={`result-note-${variant.variant_id}`}>Evidence note (optional)</label>
                        <input id={`result-note-${variant.variant_id}`} value={resultsState.note} onChange={(event) => setResultsState((current) => ({ ...current, note: event.target.value }))} placeholder="e.g. read from the published post" />
                        <button className="secondary" type="button" onClick={() => saveResult(variant)} disabled={resultsState.status === "saving"}>{resultsState.status === "saving" && resultsState.variantId === variant.variant_id ? "Recording result…" : "Record result"}</button>
                      </details>
                    </div>)}
                    {variant.workflow === "review" && (
                      <div>
                        <p><strong>Ready for review</strong></p>
                        <button className="secondary" type="button" onClick={() => runPreview(variant)} disabled={reviewState.variantId === variant.variant_id && ["rendering", "acknowledging", "approving"].includes(reviewState.status)}>{reviewState.status === "rendering" && reviewState.variantId === variant.variant_id ? "Rendering preview…" : "Render preview"}</button>
                        {reviewState.status === "rendered" && reviewState.variantId === variant.variant_id && <button className="secondary" type="button" onClick={() => runAcknowledge(variant)}>Acknowledge preview</button>}
                        {reviewState.status === "acknowledged" && reviewState.variantId === variant.variant_id && <button className="secondary" type="button" onClick={() => runApprove(variant)}>Approve</button>}
                      </div>
                    )}
                  </div>
                ))}
              </article>
            ))}
          </div>
          {generationState.status === "error" && <p className="error" role="alert">{generationState.error}</p>}
          {reviewState.status === "error" && <p className="error" role="alert">{reviewState.error}</p>}
          {manualState.status === "error" && <p className="error" role="alert">{manualState.error}</p>}
          <div>
            <button className="secondary" type="button" onClick={loadResults} disabled={resultsState.status === "loading"}>{resultsState.status === "loading" ? "Loading results…" : "View campaign results"}</button>
            {["ready","saving"].includes(resultsState.status) && (
              <div aria-label="Campaign results">
                <h3>Campaign results</h3>
                {resultsState.entries.length === 0 ? <p>No measured results have been recorded for this campaign yet.</p> : (
                  <ul>{resultsState.entries.map((entry) => <li key={entry.measurement_id}><strong>{entry.metric}</strong>: {entry.value} {entry.unit} — observed {new Date(entry.observed_at).toLocaleString()} <small>Customer attestation</small></li>)}</ul>
                )}
              </div>
            )}
            {resultsState.status === "error" && <p className="error" role="alert">{resultsState.error}</p>}
          </div>
          <div>
            <button className="secondary" type="button" onClick={runCalendar} disabled={calendarState.status === "loading"}>
              {calendarState.status === "loading" ? "Loading calendar…" : "View campaign calendar"}
            </button>
            {calendarState.status === "ready" && (
              <div aria-label="Campaign calendar">
                <h3>Campaign calendar</h3>
                {calendarState.entries.length === 0 ? (
                  <p>No scheduled or published activity is recorded for this campaign in this window.</p>
                ) : (
                  <ul>
                    {calendarState.entries.map((entry) => (
                      <li key={`${entry.variant_id}:${entry.occurrence_at}`}>
                        <strong>{entry.workflow === "published" ? "Published" : "Scheduled"}</strong>
                        {" — "}{new Date(entry.occurrence_at).toLocaleString()}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {calendarState.status === "error" && <p className="error" role="alert">{calendarState.error}</p>}
          </div>
        </section>
      )}
    </main>
  );
}
