import BrandBrainProfile from "./BrandBrainProfile";
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { getCustomerSession, refreshCustomerSession } from "./session";
import { onAuthStateChange, signOut } from "./authClient";
import AuthPanel from "./AuthPanel";
import Founding100Panel from "./Founding100Panel";
import BillingPanel from "./BillingPanel";
const PremiumBilling = lazy(() => import("./premium/PremiumBilling"));
import { fetchWorkspaceCalendar } from "./premium/workspaceCalendarClient";
import { fetchWorkspaceCalendarFromApi, isWorkspaceCalendarApiEnabled } from "./premium/workspaceCalendarApiClient";
import { applyDeliveryOverlay, fetchDeliveryOverlay } from "./premium/calendarOverlay";
const ScheduleControls = lazy(() => import("./premium/ScheduleControls"));
const ManualPublicationPanel = lazy(() => import("./premium/ManualPublicationPanel"));
const GenerateWithQuote = lazy(() => import("./premium/GenerateWithQuote"));
const CreativeStudio = lazy(() => import("./premium/CreativeStudio"));
import { isSocialApiEnabled } from "./premium/socialClient";
import { isMediaIntakeApiEnabled } from "./premium/mediaIntakeClient";
import { isAnalyticsApiEnabled } from "./premium/insightsClient";
import { isCustomerMediaApiEnabled } from "./premium/creativeProductionClient";
import { isCreditPreviewApiEnabled } from "./premium/creditPreviewClient";
import { requestCostCheck } from "./premium/costCheck";
import { describeGenerateRefusal } from "./premium/generationQuoteClient";
import { activeSchedule } from "./premium/scheduleModel";
import { forget, recall, remember } from "./premium/rememberedFacts";
import { addContentItem, fetchCampaignDetail, recordManualPublication, renameCampaign, setCampaignArchived, unscheduleVariant } from "./premium/campaignManagementClient";
import CreativeReview from "./CreativeReview";
import CreativePreviewCard, { creativeAsText } from "./CreativePreviewCard";
import { operationKey } from "./operationKey";
function Lazy({ children }) { return <Suspense fallback={<span className="visually-hidden" role="status">Loading…</span>}>{children}</Suspense>; }
const AddCreativeItem = lazy(() => import("./premium/AddCreativeItem"));
const PremiumConnections = lazy(() => import("./premium/PremiumConnections"));
const PremiumMedia = lazy(() => import("./premium/PremiumMedia"));
const PremiumInsights = lazy(() => import("./premium/PremiumInsights"));
const PremiumStudio = lazy(() => import("./premium/PremiumStudio"));
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
const WS_CAL_IDLE = { status: "idle", items: [], failures: [], error: "", window: null, campaignsRead: 0, campaignsChosen: 0, campaignsTotal: 0, truncated: false };

// A refusal because the session is no longer valid (401), as typed by the Premium Studio clients.
const isAuthRefusal = (error) => Boolean(error) && (error.kind === "auth" || error.code === "AUTHENTICATION_REQUIRED");

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
  if (response.status === 401) throw Object.assign(new Error("Your session has ended. Sign in again to continue."), { kind: "auth", code: "AUTHENTICATION_REQUIRED" });
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

