# BG-STUDIO-022 — frontend ↔ backend handoff (intelligence additions)

26 October 2026. Staging RED. Launch NO-GO. Backend read: bizgenie-api draft PR #217 head `23f49038f36acf8414a079e27a8d5ffc8d302f2b`. Frontend branch `bg-studio-022-fe-intelligence`, stacked on `bg-studio-021-fe-integration` (PR #54). This extends `BG_STUDIO_021_FRONTEND_BACKEND_HANDOFF.md`; R1, R3, R4, R5, R8, R11 are unchanged there and still open. No backend source was changed.

Governing canon (bizgenie-api): **#129** (no second experiment store, analytics spine, Brand Brain, asset authority or campaign engine; extend the smallest existing records; no causality from weak samples; learning never silently overwrites approved Brand Brain truth), **#128/#191** (launch contract; founder's 21 Oct decision makes core Learning and Hybrid PRE-LAUNCH), `docs/mission-control/INTELLIGENCE_SCHEMAS.md` (Competitor Review, Benchmark Review already exist).

## R12 — analytics and Learning Brain (answered by reading the real source)

The frontend now validates the **canonical** shapes in `src/performance-evidence/contract.js` and no longer references the earlier proposed `campaign-results.v1` / `learning-insights.v1` (removed). Proven against the backend's own reference registry in-process (`qa/integration/performanceEvidence.integration.test.js`, 4 tests).

| Contract | FE reader | What the FE enforces |
|---|---|---|
| `performance-observation.v1` (row = `{contract_version, observation, fingerprint, superseded_by}`) | `readObservationRow` | `source.kind === "platform_api"` only; `value:null` ⇔ retracted and is never shown as 0; superseded rows hidden; period ordered; units/metrics/platforms from the enums |
| `performance-snapshot.v1` | `readSnapshot` | `state available/unavailable`, reason `stale`/`missing_or_retracted` shown in words; unreadable rows counted, never shown |
| `evidence-recommendation.v1` | `readRecommendation` | refused unless `confidence:"observed_change_only"`, `causal_claim:false`, `requires_customer_acceptance:true`, two 64-hex evidence hashes |
| Feedback `{recommendation_hash, decision accepted\|rejected}` | `buildFeedback` | body built only from a server-supplied hash |

**No routes exist, so none are called.** The screen takes `api.fetchSnapshot` / `api.fetchRecommendations` injected by the parent; App injects nothing today, so the gated view says "not connected".

Asks for Codex:
* **R12-1** Mount read routes for snapshot (with `max_age_ms` policy owned by the server) and recommendations; durable ingestion with source-authenticated adapters (already stated in the reference README).
* **R12-Q1 (open question)** The `Feedback` schema needs `recommendation_hash` (64 hex) but `evidence-recommendation.v1` carries no hash field and the source does not say how one is derived. Please define it (suggest: sha256 of the canonical recommendation body), return it in the recommendation, and say who may post Feedback (owner only is assumed by the UI).
* **R12-2** Return `campaign_id` filtering on the snapshot so the Growth Centre can scope by campaign.
* **R12-3** Customer-attested figures remain a separate registry (`customer_attestation`). The UI never merges them with platform data; keep that boundary in any combined read model.

## CI-01 — creative experiment and variant persistence

Frontend model: `src/intel/experimentModel.js` (7 types; one controlled variable; hypothesis; outcome metric; window 7–90 days; states planned / active / data_insufficient / directional / supported / inconclusive; thresholds in `POLICY`, shown to the customer). Today plans are **device-only** (localStorage) and labelled so.

