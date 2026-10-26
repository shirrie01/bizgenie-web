# BG-STUDIO-019-FE — Five mandatory product directions and Premium launch readiness (frontend)

26 October 2026. Frontend draft work only, on `shirrie01/bizgenie-web`. **Staging remains RED. Launch remains NO-GO.** Nothing was merged, deployed, migrated, activated, paid for or published. Every result below is from a mocked API and Supabase (labels: **[M]** mocked/local test, **[CI]** GitHub-hosted CI, **[B]** needs backend work, **[S]** needs real staging). The Google Sheets Mission Control was not readable from this environment; section 14 is the evidence handoff for ChatGPT to record. No second register was created.

## 1. Executive summary

All five directions now have a complete, honest customer experience in the frontend. Where the backend already offers the capability (campaign rename/archive/restore, manual-publication outcomes, scheduling) the screens use the real endpoints and are integration-ready. Where it does not (plan catalogue, subscription changes, workspace calendar endpoint, credit quotes, customer media) the frontend ships a **contract-tested adapter behind a build gate that is off by default**: with the gate off the customer is told plainly that the thing is not available yet, with no dead buttons; with it on, it works against the fixtures. The real integrations are **BACKEND BLOCKED** until Codex ships the contracts in section 11. No price, credit figure, VAT statement, refund or cancellation term is written in the app: all come from the server, and a source-scan test fails the build if a price figure appears in app source.

The launch is still blocked by: the pricing/terms canon (none exists in any source searched), every backend contract below, social OAuth/publishing, analytics and Learning Brain (contracts only, no screens), and all real-staging acceptance.

## 2. Pricing and terms provenance (workstream A, mandatory first action)

Searched, read-only: `bizgenie-web` (all remote branches, `£`/`$`/price literals, billing and docs files, Issues and PR text); `bizgenie-api` (docs, README, billing docs, canon, staging activation docs, branch Markdown); earlier session reports. **Result: no approved pricing, VAT, trial, additional-usage, refund, cancellation or support canon exists in either repository, Issues or earlier reports.** The only related facts found: the backend grants a monthly credit allowance under a policy named `paid-beta-standard-v1` configured outside source control; "No commercial prices are hard-coded" (API README); the Stripe Price/credit mapping is configured outside source control. The Sheet could not be read. **Nothing was invented or inferred.** If the canon exists in Mission Control, the founder must supply it with its reference and it must be served by the catalogue endpoint (section 11, row 1). Founder decision F1.

## 3. Branches, SHAs and CI

| Item | Value |
|---|---|
| Branch | `bg-studio-019-fe-launch-completion`, stacked on `bg-studio-018-fe-premium-completion` (head `0c3078c`) |
| Commits | `ab1dd89` campaign management + calendar (E, B1); `2581a51` credit quote (D); `f5ec4b5` plans + subscription management (A, B2); `a863511` image/video/hybrid (C); `37e0896` gates-on browser QA, CI steps, a11y/overflow fixes; docs commit(s) after `37e0896` change only documentation |
| CI, exact SHA `37e089619914f7a9f7100a38d103e390baebb41c` | dispatched on the branch with `expected_sha`; result recorded in the PR description and updated below when known |
| Draft PR | see PR description (base: `bg-studio-018-fe-premium-completion`) |

## 4. Status checklist (five mandatory directions)

Vocabulary: NOT STARTED / IMPLEMENTED — LOCAL / TESTED — MOCK / BACKEND BLOCKED / INTEGRATION READY / VERIFIED — REAL STAGING / ACCEPTED — FOUNDER. Nothing is VERIFIED — REAL STAGING or ACCEPTED — FOUNDER.

