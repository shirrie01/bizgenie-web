// Performance evidence and the Learning Brain (BG-STUDIO-027-FE, F5): the REAL routes of bizgenie-api #220 (application e653ed346c41887261ff6861342e3861995edcc0;
// docs/studio/BG_STUDIO_025_BACKEND_HANDOFF.md F5; unchanged route set since #218). Off unless `VITE_ANALYTICS_API=true`; the backend answers 503 LEARNING_UNAVAILABLE
// until an operator composes the service. There is NO public ingestion route and NO route that reads the latest snapshot, so:
//   POST /customer/insights/snapshots        { scope }                        -> { snapshot_id, contract_version:"performance-snapshot.v1", state, reason, observations } (OWNER; stores a snapshot)
//   POST /customer/insights/recommendations  { scope, snapshot_id, previous_id, current_id } -> evidence-recommendation.v1 + recommendation_id            (OWNER)
//   GET  /customer/insights/recommendations?scope[&limit&cursor]  -> { recommendations:[ rec + evidence_state:current|unavailable + decision + feedback_version ], next_cursor|null } (members too)
//   POST /customer/insights/feedback         { scope, recommendation_id, decision: accepted|rejected, expected_version, idempotency_key } -> { decision, version, replay? } (OWNER)
//   POST /customer/insights/objectives       { scope, campaign_id, objective, metric, expected_version, idempotency_key } -> { version }                    (OWNER)
// Observation rows are canonical (`performance-observation.v1`) for new snapshots; older persisted snapshots may lack the row version and are accepted as history
// (src/intel/performanceEvidence.js). Evidence is a point-in-time read: current NOW does not mean current at a later write, so every write can still answer 409.
// Recommendations are observed changes only (causal_claim false). Nothing here invents analytics or calls a platform.
export const isAnalyticsApiEnabled = (env = import.meta.env) => {
  const raw = env && env.VITE_ANALYTICS_API;
  return typeof raw === "string" && raw.trim().toLowerCase() === "true";
};
export class InsightsError extends Error {
  constructor(message, { kind = "error", status = 0, code = "" } = {}) { super(message); this.name = "InsightsError"; this.kind = kind; this.status = status; this.code = code; }
}
const CODES = {
  LEARNING_UNAVAILABLE: ["unavailable", "Results and suggestions are not switched on for this workspace yet."],
  EVIDENCE_UNAVAILABLE: ["evidence", "The platform results behind this are no longer current, so nothing was recorded. Refresh the results and look again."],
  VERSION_CONFLICT: ["conflict", "A decision on this was already recorded or changed. Reload to see the latest."],
  IDEMPOTENCY_KEY_CONFLICT: ["key_conflict", "That request was already sent with different details. Reload and try again."],
  VALIDATION_ERROR: ["invalid", "Some of the details were not accepted. Nothing was recorded."],
  RESOURCE_NOT_AVAILABLE: ["forbidden", "Only the workspace owner can do that, or it is no longer available."],
};
const scopeBody = (s) => ({ tenant_id: s.tenantId, project_id: s.projectId, brand_id: s.brandId });
async function call(fetchImpl, url, options, what, write) {
  let res; try { res = await fetchImpl(url, options); } catch { throw new InsightsError(write ? `${what} may or may not have been received because the connection failed. Reload before trying again.` : `${what} could not be loaded because the connection failed.`, { kind: write ? "unconfirmed" : "network" }); }
  if (res.ok) { try { return await res.json(); } catch { throw new InsightsError("The server's answer was not in the expected form, so nothing is shown from it.", { kind: "invalid", code: "BAD_RESPONSE" }); } }
  let code = ""; try { const j = await res.json(); code = j && j.error && typeof j.error.code === "string" ? j.error.code : ""; } catch { /* none */ }
  if (res.status === 401) throw new InsightsError("Your session has ended. Sign in again to continue.", { kind: "auth", status: 401, code });
  if (CODES[code]) throw new InsightsError(CODES[code][1], { kind: CODES[code][0], status: res.status, code });
  if (res.status === 404) throw new InsightsError("Only the workspace owner can do that, or it is no longer available.", { kind: "forbidden", status: 404, code });
  if (res.status === 503) throw new InsightsError(write ? "The service could not complete that, and it may not have been recorded. Reload before trying again." : "Results are temporarily unavailable. Try again shortly.", { kind: write ? "unconfirmed" : "unavailable", status: 503, code });
  if (res.status >= 500 && write) throw new InsightsError("The service had a problem and it may not have been recorded. Reload before trying again.", { kind: "unconfirmed", status: res.status, code });
  throw new InsightsError(`${what} could not be done yet.`, { kind: "error", status: res.status, code });
}
const hj = (t) => ({ "content-type": "application/json", authorization: `Bearer ${t}` });

// The api object PremiumInsights consumes. Snapshots are created ONLY when the owner asks (a snapshot is stored); recommendations are read for every member.
export function makeInsightsApi({ apiBaseUrl, fetchImpl = (...a) => fetch(...a) }) {
  const url = (p, q) => `${apiBaseUrl}/customer/insights${p}${q ? `?${q}` : ""}`;
  return {
    refreshSnapshot: ({ accessToken, scope }) => call(fetchImpl, url("/snapshots"), { method: "POST", headers: hj(accessToken), body: JSON.stringify(scopeBody(scope)) }, "Refreshing the results", true),
    createRecommendation: ({ accessToken, scope, snapshotId, previousId, currentId }) => call(fetchImpl, url("/recommendations"), { method: "POST", headers: hj(accessToken), body: JSON.stringify({ ...scopeBody(scope), snapshot_id: snapshotId, previous_id: previousId, current_id: currentId }) }, "Looking for a change", true),
    async fetchRecommendations({ accessToken, scope, maxPages = 10 }) {
      const out = []; let cursor = null; let pages = 0;
      do {
        const q = new URLSearchParams({ ...scopeBody(scope), limit: "50", ...(cursor ? { cursor } : {}) });
        const b = await call(fetchImpl, url("/recommendations", q.toString()), { headers: { authorization: `Bearer ${accessToken}` } }, "The suggestions", false);
        if (!b || !Array.isArray(b.recommendations)) throw new InsightsError("The server's answer was not in the expected form, so nothing is shown from it.", { kind: "invalid", code: "BAD_RESPONSE" });
        out.push(...b.recommendations); cursor = typeof b.next_cursor === "string" && b.next_cursor ? b.next_cursor : null; pages += 1;
      } while (cursor && pages < maxPages);
      if (cursor) throw new InsightsError("There are more suggestions than can be loaded at once.", { kind: "error" });
      return out;
    },
    sendFeedback: ({ accessToken, scope, body }) => call(fetchImpl, url("/feedback"), { method: "POST", headers: hj(accessToken), body: JSON.stringify({ ...scopeBody(scope), ...body }) }, "Saving your decision", true),
    configureObjective: ({ accessToken, scope, body }) => call(fetchImpl, url("/objectives"), { method: "POST", headers: hj(accessToken), body: JSON.stringify({ ...scopeBody(scope), ...body }) }, "Saving the goal", true),
  };
}
