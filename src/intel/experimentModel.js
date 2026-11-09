// Creative experiments and variant intelligence (BG-STUDIO-022-FE). Extends the campaign VARIANT with structured attributes; it is not a second
// campaign system and not a store (bizgenie-api #129 G1: "no second experiment store"). Persistence is request CI-01. Until then plans live only in
// this browser and say so.
//
// The honesty rule (#129): "Never infer causality from weak/noisy samples." The evaluator below can say only what the numbers allow, and the
// strongest thing it ever says is "Result supported" for ONE named variable, never "this caused that" and never a forecast.
export const EXPERIMENT_TYPES = {
  hook: { label: "Hook A/B", variable: "hook" },
  cta: { label: "CTA A/B", variable: "cta" },
  offer: { label: "Offer A/B", variable: "offer" },
  image: { label: "Image variation", variable: "source_asset" },
  video: { label: "Video concept variation", variable: "narrative_framework" },
  platform: { label: "Platform variation", variable: "platform" },
  audience: { label: "Audience-message variation", variable: "audience" },
};
// Attributes carried by every variant (work order section 5). `hook`, `offer` and `cta` are the customer's approved words; BizGenie does not invent offers (#129 G2).
export const VARIANT_ATTRIBUTES = ["hook", "offer", "cta", "narrative_framework", "audience", "platform", "placement", "creative_format", "source_asset", "brand_brain_version", "generation_cost", "approval_state", "publication_id", "evidence"];
export const STATES = {
  planned: { label: "Experiment planned", help: "Nothing has been published for this test yet." },
  active: { label: "Experiment active", help: "Variants are published. Results are still coming in." },
  data_insufficient: { label: "Data insufficient", help: "Not enough results yet to say anything about which variant did better." },
  directional: { label: "Directional signal", help: "One variant is ahead so far, but the evidence is not strong enough to call a result." },
  supported: { label: "Result supported", help: "The difference is large and the sample is big enough that it is unlikely to be chance. It still does not prove why." },
  inconclusive: { label: "Inconclusive", help: "No meaningful difference between the variants." },
};
// Conservative, deliberately simple thresholds. They are descriptive policy, not a guarantee, and are shown to the customer.
export const POLICY = Object.freeze({ minExposurePerVariant: 500, minEventsPerVariant: 20, directionalZ: 1.0, supportedZ: 1.96, minRunDays: 7 });

export class ExperimentError extends Error { constructor(message, code) { super(message); this.name = "ExperimentError"; this.code = code; } }
const str = (v) => typeof v === "string" ? v.trim() : "";

// Build a plan. Rules: a hypothesis, ONE controlled variable (the type decides it), two to four variants that differ in that variable and only that
// variable, and a named outcome metric with a window.
export function createExperiment({ id, type, campaignId, objective, hypothesis, outcomeMetric, windowDays, variants }) {
  const t = EXPERIMENT_TYPES[type];
  if (!t) throw new ExperimentError("Choose what you are testing.", "TYPE");
  if (!str(hypothesis)) throw new ExperimentError("Write what you expect to happen and why.", "HYPOTHESIS");
  if (!str(objective)) throw new ExperimentError("Choose the goal this test serves.", "OBJECTIVE");
  if (!["clicks", "leads", "conversions", "sales", "views", "reach", "impressions", "revenue"].includes(outcomeMetric)) throw new ExperimentError("Choose the result you will judge it by.", "METRIC");
  if (!Number.isInteger(windowDays) || windowDays < POLICY.minRunDays || windowDays > 90) throw new ExperimentError(`Run it for between ${POLICY.minRunDays} and 90 days.`, "WINDOW");
  if (!Array.isArray(variants) || variants.length < 2 || variants.length > 4) throw new ExperimentError("Compare two to four variants.", "COUNT");
  const norm = variants.map((v, i) => ({ key: str(v.key) || `v${i + 1}`, label: str(v.label) || `Variant ${String.fromCharCode(65 + i)}`, attributes: { ...(v.attributes || {}) } }));
  if (new Set(norm.map((v) => v.key)).size !== norm.length) throw new ExperimentError("Each variant needs its own name.", "KEYS");
  const values = norm.map((v) => str(v.attributes[t.variable]));
  if (values.some((x) => !x)) throw new ExperimentError(`Each variant needs its own ${t.variable.replaceAll("_", " ")}.`, "VARIABLE_MISSING");
  if (new Set(values.map((x) => x.toLowerCase())).size !== values.length) throw new ExperimentError(`The variants must differ in ${t.variable.replaceAll("_", " ")}.`, "VARIABLE_SAME");
  // Controlled: every OTHER tracked attribute that any variant sets must match across variants, otherwise the test changes two things at once.
  const others = VARIANT_ATTRIBUTES.filter((k) => k !== t.variable && !["generation_cost", "approval_state", "publication_id", "evidence"].includes(k));
  const confounded = others.filter((k) => new Set(norm.map((v) => str(v.attributes[k]).toLowerCase())).size > 1);
  if (confounded.length) throw new ExperimentError(`These also differ between variants, so the test would change more than one thing: ${confounded.map((k) => k.replaceAll("_", " ")).join(", ")}.`, "CONFOUNDED");
  return Object.freeze({
    id: str(id) || `exp_${Date.now().toString(36)}`, type, campaignId: str(campaignId), objective: str(objective), hypothesis: str(hypothesis),
    variable: t.variable, outcomeMetric, windowDays, variants: norm, createdAt: new Date().toISOString(),
  });
}

