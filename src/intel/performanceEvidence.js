// Frontend validators and read models for the backend's REFERENCE performance-evidence contracts (bizgenie-api @ 23f4903,
// src/performance-evidence/contract.js): performance-observation.v1, performance-snapshot.v1, evidence-recommendation.v1 and the Feedback shape.
//
// THE BACKEND HAS NO ROUTES FOR THESE (docs/studio/BG_STUDIO_020_SOCIAL_LEARNING_CONTRACTS.md: "process-local reference code"), so this module does
// no network I/O and invents no endpoint. It validates a body handed to it (a future R12 response, or a test fixture) and turns it into what the
// screen may say. Rules carried over from the contract:
//   * the only observation source is `platform_api`; a customer attestation is a different record and is rejected here;
//   * `value: null` means retracted evidence: it is never shown as zero;
//   * an evidence-recommendation reports an OBSERVED change only: confidence `observed_change_only`, `causal_claim:false`,
//     `requires_customer_acceptance:true`. Anything else is refused, so the app can never display "this caused that".
export const OBSERVATION_VERSION = "performance-observation.v1";
export const SNAPSHOT_VERSION = "performance-snapshot.v1";
export const RECOMMENDATION_VERSION = "evidence-recommendation.v1";

const PLATFORMS = ["instagram", "facebook", "linkedin", "tiktok", "youtube"];
const ATTRIBUTION = ["organic", "paid"];
const METRICS = ["reach", "views", "impressions", "clicks", "leads", "conversions", "sales", "revenue"];
const UNITS = ["count", "gbp", "usd", "eur"];
const HASH = /^[a-f0-9]{64}$/;
const isStr = (v) => typeof v === "string" && v.trim().length > 0;
const isTime = (v) => typeof v === "string" && /(Z|[+-]\d\d:\d\d)$/.test(v) && Number.isFinite(Date.parse(v));

