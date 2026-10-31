import { describe, expect, it } from "vitest";
import { ATTRIBUTION_LABEL, EvidenceShapeError, buildFeedback, describeRecommendation, freshness, readObservationRow, readRecommendation, readSnapshot, summarise } from "./performanceEvidence";
import { observationRow, recommendation, snapshotAvailable, snapshotStale } from "./fixtures";
import { EXPERIMENT_TYPES, POLICY, createExperiment, evaluate, nextStep } from "./experimentModel";
import { INDUSTRIES, OBJECTIVES, buildStrategy, readObjective, suggestObjective } from "./goalModel";
import { FACT_KINDS, approveFact, checkWebsite, newContext, proposeBrainUpdate, setFact, setWebsite, summary } from "./productContext";
import { buildReference, directions, stripThirdPartyMarks, toBrief } from "./referenceBrief";

describe("performance evidence (canonical reference models)", () => {
  it("reads an available snapshot and groups it without inventing zeros", () => {
    const s = readSnapshot(snapshotAvailable());
    expect(s.state).toBe("available"); expect(s.observations).toHaveLength(3);
    const rows = summarise(s.observations);
    expect(rows.find((r) => r.platform === "tiktok" && r.metric === "clicks").latest).toBe(15);
    expect(rows.find((r) => r.platform === "tiktok" && r.metric === "views")).toBeUndefined();
  });
  it("reports unavailable with the server's reason", () => { expect(readSnapshot(snapshotStale())).toMatchObject({ state: "unavailable", reason: "stale" }); });
  it("refuses a snapshot of the wrong version or shape", () => {
    expect(() => readSnapshot({ ...snapshotAvailable(), contract_version: "campaign-results.v1" })).toThrow(EvidenceShapeError);
    expect(() => readSnapshot(null)).toThrow(EvidenceShapeError);
  });
  it("accepts rows without a row-level version (the persisted snapshot) but refuses a wrong one", () => {
    const { contract_version, ...bare } = observationRow(4); expect(contract_version).toBe("performance-observation.v1");
    expect(readObservationRow(bare)).not.toBeNull(); expect(readObservationRow({ ...bare, contract_version: "performance-observation.v2" })).toBeNull();
  });
  it("never shows a customer attestation as platform data", () => {
    const bad = observationRow(4, { source: { kind: "customer_attestation", source_id: "x", account_id: "y", record_id: "z" } });
    expect(readObservationRow(bad)).toBeNull();
    const snap = snapshotAvailable(); snap.observations.push(bad);
    expect(readSnapshot(snap)).toMatchObject({ skipped: 1 });
  });
  it("drops retracted and superseded rows instead of showing zero", () => {
    const snap = snapshotAvailable();
    snap.observations.push(observationRow(5, { retracted: true, value: null }));
    snap.observations.push({ ...observationRow(6), superseded_by: "x" });
    const s = readSnapshot(snap); expect(s.observations).toHaveLength(3); expect(s.skipped).toBe(2);
  });
  it("rejects negative, non-finite or inverted-period rows", () => {
    expect(readObservationRow(observationRow(7, { value: -1 }))).toBeNull();
    expect(readObservationRow(observationRow(8, { value: Infinity }))).toBeNull();
    expect(readObservationRow(observationRow(9, { period: { from: "2026-10-08T00:00:00Z", to: "2026-10-01T00:00:00Z" } }))).toBeNull();
  });
  it("freshness says how old the newest evidence is", () => {
    const s = readSnapshot(snapshotAvailable());
    expect(freshness(s.observations, Date.parse("2026-10-12T00:00:00Z")).label).toBe("Last updated 3 days ago");
    expect(freshness([]).label).toBe("No platform data");
  });
  it("a recommendation is an observed change only and respects causal_claim:false", () => {
    const r = readRecommendation(recommendation()); expect(r.direction).toBe("up");
    const text = describeRecommendation(r);
    expect(text).toMatch(/observed change only/); expect(text).toMatch(/does not show what caused it/); expect(text).not.toMatch(/\bcaused by\b|will increase|forecast to/i);
    for (const bad of [{ causal_claim: true }, { confidence: "high" }, { requires_customer_acceptance: false }, { kind: "predict" }, { evidence: ["x"] }]) expect(() => readRecommendation(recommendation(bad))).toThrow(EvidenceShapeError);
  });
  it("builds the feedback body the backend accepts: recommendation_id + decision + version + one idempotency key; no hash", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    expect(buildFeedback(id, "accepted", { idempotencyKey: "k1" })).toEqual({ recommendation_id: id, decision: "accepted", expected_version: 0, idempotency_key: "k1" });
    expect(buildFeedback("not-a-uuid", "accepted", { idempotencyKey: "k" })).toBeNull(); expect(buildFeedback(id, "maybe", { idempotencyKey: "k" })).toBeNull(); expect(buildFeedback(id, "accepted")).toBeNull();
    expect(buildFeedback(id, "accepted", { expectedVersion: -1, idempotencyKey: "k" })).toBeNull();
  });
  it("keeps the persisted recommendation id and evidence state", () => {
    const r = readRecommendation(recommendation({ recommendation_id: "00000000-0000-4000-8000-000000000002", evidence_state: "unavailable", created_at: "2026-10-26T00:00:00Z" }));
    expect(r).toMatchObject({ id: "00000000-0000-4000-8000-000000000002", evidenceState: "unavailable" }); expect(readRecommendation(recommendation()).id).toBeNull();
  });
  it("labels attribution", () => { expect(ATTRIBUTION_LABEL.paid).toBe("Paid"); });
});

