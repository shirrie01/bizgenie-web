# BG-WEB-LAUNCH-CLOSURE-16 — WEB ↔ API current-main compatibility, video and social readiness

13 Nov 2026. **Authority: accepted API main `d3ec6c375ab14b4d3180e05e784361d0bf155046`** (includes #237 calendar/catalogue/product, #238 provider-spend admission, #239 quotes/worker/recovery); WEB main `3d1af7a81af79ec4a5a84f64bf33621a170ec6ce`. This **supersedes section 1 of the Closure-15 pack, which was written against the obsolete API main `16f363e9`** and wrongly listed quotes, calendar, unschedule, catalogue and credit preview as absent. 15 API PRs remain open (Codex-owned); nothing below depends on them. Source verification only: no staging revision, hosted environment or provider was exercised. Staging and launch remain NO-GO.

## Classification (exactly one primary state per feature; further states listed where they also apply)
SOURCE ROUTE ABSENT · SOURCE PRESENT, NOT MOUNTED · MOUNTED, SERVICE NOT CONFIGURED · FEATURE FLAG OFF · STAGING REVISION NOT VERIFIED · STAGING TEST NOT RUN · VERIFIED WORKING.
**Nothing is VERIFIED WORKING**: that state needs a hosted run on a verified staging revision, and none has been run. The only revision known on staging is `bizgenie-api-staging-00030-pob` (tag `f1fc2f51`, source `f1fc2f5150…`), which **predates #237–#239**, so every feature that arrived in them is STAGING REVISION NOT VERIFIED (it cannot be assumed present).

## 1. Compatibility table (checked against `d3ec6c37` source: routers, `index.js` mounts, `startServer` composition)
| # | Feature | Route on main | Mounted | Service injected/configured by `startServer` | WEB flag (default) | Staging workflow sets it | Local proof | Primary state | Safe to enable? |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Generation quote and confirm | `POST /customer/generation-quotes`, `GET /:id`, `POST /:id/confirm`, `POST /:id/cancel` | yes, unconditionally | **no**: `generationQuoteService` is `null` in `createApp`, never composed by `startServer`; the router answers 503 `GENERATION_BILLING_UNAVAILABLE` | `VITE_GENERATION_QUOTE_API` (off) | **yes** | API `quoted-creative-adapter`, `quoted-worker-admission-hook` pass; `generation-quotes.integration` needs PostgreSQL (not run here); WEB `QuotedGeneration` 87 tests; **response fields match exactly** (`generation-quote.v1`: quote_id, execution_class, credits, kind, max_credits, available_credits, sufficient, expires_at, policy_version, state) | **MOUNTED, SERVICE NOT CONFIGURED** (+ revision not verified, test not run) | No: the staging flag must stay on only for a revision that composes the service; otherwise the customer reaches a 503 |
| 2 | Creative job create / attach / cancel (`creative-job.v1`, `creative-job-list.v1`) | **absent** (`/customer/creative-jobs` appears only in docs; quote `GET /:id` returns claim state, not `creative-job.v1`) | — | — | `VITE_CUSTOMER_MEDIA_API` (off) | **yes** | WEB tests only (mocked) | **SOURCE ROUTE ABSENT** | No: with the staging flag on, job tracking and attach would 404 |
| 3 | Workspace calendar | `GET /customer/calendar` (`workspace-calendar.v1`, entries/unscheduled/next_cursor, schedule_id and publication_id per row) | yes | repository = campaign repository (PostgreSQL in production) | `VITE_WORKSPACE_CALENDAR_API` (off) | **yes** | API `workspace-calendar.test.js`; WEB 3 calendar test files; shape matches | **STAGING REVISION NOT VERIFIED** (source present and mounted) | Yes once the staging revision is verified ≥ `d3ec6c37` |
| 4 | Unschedule | `POST …/variants/:v/unschedule` | yes (campaigns router) | same as campaigns | `VITE_UNSCHEDULE_API`, else follows the calendar flag (off) | via the calendar flag | API `campaign-management-contract`; WEB App test | **STAGING REVISION NOT VERIFIED** | Yes with #3 |
| 5 | Commercial catalogue | `GET /customer/billing/plans` | yes, when `billingRepository` exists | **no**: `commercialCatalog` is `null` by default and not composed; the route answers 503 `COMMERCIAL_CATALOG_UNAVAILABLE` until an approved catalogue is injected | `VITE_PLAN_CATALOGUE_API` (off) | no | API `commercial-contracts.test.js`; WEB 53 plan tests | **MOUNTED, SERVICE NOT CONFIGURED** (deliberately, until approval) | Not until the founder approves the catalogue |
| 6 | Credit preview | `GET /customer/billing/credit-preview` | yes | needs an active policy with `execution_costs` (not provisioned in production) | `VITE_CREDIT_PREVIEW_API` (off) | no | API billing suites; WEB `creditPreviewClient.test` | **FEATURE FLAG OFF** | After policy provisioning is approved |
| 7 | Subscription management: portal, change, cancel; invoices | `managementDraft.js`, `invoicesDraft.js` exist | **no — “Intentionally unmounted and disabled”** | mock clients only | `VITE_BILLING_MANAGEMENT_API` (off) | no | API `billing-management-draft`, `billing-invoices-draft` pass (mocks) | **SOURCE PRESENT, NOT MOUNTED** | No |
| 8 | Media ingestion / delete | `/customer/assets/**` absent | — | — | `VITE_CUSTOMER_MEDIA_INTAKE_API`, `…_DELETE_API` (off) | no | WEB mocked | **SOURCE ROUTE ABSENT** | No |
| 9 | Media preview and playback | `…/creative-preview`, `…/revisions/:r/assets/:a/preview` (GET/HEAD, range-verified in WEB) | yes | `mediaPreviewStorage` only when the media-storage environment is enabled | none (always on) | n/a | API `campaign-creative-preview.test`; WEB `mediaPreviewClient`/`MediaPreview` tests | **STAGING REVISION NOT VERIFIED** | Yes after revision and storage verified |
| 10 | Social OAuth and connections | `/customer/social/**` absent (only `src/social-contracts/contract.js`) | — | — | `VITE_SOCIAL_ACCOUNTS_API`, `VITE_SOCIAL_PROVIDERS` (off) | **yes (tiktok)** | WEB 102 mocked tests; API contract test | **SOURCE ROUTE ABSENT** | No: the staging flag would show Accounts controls that 404 |
| 11 | Social scheduling, dispatch, publishing, retry | absent (`social-dispatch.v1` contract only) | — | — | same as #10 | yes | — | **SOURCE ROUTE ABSENT** | No |
| 12 | Analytics and insights | `/customer/insights*` absent (`performance-evidence/contract.js` only); per-campaign `GET …/measurements` exists | measurements only | — | `VITE_ANALYTICS_API` (off) | no | WEB `insightsClient.test` | **SOURCE ROUTE ABSENT** | No |
| 13 | Cancellation and billing recovery | customer cancel route not mounted (#7); Stripe checkout and webhook mounted only when `stripeSubscriptionService` is configured by environment; refund/dispute handlers not built | partial | Stripe service from environment (not verified) | n/a | n/a | API Stripe/billing suites 119/119 pass (mock Stripe); refund/credit acceptance: 5 existing pass, 6 required `todo` | **SOURCE PRESENT, NOT MOUNTED** (cancel); refund/dispute **SOURCE ROUTE ABSENT** | Cancel via Stripe dashboard only, in test mode, after approval |
| 14 | Provider-spend protection (£100/month aggregate) | admission inside `withProviderJob` (`provider-spend/dispatch.js`); real image/video providers call `admitProviderDispatch` | n/a | **no worker or spend service is composed by `startServer`**, so a real provider dispatch fails closed (`PROVIDER_ADMISSION_UNAVAILABLE`) on main as composed | n/a | n/a | API `provider-spend.test`, `quoted-worker-admission-hook` pass; PostgreSQL integration not run here | **MOUNTED, SERVICE NOT CONFIGURED** (fail-closed) | Real-provider runs stay blocked until Codex composes and tests it |

**Error-state compatibility (source-verified):** for the routes that are mounted but unconfigured, the Studio maps the exact codes main emits to truthful, non-blaming text: quotes `503 GENERATION_BILLING_UNAVAILABLE` (“nothing was started or charged”), plans `503 COMMERCIAL_CATALOG_UNAVAILABLE` (“plans have not been published yet”), credit preview `503 CREDIT_PREVIEW_UNAVAILABLE`. For the routes that are **absent** (rows 2, 8, 10–12) a `404` would be read by the Studio as “this item is not available to you any more”, which wrongly blames the customer; this is why those flags must stay off for any revision lacking the routes.

**Correction to Closure-15:** features 1, 3, 4, 5, 6 are present in current source (not absent). The three classes that remain genuinely absent are creative-job tracking (#2), media intake (#8), social (#10, #11) and insights (#12), plus the unmounted management/invoices (#7).

## 2. Bounded Codex handover (only what is absent or unconfigured on main; nothing already incorporated is requested)
1. **Compose the quote path in `startServer`** (service, worker, spend service under the reviewed scope) and the approved commercial catalogue/policy injection, each behind explicit activation, with a startup refusal rather than a late 503 when enabled but incomplete.
2. **Creative-job tracking:** either mount `creative-job.v1` routes (`GET /customer/creative-jobs`, `GET /:id`, `POST /:id/attach`, `POST /:id/cancel`) or state which existing contract replaces them so WEB can adapt. Today a confirmed quote has no customer-visible job progress or attach.
3. **Social:** mount OAuth intent/complete, connections, dispatches and social calendar routes (contract versions already named in WEB).
4. **Insights:** mount `/customer/insights` and recommendations (or declare per-campaign `measurements` the launch scope).
5. **Mount management and invoices** only with the approved cancellation policy; refund/dispute handlers (acceptance tests R1–R4) and credit expiry (R5/R6) remain as already requested.
6. **Verify and publish the staging revision** built from `d3ec6c37` or later (image digest, source commit), so flags 1, 3, 4, 9 can be classified beyond STAGING REVISION NOT VERIFIED.
WEB-side decision for the founder/Codex: the staging workflow sets quote, workspace-calendar, customer-media and social flags. **Flags must match the deployed revision**: keep customer-media and social off (and quote off until #1) for any revision that lacks the routes. This is a configuration change in `.github/workflows/studio-staging-release.yml` (a workflow edit, not made here).

## 3. Video frontend acceptance matrix
| Item | Source implementation (WEB) | API source on main | Real integration proven |
|---|---|---|---|
| Submit request, quote, confirm | priced quote then explicit confirm; nothing charged before confirm; stale/insufficient handled | routes present, service not composed (#1) | NO |
| Provider job state | polls creative-jobs (`creative-job.v1`) | **route absent** (#2) | NO |
| Preview delivery and playback | authenticated, range-fetched, byte-verified preview in a video element | route present; storage by environment | NO (an H.264 stand-in is not a generation result) |
| Persisted video playback | requires a stored asset on a verified revision | — | NOT RUN |
| Cancellation and failure | cancel and failed states rendered; failed generation releases credits (API tests) | quote cancel present | NO |
| Usage credits | shown from the quote/ledger; classes 1/2/5/12 are CONDITIONAL, not locked | policy not provisioned | NO |
| Provider-spend protection | not visible to the customer by design | fail-closed admission, not composed (#14) | NO |

## 4. Social frontend acceptance matrix
| Item | Source implementation (WEB) | API source on main | Real platform integration |
|---|---|---|---|
| TikTok OAuth / LinkedIn OAuth | intent, PKCE verifier in the browser, Studio-hosted callback, strict return handling, 49 tests | **absent** | NO (needs DNS `staging-app`, provider registration, redirect constants) |
| Meta / Instagram | listed provider; only offered if named in `VITE_SOCIAL_PROVIDERS`; Instagram preview contract in API source | absent | NO |
| Account status and renewal | connected, needs reconnecting, disconnected with a Reconnect action | absent | NO |
| OAuth callback validation | exact-origin, state/provider/scope/expiry checks, address-bar cleanup | absent | NO |
| Creator-controlled publishing | TikTok “send draft” only; the creator posts it | absent | NO |
| Draft upload vs publication | “uploaded” is always a draft; never shown as published | absent | NO |
| Calendar scheduling | workspace calendar and schedule/unschedule | present (#3, #4) | NOT RUN |
| Error, retry, reconciliation | failed, reconciliation required, cancelled shown; **no retry action exists** (no retry route) | absent | NO |
| Analytics and post performance | behind a flag | absent | NO |
No paid generation, OAuth handshake or social publication was performed or is authorised by this document.
