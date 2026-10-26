// Campaign results and the Learning Brain (BG-STUDIO-020-FE). THE BACKEND HAS NEITHER: the only results it stores are customer attestations
// (`evidence_kind: customer_attestation` via POST /customer/campaigns/:id/measurements); there is no platform ingestion, no estimator and no learning
// store (docs/studio/BG_STUDIO_019_BACKEND_HANDOFF.md, "Learning/analytics"). This is a validated adapter for a PROPOSED contract, exercised only with
// fixtures, off unless `VITE_ANALYTICS_API=true`. Its one hard rule: every number and every suggestion carries WHERE IT CAME FROM, and the app never
// shows a figure as measured unless the server says `platform_measured`, nor a suggestion as learned unless it carries evidence.
//   GET  /customer/campaigns/:id/results?tenant_id&project_id[&from&to]
//        -> { contract_version: "campaign-results.v1", metrics: [ { metric, value, unit, observed_at, source: customer_entered|platform_measured|estimated,
//             method|null, fresh_as_of } ] }
//   GET  /customer/learning/insights?tenant_id&project_id&brand_id
//        -> { contract_version: "learning-insights.v1", insights: [ { insight_id, statement, confidence: low|medium|high, status: proposed|accepted|rejected,
//             generated_by: "ai", created_at, evidence: [ { source, metric, period_from, period_to, sample_size } ] } ] }
//   POST /customer/learning/insights/:id/decision { tenant_id, decision: accept|reject, request_id } -> 200 { insight_id, status }
export const isAnalyticsApiEnabled = (env = import.meta.env) => {
  const raw = env && env.VITE_ANALYTICS_API;
  return typeof raw === "string" && raw.trim().toLowerCase() === "true";
};
export class InsightsError extends Error {
  constructor(message, { kind = "error", status = 0, code = "" } = {}) { super(message); this.name = "InsightsError"; this.kind = kind; this.status = status; this.code = code; }
}
export const SOURCE_LABEL = { customer_entered: "Entered by you", platform_measured: "Measured by the platform", estimated: "Estimate", ai_recommendation: "AI suggestion" };
export const SOURCE_EXPLAIN = { customer_entered: "You typed this in. BizGenie has not checked it.", platform_measured: "Read from the platform's own reporting.", estimated: "Calculated by BizGenie from other numbers. It is not a measurement.", ai_recommendation: "A suggestion written by AI from the evidence listed with it. It is not a fact." };
const METRICS = ["reach", "views", "impressions", "clicks", "enquiries", "leads", "conversions", "sales", "revenue", "value"];
const SOURCES = ["customer_entered", "platform_measured", "estimated"]; const CONFIDENCE = ["low", "medium", "high"]; const STATUS = ["proposed", "accepted", "rejected"];
const str = (v) => typeof v === "string" && v.trim().length > 0; const date = (v) => Number.isFinite(Date.parse(v));
const bad = () => new InsightsError("The server's answer was not in the expected form, so nothing is shown from it.", { kind: "invalid", code: "BAD_RESPONSE" });
export const newRequestId = (p) => `${p}_${(globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replaceAll("-", "")}`;

