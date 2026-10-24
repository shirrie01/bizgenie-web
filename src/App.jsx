import BrandBrainProfile from "./BrandBrainProfile";
import { useCallback, useEffect, useRef, useState } from "react";
import { getCustomerSession, refreshCustomerSession } from "./session";
import { onAuthStateChange, signOut } from "./authClient";
import AuthPanel from "./AuthPanel";
import Founding100Panel from "./Founding100Panel";
import BillingPanel from "./BillingPanel";
import CreativeReview from "./CreativeReview";
import CreativePreviewCard, { creativeAsText } from "./CreativePreviewCard";
import { operationKey } from "./operationKey";
import PremiumStudio from "./premium/PremiumStudio";
import PremiumErrorBoundary from "./premium/PremiumErrorBoundary";
import { isPremiumStudioEnabled } from "./premium/flag";
import { SAVE_NOT_CONFIRMED_RETRY, createSaveKeeper, fetchOnboarding, putOnboarding } from "./premium/onboardingClient";
import { fetchMembershipRole, isReadOnlyRole } from "./premium/membershipClient";
import { fetchWorkspaces, normaliseWorkspace, sameWorkspace, selectWorkspace } from "./premium/workspaceClient";
import { BRAIN_SAVE_UNCONFIRMED, fetchBrandBrain, hasUntrimmedIdentity, identityChanged, mergeBrainFields, putBrandBrain } from "./premium/brainClient";

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

async function getSelectedBrandBrain(accessToken) {
  const response = await fetch(`${API_BASE_URL}/customer/workspace/brand-brain`, {
    headers: authorizationHeader(accessToken),
  });
  if (!response.ok) throw new Error("Brand Brain could not be loaded yet.");
  return response.json();
}

async function correctSelectedBrandBrain({ accessToken, brandBrain }) {
  const { brand_id: _brandId, project_id: _projectId, metadata: _metadata, ...editable } = brandBrain;
  const response = await fetch(`${API_BASE_URL}/customer/workspace/brand-brain`, {
    method: "PUT",
    headers: { "content-type": "application/json", ...authorizationHeader(accessToken) },
    body: JSON.stringify(editable),
  });
  if (!response.ok) throw new Error("Brand Brain changes could not be saved yet.");
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

// Premium Studio only (BG-STUDIO-008-FE). A request that never answers must not leave a spinner forever. The
// request itself is not cancelled, so callers say plainly when a write may still have completed.
const PREMIUM_TIMEOUT_MS = 20000;
function withTimeout(promise, message = "This is taking longer than expected. Please try again.", ms = PREMIUM_TIMEOUT_MS, props = null) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(props ? Object.assign(new Error(message), props) : new Error(message)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Explicit onboarding values, only through the existing bootstrap contract. Optional fields are omitted when
// empty because the backend rejects empty strings.
async function bootstrapWorkspaceWithProfile({ accessToken, businessName, website, challenge }) {
  const body = { business_name: businessName };
  if (website) body.website_or_social_profile = website;
  if (challenge) body.primary_marketing_challenge = challenge;
  const response = await fetch(`${API_BASE_URL}/customer/workspace/bootstrap`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authorizationHeader(accessToken) },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("Your workspace could not be created yet. Nothing was saved.");
  return response.json();
}

// Existing real campaigns for the selected workspace (GET /customer/campaigns). Read only.
async function getCampaignList({ accessToken, session }) {
  const query = new URLSearchParams({ tenant_id: session.tenantId, project_id: session.projectId });
  const response = await fetch(`${API_BASE_URL}/customer/campaigns?${query.toString()}`, { headers: authorizationHeader(accessToken) });
  if (!response.ok) throw new Error("Your campaigns could not be loaded yet.");
  const result = await response.json();
  return Array.isArray(result?.campaigns) ? result.campaigns : [];
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

const STALE_CODES = ["VERSION_CONFLICT", "IDEMPOTENCY_KEY_CONFLICT"];
const STALE_MESSAGE = "This campaign changed since you opened it. Reload the latest version to continue; your content is not lost.";
// The backend has no trusted preview profile for this destination and format. That is not a stale version:
// reloading or retrying cannot help, and acknowledgement and approval stay blocked.
const PROFILE_CODES = ["PREVIEW_VERSION_UNAVAILABLE"];
const PROFILE_MESSAGE = "A preview isn't available for this destination and format yet, so this content can't be reviewed or approved here. Your content is unchanged.";

// A conflict means our copy of the campaign is out of date; a plain retry would send the same stale version again.
async function reviewRequestError(response, fallback) {
  let code = "";
  try { code = (await response.json())?.error?.code || ""; } catch { /* non-JSON error body */ }
  const unavailable = PROFILE_CODES.includes(code);
  const error = new Error(unavailable ? PROFILE_MESSAGE : STALE_CODES.includes(code) ? STALE_MESSAGE : fallback);
  error.stale = STALE_CODES.includes(code);
  error.unavailable = unavailable;
  return error;
}

async function fetchCampaign({ accessToken, session, campaignId }) {
  const query = new URLSearchParams({ tenant_id: session.tenantId, project_id: session.projectId });
  const response = await fetch(`${API_BASE_URL}/customer/campaigns/${campaignId}?${query.toString()}`, { headers: authorizationHeader(accessToken) });
  if (!response.ok) throw new Error("The latest campaign could not be loaded yet. Please try again.");
  const result = await response.json();
  if (!result?.campaign?.campaign_id) throw new Error("The latest campaign could not be confirmed yet.");
  return result.campaign;
}

function currentRevisionFor(variant) {
  return variant?.current_revision_id || variant?.current_revision?.revision_id;
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
    body: JSON.stringify({ tenant_id: session.tenantId, project_id: session.projectId, revision_id: revisionId, idempotency_key: await operationKey(campaign, variant, currentRevisionFor(variant), "preview-render") }),
  });
  if (!response.ok) {
    const failure = await reviewRequestError(response, "Preview could not be rendered yet. Your content is still safe.");
    // Only the profile case is specialised here; a stale mapping would wrongly offer a reload for a render.
    throw failure.unavailable ? failure : new Error("Preview could not be rendered yet. Your content is still safe.");
  }
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
    body: JSON.stringify({ tenant_id: session.tenantId, project_id: session.projectId, expected_campaign_version: campaign.version, revision_id: revisionId, render_receipt_id: receipt.render_receipt_id, acknowledged: true, idempotency_key: await operationKey(campaign, variant, currentRevisionFor(variant), "preview-acknowledgement") }),
  });
  if (!response.ok) throw await reviewRequestError(response, "Preview could not be acknowledged yet. Please try again.");
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
    body: JSON.stringify({ tenant_id: session.tenantId, project_id: session.projectId, expected_campaign_version: campaign.version, revision_id: revisionId, preview_id: previewId, approved: true, idempotency_key: await operationKey(campaign, variant, currentRevisionFor(variant), "approval") }),
  });
  if (!response.ok) throw await reviewRequestError(response, "Approval could not be completed yet. Your content is still safe.");
  const result = await response.json();
  if (!result?.campaign?.campaign_id) throw new Error("Approval could not be confirmed yet.");
  return result.campaign;
}

