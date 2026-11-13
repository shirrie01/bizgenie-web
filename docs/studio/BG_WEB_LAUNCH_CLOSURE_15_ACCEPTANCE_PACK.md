# BG-WEB-LAUNCH-CLOSURE-15 — WEB/API contract, acceptance pack and founder sheets

13 Nov 2026. Authority: **accepted API main `16f363e93425e204d744ec5cb6d38391295f2346`** (not any unmerged proposal) and WEB main `dfc69836613ea364720370a9d9c2b7742cf3dcc6`. Source-level only: nothing here is hosted acceptance, legal approval or a price decision. Staging and launch remain NO-GO. Status words: PASS / FAIL / BLOCKED / NOT RUN; local tests and mocks are never counted as hosted or real-provider results.

## 1. WEB ↔ API-main contract (route families the Studio calls)
API main mounts: `/customer/workspace` (+ `/bootstrap`, `/select`, `/brands`, `/brand-brain`), `/customer/workspace/onboarding`, `/customer/campaigns` (list/get/create/patch, `/content-items`, `/calendar`, `/measurements`, variant `generate`, `approval`, `review`, `schedule`, `reschedule`, `preview-renders`, `preview-acknowledgements`, `manual-publication`, `creative-preview`, `assets/:assetId/preview`), `/customer/campaign-recommendations`, `/customer/billing/subscription`, `/billing/stripe/checkout`, and the provider-spend module. **Not on API main** (in the unmerged stack, Codex-owned): the rows marked GAP below. Every GAP feature is behind a default-off WEB build flag, so a WEB build without the flag never calls it.
| WEB feature (flag) | API routes it calls | On API main? | Truthful behaviour today | Owner of gap |
|---|---|---|---|---|
| Onboarding, workspace, Brand Brain | `/customer/workspace*`, `/customer/workspace/onboarding` | YES | live in source | — |
| Campaigns, variants, review, approval, schedule/reschedule, manual publication, measurements, per-campaign calendar | `/customer/campaigns/**` | YES | live in source | — |
| Creative preview and media playback | `…/creative-preview`, `…/revisions/:r/assets/:a/preview` | YES (WEB URL shape verified identical) | live in source | — |
| Subscription status | `GET /customer/billing/subscription` | YES | live in source | — |
| Checkout entry | `POST /billing/stripe/checkout` | YES (gated off, test mode first) | WEB gate off; bridge off | — |
| Priced generation: quote then confirm (`VITE_GENERATION_QUOTE_API`) | `/customer/generation-quotes[/:id/confirm]` | **GAP** | needs the stack; flag off by default | Codex |
| Creative jobs, attach, cancel (`VITE_CUSTOMER_MEDIA_API`) | `/customer/creative-jobs[/:id/attach\|cancel]` | **GAP** | needs the stack | Codex |
| Plan catalogue (`VITE_PLAN_CATALOGUE_API`) | `GET /customer/billing/plans` | **GAP** | screen says plans are not published | Codex (+ founder-approved catalogue) |
| Credit preview (`VITE_CREDIT_PREVIEW_API`) | `GET /customer/billing/credit-preview` | **GAP** | off | Codex |
| Billing management: portal, change, cancel, invoices (`VITE_BILLING_MANAGEMENT_API`) | `/customer/billing/management/*`, `/customer/billing/invoices` | **GAP** | off; cancellation is a Stripe-portal flow once built | Codex |
| Workspace calendar (`VITE_WORKSPACE_CALENDAR_API`) | `GET /customer/calendar` | **GAP** (only the per-campaign calendar exists) | off; “Remove the planned time” needs the calendar’s schedule id, so it never appears on main | Codex |
| Unschedule | `POST …/variants/:v/unschedule` | **GAP** (`schedule`/`reschedule` exist; the command exists in the repository layer but is not exposed over HTTP) | not reachable from the UI on main | Codex |
| Media intake (`VITE_CUSTOMER_MEDIA_INTAKE_API`, delete) | `/customer/assets/**` | **GAP** | off | Codex |
| Social accounts, OAuth, dispatches, social calendar (`VITE_SOCIAL_ACCOUNTS_API`, `VITE_SOCIAL_PROVIDERS`) | `/customer/social/**` | **GAP** | off | Codex |
| Analytics and insights (`VITE_ANALYTICS_API`) | `/customer/insights[/recommendations]` | **GAP** | off | Codex |
The staging workflow turns on quote, workspace calendar, customer media and social (TikTok). **A staging build pointed at an API revision built from API main alone would receive 404 for all four.** The staging API must therefore be built from the integrated stack, or those flags left off. No new backend request is raised beyond what Codex already carries (stack integration); the list above is the exact acceptance target for that integration. Optional, only if Codex implements refund/dispute handling: expose a customer-safe reason for a suspended entitlement so the billing screen can say why (today it says “Your plan access is not active”).