export function normaliseResults(body) {
  if (!body || body.contract_version !== "campaign-results.v1" || !Array.isArray(body.metrics)) throw bad();
  const metrics = []; let skipped = 0;
  for (const m of body.metrics) {
    // A metric without a known source is never shown: an unlabelled number would read as a measurement.
    if (!m || !METRICS.includes(m.metric) || typeof m.value !== "number" || !Number.isFinite(m.value) || m.value < 0 || !date(m.observed_at) || !SOURCES.includes(m.source)) { skipped += 1; continue; }
    metrics.push({ metric: m.metric, value: m.value, unit: str(m.unit) ? m.unit : "count", observedAt: m.observed_at, source: m.source, method: str(m.method) ? m.method.trim() : "", freshAsOf: date(m.fresh_as_of) ? m.fresh_as_of : null });
  }
  return { metrics: metrics.sort((a, b) => b.observedAt.localeCompare(a.observedAt)), skipped };
}
export function normaliseInsights(body) {
  if (!body || body.contract_version !== "learning-insights.v1" || !Array.isArray(body.insights)) throw bad();
  const insights = []; let skipped = 0;
  for (const i of body.insights) {
    const evidence = Array.isArray(i && i.evidence) ? i.evidence.filter((e) => e && SOURCES.includes(e.source) && METRICS.includes(e.metric) && date(e.period_from) && date(e.period_to) && Number.isInteger(e.sample_size) && e.sample_size > 0).map((e) => ({ source: e.source, metric: e.metric, from: e.period_from, to: e.period_to, sampleSize: e.sample_size })) : [];
    // A suggestion with no evidence is not a learning, so it is not shown.
    if (!i || !str(i.insight_id) || !str(i.statement) || !CONFIDENCE.includes(i.confidence) || !STATUS.includes(i.status) || i.generated_by !== "ai" || !date(i.created_at) || evidence.length === 0) { skipped += 1; continue; }
    insights.push({ id: i.insight_id, statement: i.statement.trim(), confidence: i.confidence, status: i.status, createdAt: i.created_at, evidence });
  }
  return { insights, skipped };
}
async function get(fetchImpl, url, token, what) {
  let res; try { res = await fetchImpl(url, { headers: { authorization: `Bearer ${token}` } }); } catch { throw new InsightsError(`${what} could not be loaded because the connection failed.`, { kind: "network" }); }
  if (res.status === 401) throw new InsightsError("Your session has ended. Sign in again to continue.", { kind: "auth", status: 401 });
  if (res.status === 403 || res.status === 404) throw new InsightsError(`${what} is not available to you.`, { kind: "unavailable", status: res.status });
  if (res.status === 503) throw new InsightsError(`${what} is temporarily unavailable. Try again shortly.`, { kind: "unavailable", status: 503 });
  if (!res.ok) throw new InsightsError(`${what} could not be loaded yet.`, { kind: "error", status: res.status });
  try { return await res.json(); } catch { throw bad(); }
}
export const fetchResults = async ({ apiBaseUrl, accessToken, scope, campaignId, fetchImpl = (...a) => fetch(...a) }) => normaliseResults(await get(fetchImpl, `${apiBaseUrl}/customer/campaigns/${encodeURIComponent(campaignId)}/results?${new URLSearchParams({ tenant_id: scope.tenantId, project_id: scope.projectId })}`, accessToken, "Your results"));
export const fetchInsights = async ({ apiBaseUrl, accessToken, scope, fetchImpl = (...a) => fetch(...a) }) => normaliseInsights(await get(fetchImpl, `${apiBaseUrl}/customer/learning/insights?${new URLSearchParams({ tenant_id: scope.tenantId, project_id: scope.projectId, brand_id: scope.brandId })}`, accessToken, "Your insights"));
export async function decideInsight({ apiBaseUrl, accessToken, scope, insightId, decision, id = newRequestId("decision"), fetchImpl = (...a) => fetch(...a) }) {
  if (!["accept", "reject"].includes(decision)) throw new InsightsError("Choose accept or reject.", { kind: "invalid" });
  let res; try { res = await fetchImpl(`${apiBaseUrl}/customer/learning/insights/${encodeURIComponent(insightId)}/decision`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ tenant_id: scope.tenantId, decision, request_id: id }) }); } catch { throw new InsightsError("Your decision may or may not have been received because the connection failed. Check before trying again.", { kind: "unconfirmed" }); }
  let json = null; try { json = await res.json(); } catch { json = null; }
  if (res.status === 401) throw new InsightsError("Your session has ended. Sign in again to continue. Nothing was changed.", { kind: "auth", status: 401 });
  if (res.status === 403 || res.status === 404) throw new InsightsError("Only the workspace owner can decide on a suggestion. Nothing was changed.", { kind: "forbidden", status: res.status });
  if (res.status === 409) throw new InsightsError("This suggestion was already decided or has changed. Reload to see it. Nothing was changed.", { kind: "conflict", status: 409 });
  if (res.status >= 500) throw new InsightsError("Your decision may or may not have been received because the service had a problem. Check before trying again.", { kind: "unconfirmed", status: res.status });
  if (!res.ok) throw new InsightsError("That could not be done yet. Nothing was changed.", { kind: "error", status: res.status });
  const status = decision === "accept" ? "accepted" : "rejected";
  if (!json || json.insight_id !== insightId || json.status !== status) throw new InsightsError("The decision could not be confirmed. Reload to see the current state.", { kind: "unconfirmed" });
  return { insightId, status };
}