Proposed contract (extends existing campaign variant records, per #129 "smallest existing records"; no second store):
```
experiment = { experiment_id, campaign_id, type: hook|cta|offer|image|video|platform|audience, objective, hypothesis,
  variable, outcome_metric, window_days, status: planned|active|closed, variants: [{ variant_id, label, attributes{hook,offer,cta,narrative_framework,audience,platform,placement,creative_format,source_asset,brand_brain_version} }],
  parent_experiment_id?, winner_variant_id? , decision: { by, at, note } }
```
Rules the server must enforce: variants differ in exactly one attribute; variant ids are existing campaign variants; evaluation is computed from `performance-observation.v1` rows (exposure + events per variant); status words above; no winner without the policy thresholds; tenant/brand isolation. Acceptance fixture: `src/intel/fixtures.js`, `intel.test.js` (38 tests).

## CI-02 — customer-approved product / website intelligence

Frontend: `src/intel/productContext.js`. Four fact kinds never blended: `customer_provided`, `website_claim`, `ai_interpretation`, `approved_fact`. Only the owner approves. A proposal to change Brand Brain fields is shown as a diff and **never written** by this module. The **"Read my website" action is disabled** (`EXTRACTION_AVAILABLE=false`).

Server job required before enabling: `POST /customer/product-context/ingest { tenant_id, project_id, brand_id, url }` → async job. Requirements: owner-only; https only; DNS resolved server-side and every resolved IP checked against private/loopback/link-local/metadata ranges, re-checked on **each redirect** and on connect (no DNS rebinding); redirect cap; response size, time and content-type limits; robots/terms respected; no credentials forwarded; result stored as `website_claim` facts with `source_url`, `fetched_at`, content hash; AI summaries stored as `ai_interpretation`; nothing enters Brand Brain without an owner-approved merge that records who approved it. This is a *proposal*, not an existing route.

## CI-03 — provenance-backed external market intelligence

Reuse the existing Mission Control `Competitor Review` / `Benchmark Review` records. Customer-safe read model needs: `observation`, `source`, `observed_at`, `confidence`, `relevance_to_tenant`, `uncertainty`. Rule: aggregated competitor observations are never shown as proof of a specific customer's performance, and no tenant's private data appears in another's. Frontend has no customer screen for this yet (NOT STARTED); the matrix is in `docs/intelligence/BG_STUDIO_022_COMPETITOR_ACTION_MATRIX.md`.

## CI-04 — competitor-informed strategy recommendations

Today `src/intel/goalModel.js` is deterministic general guidance by industry × objective (8 objectives incl. distributor/wholesale; wholesale beverage is trade acquisition, not a consumer launch). It is labelled "general guidance", never a forecast. Backend ask: a recommendation record that cites CI-03 evidence ids, states what was observed, how recent, why it may matter, relevance, proposed action and what remains uncertain; acceptance by the owner is required for meaningful strategic changes.

## CI-05 — Growth Control Centre read models

Frontend `GrowthCentre.jsx` composes only what exists (campaign list, workspace calendar, Brand Brain facts) plus injected snapshot/recommendations. Backend ask (optional, to avoid client-side joins): one read model per workspace — objective, pipeline counts by workflow, upcoming publications, credit usage, recent results (platform-measured only, with period + freshness), active experiments, pending recommendations. Must reuse existing authorities (no new analytics spine).

## Reference creative planning

`src/intel/referenceBrief.js` produces **briefs for the existing generation box** (binding quote + CreativeStudio); no second generation workflow. It states what was analysed (`description_only` vs `asset_named` — media analysis needs R4), strips @handles/#tags/™ names/"in the style of X", and requires a rights confirmation. No backend change needed; image/video analysis of customer assets depends on R4/R5.

## Competitor admin (P1)

NOT STARTED as UI. Recommendation: build on Mission Control Competitor Review / Benchmark Review (+ a Feature/Pricing observation record) rather than a new database; internal-only, not a customer route; no scraping. Needs a founder decision on where governance records are authoritative (Sheets vs backend).

## Test fixtures and sources

* Synthetic fixtures: `src/intel/fixtures.js` (`SYNTHETIC=true`; never rendered as live results).
* Backend sources read: `src/performance-evidence/contract.js`, `src/mission-control/intelligence-schemas.js`, `docs/mission-control/INTELLIGENCE_SCHEMAS.md`, `docs/studio/BG_STUDIO_020_SOCIAL_LEARNING_CONTRACTS.md` @ `23f4903`.
* Run locally: `BIZGENIE_API_DIR=<backend> npx vitest run qa/integration/performanceEvidence`.