const variants = (field, a, b, extra = {}) => [{ key: "a", label: "A", attributes: { [field]: a, ...extra } }, { key: "b", label: "B", attributes: { [field]: b, ...extra } }];
const base = (over = {}) => ({ type: "hook", objective: "leads", hypothesis: "A question hook gets more clicks than a statement.", outcomeMetric: "clicks", windowDays: 14, variants: variants("hook", "Tired of slow quotes?", "Quotes in a day."), ...over });

describe("experiment model", () => {
  it("supports all seven experiment types", () => { expect(Object.keys(EXPERIMENT_TYPES)).toEqual(["hook", "cta", "offer", "image", "video", "platform", "audience"]); });
  it("requires a hypothesis, a goal, a metric, a sane window and 2-4 variants", () => {
    expect(() => createExperiment(base({ hypothesis: " " }))).toThrow(/expect to happen/);
    expect(() => createExperiment(base({ objective: "" }))).toThrow(/goal/);
    expect(() => createExperiment(base({ outcomeMetric: "vibes" }))).toThrow(/judge/);
    expect(() => createExperiment(base({ windowDays: 2 }))).toThrow(/between 7 and 90/);
    expect(() => createExperiment(base({ variants: [base().variants[0]] }))).toThrow(/two to four/);
  });
  it("tests ONE variable: variants must differ in it and agree on everything else", () => {
    expect(() => createExperiment(base({ variants: variants("hook", "Same", "same") }))).toThrow(/must differ/);
    expect(() => createExperiment(base({ variants: [{ key: "a", attributes: { hook: "x", cta: "Call" } }, { key: "b", attributes: { hook: "y", cta: "Email" } }] }))).toThrow(/more than one thing: cta/);
    expect(createExperiment(base({ variants: variants("hook", "x", "y", { cta: "Call" }) })).variable).toBe("hook");
  });
  it("does not call anything until published", () => { expect(evaluate(createExperiment(base()), { published: 0 }).state).toBe("planned"); });
  const exp = () => createExperiment(base());
  const started = new Date(Date.now() - 10 * 86_400_000).toISOString();
  it("active until every variant has results", () => { expect(evaluate(exp(), { published: 2, results: { a: { exposure: 900, events: 90 } }, startedAt: started }).state).toBe("active"); });
  it("data insufficient below the stated policy", () => {
    const r = evaluate(exp(), { published: 2, startedAt: started, results: { a: { exposure: POLICY.minExposurePerVariant - 1, events: 30 }, b: { exposure: 800, events: 60 } } });
    expect(r.state).toBe("data_insufficient"); expect(r.leader).toBeNull();
  });
  it("directional when ahead but weak, supported only when strong AND run long enough, inconclusive when flat", () => {
    expect(evaluate(exp(), { published: 2, startedAt: started, results: { a: { exposure: 1000, events: 60 }, b: { exposure: 1000, events: 48 } } }).state).toBe("directional");
    expect(evaluate(exp(), { published: 2, startedAt: started, results: { a: { exposure: 2000, events: 200 }, b: { exposure: 2000, events: 120 } } })).toMatchObject({ state: "supported", leader: "a" });
    const early = evaluate(exp(), { published: 2, startedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(), results: { a: { exposure: 2000, events: 200 }, b: { exposure: 2000, events: 120 } } });
    expect(early.state).toBe("directional"); expect(early.notes.join(" ")).toMatch(/at least 7 days/);
    expect(evaluate(exp(), { published: 2, startedAt: started, results: { a: { exposure: 1000, events: 50 }, b: { exposure: 1000, events: 51 } } }).state).toBe("inconclusive");
  });
  it("ignores impossible numbers rather than computing from them", () => {
    expect(evaluate(exp(), { published: 2, startedAt: started, results: { a: { exposure: 100, events: 500 }, b: { exposure: 1000, events: 50 } } }).state).toBe("active");
  });
  it("next step never claims why a winner won", () => {
    const e = exp(); const s = nextStep(e, { state: "supported", leader: "a" });
    expect(s).toMatch(/repeat it before relying on it/); expect(s).not.toMatch(/because|caused/i);
  });
});