## 2. Hosted customer acceptance pack (the 15 required scenarios)
Columns are separate evidence classes. **Local** = unit/component tests and mocked browser matrices; **Hosted CI** = GitHub Actions on the exact head (generic: PR #79 head `96ba6b78…` 29/29, which runs the mocked/local suites, never a hosted environment); **Staging UI**, **Real provider**, **Customer acceptance** = NOT RUN unless a founder-approved run exists (none).
| # | Scenario | Local evidence (existing) | Hosted CI | Staging UI | Real provider | Customer acceptance | Prerequisite |
|---|---|---|---|---|---|---|---|
| 1 | New customer registers | `src/test/App.auth-gate.test.jsx`, `AuthPanel.test.jsx`, `qa/premium-studio.browser.qa.mjs` (mocked) | generic | NOT RUN | n/a | NOT RUN | staging Auth URLs/redirects |
| 2 | Creates a workspace | `workspaceClient.test.js`, `App.premium.workspaces.test.jsx` | generic | NOT RUN | n/a | NOT RUN | API revision with service-role secret; 15 migrations applied |
| 3 | Selects an unrelated industry (e.g. professional services, takeaway) | `App.premium.test.jsx` (“own sector and no other industry’s wording”, 6 workspaces), `premium-industries.browser.qa.mjs` | generic | NOT RUN | n/a | NOT RUN | professional-services migration |
| 4 | Completes onboarding (persists, reloads) | `onboardingClient.test.js`, `premium-studio.browser.qa.mjs` | generic | NOT RUN | n/a | NOT RUN | stage 2 |
| 5 | Generates strategy and text | `QuotedGeneration.test.jsx` (quote/confirm), App tests | generic | BLOCKED (quote routes are GAP) | NOT RUN | NOT RUN | stack integrated; text provider config |
| 6 | Generates image and video (when authorised) | `QuotedGeneration.test.jsx`, `MediaPreview*.test`, local-real harness with an H.264 **stand-in** (not a provider) | generic | BLOCKED | NOT RUN (needs explicit paid-call approval and the £100/month ceiling enforced) | NOT RUN | stack integrated; ceiling tests passed |
| 7 | Reviews creative (preview, playback) | `CreativePreviewCard.test.jsx`, `mediaPreviewClient.test.js` | generic | NOT RUN | n/a | NOT RUN | persisted asset from step 6 |
| 8 | Adds content to calendar; schedules | `scheduleModel.test.js`, `PremiumWorkspaceCalendar.test.jsx` | generic | BLOCKED (workspace calendar is GAP) | n/a | NOT RUN | stack integrated |
| 9 | Connects a social account (when authorised) | `socialClient.test.js`, `PremiumConnections.test.jsx`, `App.oauthReturn.test.jsx` (mocked OAuth; **not** a provider handshake) | generic | BLOCKED (social routes GAP; DNS + provider registration + redirect constants) | NOT RUN | NOT RUN | founder-owned test account; approvals |
| 10 | Tests publishing workflow (when authorised) | `SendDraftToTikTok.test.jsx` (draft upload only) | generic | BLOCKED | NOT RUN | NOT RUN | step 9; explicit publication approval |
| 11 | Views plan and credits | `PlanCatalogue.target.test.jsx`, `BillingPanel.test.jsx` | generic | BLOCKED (catalogue not approved/injected) | n/a | NOT RUN | approved catalogue |
| 12 | Completes test-mode checkout (when authorised) | `BillingPanel.test.jsx` (19), API Stripe suites on main (mock Stripe) | generic | BLOCKED | NOT RUN (Stripe test mode, no live) | NOT RUN | test keys, Price, webhook destination |
| 13 | Cancels subscription in test mode | API lifecycle tests (mock); WEB billing wording tests | generic | BLOCKED | NOT RUN | NOT RUN | step 12; management routes (GAP) or Stripe dashboard |
| 14 | Cannot access another tenant’s data | WEB sends scope only from the session; API isolation tests; **R2 hosted denial case** | generic | NOT RUN (R2 needs a second tenant identity) | n/a | NOT RUN | founder test JWTs |
| 15 | Cannot regain access after revocation | `membershipClient.test.js`, App session-ended tests; **R2 revoked fixture** | generic | NOT RUN (needs an existing revoked fixture) | n/a | NOT RUN | existing revoked fixture |

## 3. Stripe test-mode journey matrix (no live payments)
| Step | WEB local test | API local test (mock Stripe, main/stack) | Hosted/test-mode run | Dependency |
|---|---|---|---|---|
| Plan catalogue | `planCatalogueClient.test.js`, `PlanCatalogue.target.test.jsx` | stack `commercial-contracts.test.js` | NOT RUN | approved catalogue (Codex injects) |
| Checkout entry | `BillingPanel.test.jsx` | `stripe-billing.test.js` | NOT RUN | test Price, gates on |
| Stripe-hosted checkout | n/a (hosted by Stripe) | n/a | NOT RUN | Stripe test keys |
| Return URL / success state | `BillingPanel.test.jsx` (never trusts the URL; re-reads status) | — | NOT RUN | `STRIPE_*_URL` |
| Webhook ack, duplicate protection | — | `stripe-webhook-ingress.test.js`, lifecycle replay tests (pass) | NOT RUN | webhook destination |
| Entitlement, credit allocation | `BillingPanel.test.jsx` (reads, never grants) | grants once per period (pass) | NOT RUN | — |
| Payment failure | grace wording tests | grace mapping (pass) | NOT RUN | — |
| Cancellation, renewal | wording tests | lifecycle (pass) | NOT RUN | portal/management routes GAP |
| Refund/dispute messaging | refund link only (catalogue `refund_url`) | **handler not built (R1–R4 `todo`)** | NOT RUN | Codex, only if scoped |

## 4. Video and social launch experience (frontend facts)
| Capability | WEB source state | What is NOT proven |
|---|---|---|
| Image/video request | priced quote → explicit confirm → queued job; shows credits, never charges before confirm | any real provider run; a local H.264 clip is a stand-in and proves nothing about generation |
| Video playback | authenticated preview fetched in ranges, every byte verified before it is shown in a video element (`mediaPreviewClient.js`, `MediaPreview.jsx`) | persisted real asset on staging |
| Approval, calendar, schedule | implemented; schedule/reschedule on API main | workspace calendar and unschedule (GAP) |
| Social connect (LinkedIn, TikTok; Instagram/Facebook/YouTube are listed but only providers named in `VITE_SOCIAL_PROVIDERS` are offered) | OAuth UI, Studio-hosted callback (`/customer/social/oauth/callback/<provider>`), states: connected, **needs reconnecting** (expired), **disconnected** (revoked) with a Reconnect action; owner-only | a real provider handshake; “ready” is the server’s own configuration check, not provider approval |
| Publishing status | dispatch list states: queued, claimed, sending, reconciliation required, published, uploaded (a **draft**, never a publication), failed, cancelled; owner can cancel a queued post | automatic LinkedIn publication UI/contract; **no retry action exists** for a failed post (no retry route is on the contract) |
| Analytics visibility | insights client behind `VITE_ANALYTICS_API` | routes are GAP |
No real social publication and no paid generation occurred or is authorised by this work.

## 5. Founder decision sheet — unresolved commercial choices only
Locked or approved items are not repeated: £99/month and 60 credits are the approved target; the £100/month aggregate provider-spend ceiling is approved and is a **provider** limit, separate from customer credits (the WEB screens never show it); video classes 1/2/5/12 are conditional on verification.
| # | Open choice | Status | Needed from founder |
|---|---|---|---|
| 1 | VAT presentation (inclusive vs exclusive) | OPEN | VAT registration status and number, then the presentation |
| 2 | Video class lock (duration, quality, provider cost) | CONDITIONAL | confirmation from one approved bounded job’s billing report |
| 3 | Unused-credit expiry or carry-over, with disclosure | DEFERRED | choice and disclosure wording |
| 4 | Cancellation at period end, no routine pro-rata refund | CONDITIONAL | adviser confirmation of consumer rights |
| 5 | Trial or introductory offer | none offered | confirm “none at launch” |
| 6 | Catalogue approval record (decision id, date, source URL) | NOT GIVEN | approval record for the server catalogue |

## 6. Website/legal checklist with locations and evidence (complements `BG_WEB_LAUNCH_CLOSURE_14.md`)
`npm run site:check` currently reports **10** outstanding items (verified). Edit location is `site/config.mjs` unless stated.
| Field | Owner | Evidence required |
|---|---|---|
| `company.companyNumber`, `company.registeredOffice` | Founder | Companies House record |
| `company.contactEmail` (support), `company.privacyContactEmail` | Founder | monitored mailboxes confirmed |
| `company.retentionDecision` | Founder | decision sentence |
| `company.processors` (name + purpose) | Founder, adviser confirms | processor list and DPAs |
| `company.internationalTransfers`, `company.governingLaw` | Adviser | adviser-approved sentences |
| `company.legalReviewed = true` | Adviser | written approval (never set without it) |
| `SITE_API_URL` (build-time) | Founder/Codex | approved lead route |
| VAT status/number, ICO status | Founder | VAT certificate; ICO reference or “not required” |
| Subscription terms, cancellation page, refund page, product privacy notice | Adviser | approved texts at three HTTPS URLs |
| Publication approval | Founder | explicit approval |
| `STAGING_SUPPORT_URL`, `STAGING_TERMS_URL`, `STAGING_PRIVACY_URL` (GitHub repository variables) | Founder | approved URLs |
| Production Pages project `VITE_SUPPORT_URL`, `VITE_TERMS_URL`, `VITE_PRIVACY_URL` | Founder | Cloudflare Pages settings checked (not inspected here) |
