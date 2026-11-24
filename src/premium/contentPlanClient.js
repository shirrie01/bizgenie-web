// Launch-week content plan client (BG-FOUNDER-E2E-FINAL-01). Reads the API's deterministic plan
//   GET /customer/campaigns/:id/content-plan?tenant_id&project_id&start_date  ->  { plan: content-plan.v1 }
// and adds its items through the EXISTING content-item route. Nothing is generated, priced or charged here: every image or video still needs its own
// quote and explicit confirmation. Stable per-item idempotency keys make a retry (or a second click) add each item at most once.
import { addContentItem, CampaignApiError, errorFor, fetchCampaignDetail } from "./campaignManagementClient";
import { featureEnabled } from "./featureGate";

export const isContentPlanApiEnabled = (env = import.meta.env) => featureEnabled("contentPlan", env);
export const PLAN_CONTRACT = "content-plan.v1";
const scopeQuery = (scope) => new URLSearchParams({ tenant_id: scope.tenantId, project_id: scope.projectId });

// A real calendar date: it must round-trip through a UTC date (2026-02-30 is refused, never rolled into March).
export function isRealDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number); const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// Fail closed: anything that is not exactly the contract is not shown or added. Week identity is part of the contract: the plan names its week,
// every saved name starts with that week and every idempotency key embeds pack, week, campaign and item number, so one week can never be mistaken
// for another and a retry of the same week repeats exactly.
export function validatePlan(plan, campaignId) {
  const bad = () => new CampaignApiError("The launch-week plan could not be checked. Nothing was added.", { kind: "invalid", code: "BAD_PLAN" });
  if (!plan || plan.contract_version !== PLAN_CONTRACT || plan.campaign_id !== campaignId || !Array.isArray(plan.items) || plan.items.length < 1 || plan.items.length > 20) throw bad();
  if (typeof plan.pack !== "string" || !/^[A-Za-z0-9._-]{1,40}$/.test(plan.pack) || !isRealDate(plan.start_date) || plan.plan_id !== `${plan.pack}:${plan.start_date}`) throw bad();
  const keys = new Set(), names = new Set();
  for (const item of plan.items) {
    const c = item && item.content_item;
    if (!c || !["text", "image", "video"].includes(c.format) || typeof c.name !== "string" || !c.name || typeof c.platform !== "string" || typeof c.placement !== "string" || typeof c.destination_label !== "string") throw bad();
    if (!item.initial_content || typeof item.initial_content.body !== "string" || !Array.isArray(item.initial_content.asset_refs) || item.initial_content.asset_refs.length) throw bad();
    if (!Number.isInteger(item.plan_item) || item.plan_item < 1) throw bad();
    if (item.idempotency_key !== `plan:${plan.pack}:${plan.start_date}:${campaignId}:${item.plan_item}` || item.idempotency_key.length > 128 || !c.name.startsWith(`Week of ${plan.start_date} · `)) throw bad();
    if (keys.has(item.idempotency_key) || names.has(c.name)) throw bad();
    keys.add(item.idempotency_key); names.add(c.name);
  }
  return plan;
}

export async function fetchContentPlan({ apiBaseUrl, accessToken, scope, campaignId, startDate, fetchImpl = (...a) => fetch(...a) }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startDate))) throw new CampaignApiError("Choose a start date.", { kind: "invalid", code: "VALIDATION_ERROR" });
  const q = scopeQuery(scope); q.set("start_date", startDate);
  let response;
  try { response = await fetchImpl(`${apiBaseUrl}/customer/campaigns/${campaignId}/content-plan?${q}`, { headers: { authorization: `Bearer ${accessToken}` } }); }
  catch { throw new CampaignApiError("The launch-week plan could not be reached. Nothing was changed.", { kind: "network", code: "NETWORK" }); }
  if (!response.ok) throw await errorFor(response, "The launch-week plan");
  let json = null; try { json = await response.json(); } catch { json = null; }
  return validatePlan(json && json.plan, campaignId);
}

// Credits the plan would need, by execution class (counts only; the server owns prices and each quote shows the exact cost before you confirm).
export const creditNeeds = (plan) => Object.fromEntries(Object.entries((plan && plan.credit_requirements && plan.credit_requirements.by_execution_class) || {}).filter(([, n]) => Number.isInteger(n) && n > 0));

// Adds the plan's items one at a time (each add changes the campaign version). Items already present are skipped, so a retry after a partial failure
// continues where it stopped and never duplicates; completed work is never undone. Resolves { campaign, added, skipped, failed }.
export async function addPlanItems({ apiBaseUrl, accessToken, scope, campaign, plan, onProgress = () => {}, fetchImpl = (...a) => fetch(...a) }) {
  validatePlan(plan, campaign.campaign_id);
  let current = campaign, added = 0, skipped = 0;
  for (const item of plan.items) {
    const have = new Set((current.items || []).map((i) => i.name));
    if (have.has(item.content_item.name)) { skipped += 1; onProgress({ done: added + skipped, total: plan.items.length, name: item.content_item.name, skipped: true }); continue; }
    try {
      current = await addContentItem({ apiBaseUrl, accessToken, scope, campaign: current, ...camel(item.content_item), initialContent: item.initial_content, idempotencyKey: item.idempotency_key, fetchImpl });
      added += 1; onProgress({ done: added + skipped, total: plan.items.length, name: item.content_item.name, skipped: false });
    } catch (error) {
      // An unconfirmed network failure may have saved the item: re-read before reporting, so the screen never claims what the server did not say.
      if (error && error.kind === "unconfirmed") { try { current = await fetchCampaignDetail({ apiBaseUrl, accessToken, scope, campaignId: campaign.campaign_id, fetchImpl }); } catch { /* keep last known */ } }
      return { campaign: current, added, skipped, failed: { name: item.content_item.name, message: error && error.message ? error.message : "That item could not be added yet." } };
    }
  }
  return { campaign: current, added, skipped, failed: null };
}
const camel = (c) => ({ name: c.name, format: c.format, platform: c.platform, placement: c.placement, destinationLabel: c.destination_label });
