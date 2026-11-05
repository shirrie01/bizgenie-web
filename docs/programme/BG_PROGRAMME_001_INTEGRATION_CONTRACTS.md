# BG-PROGRAMME-001 — integration contracts and mismatches

27 Oct 2026. Format: Consumer → expected contract → actual provider → consequence → correction → owner → test. Evidence: native inspection of web #56 and api #218, plus the 023 backend218 integration test (local Postgres).

| # | Consumer → expected | Actual provider | Consequence | Correction | Owner | Test |
|---|---|---|---|---|---|---|
| 1 | FE `socialClient.js` → legacy social routes | api #218 `/customer/social/*` (OAuth + dispatch outbox) | Social UI cannot talk to the backend | Rewrite client to `/customer/social/*`; keep gate OFF | Claude (FE) | contract test against #218 server |
| 2 | FE insights client → `/customer/insights/*` (objectives, snapshots, recommendations, feedback) | #218 provides; rows lack row-level `contract_version` | FE validator tolerant (version optional-but-checked) | Backend to add the version field | Codex | `performanceEvidence` + `backend218` tests |
| 3 | FE feedback → `{recommendation_id, decision, expected_version, idempotency_key}` | #218 route as expected | none (reference `recommendation_hash` removed) | — | — | `backend218` |
| 4 | FE quote/confirm → `generation-quote.v1` | #217/#218 durable quote | none; tested | — | — | `quoteConfirm` |
| 5 | FE media/creative-job UI → creative jobs + media attach | #218 chain provides; FE not wired | no customer upload/preview | Adopt UI | Claude (FE) | browser matrix |
| 6 | FE campaign discovery/nested facts | #218 provides | partial adoption | finish adoption | Claude | integration |
| 7 | Media delivery (two lineages) | #205–#212 vs #218 | duplicate/conflicting code | Codex reconciliation (PR register) | Codex | media tests on merged head |
| 8 | Website #57 → `early-access-interest.v1` `POST /public/early-access-interest` | **No route**; existing `/public/paid-beta-interest` is narrower | form closed/failing in any real build | Extend paid-beta lead domain per contract §5; admin export/deletion; retention job | Codex | `site/contract` against real server |
| 9 | Website events → `site-events.v1` | none | measurement off | build or leave off | Codex/founder | contract tests |
| 10 | Billing management routes | not mounted; Stripe inactive | no paid subscription | mount behind flag, staging test with test-mode only on approval | Codex/founder | staging |
| 11 | Analytics ingestion → insights snapshots | no producer | Learning Brain has no real input | manual-entry first, Meta ingestion after approval | Codex | e2e |
| 12 | Tenant isolation | enforced in #218 repositories | verified locally only | cross-tenant negative tests on staging | Codex | existing negative tests + staging |
| 13 | Feature flags | FE `VITE_*` default OFF; BE optional services 503 stable codes | safe by default | keep; add a flags inventory to release plan | Both | gates tests |
| 14 | Workspace calendar endpoint | required by `DEC-025` before full launch | FE calendar relies on campaign facts | confirm provided in #218 or add | Codex | integration |