| # | Direction | Status | Evidence |
|---|---|---|---|
| A | Approved pricing and customer terms | **TESTED — MOCK; BACKEND BLOCKED; canon NOT RECOVERED** | `planCatalogueClient` (34 tests) fails closed on any missing price/VAT/terms/support/refund/cancellation field; `PlanCatalogue` shows plan, tier, price, interval, currency, VAT statement, included credits, additional usage, trial, renewal, cancellation, refund, terms version and effective date, support contact; owner-only choose; gate `VITE_PLAN_CATALOGUE_API` off by default (then: "BizGenie has not published plans, prices and terms in the app yet"); source-scan test |
| B1 | Workspace-wide calendar | **TESTED — MOCK; BACKEND BLOCKED** (endpoint); works today on existing per-campaign endpoints | month/week/day, filters, time zones/DST, mobile and keyboard from 018; this work: paging with "Load more" (never silent truncation), drill-down to the campaign, source-aware wording; `GET /customer/calendar` adapter (13 tests) behind `VITE_WORKSPACE_CALENDAR_API` |
| B2 | Subscription management | **TESTED — MOCK; BACKEND BLOCKED** | view/credits/period (existing), compare plans, change plan, cancel with terms shown first, Stripe-hosted payment details and receipts, invoices with Stripe status, recheck, support line; owner-only; a request is reported as **requested**, never as done; request ids reused on retry; duplicate-click guard; no Stripe secret in the browser; gate `VITE_BILLING_MANAGEMENT_API` off by default (then plain text, no buttons) |
| C | Image, video, hybrid creative | **TESTED — MOCK; BACKEND BLOCKED** | `creativeProductionClient` (30 tests) + `CreativeStudio` (14 tests); options (kinds, platforms, shapes, limits, file types) come from the server; brief; hybrid = the customer's own media + AI only (a validation rule prevents relabelling AI-only as hybrid); rights confirmation before upload; direct signed upload (token never sent to storage); queued/running/ready/failed/cancelled/approved states; provenance label on every output; revision request; two-step approval that never says "published"; reload finds the job again; gate `VITE_CUSTOMER_MEDIA_API` off by default |
| D | Credit-cost transparency | **TESTED — MOCK; BACKEND BLOCKED** (quote endpoint) | `generationQuoteClient` (28) + `GenerateWithQuote` (10) + App tests; quote shown with balance, fixed/estimate with maximum, expiry; explicit confirmation; insufficient credits; expired/changed price; duplicate-click guard; network failure; quote debits nothing and calls no provider; generate carries `quote_id`/`max_credits`; 402/503 refusals explained even without quotes; the server stays the only billing authority |
| E | Campaign management and manual-publication recording | **TESTED — MOCK; INTEGRATION READY** (endpoints exist) | new Campaigns view: rename, archive, restore, archived list, confirmations with reason, 401/403/404/409 recovery, consistent list/calendar state; manual publication: completed (https URL, non-future time, optional reference), failed, cancelled (reason), a pending attempt survives reload; wording separates "recorded by you" from "checked by the platform" (never claimed) |

## 5. Extra capabilities

| Capability | Status |
|---|---|
| Social OAuth / connected accounts / publishing | **NOT STARTED in the frontend** by design: no screen is shown that implies a connection. Contract and journey in section 11. No OAuth or publishing was attempted |
| Autonomous scheduling and publishing | Planned time can be set (existing endpoints, TESTED — MOCK). Automatic publishing **NOT STARTED**; the app says publication is manual |
| Analytics provenance | Customer-entered results exist and are labelled as such. Platform-measured, estimated and AI-recommended categories are **contract only** (section 11); nothing implies measured data |
| Learning Brain | **NOT STARTED**; no screen claims learning |

## 6. What a customer can now do, honestly

Sign in and choose a workspace; set up and keep a Brand Brain (owner/member rules unchanged); create, rename, archive and restore campaigns; check the cost of a draft, confirm it, and generate; schedule a planned time; prepare a manual publication and record that it was published, failed or was cancelled with date, platform reference and note; see everything on one calendar; read plans and terms and manage a subscription **when the server provides them**; create image, video and hybrid creative **when the server provides it**. The disabled "Hybrid — coming next" option in the Premium execution mode now points to the creative panel; the flag-off app is unchanged.

## 7. Security and billing risks

* No browser-side Stripe secret exists. Checkout, portal, change and cancel are server calls; portal and checkout URLs must be https or are refused. The browser never decides ownership; it hides controls for non-owners and the server must 403.
* A cancel/change "requested" answer is not an entitlement change. The UI says so and offers a recheck; the entitlement the backend reports is the only truth.
* Retried requests reuse their idempotency key; a connection failure after a send is reported as **unconfirmed**, never as "not done".
* Quotes must be single-use, tenant-scoped and short-lived server side; a stale quote must 409 (`QUOTE_EXPIRED`/`QUOTE_CHANGED`). Risk if the backend does not re-price on generate: a customer could be charged differently from the quote. Handoff rows require it.
* Uploaded media needs server-side malware/content checks, type sniffing, size limits and rights recording; the browser check is convenience only.
* Job and asset ids are unguessable but must still be tenant-checked server side. Output URLs must be short-lived signed https.
* The remembered creative job id is kept in browser storage per tenant and variant as a convenience only; clearing storage loses only the shortcut (a list-by-variant endpoint is requested).

## 8. Mock versus real