describe("goal-first strategy across five industries", () => {
  it("classifies a wholesale beverage campaign as distributor acquisition, not a consumer launch", () => {
    expect(suggestObjective("We want to launch our new drink to wholesale distributors and stockists").objective).toBe("distributor");
    const r = readObjective("beverage", "distributor"); expect(r.audience).toMatch(/Trade buyers/); expect(r.caution).toMatch(/Do not treat it as a consumer product launch/);
  });
  it("a consumer beverage launch points trade buyers elsewhere", () => { expect(readObjective("beverage", "launch").caution).toMatch(/Distributor or wholesale/); });
  it.each([
    ["leasing", "We need more enquiries from fleet managers", "leads"],
    ["professional_services", "Fill our diary with consultations", "bookings"],
    ["aesthetics", "More people booking appointments for treatments", "bookings"],
    ["perfume", "Sell our new perfume this Christmas", "sales"],
    ["beverage", "Get listed with more wholesale accounts", "distributor"],
  ])("%s reads %j as %s and has an industry-specific caution", (sector, text, expected) => {
    expect(suggestObjective(text).objective).toBe(expected);
    const read = readObjective(sector, expected); expect(read.caution.length).toBeGreaterThan(10);
    expect(read.sector).toBe(sector);
  });
  it("has all eight objectives and every industry reads every objective without throwing", () => {
    expect(Object.keys(OBJECTIVES)).toHaveLength(8);
    for (const s of INDUSTRIES) for (const o of Object.keys(OBJECTIVES)) expect(readObjective(s, o).objectiveLabel).toBe(OBJECTIVES[o].label);
  });
  it("strategy uses the customer's own facts when present and labels general guidance when not; never forecasts", () => {
    const a = buildStrategy({ sector: "beverage", sectorSource: "chosen", objective: "distributor", brainFacts: { audience: "Independent bars in the North West", cta: "Request a trade sample" }, channels: ["LinkedIn"] });
    expect(a.targetCustomer).toEqual({ text: "Independent bars in the North West", source: "Your Brand Brain" }); expect(a.forecast).toBeNull(); expect(a.assumptions).toHaveLength(0);
    const b = buildStrategy({ sector: "aesthetics", sectorSource: "inferred", objective: "bookings", brainFacts: {}, channels: [] });
    expect(b.offer.source).toMatch(/not your approved offer/); expect(b.assumptions.join(" ")).toMatch(/will not invent one/); expect(b.assumptions.join(" ")).toMatch(/inferred/);
    expect(JSON.stringify(b)).not.toMatch(/\d+%|guarantee|will increase/i);
  });
  it("returns null for an unknown objective", () => { expect(buildStrategy({ sector: "leasing", objective: "x" })).toBeNull(); });
});

