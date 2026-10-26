// SYNTHETIC fixtures for tests and for the labelled demo state. Nothing here is a customer result and nothing here may be shown as one:
// every screen that renders from these says "Sample data" and the Growth Control Centre never mixes them into live numbers.
const H = (c) => c.repeat(64);
export const SYNTHETIC = true;
const row = (n, over = {}) => ({
  contract_version: "performance-observation.v1",
  observation: {
    observation_id: `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`, tenant_id: "t1", project_id: "p1", brand_id: "b1",
    campaign_id: "00000000-0000-4000-8000-000000000a01", variant_id: "00000000-0000-4000-8000-000000000b01", publication_id: "00000000-0000-4000-8000-000000000c01",
    objective: "leads", platform: "instagram", attribution: "organic", metric: "clicks", unit: "count", value: 40,
    period: { from: "2026-10-01T00:00:00.000Z", to: "2026-10-08T00:00:00.000Z" }, observed_at: "2026-10-09T00:00:00.000Z",
    source: { kind: "platform_api", source_id: "fixture-source", account_id: "fixture-account", record_id: `rec-${n}` }, retracted: false, ...over,
  },
  fingerprint: H(String(n % 10)), superseded_by: null,
});
export const observationRow = row;
export const snapshotAvailable = () => ({ contract_version: "performance-snapshot.v1", state: "available", reason: null, snapshot_hash: H("a"), observations: [row(1), row(2, { metric: "views", value: 1200 }), row(3, { platform: "tiktok", metric: "clicks", value: 15 })] });
export const snapshotStale = () => ({ contract_version: "performance-snapshot.v1", state: "unavailable", reason: "stale", snapshot_hash: H("b"), observations: [] });
export const recommendation = (over = {}) => ({ contract_version: "evidence-recommendation.v1", kind: "review_metric_change", metric: "clicks", previous_value: 40, current_value: 52, absolute_change: 12, percentage_change: 30, evidence: [H("1"), H("2")], confidence: "observed_change_only", causal_claim: false, requires_customer_acceptance: true, ...over });