export const METRIC_LABEL = { reach: "Reach", views: "Views", impressions: "Impressions", clicks: "Clicks", leads: "Leads", conversions: "Conversions", sales: "Sales", revenue: "Revenue" };
export const PLATFORM_LABEL = { instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn", tiktok: "TikTok", youtube: "YouTube" };
export const ATTRIBUTION_LABEL = { organic: "Organic (unpaid)", paid: "Paid" };

export class EvidenceShapeError extends Error {
  constructor(code) { super("The evidence was not in the expected form, so nothing is shown from it."); this.name = "EvidenceShapeError"; this.code = code; }
}

// One observation row exactly as the registry returns it: { contract_version, observation, fingerprint, superseded_by }.
export function readObservationRow(row) {
  const o = row && row.observation;
  if (!row || row.contract_version !== OBSERVATION_VERSION || !o || !HASH.test(String(row.fingerprint || ""))) return null;
  const retracted = o.retracted === true;
  const okValue = retracted ? o.value === null : typeof o.value === "number" && Number.isFinite(o.value) && o.value >= 0;
  if (!okValue || !PLATFORMS.includes(o.platform) || !ATTRIBUTION.includes(o.attribution) || !METRICS.includes(o.metric) || !UNITS.includes(o.unit)) return null;
  if (!isStr(o.observation_id) || !isStr(o.campaign_id) || !isStr(o.variant_id) || !isStr(o.publication_id) || !isStr(o.objective)) return null;
  if (!o.period || !isTime(o.period.from) || !isTime(o.period.to) || !isTime(o.observed_at)) return null;
  if (Date.parse(o.period.from) >= Date.parse(o.period.to)) return null;
  // Platform data only. A customer attestation is a different kind of statement and must never be shown as measured.
  if (!o.source || o.source.kind !== "platform_api" || !isStr(o.source.source_id) || !isStr(o.source.account_id)) return null;
  return {
    id: o.observation_id, campaignId: o.campaign_id, variantId: o.variant_id, publicationId: o.publication_id, objective: o.objective,
    platform: o.platform, attribution: o.attribution, metric: o.metric, unit: o.unit, value: o.value, retracted,
    periodFrom: o.period.from, periodTo: o.period.to, observedAt: o.observed_at, correctionOf: o.correction_of || null,
    superseded: Boolean(row.superseded_by), fingerprint: row.fingerprint,
  };
}

// performance-snapshot.v1 -> a state the screen can describe without guessing.
//   available   : at least one usable observation (rows that cannot be read are counted, never shown)
//   unavailable : the server says why (stale | missing_or_retracted)
export function readSnapshot(body) {
  if (!body || body.contract_version !== SNAPSHOT_VERSION || !["available", "unavailable"].includes(body.state) || !Array.isArray(body.observations)) throw new EvidenceShapeError("SNAPSHOT_INVALID");
  if (body.state === "unavailable") return { state: "unavailable", reason: body.reason === "stale" ? "stale" : "missing_or_retracted", observations: [], skipped: 0, snapshotHash: String(body.snapshot_hash || "") };
  const observations = []; let skipped = 0;
  for (const row of body.observations) { const r = readObservationRow(row); if (r && !r.superseded && !r.retracted) observations.push(r); else skipped += 1; }
  return { state: observations.length ? "available" : "unavailable", reason: observations.length ? null : "missing_or_retracted", observations, skipped, snapshotHash: String(body.snapshot_hash || "") };
}

// evidence-recommendation.v1. Refused unless it says, in the contract's own words, that it is an observed change and not a cause.
export function readRecommendation(body) {
  const ok = body && body.contract_version === RECOMMENDATION_VERSION && body.kind === "review_metric_change"
    && METRICS.includes(body.metric) && Number.isFinite(body.previous_value) && Number.isFinite(body.current_value) && Number.isFinite(body.absolute_change)
    && (body.percentage_change === null || Number.isFinite(body.percentage_change))
    && Array.isArray(body.evidence) && body.evidence.length === 2 && body.evidence.every((h) => HASH.test(String(h)))
    && body.confidence === "observed_change_only" && body.causal_claim === false && body.requires_customer_acceptance === true;
  if (!ok) throw new EvidenceShapeError("RECOMMENDATION_INVALID");
  const direction = body.absolute_change > 0 ? "up" : body.absolute_change < 0 ? "down" : "flat";
  return {
    metric: body.metric, previous: body.previous_value, current: body.current_value, change: body.absolute_change, percent: body.percentage_change,
    direction, evidence: body.evidence.slice(), // the hash BizGenie records a decision against
  };
}

// What the screen may say about a recommendation. Never "caused", never "will", never a forecast.
export function describeRecommendation(r) {
  const label = METRIC_LABEL[r.metric] || r.metric;
  const pct = r.percent === null ? "" : ` (${r.percent > 0 ? "+" : ""}${r.percent.toFixed(1)}%)`;
  const moved = r.direction === "flat" ? `${label} did not change between the two periods.` : `${label} went ${r.direction} from ${r.previous} to ${r.current}${pct} between the two periods.`;
  return `${moved} This is an observed change only. It does not show what caused it, and it is not a forecast. Nothing changes unless you accept it.`;
}

// The Feedback body shape (recommendation_hash + decision). Tenant/project/actor/time are the server's to fill, not guessed here.
// The reference contract defines the Feedback hash but NOT how a recommendation gets one (open question R12-Q1 in the handoff), so this builds a body
// only from a hash the server supplied. Without one there is nothing safe to send and the decision stays on this device.
export function buildFeedback(recommendationHash, decision) {
  if (!HASH.test(String(recommendationHash || "")) || !["accepted", "rejected"].includes(decision)) return null;
  return { recommendation_hash: recommendationHash, decision };
}

// Freshness and period facts for a snapshot, relative to `now`. Used to label how old evidence is.
export function freshness(observations, now = Date.now()) {
  if (!observations.length) return { newestAt: null, oldestAt: null, ageDays: null, label: "No platform data" };
  const times = observations.map((o) => Date.parse(o.observedAt));
  const newest = Math.max(...times); const oldest = Math.min(...times);
  const ageDays = Math.max(0, Math.floor((now - newest) / 86_400_000));
  return { newestAt: new Date(newest).toISOString(), oldestAt: new Date(oldest).toISOString(), ageDays, label: ageDays === 0 ? "Updated today" : `Last updated ${ageDays} day${ageDays === 1 ? "" : "s"} ago` };
}

// Rows grouped for a table: one line per platform + attribution + metric, latest period first. Missing combinations are simply absent: no zero is invented.
export function summarise(observations) {
  const groups = new Map();
  for (const o of observations) {
    const key = `${o.platform}|${o.attribution}|${o.metric}|${o.unit}`;
    const list = groups.get(key) || []; list.push(o); groups.set(key, list);
  }
  return [...groups.values()].map((list) => {
    const sorted = list.slice().sort((a, b) => b.periodTo.localeCompare(a.periodTo));
    const head = sorted[0];
    return { platform: head.platform, attribution: head.attribution, metric: head.metric, unit: head.unit, latest: head.value, periodFrom: head.periodFrom, periodTo: head.periodTo, periods: sorted.length, variants: new Set(sorted.map((x) => x.variantId)).size };
  }).sort((a, b) => a.platform.localeCompare(b.platform) || a.metric.localeCompare(b.metric));
}