async function beginManualPublication({ accessToken, session, campaign, variant }) {
  const revisionId = currentRevisionFor(variant);
  if (!revisionId || variant.workflow !== "approved") throw new Error("Only approved content can be prepared for manual publication.");
  const response = await fetch(`${API_BASE_URL}/customer/campaigns/${campaign.campaign_id}/variants/${variant.variant_id}/manual-publication`, {
    method: "POST", headers: { "content-type": "application/json", ...authorizationHeader(accessToken) },
    body: JSON.stringify({ tenant_id: session.tenantId, project_id: session.projectId, expected_campaign_version: campaign.version, revision_id: revisionId, idempotency_key: await operationKey(campaign, variant, currentRevisionFor(variant), "manual-publication") }),
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
    body: JSON.stringify({ tenant_id: session.tenantId, project_id: session.projectId, expected_campaign_version: campaign.version, attempt_id: attemptId, published_at: new Date().toISOString(), publication_url: publicationUrl, idempotency_key: await operationKey(campaign, variant, currentRevisionFor(variant), "manual-publication-confirm") }),
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
  const [reviewState, setReviewState] = useState({ status: "idle", variantId: "", receipt: null, previewId: "", error: "", stale: false });
  const [manualState, setManualState] = useState({ status: "idle", variantId: "", attemptId: "", url: "", error: "" });
  const [calendarState, setCalendarState] = useState({ status: "idle", entries: [], error: "" });
  const [resultsState, setResultsState] = useState({ status: "idle", entries: [], variantId: "", metric: "views", value: "", unit: "count", observedAt: "", note: "", error: "" });
  const [session, setSession] = useState({ status: "loading" });
  const [pendingSubmit, setPendingSubmit] = useState(false);
  const [brandBrainState, setBrandBrainState] = useState({ status: "idle", brain: null, draft: "", error: "" });
  const premiumEnabled = isPremiumStudioEnabled();
  const [campaignList, setCampaignList] = useState({ status: "idle", campaigns: [], error: "" });
  const [premiumEpoch, setPremiumEpoch] = useState(0);
  // Persistent onboarding (BG-STUDIO-010-FE): the saved record for the selected workspace, as the API returned it.
  const [onboardingState, setOnboardingState] = useState({ status: "idle", onboarding: null, brandNamePlaceholder: null, error: "" });
  // Workspace list and selection (BG-STUDIO-011-FE). `selectionRequired` is true only when the API said so; the
  // browser never picks a workspace for the customer.
  const [workspaceState, setWorkspaceState] = useState({ status: "idle", workspaces: [], selectionRequired: false, error: "", errorCode: "", notice: "", target: null });
  // The customer's role in this workspace (from the existing workspace list). Unknown until read; the server decides writes.
  const [roleState, setRoleState] = useState({ status: "idle", role: null });
  const saveKeeperRef = useRef(null);
  if (saveKeeperRef.current === null) saveKeeperRef.current = createSaveKeeper();
  const hadSessionRef = useRef(false);
  const lastScopeRef = useRef("");
  // Bumped whenever the account or workspace changes. Responses that started under an earlier value are ignored.
  const scopeTokenRef = useRef(0);

  function resetCustomerState() {
    scopeTokenRef.current += 1;
    setGoal("");
    setState({ status: "idle", recommendation: null, error: "" });
    setCampaignState({ status: "idle", campaign: null, error: "" });
    setGenerationState({ status: "idle", error: "" });
    setReviewState({ status: "idle", variantId: "", receipt: null, previewId: "", error: "", stale: false });
    setManualState({ status: "idle", variantId: "", attemptId: "", url: "", error: "" });
    setCalendarState({ status: "idle", entries: [], error: "" });
    setResultsState({ status: "idle", entries: [], variantId: "", metric: "views", value: "", unit: "count", observedAt: "", note: "", error: "" });
    setBrandBrainState({ status: "idle", brain: null, draft: "", error: "" });
    setCampaignList({ status: "idle", campaigns: [], error: "" });
    setOnboardingState({ status: "idle", onboarding: null, brandNamePlaceholder: null, error: "" });
    setRoleState({ status: "idle", role: null });
    saveKeeperRef.current.clear();
    setPendingSubmit(false);
  }

  // Premium Studio: never carry one account's or workspace's data into another. Runs only when the flag is on.
  useEffect(() => {
    if (!premiumEnabled) return;
    const scope = session.status === "ready" ? `${session.tenantId}:${session.projectId}:${session.brandId}` : "";
    const signedOut = session.status === "signed-out" || session.status === "unconfigured";
    const scopeChanged = Boolean(scope) && Boolean(lastScopeRef.current) && scope !== lastScopeRef.current;
    if (scopeChanged || (signedOut && hadSessionRef.current)) {
      resetCustomerState();
      setWorkspaceState({ status: "idle", workspaces: [], selectionRequired: false, error: "", errorCode: "", notice: "", target: null });
      setPremiumEpoch((value) => value + 1);
      hadSessionRef.current = false;
      lastScopeRef.current = "";
    }
    if (session.status === "ready" || session.status === "scope-missing") hadSessionRef.current = true;
    if (scope) lastScopeRef.current = scope;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [premiumEnabled, session.status, session.tenantId, session.projectId, session.brandId]);

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

  async function loadBrandBrain() {
    if (session.status !== "ready" || brandBrainState.status === "loading") return;
    setBrandBrainState((current) => ({ ...current, status: "loading", error: "" }));
    try {
      const result = await getSelectedBrandBrain(session.accessToken);
      setBrandBrainState({ status: "ready", brain: result.brand_brain, draft: JSON.stringify(result.brand_brain, null, 2), error: "" });
    } catch (error) {
      setBrandBrainState({ status: "error", brain: null, draft: "", error: error.message });
    }
  }

  async function saveBrandBrain() {
    if (session.status !== "ready" || brandBrainState.status === "saving") return;
    try {
      const parsed = JSON.parse(brandBrainState.draft);
      setBrandBrainState((current) => ({ ...current, status: "saving", error: "" }));
      const result = await correctSelectedBrandBrain({ accessToken: session.accessToken, brandBrain: parsed });
      setBrandBrainState({ status: "ready", brain: result.brand_brain, draft: JSON.stringify(result.brand_brain, null, 2), error: "" });
    } catch (error) {
      setBrandBrainState((current) => ({ ...current, status: "error", error: error instanceof SyntaxError ? "Brand Brain JSON is not valid yet." : error.message }));
    }
  }

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

  async function runRecommendation(activeSession, goalOverride) {
    const scopeToken = scopeTokenRef.current;
    const goalText = (typeof goalOverride === "string" ? goalOverride : goal).trim();
    setState({ status: "loading", recommendation: null, error: "" });
    setCampaignState({ status: "idle", campaign: null, error: "" });
    setGenerationState({ status: "idle", error: "" });
    setReviewState({ status: "idle", variantId: "", receipt: null, previewId: "", error: "", stale: false });
    setManualState({ status: "idle", variantId: "", attemptId: "", url: "", error: "" });
    setCalendarState({ status: "idle", entries: [], error: "" });
    try {
      const readySession = await ensureReadySession(activeSession);
      if (readySession.status !== "ready") {
        throw new Error("Your workspace is ready. Please sign out and sign back in, then press Get my recommendation again.");
      }
      const request = requestRecommendation({
        accessToken: readySession.accessToken,
        tenantId: readySession.tenantId,
        projectId: readySession.projectId,
        brandId: readySession.brandId,
        goal: goalText,
        idempotencyKey: crypto.randomUUID(),
      });
      const result = await (premiumEnabled ? withTimeout(request, "Your recommendation is taking longer than expected. Please try again.") : request);
      if (scopeToken !== scopeTokenRef.current) return;
      setState({ status: "ready", recommendation: result.recommendation, error: "" });
    } catch (error) {
      if (scopeToken !== scopeTokenRef.current) return;
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

  async function runReloadCampaign() {
    if (!campaignState.campaign || ["rendering", "acknowledging", "approving", "reloading"].includes(reviewState.status)) return;
    const variantId = reviewState.variantId;
    setReviewState((current) => ({ ...current, status: "reloading", error: "", stale: false }));
    try {
      const campaign = await fetchCampaign({ accessToken: session.accessToken, session, campaignId: campaignState.campaign.campaign_id });
      setCampaignState({ status: "ready", campaign, error: "" });
      setReviewState({ status: "idle", variantId: "", receipt: null, previewId: "", error: "", stale: false });
    } catch (error) { setReviewState((current) => ({ ...current, status: "error", variantId, error: error.message, stale: true })); }
  }

  async function runPreview(variant) {
    if (["rendering", "acknowledging", "approving", "reloading"].includes(reviewState.status) || !campaignState.campaign || variant.workflow !== "review") return;
    setReviewState({ status: "rendering", variantId: variant.variant_id, receipt: null, previewId: "", error: "", stale: false });
    try {
      const receipt = await renderCampaignPreview({ accessToken: session.accessToken, session, campaign: campaignState.campaign, variant });
      setReviewState({ status: "rendered", variantId: variant.variant_id, receipt, previewId: "", error: "" });
    } catch (error) { setReviewState({ status: "error", variantId: variant.variant_id, receipt: null, previewId: "", error: error.message, stale: false, unavailable: Boolean(error.unavailable) }); }
  }

  async function runAcknowledge(variant) {
    const retryable = reviewState.status === "error" && reviewState.receipt && !reviewState.previewId;
    if ((reviewState.status !== "rendered" && !retryable) || reviewState.variantId !== variant.variant_id) return;
    setReviewState((current) => ({ ...current, status: "acknowledging", error: "", stale: false }));
    try {
      const acknowledged = await acknowledgeCampaignPreview({ accessToken: session.accessToken, session, campaign: campaignState.campaign, variant, receipt: reviewState.receipt });
      const campaign = acknowledged.campaign;
      const previewId = acknowledged.previewId;
      if (!previewId) throw new Error("Preview acknowledgement could not be confirmed yet.");
      setCampaignState({ status: "ready", campaign, error: "" });
      setReviewState((current) => ({ ...current, status: "acknowledged", previewId, error: "" }));
    } catch (error) { setReviewState((current) => ({ ...current, status: "error", error: error.message, stale: Boolean(error.stale), unavailable: Boolean(error.unavailable) })); }
  }

  async function runApprove(variant) {
    const retryable = reviewState.status === "error" && reviewState.previewId;
    if ((reviewState.status !== "acknowledged" && !retryable) || reviewState.variantId !== variant.variant_id) return;
    setReviewState((current) => ({ ...current, status: "approving", error: "", stale: false }));
    try {
      const campaign = await approveCampaignVariant({ accessToken: session.accessToken, session, campaign: campaignState.campaign, variant, previewId: reviewState.previewId });
      setCampaignState({ status: "ready", campaign, error: "" });
      if (campaignVariant(campaign, variant.variant_id)?.workflow !== "approved") {
        const unconfirmed = new Error("Approval could not be confirmed yet. Reload the latest campaign to check its status.");
        unconfirmed.stale = true;
        throw unconfirmed;
      }
      setReviewState((current) => ({ ...current, status: "approved", error: "" }));
    } catch (error) { setReviewState((current) => ({ ...current, status: "error", error: error.message, stale: Boolean(error.stale), unavailable: Boolean(error.unavailable) })); }
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
    setReviewState({ status: "idle", variantId: "", receipt: null, previewId: "", error: "", stale: false });
    setManualState({ status: "idle", variantId: "", attemptId: "", url: "", error: "" });
    setCalendarState({ status: "idle", entries: [], error: "" });
    setPendingSubmit(false);
  }

  const brandSection = session.status === "ready" && (
        <section className="recommendation" aria-label="Brand Brain">
          <div className="recommendation-header"><div><p className="eyebrow">Selected brand intelligence</p><h2>Brand Brain</h2></div><span className="pill">{brandBrainState.brain?.metadata?.status || "Loading"}</span></div>
          <p>Review the approved intelligence BizGenie will use. Changes stay bound to your currently selected brand.</p>
          <button className="secondary" type="button" onClick={loadBrandBrain} disabled={brandBrainState.status === "loading"}>{brandBrainState.status === "loading" ? "Loading Brand Brain…" : brandBrainState.brain ? "Reload Brand Brain" : "Review Brand Brain"}</button>
          {brandBrainState.brain && <BrandBrainProfile brain={JSON.parse(brandBrainState.draft)} disabled={brandBrainState.status === "saving"} onChange={(next) => setBrandBrainState((current) => ({ ...current, draft: JSON.stringify(next), error: "" }))} />}
          {brandBrainState.brain && <button className="secondary" type="button" onClick={saveBrandBrain} disabled={brandBrainState.status === "saving"}>{brandBrainState.status === "saving" ? "Saving…" : "Save Brand Brain changes"}</button>}
          {brandBrainState.status === "error" && <p className="error" role="alert">{brandBrainState.error}</p>}
        </section>
  );

  const recommendationSection = state.recommendation && (
        <section className="recommendation" aria-live="polite">
          <div className="recommendation-header"><div><p className="eyebrow">Your starting point</p><h2>{state.recommendation.campaign_name}</h2></div><span className="pill">Review first</span></div>
          {state.recommendation.summary && <p><strong>Recommended approach:</strong> {state.recommendation.summary}</p>}
          <p>{state.recommendation.explanation}</p>
          <div className="item-grid">{state.recommendation.suggested_items.map((item) => <article className="item" key={item.name}><span>{item.format}</span><h3>{item.name}</h3><p>{item.reason}</p><small>{item.destination_label}</small></article>)}</div>
          <button className="secondary" type="button" onClick={runCreateCampaign} disabled={campaignState.status === "loading" || campaignState.status === "ready"}>
            {campaignState.status === "loading" ? "Creating campaign…" : campaignState.status === "ready" ? "Campaign created" : "Create campaign"}
          </button>
          {campaignState.status === "error" && <p className="error" role="alert">{campaignState.error}</p>}
        </section>
  );

  const campaignSection = campaignState.campaign && (
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
              <article className={item.variants.some((v) => v.workflow === "review") ? "item item-review" : "item"} key={item.content_item_id}>
                <span>{item.format}</span>
                <h3>{item.name}</h3>
                {item.variants.map((variant) => (
                  <div key={variant.variant_id}>
                    {!["review", "approved"].includes(variant.workflow) && <p>{creativeAsText(variant.current_content) || (variant.workflow === "draft" ? "Draft ready to generate." : variant.workflow)}</p>}
                    {variant.workflow === "approved" && <CreativePreviewCard variant={variant} />}
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
                      <textarea aria-label="Approved content" readOnly value={creativeAsText(variant.current_content)} />
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
                      <CreativeReview apiBaseUrl={API_BASE_URL} session={session} campaign={campaignState.campaign} variant={variant} reviewState={reviewState} onRender={runPreview} onAcknowledge={runAcknowledge} onApprove={runApprove} onReload={runReloadCampaign} />
                    )}
                  </div>
                ))}
              </article>
            ))}
          </div>
          {generationState.status === "error" && <p className="error" role="alert">{generationState.error}</p>}
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
  );

  const topbar = (
      <nav className="topbar">
        <span className="wordmark">BizGenie</span>
        {session.status === "ready" || (premiumEnabled && session.status === "scope-missing") ? (
          <button type="button" className="secondary" onClick={handleSignOut}>Sign out</button>
        ) : (
          <span className="status">Campaign workspace</span>
        )}
      </nav>
  );

  // ---- Premium Studio handlers (BG-STUDIO-008-FE). Used only when the flag is on. ----
  const premiumLoadBrain = useCallback(async () => {
    if (session.status !== "ready") return;
    const scopeToken = scopeTokenRef.current;
    setBrandBrainState((current) => (current.status === "loading" ? current : { ...current, status: "loading", error: "", errorCode: "" }));
    try {
      const result = await withTimeout(fetchBrandBrain({ apiBaseUrl: API_BASE_URL, accessToken: session.accessToken }), "Your Brand Brain is taking longer than expected to load.");
      if (scopeToken !== scopeTokenRef.current) return;
      setBrandBrainState({ status: "ready", brain: result.brand_brain, draft: JSON.stringify(result.brand_brain, null, 2), error: "", errorCode: "" });
    } catch (error) {
      if (scopeToken !== scopeTokenRef.current) return;
      // A workspace the customer can no longer use is not an outage: say so, and let the screen offer the chooser.
      setBrandBrainState({ status: "error", brain: null, draft: "", error: error.message, errorCode: error.code === "WORKSPACE_NOT_AUTHORIZED" ? "WORKSPACE_NOT_AUTHORIZED" : "" });
    }
  }, [session.status, session.accessToken]);

  const premiumLoadCampaigns = useCallback(async () => {
    if (session.status !== "ready") return;
    const scopeToken = scopeTokenRef.current;
    setCampaignList((current) => (current.status === "loading" ? current : { ...current, status: "loading", error: "" }));
    try {
      const campaigns = await withTimeout(getCampaignList({ accessToken: session.accessToken, session }), "Your campaigns are taking longer than expected to load.");
      if (scopeToken !== scopeTokenRef.current) return;
      setCampaignList({ status: "ready", campaigns, error: "" });
      // After a refresh, restore the newest real campaign so the workspace matches what is actually saved.
      const latest = campaigns.filter((c) => c && c.campaign_id && !c.archived_at).sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))[0];
      if (latest) {
        const detail = await withTimeout(fetchCampaign({ accessToken: session.accessToken, session, campaignId: latest.campaign_id }), "Your latest campaign is taking longer than expected to load.");
        if (scopeToken !== scopeTokenRef.current) return;
        setCampaignState((current) => (current.campaign ? current : { status: "ready", campaign: detail, error: "" }));
      }
    } catch (error) {
      if (scopeToken !== scopeTokenRef.current) return;
      setCampaignList((current) => ({ ...current, status: "error", error: error.message }));
    }
  }, [session.status, session.accessToken, session.tenantId, session.projectId]);

  const premiumLoadOnboarding = useCallback(async () => {
    if (session.status !== "ready") return;
    const scopeToken = scopeTokenRef.current;
    setOnboardingState((current) => (current.status === "loading" ? current : { ...current, status: "loading", error: "" }));
    try {
      const result = await withTimeout(fetchOnboarding({ apiBaseUrl: API_BASE_URL, accessToken: session.accessToken }), "Your saved setup is taking longer than expected to load.");
      if (scopeToken !== scopeTokenRef.current) return;
      setOnboardingState({ status: "ready", onboarding: result.onboarding, brandNamePlaceholder: result.brandNamePlaceholder, error: "" });
    } catch (error) {
      if (scopeToken !== scopeTokenRef.current) return;
      // Never keep an earlier record on screen as if it were current once a reload has failed.
      setOnboardingState({ status: error.code === "ONBOARDING_UNAVAILABLE" ? "unavailable" : "error", onboarding: null, brandNamePlaceholder: null, error: error.message, errorCode: error.code || "" });
    }
  }, [session.status, session.accessToken]);

  const premiumLoadRole = useCallback(async () => {
    if (session.status !== "ready") return;
    const scopeToken = scopeTokenRef.current;
    const result = await fetchMembershipRole({ apiBaseUrl: API_BASE_URL, accessToken: session.accessToken, scope: { tenantId: session.tenantId, projectId: session.projectId, brandId: session.brandId } });
    if (scopeToken !== scopeTokenRef.current) return;
    setRoleState({ status: "ready", role: result.role });
  }, [session.status, session.accessToken, session.tenantId, session.projectId, session.brandId]);

  useEffect(() => { if (premiumEnabled && session.status === "ready" && roleState.status === "idle") premiumLoadRole(); }, [premiumEnabled, session.status, roleState.status, premiumLoadRole]);

  // Save setup progress through PUT /customer/workspace/onboarding. Resolves { ok, message?, conflict? }; ok only
  // when the server confirmed the write. A retry of an identical request reuses its idempotency key.
  async function premiumSaveOnboarding(body) {
    if (session.status !== "ready") return { ok: false, message: "Sign in to save your setup. Nothing was saved." };
    const scopeToken = scopeTokenRef.current;
    const changed = { ok: false, message: "Your account or workspace changed while saving, so this screen was reset. Nothing is shown as saved here." };
    const key = saveKeeperRef.current.keyFor(body);
    try {
      const result = await withTimeout(putOnboarding({ apiBaseUrl: API_BASE_URL, accessToken: session.accessToken, body: { ...body, idempotency_key: key } }), SAVE_NOT_CONFIRMED_RETRY, PREMIUM_TIMEOUT_MS, { outcome: "unknown" });
      if (scopeToken !== scopeTokenRef.current) return changed;
      saveKeeperRef.current.clear();
      setOnboardingState({ status: "ready", onboarding: result.onboarding, brandNamePlaceholder: result.brandNamePlaceholder, error: "" });
      return { ok: true, replayed: result.replayed };
    } catch (error) {
      if (scopeToken !== scopeTokenRef.current) return changed;
      if (error.code === "VERSION_CONFLICT" || error.code === "IDEMPOTENCY_KEY_CONFLICT") {
        saveKeeperRef.current.clear();
        try {
          const latest = await withTimeout(fetchOnboarding({ apiBaseUrl: API_BASE_URL, accessToken: session.accessToken }), "Loading the latest saved setup is taking longer than expected.");
          if (scopeToken === scopeTokenRef.current) setOnboardingState({ status: "ready", onboarding: latest.onboarding, brandNamePlaceholder: latest.brandNamePlaceholder, error: "" });
        } catch { /* the conflict message stands; the next save re-reads */ }
        return { ok: false, conflict: error.code === "VERSION_CONFLICT", message: error.message };
      }
      // The API's 403 does not say why; re-read the role so the screen can tell a read-only member from lost access.
      if (error.forbiddenWrite) { premiumLoadRole(); return { ok: false, forbidden: true, message: error.message }; }
      // 503, a dropped connection and a timeout can all follow a commit whose acknowledgement was lost: never "not saved".
      if (error.outcome === "unknown" || error.code === "NETWORK") return { ok: false, unconfirmed: true, message: error.message };
      if (error.code === "ONBOARDING_INCOMPLETE") return { ok: false, missing: error.missing || [], message: error.message };
      return { ok: false, message: error.message };
    }
  }

  // ---- Workspace list and selection (BG-STUDIO-011-FE). Uses the identity token, so it works before a workspace is selected. ----
  const premiumLoadWorkspaces = useCallback(async () => {
    if (session.status !== "ready" && session.status !== "scope-missing") return;
    const scopeToken = scopeTokenRef.current;
    // A list already on screen stays while it refreshes; a failed refresh then replaces it (never left looking current).
    setWorkspaceState((current) => (current.status === "idle" || current.status === "error" ? { ...current, status: "loading", error: "", errorCode: "" } : current));
    try {
      const result = await withTimeout(fetchWorkspaces({ apiBaseUrl: API_BASE_URL, accessToken: session.accessToken }), "Your workspaces are taking longer than expected to load.");
      if (scopeToken !== scopeTokenRef.current) return;
      setWorkspaceState((current) => (current.status === "switching" ? current : { ...current, status: "ready", workspaces: result.workspaces, selectionRequired: result.status === "selection_required", error: "", errorCode: "", target: null }));
    } catch (error) {
      if (scopeToken !== scopeTokenRef.current) return;
      // Never keep an earlier list on screen as if it were current once a reload has failed.
      setWorkspaceState((current) => (current.status === "switching" ? current : { ...current, status: "error", workspaces: [], selectionRequired: false, error: error.message, errorCode: error.code || "", target: null }));
    }
  }, [session.status, session.accessToken]);

  // A customer who has not been placed in a workspace yet: ask the API whether they must choose one.
  useEffect(() => {
    if (premiumEnabled && session.status === "scope-missing" && workspaceState.status === "idle") premiumLoadWorkspaces();
  }, [premiumEnabled, session.status, workspaceState.status, premiumLoadWorkspaces]);

  // Choose a workspace explicitly. The previous workspace's state is cleared at once (and any in-flight response for it
  // is ignored); the new workspace's data loads only after the API confirms the choice AND the refreshed sign-in
  // carries exactly that scope. Nothing from the previous workspace is ever shown for the new one.
  async function premiumSelectWorkspace(workspace) {
    if (session.status !== "ready" && session.status !== "scope-missing") return;
    if (workspaceState.status === "switching") return;
    const previous = session;
    resetCustomerState();
    const scopeToken = scopeTokenRef.current;
    setWorkspaceState((current) => ({ ...current, status: "switching", error: "", errorCode: "", notice: "", target: workspace }));
    const backToCurrent = (message, extra = {}) => {
      // Reload whatever the session still points at; show the list again with the reason.
      setWorkspaceState((current) => ({ ...current, status: "ready", notice: message, errorCode: extra.errorCode || "", target: null, ...(extra.workspaces ? { workspaces: extra.workspaces, selectionRequired: extra.workspaces.length > 1 } : {}) }));
      setPremiumEpoch((value) => value + 1);
    };
    try {
      const chosen = await withTimeout(selectWorkspace({ apiBaseUrl: API_BASE_URL, accessToken: previous.accessToken, workspace }), "Switching workspace is taking longer than expected. It may or may not have switched: reload the page to check.");
      if (scopeToken !== scopeTokenRef.current) return;
      const refreshed = chosen.requiresSessionRefresh ? await refreshCustomerSession() : await getCustomerSession();
      if (scopeToken !== scopeTokenRef.current) return;
      if (refreshed.status === "signed-out" || refreshed.status === "unconfigured") { setSession(refreshed); setWorkspaceState({ status: "idle", workspaces: [], selectionRequired: false, error: "", errorCode: "", notice: "", target: null }); return; }
      const carries = refreshed.status === "ready" && sameWorkspace({ tenant_id: refreshed.tenantId, project_id: refreshed.projectId, brand_id: refreshed.brandId }, workspace);
      if (!carries) {
        backToCurrent("Your workspace was chosen, but your sign-in has not switched to it yet, so nothing from it is shown. Press the workspace again, or sign out and back in.");
        return;
      }
      setSession(refreshed);
      setWorkspaceState({ status: "idle", workspaces: [], selectionRequired: false, error: "", errorCode: "", notice: "", target: null });
    } catch (error) {
      if (scopeToken !== scopeTokenRef.current) return;
      if (error.unavailable) {
        let fresh;
        try { fresh = (await fetchWorkspaces({ apiBaseUrl: API_BASE_URL, accessToken: previous.accessToken })).workspaces; } catch { fresh = []; }
        backToCurrent(error.message, { errorCode: error.code, workspaces: fresh });
      } else backToCurrent(error.message, { errorCode: error.code });
    }
  }

  // Brand Brain save for the Premium Studio. Only the workspace owner may change the business name and description
  // (DEC-021 / DEC-022; bizgenie-api #214): a known non-owner's save repeats the stored values exactly and changes only the
  // other fields. A refusal, a conflict and an unconfirmed outcome are told apart and never shown as a plain failure.
  //
  // `fields` holds ONLY what the customer edited. The backend has no compare-and-set for Brand Brain writes (#214, Q6), so
  // the edits are applied to the LATEST stored Brand Brain (read just before the write), never to the copy loaded when
  // the screen opened: a stale whole-document write would silently overwrite anyone else's later edits.
  async function premiumSaveBrain(fields) {
    if (session.status !== "ready") return { ok: false, message: "Sign in to save changes." };
    if (!brandBrainState.brain) return { ok: false, message: "Your Brand Brain has not loaded, so nothing can be saved yet." };
    if (!fields || !Object.keys(fields).length) return { ok: true, noop: true };
    const scopeToken = scopeTokenRef.current;
    const token = session.accessToken;
    const gone = { ok: false, message: "Your account changed while saving. Nothing was shown as saved." };
    const memberOnly = isReadOnlyRole(roleState.role);
    // Re-read what is stored, so the screen shows the truth after a refusal or a conflict. Typed answers are not touched.
    const reread = async () => {
      try {
        const latest = await withTimeout(fetchBrandBrain({ apiBaseUrl: API_BASE_URL, accessToken: token }), "Your Brand Brain is taking longer than expected to load.");
        if (scopeToken !== scopeTokenRef.current) return null;
        setBrandBrainState({ status: "ready", brain: latest.brand_brain, draft: JSON.stringify(latest.brand_brain, null, 2), error: "", errorCode: "" });
        return latest.brand_brain;
      } catch { return null; }
    };
    // 1. The latest stored version. If it cannot be read, nothing is written.
    let stored;
    try {
      stored = (await withTimeout(fetchBrandBrain({ apiBaseUrl: API_BASE_URL, accessToken: token }), "Checking your latest saved Brand Brain is taking longer than expected. Nothing was saved.")).brand_brain;
    } catch (error) {
      if (scopeToken !== scopeTokenRef.current) return gone;
      if (error.code === "WORKSPACE_NOT_AUTHORIZED") { premiumLoadRole(); return { ok: false, workspaceUnavailable: true, message: `${error.message} Nothing was saved.` }; }
      return { ok: false, message: error.kind === "auth" ? "Your session has ended. Sign in again to continue. Nothing was saved." : "Your latest saved Brand Brain could not be checked, so nothing was saved. Your answers are still on this screen. Try again." };
    }
    if (scopeToken !== scopeTokenRef.current) return gone;
    // 2. The backend trims what it receives and then compares exactly (Q1): an untrimmed stored name or description can never be repeated by a member.
    if (memberOnly && hasUntrimmedIdentity(stored)) return { ok: false, ownerMustFix: true, message: "The saved business name or description has extra spaces at its start or end, and only the workspace owner can correct it. Until then your other changes cannot be saved. Nothing was saved." };
    // 3. Apply only the edited fields to that version and write.
    const merged = mergeBrainFields(stored, fields, { canChangeIdentity: !memberOnly });
    try {
      const result = await withTimeout(putBrandBrain({ apiBaseUrl: API_BASE_URL, accessToken: token, brandBrain: merged }), BRAIN_SAVE_UNCONFIRMED, PREMIUM_TIMEOUT_MS, { outcome: "unknown", kind: "unconfirmed" });
      if (scopeToken !== scopeTokenRef.current) return gone;
      setBrandBrainState({ status: "ready", brain: result.brand_brain, draft: JSON.stringify(result.brand_brain, null, 2), error: "", errorCode: "" });
      return { ok: true };
    } catch (error) {
      if (scopeToken !== scopeTokenRef.current) return gone;
      if (error.kind === "unconfirmed" || error.outcome === "unknown") return { ok: false, unconfirmed: true, message: error.message };
      if (error.kind === "forbidden") {
        // One 403 covers "only the owner may change the name or description" and "not a member (any more)". Ask again who
        // this customer is, and whether the owner changed the name or description after the read above.
        premiumLoadRole();
        const latest = await reread();
        return { ok: false, forbidden: true, identityChanged: latest ? identityChanged(stored, latest) : false, reloaded: Boolean(latest), message: error.message };
      }
      if (error.kind === "conflict") {
        const latest = await reread();
        return { ok: false, conflict: true, reloaded: Boolean(latest), message: error.message };
      }
      return { ok: false, message: error.message };
    }
  }

  async function premiumBootstrap({ businessName, website, challenge }) {
    if (session.status !== "scope-missing") return { ok: false, message: "Your workspace is already set up." };
    const scopeToken = scopeTokenRef.current;
    try {
      const current = await withTimeout(getCustomerWorkspace(session.accessToken), "Checking your workspace is taking longer than expected. Nothing was created.");
      if (current.status === "selection_required") {
        // Never guess: hand the customer the list and let them choose.
        setWorkspaceState({ status: "ready", notice: "", workspaces: (Array.isArray(current.workspaces) ? current.workspaces : []).map(normaliseWorkspace), selectionRequired: true, error: "", errorCode: "", target: null });
        return { ok: false, message: "You have more than one workspace. Choose which one to use." };
      }
      if (current.status !== "ready" && current.status !== "missing_workspace") return { ok: false, message: "Your workspace could not be checked yet. Nothing was created." };
      // Bootstrap is idempotent: an existing workspace is kept and only its trusted scope is provisioned.
      const created = await withTimeout(bootstrapWorkspaceWithProfile({ accessToken: session.accessToken, businessName, website, challenge }), "Creating your workspace is taking longer than expected. It may have been created: reload the page to check before trying again.");
      if (created.status !== "ready") return { ok: false, message: "Your workspace could not be created yet. Nothing was saved." };
      const refreshed = created.requires_session_refresh ? await refreshCustomerSession() : await getCustomerSession();
      if (scopeToken !== scopeTokenRef.current) return { ok: false, message: "Your account changed while setting up." };
      setSession(refreshed);
      if (refreshed.status !== "ready") return { ok: false, message: "Your workspace was created. Please sign out and sign back in to continue." };
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  }

  async function premiumRecommend(goalText) {
    if (session.status !== "ready" || state.status === "loading") return;
    setGoal(goalText);
    await runRecommendation(session, goalText);
  }

  const premiumView = premiumEnabled ? (
    <main className="shell premium">
      {topbar}
      {workspaceState.status === "switching" ? (
        <section className="ps-empty ps-switching" aria-label="Switching workspace" role="status" aria-live="polite">
          <h2>Switching to {workspaceState.target ? (workspaceState.target.brand_name || "your workspace") : "your workspace"}…</h2>
          <p>Your previous workspace has been cleared from this screen. Nothing from it is shown while your sign-in switches. Nothing is created, scheduled or published.</p>
        </section>
      ) : (
      <PremiumErrorBoundary key={premiumEpoch}>
      <PremiumStudio
        key={premiumEpoch}
        session={session}
        brainState={brandBrainState}
        onLoadBrain={premiumLoadBrain}
        onSaveBrain={premiumSaveBrain}
        onBootstrap={premiumBootstrap}
        workspaceState={workspaceState}
        onLoadWorkspaces={premiumLoadWorkspaces}
        onSelectWorkspace={premiumSelectWorkspace}
        membershipRole={roleState.role}
        readOnly={isReadOnlyRole(roleState.role)}
        onboardingState={onboardingState}
        onLoadOnboarding={premiumLoadOnboarding}
        onSaveOnboarding={premiumSaveOnboarding}
        recommendationState={state}
        onRecommend={premiumRecommend}
        campaign={campaignState.campaign}
        campaignList={campaignList}
        onLoadCampaigns={premiumLoadCampaigns}
        calendarState={calendarState}
        onLoadCalendar={runCalendar}
        sections={{
          auth: (
            <section className="recommendation ps-auth" aria-label="Account access">
              <div className="recommendation-header">
                <div><p className="eyebrow">Your workspace</p><h2>Sign in to BizGenie</h2></div>
                <span className="pill">Account</span>
              </div>
              <p>Sign in to set up your workspace and open your Brand Brain, campaigns and calendar.</p>
              <AuthPanel onAuthenticated={() => {}} />
            </section>
          ),
          recommendation: recommendationSection,
          campaign: campaignSection,
          brand: brandSection,
          account: <BillingPanel session={session} />,
        }}
      />
      </PremiumErrorBoundary>
      )}
    </main>
  ) : null;

  // Premium Studio (BG-STUDIO-008-FE) is behind a build-time flag that is off by default. With the flag off,
  // the markup below is exactly what it was before, in the same order.
  if (premiumEnabled) return premiumView;

  return (
    <main className="shell">
      {topbar}
      {(session.status === "signed-out" || session.status === "unconfigured") && (
        <section className="recommendation" aria-label="Account access">
          <div className="recommendation-header">
            <div><p className="eyebrow">Your workspace</p><h2>Sign in to BizGenie</h2></div>
            <span className="pill">Account</span>
          </div>
          <p>Sign in before you start a campaign to access your existing workspace and Brand Brain.</p>
          <AuthPanel onAuthenticated={() => {}} />
        </section>
      )}
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
      <BillingPanel session={session} />
      {brandSection}

      {recommendationSection}
      {campaignSection}
    </main>
  );
}
