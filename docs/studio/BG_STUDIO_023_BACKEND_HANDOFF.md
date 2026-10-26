# BG-STUDIO-023 — compact backend handoff and compatibility matrix

26 October 2026. **Staging RED. Launch NO-GO.** Backend read: bizgenie-api draft PR #218 (`bg-studio-021-backend-integration`) head `9346055a4b0c2057f8ab13274396ecf502296ed6`, based on PR #217 `23f49038f36acf8414a079e27a8d5ffc8d302f2b`. Frontend: branch `bg-studio-023-fe-acceptance` (see the report for the exact SHA), stacked on PR #55. No newer backend or frontend PR existed when this was written (backend open PRs #211–#218; frontend #46–#55).

"Integrated locally" = the backend's own Express routers, a throwaway PostgreSQL database and the backend's own synthetic fixtures (`qa/integration/*.integration.test.js`, 41 tests, run with `BIZGENIE_API_DIR=<#218 checkout> TEST_DATABASE_URL=<throwaway superuser>`). It is **not** staging: no real identity, provider, OAuth, malware scanner, Stripe or deployed service.

## 1. Compatibility matrix — exact routes (exists / proposed / FE adopted)

| Area | Backend route (all bearer-authenticated, private/no-store) | Exists in #218? | Mounted by default? | Observed shape | FE adapter status | Evidence |
|---|---|---|---|---|---|---|
| Quote | `POST /customer/generation-quotes` | yes | 503 `GENERATION_BILLING_UNAVAILABLE` until a quote service is injected | `generation-quote.v1` {quote_id, execution_class, credits, kind:"fixed", max_credits, available_credits, sufficient, expires_at, policy_version, state} (201) | **aligned** (`generationQuoteClient.js`) | harness (16 + 1) |
| Confirm / status / cancel | `POST …/:id/confirm`, `GET …/:id`, `POST …/:id/cancel` | yes | same | 202 {status:"queued", job_id, quote_id, reserved_credits, replay} | **aligned** | harness |
| Creative jobs | `GET /customer/creative-jobs`, `GET …/:job_id`, `POST …/:job_id/attach`, `POST …/:job_id/cancel` | yes (R3) | 503 `CREATIVE_JOBS_UNAVAILABLE` | `creative-job-list.v1`, `creative-job.v1` (state, outputs, preview paths, can_cancel, retry_guidance); no `gs://`/token in output | **not adopted** (FE shows "finished, not shown yet"; list/detail/attach UI not built) | harness (list/detail queued case, scope isolation); attach success is backend-tested only |
| Campaign detail (R1) | `GET /customer/campaigns/:id` | yes | yes | per variant `current_schedule{schedule_id,revision_id,scheduled_for,timezone}`, `manual_publication{attempt_id,…}\|null`, `publication{record_id,…,evidence_kind:"customer_attestation"}\|null`; old `active_schedule_id/schedules/pending_attempt_id/publications` still absent | **adopted** (`scheduleModel.activeSchedule`, App `pendingAttemptFor`, `publicationFor`; browser-remembered ids remain a labelled fallback) | harness + unit |
| Campaign discovery | `GET /customer/campaigns/discovery?archived=&limit≤100&cursor` | yes | yes | `campaign-discovery.v1` {campaigns[], next_cursor}; limit 500 → 400 | **not adopted** (FE still uses the legacy collection) | harness |
| Calendar | `GET /customer/calendar` (≤93 days, limit ≤100) | yes | yes | `workspace-calendar.v1` | aligned | harness |
| Customer media intake (R4) | `GET/POST /customer/assets…` (`/uploads`, `PUT /uploads/:id/bytes`, `/:id/complete`, `/:id/preview`, `/:id/revoke`, `DELETE`) | yes | 503 `MEDIA_INTAKE_UNAVAILABLE` | per backend doc: quarantined → ready/rejected → revoked/deleted; rights attestation recorded, not verified | **not adopted** (FE hybrid message unchanged) | default-off verified; flow backend-tested only |
| Hybrid / video (R5) | via quote `execution_mode:"hybrid"` + `supplied_assets` | partly: fixture compositor only, one known synthetic digest; AI-only video with references = 422 `OPERATION_UNSUPPORTED` | — | — | **not adopted** | backend doc |
| Social OAuth/dispatch (R11) | `GET /customer/social/connections`, `POST /oauth-intents`, `POST /oauth-complete`, `POST /connections/:id/disconnect`, `GET/POST /dispatches`, `POST /dispatches/:id/cancel`, `GET /calendar` | yes | 503 `SOCIAL_NOT_CONFIGURED` | connections {connection_id, platform, account_id, status, expires_at, version} (no token reference); dispatch 200 {dispatch_id, state:"queued", publication_id:null, evidence_kind:null}; `publishing-calendar.v1`; window >93 days → 400; foreign actor → 404 | **proposed paths are WRONG**: FE `socialClient.js` still calls `/customer/social-accounts` and `/customer/publishing-queue` (both 404). **Needs rewrite, not adopted** | harness (read/enqueue/cancel/calendar, idempotent enqueue, isolation) |
| Learning (R12) | `POST /customer/insights/objectives`, `POST /snapshots`, `POST /recommendations`, `GET /recommendations`, `POST /feedback` | yes | 503 `LEARNING_UNAVAILABLE` | persisted `performance-snapshot.v1` (+`snapshot_id`; rows are `{observation, fingerprint, superseded_by}` with **no row-level version**), `evidence-recommendation.v1` (+`recommendation_id`, `evidence_state: current\|unavailable`), feedback `{recommendation_id, decision, expected_version, idempotency_key}`; **no public ingestion route** | **validators adopted** (`src/intel/performanceEvidence.js`); view takes injected `api.fetchSnapshot/fetchRecommendations/sendFeedback`; **no concrete client wired** (App injects none) | harness (full journey) |
| Plan catalogue | `GET /customer/billing/plans` | yes | 503 `COMMERCIAL_CATALOG_UNAVAILABLE` without an approved catalogue | `commercial-catalog.v1` | aligned | harness (earlier) |
| Subscription / credit preview | `GET /customer/billing/subscription`, `…/credit-preview` | yes | yes | informational; preview is not a quote | aligned | harness |
| Subscription management | `…/management/*` | **draft, unmounted** (`managementDraft.js`) | no | `confirmation_required`, `entitlement_confirmed:false` | adapter ready, nothing mounted | draft router harness |
| Invoices | `GET /customer/billing/invoices` | **draft, unmounted** (`invoicesDraft.js`) | no | `billing-invoices.v1`; links only `invoice.stripe.com`; `receipt_url:null` | adapter ready | draft router harness |
| Guessed FE paths | `/customer/learning/insights`, `/customer/campaigns/:id/results`, `/customer/social-accounts`, `/customer/publishing-queue` | **do not exist** (404) | — | — | the first two removed in 022; the last two still in `socialClient.js` | harness asserts 404 |
| Customer-entered results | `GET/POST /customer/campaigns/:id/measurements` | yes (existing) | yes | `evidence_kind: customer_attestation` | used on the campaign page; never merged with platform evidence | existing |

