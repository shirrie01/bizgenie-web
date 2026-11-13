# BG-WEB-LAUNCH-CLOSURE-18 — customer journey, commercial, legal, Stripe, social/video and hosted-acceptance preconditions

13 Nov 2026. API authority `5cd1d774e04fcbfb0745d9bd5c7a0b974cd982f5`; WEB base `df3b95d9…` plus the compatibility gate (PR #83). Source-level only: **nothing was deployed, run on staging, charged, connected or published.** Staging and launch remain NO-GO. This updates the Closure-15/16 documents only where facts changed; the flag-versus-API matrix is `BG_WEB_LAUNCH_CLOSURE_18_FLAG_COMPATIBILITY.md`.

## 1. Fifteen scenarios plus R2: current status
Local = WEB and API unit/component tests run today (API suites for billing, Stripe, quotes, spend, media, video, social, calendar, activation: **378/378 pass** on `5cd1d774`; WEB full suite passes). “Gate” = state under the new compatibility gate in the next staging build (all gated controls OFF: no API revision declared, manifest empty). **Customer acceptance is NOT RUN for every row; no hosted PASS exists.**
| # | Scenario | Local source/test | Exact API contract | Backend capability required | Staging status | Blocker and owner |
|---|---|---|---|---|---|---|
| 1 | Registration, sign-in | WEB auth tests pass | Supabase Auth (not the API) | staging Auth redirect URLs, confirmation setting | NOT RUN | founder test user |
| 2 | Workspace creation | pass | `POST /customer/workspace/bootstrap`, `GET /customer/workspace` | service-role secret on the revision; migrations | NOT RUN | revision and migration evidence: Codex/operator (#245) |
| 3 | Unrelated industry | WEB 6-workspace wording test passes | `GET/PUT /customer/workspace/onboarding` | professional-services enum and CHECK migration | BLOCKED (gate OFF for `VITE_PROFESSIONAL_SECTOR_PERSISTED`) | migration approval: founder/Codex |
| 4 | Onboarding persistence | pass | same | table and RLS | NOT RUN | #245 |
| 5 | Brand Brain persistence | pass | `GET/PUT /customer/workspace/brand-brain` | same | NOT RUN | #245 |
| 6 | Strategy and text | WEB quote/confirm tests pass; API quote adapter and worker-admission tests pass | `POST /customer/generation-quotes`, `…/confirm` | `QUOTED_GENERATION_ENABLED` composition, text profile, policy costs | BLOCKED (gate OFF) | revision verification and composition evidence: Codex/operator |
| 7 | Image and video | WEB/API tests pass (mocked providers) | quotes plus `creative-jobs` | media storage, provider profiles, spend admission (#234), approved costs | BLOCKED | #234, spend approval, video-class evidence: Codex/founder |
| 8 | Job tracking and preview | WEB `CreativeJobResult` and preview tests pass; API creative-jobs and preview routes exist and are bridge-carried | `GET /customer/creative-jobs[/:id]`, `POST …/attach` and `…/cancel`, `…/creative-preview`, `…/assets/:id/preview` | worker, private storage | BLOCKED (gate OFF) | same as 7 |
| 9 | Review and approval | pass | `POST …/review`, `…/approval` | campaign tables | NOT RUN | #245 |
| 10 | Calendar and unschedule | WEB/API calendar tests pass | `GET /customer/calendar`, `POST …/unschedule` | revision ≥ `5cd1d774` | BLOCKED (gate OFF) | revision verification |
| 11 | TikTok/LinkedIn connect | WEB 102 + API connector tests pass (mocks) | `POST /customer/social/oauth-intents`, `…/oauth-complete`; provider callback `GET /customer/social/oauth/callback/:platform` | `SOCIAL_PUBLISHING_ENABLED`, token vault, provider registration, **reachable redirect host** | BLOCKED | callback host not evidenced and **not carried by the bridge**: Codex/operator; provider approvals: founder |
| 12 | Scheduling/publishing state | WEB dispatch states tested | `GET/POST /customer/social/dispatches…` | same | BLOCKED | same |
| 13 | Analytics and learning | WEB client tests pass | `/customer/insights*` | `LEARNING_ENABLED`, social service | BLOCKED (**bridge does not forward insights**) | allow-list decision: Codex |
| 14 | Plan, credits, checkout, cancellation | WEB plan/billing tests pass; API Stripe suites pass | `GET /customer/billing/plans`, `…/subscription`, `…/credit-preview`, `POST /billing/stripe/checkout`; management/invoices **not mounted** | approved catalogue, policy provisioning, Stripe test composition | BLOCKED | founder approvals; management mount: Codex |
| 15 | Foreign-tenant and revoked denial | WEB sends scope only from the session; API isolation tests pass | R2 cases | second tenant identity, existing revoked fixture, app-pool RLS evidence | NOT RUN | founder tokens; #245 |
| R2 | Protected media access | WEB preview range/verify tests pass | preview routes | persisted asset | NOT RUN | needs a real asset (7/8) |
**Customer-visible job state after a confirmed quote:** WEB follows the job through `creative-jobs` (carried by the bridge, mounted on API main); this works only when the quote service and worker are genuinely composed and the gate is verified. It is therefore not asserted for staging. **Draft vs published:** an `uploaded` TikTok dispatch is a draft and never shown as published (tested). **Fixtures:** no named customer fixtures appear in source; sector wording tests pass for six unrelated workspaces.
**Hosted-acceptance preconditions (all NOT MET):** approved staging deployment and verified API revision; WEB/API compatibility entry in the manifest; live migration history and permissions; app-pool RLS and tenant isolation evidence (#245); backup/restore evidence; approved provider-spend policy and estimates (#234); real private media storage; approved Stripe test-mode procedure; authorised TikTok/LinkedIn test accounts; commercial and legal approvals; explicit founder permission per operational test.
**Execution order once preconditions hold:** 1 registration → 2 workspace → 3/4 onboarding, unrelated industry → 5 Brand Brain → 14 plan display → 6 text (credits 1) → 8 preview/approval → 10 calendar → 15 isolation and revocation → R2 media → 7 image then video (spend ceiling, one job each) → Stripe test-mode drill → 11/12 social (founder-owned accounts) → 13 analytics. After each: screenshot, filtered network log (identifiers hashed), API log line; rollback by disabling the build flags and redeploying the previous Pages build.

## 2. Commercial decisions: only what is unresolved
Approved and unchanged: Standard £99/month, 60 monthly credits, £100/month aggregate provider-spend ceiling (internal safety limit, never shown as customer credit). The Studio renders price and credits only from the server catalogue; no value is hard-coded (tested).
| Item | Actual current state | Recommendation | Risk | Needed from founder/adviser |
|---|---|---|---|---|
| VAT | entity VAT status unknown; nothing assumed from any other business | present £99 + VAT only if the contracting entity is registered; otherwise flat | wrong price/invoice | registration status and number; inclusive or exclusive |
| Video classes (5 and 12 credits) | conditional; 4 s, 720p, silent profile in code; **no billing evidence of provider cost** | keep conditional; do not publish class prices | credits mis-recover cost | one approved bounded job's provider billing report |
| Unused credits | **carry over without limit**; the ledger has an `expiry_reset` entry type but nothing writes it (acceptance tests R5/R6 still red on `5cd1d774`) | decide expire vs carry-over before advertising; until decided, the catalogue and terms must say nothing about expiry | stockpiled credits; false “per month” promise | the decision and wording |
| Trial | none approved | confirm “no trial or introductory offer” | accidental coupon | written confirmation |
| Cancellation/refunds | conditional on legal review; period-end cancel, no routine pro-rata refund | adviser confirmation of statutory rights | consumer-law non-compliance | adviser note; consumer vs business customers |
| Catalogue approval record | none | one entry: plan `standard`, version 1, `amount_minor 9900`, GBP, month, `included_credits 60`, tax `{presentation, jurisdiction, wording}`, `policy_id`, `entitlement_codes ["standard"]`, `effective_from`, terms `{version, url, cancellation_url, refund_url}`, approval `{decision, source, approved_at}`; Stripe Price id stays server-side | no catalogue is shown without it | decision id and URL, effective date, the three terms URLs, tax wording |
No live Stripe Price is created and public checkout is not enabled by this document.

## 3. Company and legal facts: one checklist (fields in `site/config.mjs`; `npm run site:check` lists 10)
| Field | Evidence source | Owner | Blocks |
|---|---|---|---|
| Registered legal name; `companyNumber`; `registeredOffice` | certificate of incorporation or verified Companies House record for the **actual contracting entity** (a similar name is not proof) | Founder | public site, terms, catalogue terms |
| `contactEmail`, `privacyContactEmail` | monitored mailboxes | Founder | support path, privacy |
| VAT status/number; ICO status | VAT certificate; ICO reference or “not required” | Founder | price display; privacy |
| `retentionDecision`; `processors` (name and purpose); `internationalTransfers`; `governingLaw` | decision and adviser-approved sentences | Founder/adviser | privacy notice, terms |
| Subscription terms, cancellation and refund pages, product privacy notice | adviser-approved texts at HTTPS URLs | Adviser | catalogue, checkout |
| `legalReviewed: true` | written adviser approval (never set without it) | Adviser | strict build |
| Founder approval to publish; `STAGING_SUPPORT_URL`, `STAGING_TERMS_URL`, `STAGING_PRIVACY_URL`; production Pages equivalents (not inspected) | the approvals and URLs | Founder | publication; footer |
The strict build refuses until every field is supplied; nothing was published or set.

## 4. Stripe test-mode readiness against `5cd1d774`
Local evidence today: billing, Stripe (checkout, Dahlia payload, webhook ingress, production route regression), generation billing, paid-beta, commercial contracts, management and invoice drafts (mocks), provider spend, quoted adapter and worker hook: **all pass**; the first-customer simulation passes; refund/credit acceptance: **5 existing pass, 6 required (`R1–R4` refund/dispute handling, `R5–R6` credit expiry) remain `todo` and red**. The webhook allow-list is still the same seven subscription/invoice events; management and invoice routers remain unmounted. These gaps are not represented as passing.
| Stage | Local | Test-mode |
|---|---|---|
| 1 catalogue ↔ Stripe test Price | pass (mock) | NOT RUN |
| 2 checkout initiation | pass | NOT RUN |
| 3 hosted test checkout | n/a | NOT RUN |
| 4 return and server refresh | pass | NOT RUN |
| 5 signed webhook | pass | NOT RUN |
| 6 idempotent +60 grant | pass | NOT RUN |
| 7 failure and grace | pass | NOT RUN |
| 8 cancellation and renewal | pass | NOT RUN |
| 9 invoices, refund/dispute, messaging | invoices unmounted; refund/dispute **absent** | NOT RUN |
**Approval request for the bounded drill (not performed):** account: the founder-owned Stripe account in **test mode**; tenant: one founder-owned staging tenant and user; credentials: test secret key, test webhook secret and test Price created by the founder, entered only through the approved secret path; money: **zero live charge**, test cards only; expected effects: one subscription, entitlement `active`, exactly one `monthly_grant` of +60, no duplicate on webhook replay, `grace` on the failing card, `cancelled` after cancellation (generation refused); evidence: per-stage record (UTC time, revision, event ids truncated, ledger rows, screenshots); cleanup: cancel the test subscription, delete the test customer, remove the test webhook destination, keep ledger rows as evidence; rollback: switch the checkout gate off and redeploy the previous Pages build; abort if any of: live-mode key detected, price mismatch, second grant, webhook accepted unsigned, revision not the declared one.

## 5. Video, TikTok, LinkedIn, Meta: source readiness versus external acceptance
| Capability | Source and tests today (not platform acceptance) | External acceptance still required |
|---|---|---|
| Video quote/confirm/state | WEB and API tests with mocked providers; fail-closed spend admission on dispatch; media inspection and authenticated range-verified playback tested | approved provider cost (billing report), policy, real storage, one approved paid job: **NOT RUN** |
| TikTok | OAuth intent/callback validation, reconnect, expiry, draft upload (`user.info.basic`, `video.upload`), creator-controlled posting; “uploaded” is a draft; failure states shown | TikTok app review/scopes, domain verification, a reachable redirect host, a founder-owned sandbox account |
| LinkedIn | member-account OIDC (`openid profile w_member_social`), text posting only when a reviewed posting policy is configured; no company-page or media-publishing capability is claimed | LinkedIn app approval for the products used, redirect registration, a founder-owned account |
| Meta/Instagram | preview-contract source only; no automatic video provisioning (prohibited until independently accepted) | none requested |
| Retry | no failed-post retry route exists | decision if required |

## 6. Codex / operator requests (bounded, source-backed)
(a) OAuth callback reachability: the registered staging redirect host is not the bridge origin a deployable Studio must use, and the bridge allow-list has no callback route; evidence which service answers it, or add the redirect relay to the bridge after security review. (b) Decide whether `/customer/insights*` and billing management/invoices should be bridge-carried (they are not today). (c) Optional read-only capability report endpoint (see the flag document). (d) Refund/dispute and credit-expiry implementation remain as already requested (#191); nothing mounted is asked for again.