Everything is mock. Real: nothing was sent to Stripe, Supabase, the backend or a provider. Unit tests use injected fetch; browser tests intercept `api.test` and `supabase.test`; fixture prices (`£11.11`, `£22.22`) are deliberately implausible test values.

## 9. Tests

| Check | Result |
|---|---|
| `npx vitest run` | **736 passed**, 42 files [M] (526 at 018) |
| Premium browser matrix, gates off, 1440/1024/768/390/320 | **52 passed at each width** [M] |
| Gates-on browser matrix, same widths (new `qa/premium-gates.gates.qa.mjs`): owner plans + Stripe checkout with plan code, member read-only plans, cancel "requested" + invoices, quote then generate with `quote_id`, image creative end to end incl. approval and reload, campaign rename + archive | **6 passed at each width** [M]; axe WCAG 2.x A/AA clean, no horizontal overflow |
| Real defects found by this QA and fixed | `.ps-chip` contrast failure (own `.ps-tag`); 320/390 px overflow from a wide table in a grid (`minmax(0,1fr)`); an ambiguous accessible name ("Brief") |
| Flag-off regression: build, app a11y (2), preview contract (5), preview browser (33) at 1440 and 390 px | pass [M] |
| Flag-off DOM equivalence against the 018 snapshots (signed-out, unconfigured, scope-missing, ready, brain, recommendation, campaign) | **byte-identical** [M] |
| Bundle JS gzip | #49 146,150 → 018 155,749 → **175,965 B** (+20,216 vs 018; +20.4% vs #49; raw 638,967 B); CSS gzip 5,054 B. No lazy loading yet; Premium code ships to flag-off visitors. Recommend code-splitting Premium before launch |
| Five industries × owner/member | the five-industry spec runs in the 52 at all widths; owner/member covered in unit and browser specs. Industry-specific **generation quality** needs the real backend [S] |
| Reduced motion | calendar and new components add no animation; site-wide audit not done. Real assistive technology, real devices, network profiles: **NOT TESTED** |
| GitHub CI on the exact SHA | see section 3 |

## 10. Premium and flag behaviour

All new capability gates are build-time, strictly `"true"`, default off: `VITE_PLAN_CATALOGUE_API`, `VITE_BILLING_MANAGEMENT_API`, `VITE_WORKSPACE_CALENDAR_API`, `VITE_GENERATION_QUOTE_API`, `VITE_CUSTOMER_MEDIA_API`. Rollback of any one is unsetting it and rebuilding. Activation requires its backend contract to be deployed and founder approval; none was activated.

## 11. Dependency handoff for Codex (backend)

Format per row: existing capability · missing · proposed contract · authz/tenancy · idempotency/retry · FE state · deterministic acceptance tests · real staging acceptance.