async function generateCampaignVariant({ accessToken, session, campaign, variant, executionMode = "ai", executionBrief = "", rich = false }) {
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
  if (!response.ok) {
    if (!rich) throw new Error("Content could not be generated yet. Your draft is still safe to retry.");
    let code = ""; try { code = (await response.json())?.error?.code || ""; } catch { /* no body */ }
    if (response.status === 401) throw Object.assign(new Error("Your session has ended. Sign in again to continue. Nothing was charged."), { kind: "auth", code: "AUTHENTICATION_REQUIRED" });
    const refusal = describeGenerateRefusal(response.status, code);
    throw Object.assign(new Error(refusal ? refusal.text : "Content could not be generated yet. Your draft is still safe to retry, and your credits are only used if it succeeds."), { status: response.status, code, refusal });
  }
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

// Record (or change) the planned publication time of an approved variant. POST .../schedule or .../reschedule. Records a plan only.
async function scheduleVariant({ accessToken, session, campaign, variant, payload, mode, scheduleId: knownScheduleId = "" }) {
  if (mode === "unschedule") return { campaign: await unscheduleVariant({ apiBaseUrl: API_BASE_URL, accessToken, scope: { tenantId: session.tenantId, projectId: session.projectId }, campaign, variant, scheduleId: knownScheduleId }), scheduleId: "" };
  const revisionId = currentRevisionFor(variant);
  if (!revisionId || !["approved", "scheduled"].includes(variant.workflow)) throw new Error("Only approved content can be scheduled.");
  const response = await fetch(`${API_BASE_URL}/customer/campaigns/${campaign.campaign_id}/variants/${variant.variant_id}/${mode}`, {
    method: "POST", headers: { "content-type": "application/json", ...authorizationHeader(accessToken) },
    body: JSON.stringify({ tenant_id: session.tenantId, project_id: session.projectId, expected_campaign_version: campaign.version, revision_id: revisionId, ...payload, idempotency_key: await operationKey(campaign, variant, revisionId, `${mode}-${payload.scheduled_for}`) }),
  });
  if (response.status === 401) throw Object.assign(new Error("Your session has ended. Sign in again to continue. Nothing was scheduled."), { kind: "auth", code: "AUTHENTICATION_REQUIRED" });
  if (!response.ok) throw await reviewRequestError(response, "That time could not be saved yet. Nothing was published and your approval is still safe.");
  const result = await response.json();
  if (!result?.campaign?.campaign_id) throw new Error("The planned time could not be confirmed yet. Reload the latest campaign to check it.");
  return { campaign: result.campaign, scheduleId: result?.result?.created_ids?.schedule_ids?.[0] || "" };
}

async function beginManualPublication({ accessToken, session, campaign, variant }) {
  const revisionId = currentRevisionFor(variant);
  if (!revisionId || !["approved", "scheduled"].includes(variant.workflow)) throw new Error("Only approved content can be prepared for manual publication.");
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
  const [workspaceCalendarState, setWorkspaceCalendarState] = useState(WS_CAL_IDLE); // BG-STUDIO-018-FE
  const [scheduleState, setScheduleState] = useState({ status: "idle", variantId: "", error: "" });
  const [campaignAdmin, setCampaignAdmin] = useState({ status: "idle", id: "", kind: "", message: "", error: "" }); // BG-STUDIO-019-FE
  const [resultsState, setResultsState] = useState({ status: "idle", entries: [], variantId: "", metric: "views", value: "", unit: "count", observedAt: "", note: "", error: "" });
  const [session, setSession] = useState({ status: "loading" });
  const [pendingSubmit, setPendingSubmit] = useState(false);
  const [brandBrainState, setBrandBrainState] = useState({ status: "idle", brain: null, draft: "", error: "" });
  const premiumEnabled = isPremiumStudioEnabled();
  const [campaignList, setCampaignList] = useState({ status: "idle", campaigns: [], error: "" });
  // BG-STUDIO-017-FE: set when any Premium Studio call is refused with 401, so the shell can offer "Sign in again" instead of retry buttons that cannot work.
  const [sessionEnded, setSessionEnded] = useState(false);
  useEffect(() => { setSessionEnded(false); }, [session.accessToken]);
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
    setWorkspaceCalendarState(WS_CAL_IDLE);
    setScheduleState({ status: "idle", variantId: "", error: "" });
    setCampaignAdmin({ status: "idle", id: "", kind: "", message: "", error: "" });
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
    setWorkspaceCalendarState(WS_CAL_IDLE);
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

  // BG-STUDIO-019-FE (Premium Studio): the cost is shown first when the backend can quote it; a refusal says why and that nothing was charged.
  async function premiumQuote(variant) {
    // A binding server quote when the durable quote/confirm backend exists; otherwise the backend's read-only price preview, labelled as such.
    return requestCostCheck({ apiBaseUrl: API_BASE_URL, accessToken: session.accessToken, scope: { tenantId: session.tenantId, projectId: session.projectId, brandId: session.brandId }, campaign: campaignState.campaign, variant, executionClass: "text.standard", executionMode });
  }
  async function premiumGenerate(variant, quote) {
    if (generationState.status === "loading" || !campaignState.campaign || variant.workflow !== "draft") return { ok: false, kind: "error", text: "This draft is not ready to generate yet." };
    const scopeToken = scopeTokenRef.current;
    setGenerationState({ status: "loading", error: "" });
    try {
      const campaign = await generateCampaignVariant({ accessToken: session.accessToken, session, campaign: campaignState.campaign, variant, executionMode, executionBrief, rich: true });
      if (scopeToken !== scopeTokenRef.current) return { ok: false, kind: "error", text: "Your workspace changed. Nothing is shown as generated here." };
      setCampaignState({ status: "ready", campaign, error: "" });
      setGenerationState({ status: "ready", error: "" });
      return { ok: true };
    } catch (error) {
      if (isAuthRefusal(error)) setSessionEnded(true);
      setGenerationState({ status: "error", error: error.message });
      return { ok: false, kind: (error.refusal && error.refusal.kind) || "error", text: error.message };
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

  // ---- BG-STUDIO-019-FE, workstream E: campaign management (Premium Studio only). Every result shown is the backend's answer. ----
  const adminScope = () => ({ tenantId: session.tenantId, projectId: session.projectId });
  const resetCampaignViews = () => {
    setCalendarState({ status: "idle", entries: [], error: "" });
    setWorkspaceCalendarState(WS_CAL_IDLE);
    setReviewState({ status: "idle", variantId: "", receipt: null, previewId: "", error: "", stale: false });
    setManualState({ status: "idle", variantId: "", attemptId: "", url: "", error: "" });
    setScheduleState({ status: "idle", variantId: "", error: "" });
    setGenerationState({ status: "idle", error: "" });
  };
  const refreshList = async (current) => {
    try { const campaigns = await getCampaignList({ accessToken: session.accessToken, session }); if (current()) setCampaignList({ status: "ready", campaigns, error: "" }); } catch { /* the list keeps what it had */ }
  };
  async function adminRun(id, kind, work, doneMessage) {
    if (session.status !== "ready" || campaignAdmin.status === "working") return { ok: false };
    const scopeToken = scopeTokenRef.current; const current = () => scopeToken === scopeTokenRef.current;
    setCampaignAdmin({ status: "working", id, kind, message: "", error: "" });
    try {
      const detail = await fetchCampaignDetail({ apiBaseUrl: API_BASE_URL, accessToken: session.accessToken, scope: adminScope(), campaignId: id });
      if (!current()) return { ok: false };
      const updated = await work(detail);
      if (!current()) return { ok: false };
      setCampaignAdmin({ status: "done", id, kind, message: doneMessage(updated), error: "" });
      return { ok: true, campaign: updated };
    } catch (error) {
      if (!current()) return { ok: false };
      if (error.kind === "auth") setSessionEnded(true);
      if (error.kind === "conflict" || error.kind === "unconfirmed") {
        // Show the truth: the latest stored version replaces whatever was on screen for this campaign.
        try { const latest = await fetchCampaignDetail({ apiBaseUrl: API_BASE_URL, accessToken: session.accessToken, scope: adminScope(), campaignId: id }); if (current()) setCampaignState((c) => (c.campaign && c.campaign.campaign_id === id ? { status: "ready", campaign: latest, error: "" } : c)); } catch { /* leave it */ }
        await refreshList(current);
      }
      if (error.kind === "unavailable") await refreshList(current);
      if (current()) setCampaignAdmin({ status: "error", id, kind, message: "", error: error.message || "That could not be done yet. Nothing was changed." });
      return { ok: false };
    }
  }
  async function premiumOpenCampaign(id) {
    const result = await adminRun(id, "open", async (detail) => detail, (c) => `Opened ${c.name}.`);
    if (result.ok) { setCampaignState({ status: "ready", campaign: result.campaign, error: "" }); resetCampaignViews(); }
    return result;
  }
  // Add an image or video item, and re-read the campaign after a creative job finishes (the server, not this screen, says what the campaign now holds).
  const [addItemState, setAddItemState] = useState({ status: "idle", error: "", notice: "" });
  async function premiumAddItem(fields) {
    if (!campaignState.campaign || addItemState.status === "working") return { ok: false };
    const scopeToken = scopeTokenRef.current; setAddItemState({ status: "working", error: "", notice: "" });
    try {
      const detail = await fetchCampaignDetail({ apiBaseUrl: API_BASE_URL, accessToken: session.accessToken, scope: adminScope(), campaignId: campaignState.campaign.campaign_id });
      const updated = await addContentItem({ apiBaseUrl: API_BASE_URL, accessToken: session.accessToken, scope: adminScope(), campaign: detail, name: fields.name, format: fields.format, platform: fields.platform, placement: fields.placement, destinationLabel: fields.destinationLabel });
      if (scopeToken !== scopeTokenRef.current) return { ok: false };
      setCampaignState({ status: "ready", campaign: updated, error: "" }); setCalendarState({ status: "idle", entries: [], error: "" }); setWorkspaceCalendarState(WS_CAL_IDLE);
      setAddItemState({ status: "done", error: "", notice: `Added ${fields.name.trim()}. Get a price below when you are ready.` }); return { ok: true };
    } catch (error) {
      if (scopeToken !== scopeTokenRef.current) return { ok: false };
      if (error.kind === "auth") setSessionEnded(true);
      setAddItemState({ status: "error", error: error.message || "That could not be added yet. Nothing was changed.", notice: "" }); return { ok: false };
    }
  }
  async function premiumReloadCampaign() {
    if (!campaignState.campaign) return; const scopeToken = scopeTokenRef.current;
    try { const latest = await fetchCampaignDetail({ apiBaseUrl: API_BASE_URL, accessToken: session.accessToken, scope: adminScope(), campaignId: campaignState.campaign.campaign_id }); if (scopeToken === scopeTokenRef.current) setCampaignState({ status: "ready", campaign: latest, error: "" }); }
    catch (error) { if (error.kind === "auth") setSessionEnded(true); }
  }
  async function premiumRenameCampaign(id, name) {
    const result = await adminRun(id, "rename", (detail) => renameCampaign({ apiBaseUrl: API_BASE_URL, accessToken: session.accessToken, scope: adminScope(), campaign: detail, name }), (c) => `Renamed to ${c.name}.`);
    if (result.ok) {
      const scopeToken = scopeTokenRef.current;
      setCampaignList((cur) => ({ ...cur, campaigns: cur.campaigns.map((c) => (c.campaign_id === id ? { ...c, name: result.campaign.name, updated_at: result.campaign.updated_at || c.updated_at } : c)) }));
      setCampaignState((cur) => (cur.campaign && cur.campaign.campaign_id === id ? { status: "ready", campaign: result.campaign, error: "" } : cur));
      setCalendarState({ status: "idle", entries: [], error: "" }); setWorkspaceCalendarState(WS_CAL_IDLE);
      await refreshList(() => scopeToken === scopeTokenRef.current);
    }
    return result;
  }
  async function premiumSetArchived(id, archive, reason) {
    const result = await adminRun(id, archive ? "archive" : "restore", (detail) => setCampaignArchived({ apiBaseUrl: API_BASE_URL, accessToken: session.accessToken, scope: adminScope(), campaign: detail, archive, reason }), (c) => (archive ? `Archived ${c.name}. It is hidden from your campaigns and calendar, not deleted.` : `Restored ${c.name}.`));
    if (result.ok) {
      const scopeToken = scopeTokenRef.current;
      if (archive) setCampaignState((cur) => (cur.campaign && cur.campaign.campaign_id === id ? { status: "idle", campaign: null, error: "" } : cur));
      resetCampaignViews();
      await refreshList(() => scopeToken === scopeTokenRef.current);
    }
    return result;
  }
  // Record how a manual publication went. The saved campaign is the source of truth: the response replaces it.
  async function premiumRecordPublication(variant, outcome, fields) {
    if (!campaignState.campaign || manualState.status === "recording") return;
    const scopeToken = scopeTokenRef.current;
    setManualState({ status: "recording", variantId: variant.variant_id, attemptId: fields.attemptId, url: "", error: "", notice: "" });
    try {
      const campaign = await recordManualPublication({ apiBaseUrl: API_BASE_URL, accessToken: session.accessToken, scope: adminScope(), campaign: campaignState.campaign, variant, outcome, attemptId: fields.attemptId, publishedAt: fields.publishedAt, publicationUrl: fields.url, externalReference: fields.reference, note: fields.note, reason: fields.reason });
      if (scopeToken !== scopeTokenRef.current) return;
      setCampaignState({ status: "ready", campaign, error: "" });
      forget({ tenantId: session.tenantId, projectId: session.projectId }, "attempt", campaign.campaign_id, variant.variant_id); forget({ tenantId: session.tenantId, projectId: session.projectId }, "schedule", campaign.campaign_id, variant.variant_id);
      setCalendarState({ status: "idle", entries: [], error: "" }); setWorkspaceCalendarState(WS_CAL_IDLE);
      const notice = outcome === "confirm" ? "Recorded as published, as your own statement. BizGenie has not checked the platform." : outcome === "fail" ? "Recorded as not published. Your approval is kept; you can prepare the handoff again." : "Handoff closed. Nothing was published and your approval is kept.";
      setManualState({ status: "done", variantId: variant.variant_id, attemptId: "", url: "", error: "", notice });
    } catch (error) {
      if (scopeToken !== scopeTokenRef.current) return;
      if (error.kind === "auth") setSessionEnded(true);
      if (error.kind === "conflict" || error.kind === "unconfirmed") {
        try { const latest = await fetchCampaignDetail({ apiBaseUrl: API_BASE_URL, accessToken: session.accessToken, scope: adminScope(), campaignId: campaignState.campaign.campaign_id }); if (scopeToken === scopeTokenRef.current) setCampaignState({ status: "ready", campaign: latest, error: "" }); } catch { /* leave it */ }
      }
      setManualState({ status: "error", variantId: variant.variant_id, attemptId: fields.attemptId, url: "", error: error.message || "That could not be recorded yet. Nothing was changed.", notice: "" });
    }
  }

  // The planned time of a scheduled variant: the server's own record when the detail carries it, else what this browser was told when it was set,
  // else what the workspace calendar API reports. Null when none is known (the page then says the time cannot be shown here).
  function scheduleFor(variant) {
    const campaign = campaignState.campaign; if (!campaign || variant.workflow !== "scheduled") return null;
    const own = activeSchedule(campaign, variant); if (own) return own;
    const mem = recall({ tenantId: session.tenantId, projectId: session.projectId }, "schedule", campaign.campaign_id, variant.variant_id); if (mem && mem.schedule_id) return mem;
    const row = (workspaceCalendarState.items || []).find((i) => i.variantId === variant.variant_id && i.scheduleId && i.occurrenceAt);
    return row ? { schedule_id: row.scheduleId, scheduled_for: row.occurrenceAt, timezone: campaign.display_timezone || "UTC" } : null;
  }
  const pendingAttemptFor = (variant) => {
    const campaign = campaignState.campaign; if (!campaign) return "";
    if (variant.manual_publication && variant.manual_publication.attempt_id) return variant.manual_publication.attempt_id; // #218: the server says a handoff is waiting
    if (variant.pending_attempt_id) return variant.pending_attempt_id;
    if (manualState.variantId === variant.variant_id && ["prepared", "recording", "error"].includes(manualState.status) && manualState.attemptId) return manualState.attemptId;
    const mem = recall({ tenantId: session.tenantId, projectId: session.projectId }, "attempt", campaign.campaign_id, variant.variant_id); return mem && mem.attempt_id ? mem.attempt_id : "";
  };

  // BG-STUDIO-018-FE (Premium Studio only): record or change the planned publication time. Nothing is published.
  async function runSchedule(variant, payload, mode) {
    if (!campaignState.campaign || scheduleState.status === "saving") return;
    const scopeToken = scopeTokenRef.current;
    setScheduleState({ status: "saving", variantId: variant.variant_id, error: "" });
    try {
      const known = scheduleFor(variant);
      const { campaign, scheduleId } = await scheduleVariant({ accessToken: session.accessToken, session, campaign: campaignState.campaign, variant, payload, mode, scheduleId: known ? known.schedule_id : "" });
      if (scopeToken !== scopeTokenRef.current) return;
      // The real campaign detail does not repeat the schedule id or time, so the browser keeps what the command returned (see rememberedFacts.js).
      const fscope = { tenantId: session.tenantId, projectId: session.projectId };
      if (mode === "unschedule") forget(fscope, "schedule", campaign.campaign_id, variant.variant_id);
      else if (scheduleId) remember(fscope, "schedule", campaign.campaign_id, variant.variant_id, { schedule_id: scheduleId, scheduled_for: payload.scheduled_for, timezone: payload.timezone });
      setCampaignState({ status: "ready", campaign, error: "" });
      setCalendarState({ status: "idle", entries: [], error: "" });
      setWorkspaceCalendarState(WS_CAL_IDLE);
      if (mode === "unschedule" ? campaignVariant(campaign, variant.variant_id)?.workflow === "scheduled" : campaignVariant(campaign, variant.variant_id)?.workflow !== "scheduled") throw new Error(mode === "unschedule" ? "The planned time could not be confirmed as removed. Reload the latest campaign to check it." : "The planned time could not be confirmed yet. Reload the latest campaign to check it.");
      setScheduleState({ status: mode === "unschedule" ? "removed" : "saved", variantId: variant.variant_id, error: "" });
    } catch (error) {
      if (scopeToken !== scopeTokenRef.current) return;
      if (isAuthRefusal(error)) setSessionEnded(true);
      setScheduleState({ status: "error", variantId: variant.variant_id, error: error.message });
    }
  }

  async function runManualStart(variant) {
    if (!campaignState.campaign || manualState.status === "starting") return;
    setManualState({ status: "starting", variantId: variant.variant_id, attemptId: "", url: "", error: "" });
    try {
      const result = await beginManualPublication({ accessToken: session.accessToken, session, campaign: campaignState.campaign, variant });
      setCampaignState({ status: "ready", campaign: result.campaign, error: "" });
      setManualState({ status: "prepared", variantId: variant.variant_id, attemptId: result.attemptId, url: "", error: "" });
      remember({ tenantId: session.tenantId, projectId: session.projectId }, "attempt", result.campaign.campaign_id, variant.variant_id, { attempt_id: result.attemptId });
    } catch (error) { setManualState((current) => ({ ...current, status: "error", variantId: variant.variant_id, error: error.message })); }
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
      setCalendarState({ status: "ready", entries, error: "", window: { from: from.toISOString(), to: to.toISOString() } });
    } catch (error) {
      setCalendarState({ status: "error", entries: [], error: error.message });
    }
  }

  // BG-STUDIO-018-FE: the workspace-wide calendar, assembled from existing read endpoints (no workspace endpoint exists yet).
  async function runWorkspaceCalendar(win, opts = {}) {
    if (session.status !== "ready") return;
    const more = Boolean(opts.more) && workspaceCalendarState.status === "ready" && workspaceCalendarState.nextOffset != null;
    if (workspaceCalendarState.status === "loading" || (more && workspaceCalendarState.loadingMore)) return;
    const scopeToken = scopeTokenRef.current;
    const current = () => scopeToken === scopeTokenRef.current;
    const prev = more ? workspaceCalendarState : null;
    const window = more ? prev.window : win;
    setWorkspaceCalendarState(more ? { ...prev, loadingMore: true } : { ...WS_CAL_IDLE, status: "loading", window });
    try {
      const scope = { tenantId: session.tenantId, projectId: session.projectId };
      let result;
      if (isWorkspaceCalendarApiEnabled()) {
        result = await fetchWorkspaceCalendarFromApi({ apiBaseUrl: API_BASE_URL, accessToken: session.accessToken, scope, from: window.from, to: window.to, isCurrent: current });
        if (current() && isSocialApiEnabled() && session.brandId) { // delivery status for items still scheduled; a failure here never hides the calendar
          try {
            const o = await fetchDeliveryOverlay({ apiBaseUrl: API_BASE_URL, accessToken: session.accessToken, scope: { ...scope, brandId: session.brandId }, from: window.from, to: window.to });
            result = { ...result, ...(() => { const r = applyDeliveryOverlay(result.items, o.entries); return { items: r.items, overlay: { ok: true, dropped: r.dropped + o.skipped } }; })() };
          } catch { result = { ...result, overlay: { ok: false, dropped: 0 } }; }
        }
      } else {
        const campaigns = await getCampaignList({ accessToken: session.accessToken, session });
        if (!current()) return;
        result = await fetchWorkspaceCalendar({ apiBaseUrl: API_BASE_URL, accessToken: session.accessToken, scope, from: window.from, to: window.to, campaigns, offset: more ? prev.nextOffset : 0, isCurrent: current });
      }
      if (!current()) return;
      const merged = more ? { ...result, items: [...prev.items, ...result.items], failures: [...prev.failures, ...result.failures], campaignsRead: prev.campaignsRead + result.campaignsRead, campaignsChosen: prev.campaignsChosen + result.campaignsChosen } : result;
      setWorkspaceCalendarState({ ...WS_CAL_IDLE, status: "ready", window, ...merged, loadingMore: false });
    } catch (error) {
      if (!current()) return;
      if (isAuthRefusal(error)) setSessionEnded(true);
      const message = isAuthRefusal(error) ? "Your session has ended. Sign in again to continue." : (error && error.kind && error.kind !== "network" && error.message) || "The calendar could not be loaded yet.";
      setWorkspaceCalendarState(more ? { ...prev, loadingMore: false, moreError: message } : { ...WS_CAL_IDLE, status: "error", window, error: message });
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
      setWorkspaceCalendarState(WS_CAL_IDLE);
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
    setWorkspaceCalendarState(WS_CAL_IDLE);
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
              <option value="hybrid" disabled>{premiumEnabled ? "Hybrid — your own media with AI is not available yet" : "Hybrid — use your media + AI (add-media picker coming next)"}</option>
            </select>
            <label htmlFor="execution-brief">Execution brief (optional)</label>
            <textarea id="execution-brief" maxLength={4000} value={executionBrief} onChange={(event) => setExecutionBrief(event.target.value)} placeholder="Temporary direction for this execution, e.g. focus on the founder story and keep the opening conversational." />
            <small>This brief applies only to this generation. It does not change your approved Brand Brain.</small>
          </div>
          {premiumEnabled && !isReadOnlyRole(roleState.role) && <Lazy><AddCreativeItem busy={addItemState.status === "working"} error={addItemState.error} notice={addItemState.notice} onAdd={premiumAddItem} /></Lazy>}
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
                    {variant.workflow === "draft" && (premiumEnabled ? (
                      item.format === "text" ? (
                        <Lazy><GenerateWithQuote key={`${variant.variant_id}:${campaignState.campaign.version}`} quotesEnabled={isCreditPreviewApiEnabled()} disabled={generationState.status === "loading"} onQuote={() => premiumQuote(variant)} onGenerate={(q) => premiumGenerate(variant, q)} /></Lazy>
                      ) : (
                        <Lazy><CreativeStudio key={`creative:${variant.variant_id}:${session.tenantId}`} enabled={isCustomerMediaApiEnabled()} session={session} scope={{ tenantId: session.tenantId, projectId: session.projectId, brandId: session.brandId }} campaign={campaignState.campaign} variant={variant} format={item.format} readOnly={isReadOnlyRole(roleState.role)} canAttach={roleState.role === "owner"} onSessionEnded={() => setSessionEnded(true)} onFinished={premiumReloadCampaign} /></Lazy>
                      )
                    ) : (
                      <button className="secondary" type="button" onClick={() => runGenerateVariant(variant)} disabled={generationState.status === "loading"}>
                        {generationState.status === "loading" ? "Generating…" : "Generate draft"}
                      </button>
                    ))}
                    {variant.workflow === "approved" && <p><strong>Approved</strong></p>}
                    {premiumEnabled && ["approved", "scheduled"].includes(variant.workflow) && <Lazy><ScheduleControls campaign={campaignState.campaign} variant={variant} schedule={scheduleFor(variant)} state={scheduleState} onSchedule={runSchedule} /></Lazy>}
                    {premiumEnabled && ["approved", "scheduled", "published"].includes(variant.workflow) && <Lazy><ManualPublicationPanel campaign={campaignState.campaign} variant={variant} pendingAttemptId={pendingAttemptFor(variant)} state={manualState} contentText={creativeAsText(variant.current_content)} onStart={runManualStart} onRecord={premiumRecordPublication} /></Lazy>}
                    {!premiumEnabled && variant.workflow === "approved" && <div>
                      <p>Manual publication required. BizGenie will not claim this was published until you confirm it.</p>
                      <button className="secondary" type="button" onClick={() => runManualStart(variant)} disabled={manualState.status === "starting"}>{manualState.status === "starting" ? "Preparing handoff…" : "Prepare manual publication"}</button>
                    </div>}
                    {!premiumEnabled && manualState.variantId === variant.variant_id && ["prepared", "confirming"].includes(manualState.status) && <div>
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
          {!premiumEnabled && generationState.status === "error" && <p className="error" role="alert">{generationState.error}</p>}
          {!premiumEnabled && manualState.status === "error" && <p className="error" role="alert">{manualState.error}</p>}
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
      setSessionEnded(false);
    } catch (error) {
      if (scopeToken !== scopeTokenRef.current) return;
      if (isAuthRefusal(error)) setSessionEnded(true);
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
      if (isAuthRefusal(error)) setSessionEnded(true);
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
      setSessionEnded(false);
    } catch (error) {
      if (scopeToken !== scopeTokenRef.current) return;
      if (isAuthRefusal(error)) setSessionEnded(true);
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
      if (isAuthRefusal(error)) setSessionEnded(true);
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
      if (isAuthRefusal(error)) setSessionEnded(true);
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
      if (isAuthRefusal(error)) setSessionEnded(true);
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
      if (isAuthRefusal(error)) setSessionEnded(true);
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
      <PremiumErrorBoundary key={premiumEpoch}><Lazy>
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
        sessionEnded={sessionEnded}
        onSignOut={handleSignOut}
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
        workspaceCalendarState={workspaceCalendarState}
        onLoadWorkspaceCalendar={runWorkspaceCalendar}
        campaignAdmin={campaignAdmin}
        onAdminOpen={premiumOpenCampaign}
        onAdminRename={premiumRenameCampaign}
        onAdminSetArchived={premiumSetArchived}
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
          media: <Lazy><PremiumMedia enabled={isMediaIntakeApiEnabled()} session={session} scope={{ tenantId: session.tenantId, projectId: session.projectId, brandId: session.brandId }} isOwner={roleState.role === "owner"} onSessionEnded={() => setSessionEnded(true)} /></Lazy>,
          connections: <Lazy><PremiumConnections enabled={isSocialApiEnabled()} session={session} scope={{ tenantId: session.tenantId, projectId: session.projectId, brandId: session.brandId }} isOwner={roleState.role === "owner"} onSessionEnded={() => setSessionEnded(true)} /></Lazy>,
          insights: <Lazy><PremiumInsights enabled={isAnalyticsApiEnabled()} session={session} scope={{ tenantId: session.tenantId, projectId: session.projectId, brandId: session.brandId }} campaignId={campaignState.campaign ? campaignState.campaign.campaign_id : ""} campaignName={campaignState.campaign ? campaignState.campaign.name : ""} isOwner={roleState.role === "owner"} onSessionEnded={() => setSessionEnded(true)} /></Lazy>,
          account: <Lazy><PremiumBilling session={session} isOwner={roleState.role === "owner"} /></Lazy>,
        }}
      />
      </Lazy></PremiumErrorBoundary>
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