describe("product and website context", () => {
  it("accepts a public https address as text and refuses internal or numeric ones", () => {
    expect(checkWebsite("example.co.uk/shop").value).toBe("https://example.co.uk/shop");
    for (const bad of ["http://example.com", "https://localhost", "https://192.168.0.1", "https://user:pw@example.com", "https://intranet.internal", "not a url", "https://[::1]"]) expect(checkWebsite(bad).ok).toBe(false);
    expect(checkWebsite("").ok).toBe(true);
  });
  it("facts start unapproved and only the owner can approve", () => {
    let c = setFact(newContext(), "offer", "Free fitting"); expect(c.facts.offer).toMatchObject({ kind: "customer_provided", approved: false });
    expect(approveFact(c, "offer", { isOwner: false }).error).toMatch(/Only the owner/);
    c = approveFact(c, "offer", { isOwner: true }).context; expect(c.facts.offer).toMatchObject({ approved: true, kind: "approved_fact", origin: "customer_provided" });
  });
  it("ignores unknown fields and trims long text", () => {
    expect(setFact(newContext(), "secret", "x").facts).toEqual({});
    expect(setFact(newContext(), "offer", "x".repeat(5000)).facts.offer.text).toHaveLength(1500);
  });
  it("never overwrites the Brand Brain silently: it proposes a labelled diff", () => {
    let c = approveFact(setFact(newContext(), "target", "Independent bars"), "target", { isOwner: true }).context;
    expect(proposeBrainUpdate(c, { audience: "Pubs" })).toEqual([{ field: "audience", current: "Pubs", proposed: "Independent bars", kind: "replaces_existing" }]);
    expect(proposeBrainUpdate(c, { audience: "" })[0].kind).toBe("fills_empty");
    expect(proposeBrainUpdate(setFact(newContext(), "target", "x"), {})).toEqual([]);
  });
  it("summary lists the required facts still missing; website setter reports errors", () => {
    expect(summary(newContext()).missingRequired).toHaveLength(3);
    expect(setWebsite(newContext(), "http://x.com").error).toMatch(/https/);
    expect(Object.keys(FACT_KINDS)).toHaveLength(4);
  });
});

describe("reference creative planning", () => {
  const input = { description: "A punchy question opening then a quick demonstration, like Acme Fizz® does.", rightsConfirmed: true, platform: "TikTok" };
  it("needs a real description and a rights confirmation", () => {
    expect(buildReference({ ...input, description: "short" }).ok).toBe(false);
    expect(buildReference({ ...input, rightsConfirmed: false }).message).toMatch(/Confirm/);
  });
  it("removes third-party brand marks and says so", () => {
    const r = buildReference({ ...input, description: "Make it feel like Acme Fizz and use #acmefizz with @rival_brand vibes in the style of Big Cola Co" });
    expect(r.reference.description).not.toMatch(/Acme Fizz|#acmefizz|@rival_brand|Big Cola Co/); expect(r.reference.removed.length).toBeGreaterThanOrEqual(3);
    expect(stripThirdPartyMarks("plain words only").removed).toEqual([]);
  });
  it("states exactly what was analysed", () => {
    expect(buildReference(input).reference.analysis).toBe("description_only");
    expect(buildReference({ ...input, assetName: "my-ad.mp4" }).reference.analysis).toBe("asset_named");
  });
  it("produces three original directions whose briefs forbid copying", () => {
    const ref = buildReference(input).reference; const d = directions(ref, { audience: "Local cafés" });
    expect(d).toHaveLength(3); for (const x of d) { expect(x.brief).toMatch(/Do not copy any existing advertisement/); expect(x.brief.length).toBeLessThanOrEqual(4000); }
    expect(toBrief(ref)).toMatch(/ORIGINAL/); expect(new Set(d.map((x) => x.hook)).size).toBe(3);
  });
});