1. **Plan catalogue and terms.** Existing: Checkout start; a configured Stripe Price mapping outside source. Missing: any catalogue. Contract: `GET /billing/plans?tenant_id` → `{ catalogue_version, effective_from, currency, vat{treatment,text}, terms{version,effective_from,url}, support{email|url,hours}, plans[{plan_code,name,tier,summary?,price{amount_minor,currency,interval},included_credits,additional_usage{text},trial?{days,conditions?},renewal{text},cancellation{text},refund{text},current}] }`; content owned by the approved canon, not code. Authz: any member of the tenant may read; `current` reflects the tenant's plan. Retry: safe GET. FE: `PlanCatalogue`, fails closed. Tests: schema validation, currency consistency, tenant isolation, unknown plan code at checkout refused. Staging: Stripe test mode, founder-approved prices.
2. **Checkout with plan.** Existing: `POST /billing/stripe/checkout`. Missing: `plan_code` honoured beyond "standard". Contract: validate `plan_code` against the catalogue; owner only. Idempotent on `request_id`. FE already sends `plan_code`. Tests: non-owner 403, unknown plan 422, replay returns same session. Staging: test-mode checkout per plan.
3. **Subscription management.** Missing: `POST /billing/portal-session`, `POST /billing/subscription/change`, `POST /billing/subscription/cancel`, `GET /customer/billing/invoices` (bodies in `billingManagementClient.js`). Authz: tenant owner only; 403/404 otherwise. Idempotency: `request_id`, replay returns the first answer. Webhook-confirmed entitlement is the only source of plan change; answers are "requested". Tests: owner/member, replay, conflicting in-flight 409, proration/effective-date fields, invoice fields incl. `receipt_url` null. Staging: Stripe test clock.
4. **Workspace calendar.** Existing: per-campaign `…/calendar`. Missing: `GET /customer/calendar?tenant_id&project_id&from&to[&campaign_id][&platform][&workflow][&cursor][&limit]` → `{window, entries[], unscheduled[], next_cursor}` (spec at the top of `workspaceCalendarApiClient.js`). Tenant/project scoping, archived excluded, `from` inclusive `to` exclusive, cursor stable under writes. Tests: two campaigns, isolation, reversed window 400, pagination, archived excluded.
5. **Credit quote.** Existing: server-side execution classes and 402/503. Missing: `POST /customer/generation-quotes` (see `generationQuoteClient.js`); generate must accept `quote_id` + `max_credits` and re-price (409 on mismatch). Quote debits nothing, calls no provider, expires, single use, idempotent. Tests: expiry, changed policy, insufficient, replay, no ledger write on quote.
6. **Customer media.** Existing: hybrid + `supplied_assets` for text; image/video routes admin-only. Missing: capabilities, asset list/upload/complete, creative jobs (create/get/revision/approval) — all in `creativeProductionClient.js` header. Authz: editors/owners create; members read; tenant+project+brand scope; rights confirmation stored; signed https upload with content-type and size enforcement and malware scan. Idempotency keys on every write. Provider spend only after quote confirmation, reservation then debit on success/release on failure. Tests: provider fake, failure releases credits, hybrid requires ≥1 owned asset, non-owned asset id refused, output URL signed. Staging: capped, separately approved.
7. **Job list by variant** (so reload does not depend on browser storage): `GET /customer/campaigns/{id}/variants/{v}/creative-jobs`.
8. **Campaign management and manual publication.** Existing and used: PATCH rename, archive/restore, schedule/reschedule, manual-publication confirm/fail/cancel. Missing: none for the screens. Staging acceptance: F-series on a real tenant, incl. archive-blocked-while-scheduled 409 wording.
9. **Social OAuth and publishing.** Missing entirely. Proposed: `GET /customer/social-accounts`, `POST /customer/social-accounts/{provider}/connect` (returns provider authorize URL, state bound to tenant+user, PKCE), callback handled server side, `DELETE …/{id}`; status values `connected|needs_reauth|revoked|error`; publish via a scheduled job with retry/dead-letter and a `publication_result` carrying `platform_post_id`/`platform_url` and `verified_by: platform`. Frontend journey (not built): Connect → provider consent → return → account shown with health → select per variant destination. Separate integration approval required; no live OAuth in this work.
10. **Analytics provenance.** Proposed `GET /customer/campaigns/{id}/results` returning each metric with `source: customer_entered | platform_measured | estimated | ai_recommendation`, `observed_at`, `method`. UI rule: never show a platform-measured badge without `platform_measured`.
11. **Learning Brain.** Proposed read-only `GET /customer/learning/insights` with evidence references and confidence; every insight links to its results; nothing is applied to the Brand Brain without owner approval.

## 12. Founder decisions required

F1 supply the pricing/terms canon with its reference (or confirm none exists). F2 approve the section 11 contracts for Codex. F3 approve creating the customer media endpoints (paid provider execution; spend caps). F4 decide whether hybrid is launch-mandatory with video, or image first. F5 approve code-splitting Premium (bundle +20%). F6 decide the rights wording for uploaded media with Legal.

## 13. Recommended Codex tasks (in order)

1. Catalogue + checkout plan code (rows 1–2). 2. Quote + re-price on generate (5). 3. Workspace calendar (4). 4. Subscription management via Stripe (3). 5. Customer media and jobs (6–7). 6. Social OAuth (9). 7. Results provenance and Learning (10–11). Each with the deterministic tests listed, then a real-staging acceptance under a separate approval.

## 14. Mission Control reconciliation handoff (no write made)

* Record against existing rows (no duplicates): BG-STUDIO-019-FE draft branch `bg-studio-019-fe-launch-completion`, commits above, CI run and unit/browser totals from section 9.
* Direction statuses as in section 4; DEC-025 workspace calendar: frontend adapter exists, endpoint BLOCKED.
* New debt candidates: Premium bundle +20% with no code splitting; remembered creative job id in browser storage until a list endpoint exists; platform-measured analytics unlabelled until provenance contract.
* Write by identifier, not row position.

## 15. Launch-critical remaining work

Pricing canon; backend contracts 1–11; real Stripe test-mode, Supabase and provider-capped staging acceptance (F-series, D23-1–5, plus new: plan choice, cancel, quote, creative, archive); social OAuth/publishing; analytics provenance; Learning Brain; real-device and assistive-technology testing; Premium code splitting; infrastructure items from BG-STUDIO-016 (shared service-role secret, production identity, restore test); founder acceptance of every capability. **Staging RED; launch NO-GO.**