Findings from running the frontend against #218 (all fixed in this branch unless marked):
1. **Persisted snapshot rows have no `contract_version`**; the 022 validator required one and would have shown "no data" for real data. Fixed; unit test added.
2. The reference `Feedback.recommendation_hash` is **not part of the route**; the backend identifies a recommendation by `recommendation_id` (an extra hash field is ignored). The earlier open question R12-Q1 is therefore **closed on the backend's side**; the frontend now sends the real body with one stable idempotency key per decision.
3. `socialClient.js` targets routes that do not exist. **Open (frontend).**
4. Enqueue returns **200**, not 201, with `publication_id:null` until a platform confirms.

## 2. Requests, status after #218

| Id | Status | Remaining |
|---|---|---|
| R1 persisted campaign facts | **delivered** in #218 (nested names) | FE adopted. Backend: keep names stable; FE still needs `campaign-discovery.v1` adoption |
| R3 job dispatch + attach | **delivered** (jobs router, attach in one campaign command) | FE UI for list/detail/attach/preview/approval; a **product** worker and storage composition are still deployment items (not wired by default) |
| R4 customer media intake | **delivered** as optional service | FE library UI; rights wording needs Legal; inspector/rights policy/storage must exist (503 otherwise); quota/retention open |
| R5 hybrid | **partial** (fixture only) | general compositor, AI-video-with-references |
| R8 billing management mounting | **not delivered** (`managementDraft.js`, `invoicesDraft.js` unmounted) | server tenant resolution + mount |
| R11 social | **delivered as durable metadata + outbox** | no real connector/app/vault; FE rewrite to `/customer/social/*`; platform approval and scopes are external (see Meta checklist) |
| R12 analytics/learning | **delivered** (persisted objectives, snapshots, recommendations, feedback; future-context injection) | **no public ingestion route / scheduler** (observations enter only via a trusted connector call), metric dictionaries, attribution policy; FE client wiring |
| R6/R7 | R6 delivered; R7 needs the founder's approved catalogue | pricing canon **not found anywhere accessible** |
| CI-01 experiment + variant persistence | **not started** (no route) | proposal in `BG_STUDIO_022_FRONTEND_BACKEND_HANDOFF.md` §CI-01; extend campaign variant records, no second store (#129) |
| CI-02 customer-approved product/website intelligence | **not started** | server-side SSRF-safe ingest contract in the 022 handoff §CI-02; FE "Read my website" stays disabled |
| CI-03 provenance-backed market intelligence | **not started** | reuse Mission Control Competitor/Benchmark Review; customer-safe read model |
| CI-04 competitor-informed recommendations | **not started** | cites CI-03 evidence ids; owner acceptance required |
| CI-05 Growth Control Centre read model | **not started** (optional) | FE composes existing reads for now |

## 3. Acceptance criteria for the next backend step (what makes a stage flip to "integrated")

* R12: a real, authenticated, source-verified ingestion path and schedule; then the FE wires `fetchSnapshot/fetchRecommendations/sendFeedback` to `/customer/insights/*`.
* R11: a configured connector in a reviewed environment; FE rewrite to `/customer/social/*` including OAuth return states (intent → provider → complete), disconnect, dispatch list, cancel, and the publishing calendar overlay without double-counting a planned post and its dispatch.
* R3/R4: a configured worker, storage and inspector in a reviewed environment; FE job list/detail, authenticated media preview (≤32 MiB, `credentials: omit`), attach → render → acknowledge → approve.
* Every optional service stays **unavailable by default**; the FE capability gates stay OFF until an integrated owner/member browser journey is proven against that environment.
