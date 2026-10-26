// @vitest-environment node
// LOCAL INTEGRATION (BG-STUDIO-022-FE): drives the backend's REFERENCE performance-evidence registry (bizgenie-api PR #217 @ 23f4903,
// src/performance-evidence/contract.js, "process-local reference code", no routes) and checks that THIS app's validators accept exactly what it
// produces and refuse what it refuses. No network and no endpoint: it calls the backend module in-process. Not staging; the data is synthetic.
// Skipped unless BIZGENIE_API_DIR points at the backend checkout with node_modules installed.
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { describeRecommendation, readRecommendation, readSnapshot, summarise } from "../../src/intel/performanceEvidence";

const DIR = process.env.BIZGENIE_API_DIR;
const run = DIR ? describe : describe.skip;
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

run("frontend evidence validators against the backend reference registry", () => {
  const req = createRequire(path.join(DIR, "index.js"));
  const { PerformanceEvidenceReferenceRegistry, compareObservations, EvidenceError } = req("./src/performance-evidence/contract");
  const now = new Date("2026-10-20T00:00:00.000Z");
  const scope = { tenant_id: "t1", project_id: "p1", brand_id: "b1", campaign_id: U(1), variant_id: U(2), publication_id: U(3), objective: "leads", platform: "instagram" };
  const binding = { ...scope, published_at: "2026-09-30T00:00:00.000Z" };
  const obs = (n, from, to, value, over = {}) => ({ observation_id: U(100 + n), ...scope, attribution: "organic", metric: "clicks", unit: "count", value, period: { from, to }, observed_at: new Date(Date.parse(to) + 86_400_000).toISOString(), source: { kind: "platform_api", source_id: "src", account_id: "acct", record_id: `r${n}` }, retracted: false, ...over });
  const make = () => new PerformanceEvidenceReferenceRegistry({ authorizeSource: async () => true, now: () => now });

  it("accepts a real snapshot and a real recommendation, and describes the change as observed only", async () => {
    const reg = make();
    const a = await reg.ingest({}, binding, obs(1, "2026-10-01T00:00:00.000Z", "2026-10-08T00:00:00.000Z", 40));
    const b = await reg.ingest({}, binding, obs(2, "2026-10-08T00:00:00.000Z", "2026-10-15T00:00:00.000Z", 52));
    const snap = reg.snapshot({ tenant_id: "t1", project_id: "p1", brand_id: "b1", max_age_ms: 30 * 86_400_000 });
    const read = readSnapshot(JSON.parse(JSON.stringify(snap)));
    expect(read.state).toBe("available"); expect(read.observations).toHaveLength(2); expect(read.skipped).toBe(0);
    expect(summarise(read.observations)[0]).toMatchObject({ platform: "instagram", metric: "clicks", periods: 2 });
    const rec = readRecommendation(JSON.parse(JSON.stringify(compareObservations(a, b))));
    expect(rec).toMatchObject({ direction: "up", change: 12, previous: 40, current: 52 });
    expect(describeRecommendation(rec)).toMatch(/observed change only/);
  });
  it("a retracted observation leaves the snapshot instead of becoming zero", async () => {
    const reg = make();
    await reg.ingest({}, binding, obs(1, "2026-10-01T00:00:00.000Z", "2026-10-08T00:00:00.000Z", 40));
    await reg.ingest({}, binding, obs(3, "2026-10-01T00:00:00.000Z", "2026-10-08T00:00:00.000Z", null, { correction_of: U(101), retracted: true }));
    const snap = JSON.parse(JSON.stringify(reg.snapshot({ tenant_id: "t1", project_id: "p1", brand_id: "b1", max_age_ms: 30 * 86_400_000 })));
    expect(readSnapshot(snap)).toMatchObject({ state: "unavailable", reason: "missing_or_retracted" });
  });
  it("a stale snapshot is reported as stale", async () => {
    const reg = make();
    await reg.ingest({}, binding, obs(1, "2026-10-01T00:00:00.000Z", "2026-10-08T00:00:00.000Z", 40));
    const snap = JSON.parse(JSON.stringify(reg.snapshot({ tenant_id: "t1", project_id: "p1", brand_id: "b1", max_age_ms: 60_000 })));
    expect(readSnapshot(snap)).toMatchObject({ state: "unavailable", reason: "stale" });
  });
  it("the backend refuses what the frontend would also never show (customer attestation as a source)", async () => {
    await expect(make().ingest({}, binding, obs(4, "2026-10-01T00:00:00.000Z", "2026-10-08T00:00:00.000Z", 5, { source: { kind: "customer_attestation", source_id: "s", account_id: "a", record_id: "r" } }))).rejects.toBeInstanceOf(EvidenceError);
  });
});