// Wilson-free two-proportion z using pooled variance: events / exposure per variant. Returns null when it cannot be computed honestly.
function zScore(a, b) {
  if (!(a.exposure > 0 && b.exposure > 0)) return null;
  const p1 = a.events / a.exposure; const p2 = b.events / b.exposure;
  const pooled = (a.events + b.events) / (a.exposure + b.exposure);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / a.exposure + 1 / b.exposure));
  return se === 0 ? 0 : (p1 - p2) / se;
}

// results: { [variantKey]: { exposure, events } } measured for the experiment's outcome metric.
// published: how many variants have a publication. startedAt: ISO of first publication. Returns { state, leader, notes[] }.
export function evaluate(experiment, { results = {}, published = 0, startedAt = null, now = Date.now() } = {}) {
  const keys = experiment.variants.map((v) => v.key);
  if (published === 0) return { state: "planned", leader: null, notes: [] };
  const rows = keys.map((k) => ({ key: k, exposure: Number(results[k] && results[k].exposure), events: Number(results[k] && results[k].events) }));
  const have = rows.filter((r) => Number.isFinite(r.exposure) && Number.isFinite(r.events) && r.exposure >= 0 && r.events >= 0 && r.events <= r.exposure);
  const days = startedAt ? (now - Date.parse(startedAt)) / 86_400_000 : 0;
  const notes = [];
  if (have.length < keys.length || published < keys.length) return { state: "active", leader: null, notes: ["Not every variant has results yet."] };
  const thin = have.filter((r) => r.exposure < POLICY.minExposurePerVariant || r.events < POLICY.minEventsPerVariant);
  if (thin.length) { notes.push(`Each variant needs at least ${POLICY.minExposurePerVariant} views and ${POLICY.minEventsPerVariant} results before anything is called.`); return { state: "data_insufficient", leader: null, notes }; }
  const sorted = have.slice().sort((a, b) => b.events / b.exposure - a.events / a.exposure);
  const z = zScore(sorted[0], sorted[1]);
  if (z === null) return { state: "data_insufficient", leader: null, notes };
  const timeOk = days >= POLICY.minRunDays; if (!timeOk) notes.push(`Let it run for at least ${POLICY.minRunDays} days before calling a result.`);
  if (Math.abs(z) >= POLICY.supportedZ && timeOk) { if (keys.length > 2) notes.push("With more than two variants, compare the top two only; treat this as a lead to retest."); return { state: "supported", leader: sorted[0].key, notes }; }
  if (Math.abs(z) >= POLICY.directionalZ) return { state: "directional", leader: sorted[0].key, notes };
  return { state: "inconclusive", leader: null, notes };
}

// The "what next" step: keeps what stays the same, changes ONE named variable, never claims why the winner won (#129 G1).
export function nextStep(experiment, outcome) {
  const name = experiment.variable.replaceAll("_", " ");
  if (outcome.state === "supported") return `Keep the ${experiment.variants.find((v) => v.key === outcome.leader)?.label || "leading"} ${name} and test a different ${NEXT_VARIABLE[experiment.variable] || "element"} against it. This was one test, so repeat it before relying on it.`;
  if (outcome.state === "directional") return "Keep the test running to gather more results before deciding.";
  if (outcome.state === "inconclusive") return `The ${name} made no clear difference here. Try a bolder change to the ${name}, or test something else.`;
  if (outcome.state === "data_insufficient") return "Wait for more results. Do not decide yet.";
  if (outcome.state === "active") return "Wait until every variant has results.";
  return "Approve the variants and schedule them to start the test.";
}
const NEXT_VARIABLE = { hook: "call to action", cta: "offer", offer: "hook", source_asset: "hook", narrative_framework: "call to action", platform: "hook", audience: "offer" };
