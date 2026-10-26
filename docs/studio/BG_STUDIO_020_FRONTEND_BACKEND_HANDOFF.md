# BG-STUDIO-020 — frontend/backend handoff (frontend side)

26 October 2026. Written by the frontend agent for Codex (BG-STUDIO-020-BE) and for ChatGPT to record. **Staging RED / launch NO-GO.** Frontend branch `bg-studio-020-fe-integration` (stacked on `bg-studio-019-fe-launch-completion`, draft). Everything here was checked against the backend **source**, not its report: bizgenie-api draft PR #216, head `f8d81bf07977b57496d97db0df75e984bc8c425f` (fetched with git; `docs/studio/BG_STUDIO_019_BACKEND_HANDOFF.md` read, then the routers, schemas and tests it names). No newer backend branch for BG-STUDIO-020 existed when this was written (`git branch -r` showed none), so Codex's later work is **not** covered: re-run `BIZGENIE_API_DIR=<checkout> npx vitest run qa/integration` in the frontend repo against it.

## 1. How the contracts were verified

1. Read each backend route, its zod schema and its tests.
2. Rewrote the frontend adapter to match.
3. **Ran the adapters against the backend's own routers** (opt-in harness `qa/integration/backendDraft.integration.test.js`, 20 tests): real `createApp`, real validation and handlers, the backend's in-memory repositories and its own test fixtures for identity, billing and providers. This is "integrated locally". It is not staging: no database, Stripe or deployed service, and identity is the backend's fixture.

The harness found real mismatches that mocked tests had hidden (section 3). Mocked frontend tests alone were therefore not trusted.

## 2. Compatibility matrix

Legend for status: **MATCHED** (verified against source and run against the real route), **FE FIXED** (a mismatch was found and fixed in the frontend), **BLOCKED** (the backend has no such route; adapter and honest disabled state only), **UNMOUNTED** (code exists in the draft but is not mounted). "Gate" is a build-time flag, strictly `"true"`, default off.

| # | Route | Backend source | Contract | Frontend adapter | Gate | Status |
|---|---|---|---|---|---|---|
| 1 | `GET /customer/calendar` | `src/campaigns/workspaceCalendar.js`, `router.js` | `workspace-calendar.v1` | `workspaceCalendarApiClient.js` | `VITE_WORKSPACE_CALENDAR_API` | **FE FIXED**, run against real route |
| 2 | `GET /customer/billing/plans` | `src/billing/commercialCatalog.js`, `customerRouter.js` | `commercial-catalog.v1` | `planCatalogueClient.js` | `VITE_PLAN_CATALOGUE_API` | **FE FIXED**, run against real route; **no approved catalogue exists (503)** |
| 3 | `GET /customer/billing/subscription` | `customerRouter.js` | existing | `billingClient.js`, `BillingPanel.jsx` | none | MATCHED (unchanged) |
| 4 | `POST /billing/stripe/checkout` | `src/billing/stripe/service.js` (`plan_code: standard\|pro`) | existing | `billingClient.js` `startStandardCheckout({planCode})` | catalogue gate shows plan buttons | MATCHED by source; not run (needs Stripe mock composition) |
| 5 | `POST /customer/billing/management/{portal-session,subscription/change,subscription/cancel}` | `src/billing/stripe/managementDraft.js` | draft, strict | `billingManagementClient.js` | `VITE_BILLING_MANAGEMENT_API` | **UNMOUNTED**; **FE FIXED**, run against the draft router with mock Stripe |
| 6 | `GET /customer/billing/credit-preview` | `customerRouter.js` | `execution-cost-preview.v1` | `creditPreviewClient.js`, `costCheck.js` | `VITE_CREDIT_PREVIEW_API` | **FE FIXED** (was a non-existent POST quote), run against real route; **non-binding** |
| 7 | `POST /customer/campaigns/:id/variants/:v/generate` | `src/campaigns/router.js` `generationBody` (`.strict()`) | existing | `App.jsx` `generateCampaignVariant` | `VITE_GENERATION_QUOTE_API` (quote ids) | MATCHED for the existing body; **quote fields would be rejected (400)** until the backend adds them |
| 8 | `POST /customer/generate-image` | `src/image-generation/{schema,router}.js`, `authentication/customerGenerationBoundary.js` | existing | `creativeProductionClient.js` `startImage` | `VITE_CUSTOMER_MEDIA_API` | **FE FIXED** (rebuilt on the real route), run against real route with a fixture provider |
| 9 | `POST/GET /customer/generate-video[/:id[/poll]]` | `src/video-generation/{schema,router}.js`, `customerVideoStatusBoundary.js` | existing | `startVideo`, `fetchVideo`, `pollVideo` | `VITE_CUSTOMER_MEDIA_API` | **FE FIXED** (GET does not advance a video; POST `/poll` does), run against real route |
| 10 | `PATCH /customer/campaigns/:id`, `POST …/archive`, `…/restore` | `router.js` | existing | `campaignManagementClient.js` | none | MATCHED, run against real routes |
| 11 | `POST …/variants/:v/schedule`, `…/reschedule`, `…/unschedule` | `router.js` (`unschedule` added in the draft) | existing + draft | `App.jsx` `scheduleVariant`, `campaignManagementClient.js` `unscheduleVariant` | none | **FE FIXED** (see finding F1); unschedule run against real route |
| 12 | `POST …/variants/:v/manual-publication[/confirm\|fail\|cancel]` | `router.js` `manualStartBody`, `manualResolutionBody` | existing | `campaignManagementClient.js` `recordManualPublication` | none | **FE FIXED** (finding F1), confirm run against real route |
| 13 | Social accounts, OAuth, publishing queue | none | — | `socialClient.js` | `VITE_SOCIAL_ACCOUNTS_API` | **BLOCKED** (proposed contract, fixtures only) |
| 14 | Campaign results provenance, Learning insights | none (only `…/measurements` customer attestation) | — | `insightsClient.js` | `VITE_ANALYTICS_API` | **BLOCKED** (proposed contract, fixtures only) |
| 15 | Customer media upload, library, private delivery, media approval, hybrid composition | none | — | none (named as unavailable in the UI) | — | **BLOCKED** |

### 2.1 Detail per route (request · response · auth/scope · errors · paging · retry · fixture · staging dependency)

**1 Workspace calendar.**
Request: `tenant_id`, `project_id`, `from`, `to` (ISO 8601 with explicit offset; `from` inclusive, `to` exclusive, strictly increasing, **at most 93 days**), optional `campaign_id`, `platform` (linkedin, instagram, facebook, tiktok, youtube, email, other), `workflow` (draft, review, approved, scheduled, published), `limit` (default 50, **max 100**), `cursor`; unknown keys fail.
Response: `contract_version`, `window`, `display_timezone: "UTC"`, `entries[]` (campaign/content/variant ids and names, `platform`, `placement`, `destination_label`, `workflow`, `occurrence_at`, `occurrence_kind` scheduled|published, `schedule_id`, `publication_id`), `unscheduled[]` (same, nulls), `next_cursor`.
Auth/scope: Bearer; project read; owners and authorised members; foreign scope 404.
Errors: 400 `VALIDATION_ERROR`, 401, 404, 503 `CAMPAIGN_TEMPORARILY_UNAVAILABLE`.
Paging: opaque cursor bound to scope/window/filters; pages individually consistent; undated rows repeated per window and paged after dated rows.
Retry: safe GET. FE: windows ≤93 days run one after another (a 120-day view is two); later windows stop once their dated rows are done; `limit` clamped to 100; fails closed on a missing/other `contract_version`; 503 shown as "temporarily unavailable", never as an empty calendar; keeps `schedule_id` (used by unschedule).
Fixtures: `workspaceCalendarApiClient.test.js` (21), harness (4). Staging: query plan/index/load unknown (backend doc).

**2 Plan catalogue.**
Response: `{contract_version:"commercial-catalog.v1", plans:[{plan_code(standard|pro), plan_version, amount_minor, currency, billing_cadence(month|year), tax{presentation(inclusive|exclusive), jurisdiction, wording}, credit_grant_cadence:"month", included_credits, policy_id, entitlement_codes[], effective_from, effective_to|null, terms{version,url,cancellation_url,refund_url}, approval{decision,source,approved_at}}]}`. Stripe price id is omitted. 401/404; **503 `COMMERCIAL_CATALOG_UNAVAILABLE` until an approved catalogue is injected**.
FE: shows only a catalogue in which every field validates; "Not published yet" for trial, additional usage and renewal (the contract has none); plan label derived from `plan_code`; support line says none is published; current plan marked from the subscription. Source-scan test fails the build if a price figure appears in app source.
**Activation prerequisites:** founder supplies the pricing/terms canon with its reference → Codex injects it → compatible backend deployed → founder approves → set `VITE_PLAN_CATALOGUE_API` and rebuild.

**5 Subscription management (draft, unmounted).** Bodies are strict: `{request_id}` plus `plan_code` for change. Response 201 `{status:"confirmation_required", portal_url (https://billing.stripe.com only), entitlement_confirmed:false}`. Owner only (`billing:checkout`); members and revoked owners 404; no Stripe mapping 404 `STRIPE_BILLING_RESOURCE_NOT_AVAILABLE`; conflict 409; not configured 503. **There is no invoices endpoint** (Stripe's portal holds invoices and receipts). FE: every action opens the Stripe-hosted page; nothing is reported as changed; request id reused on retry; duplicate click guarded; owner-only; gate off = plain text, no buttons.
**Open question for Codex:** the draft reads the tenant through `authorizeTenantRequest(req, …)`; how it resolves the tenant when mounted is not visible. The FE sends `?tenant_id=` (as the other billing routes do) and nothing in the body (the body is strict). Confirm or tell us the real mechanism.

**6 Credit preview.** Query: `tenant_id, project_id, brand_id, execution_class, spend_cap` (all required, strict). Response `execution-cost-preview.v1` with `reserved:false, execution_authorized:false, confirmation_supported:false`. FE labels it "current price, not a locked quote", offers "Generate now" (never "use N credits and generate"), passes the largest spend cap the contract accepts because no cap is enforced at execution, and **refuses to treat a response that claims it reserved or authorised anything**. A binding quote needs R6 below.

**7 Generate (text).** Strict body: `tenant_id, project_id, idempotency_key, expected_campaign_version, execution_mode(ai|human|hybrid), execution_brief?, supplied_assets?[{asset_id uuid, role primary|supporting}]`. The FE never sends quote fields unless a *binding* quote exists (it cannot today).

**8 Image.** Request/response in `creativeProductionClient.js` header (verified against `ImageGenerationRequestSchema`). FE chooses one `execution_id`/`generation_id` pair per attempt and **reuses it for every retry**; a lost connection after sending is "unconfirmed", never "not started"; the returned `asset.location` (a private storage address such as `gs://…`) is dropped in the client and never shown or fetched.

**9 Video.** Same context; `quality normal|premium`, `aspect_ratio 16:9|9:16`, `duration_seconds 4|6|8`, `input_image` or 1–3 `reference_assets` (then 8 s). POST returns 202. **GET reads stored state only; POST `/poll` asks the provider and settles credits** (proved in the harness: five GETs never completed a video). FE polls with POST while in progress and reads with GET on reload.

**10–12 Campaign management and manual publication.** Owner only (`project:write`; members get 404). All mutations send `tenant_id, project_id, idempotency_key, expected_campaign_version`; 409 `VERSION_CONFLICT` is surfaced as "reload". Archive is refused (409) while a time is planned or an attempt is pending (verified). Manual confirm is the customer's attestation; the FE labels it that way.

## 3. Findings from running the adapters against the real routes

| ID | Finding | Frontend action | Backend ask |
|---|---|---|---|
| **F1** | The customer campaign **detail omits** `active_schedule_id`, `schedules`, `pending_attempt_id`, `publication_id`, `publications` (`safeCampaign`/`safeVariant`, `router.js` ~L213–265). 018/019 screens assumed them (mocks had them). Effect in the product: a planned time could not be described, "Prepare manual publication" never opened the record form, a published item showed no record. | Ids returned by the commands (`created_ids.schedule_ids[0]`, `attempt_ids[0]`) are **remembered in the browser** per workspace/campaign/variant (`rememberedFacts.js`, convenience only; the server re-checks every id); schedule id/time also read from the workspace calendar API when on; if neither is known the page says the time cannot be shown here and offers no removal it cannot do exactly. Tests use the real shape. | **R1** |
| F2 | Calendar: the old adapter asked for `limit=200` and a 120-day window; the real route returns 400 for both (harness proves it). | Fixed (windows ≤93 days, limit ≤100). | — |
| F3 | Catalogue path and schema differed entirely from the proposal (path `/customer/billing/plans`; no display name, support contact, trial, additional-usage price, renewal wording or "current" marker; terms are links). | Rewritten; missing items shown as "not published". | R7 |
| F4 | There is no quote endpoint; only a read-only preview. | Preview adapter; quote adapter kept dormant behind its own gate. | R6 |
| F5 | Management draft has no invoices route, returns a Stripe-hosted confirmation (not a "requested" result), and rejects any extra body field. | Rewritten; invoices live in Stripe's portal. | R8 |
| F6 | The finished image/video record carries a private storage address and there is no delivery, approval or upload route. | Created media is reported as "created and stored privately"; never displayed or approved; hybrid named unavailable. | R3–R5 |
| F7 | Video GET does not advance a video. | POST `/poll` loop. | — |
| F8 | OBSERVATION: replaying an image request with the **same ids but a different brief** returned the original job without error (no second charge). | Not relied on; the FE never changes a brief under reused ids. | R10 (clarify intended behaviour) |
| F9 | Generate body is `.strict()`; `quote_id`/`max_credits` would be 400. | Never sent without a binding quote. | R6 |

## 4. Requests for Codex (BG-STUDIO-020-BE), with acceptance tests

| ID | Request | Deterministic acceptance |
|---|---|---|
| **R1** | Add to the customer campaign detail: per variant `active_schedule_id`, `pending_attempt_id`, `publication_id`; per campaign `schedules[]` (`schedule_id, variant_id, scheduled_for, timezone`, active only) and `publications[]` (`publication_id, published_at, publication_url, evidence_kind:"customer_attestation"`, latest correction applied). | Schedule → GET detail shows the id/time; begin manual attempt → GET shows `pending_attempt_id`; confirm → GET shows the publication; member/foreign scope unchanged; the FE harness test "reads the campaign…" is updated to expect the fields. |
| R2 | If R1 is not wanted, a read route listing open manual attempts per campaign. | Same as above via that route. |
| **R3** | Private media delivery: an authenticated, tenant/project/brand-scoped way to view a finished image/video by `generation_id` (short-lived signed URL or streamed bytes), never returning `gs://`/`s3://` addresses. Plus a customer approve/reject route bound to the immutable revision. | Foreign tenant 404; expired URL 403/410; no storage address in any customer response. |
| R4 | Customer asset intake: upload init/complete with rights attestation (who, what, consent), size/MIME/duration inspection, quarantine, retention/deletion policy, list. | Reject over-size/wrong type/unattested; asset unusable until inspected; list is tenant-scoped. |
| R5 | Hybrid composition request referencing inspected asset ids plus AI brief, with execution class and billing. | Cannot reference another tenant's asset; one debit per job; failure releases. |
| **R6** | Durable quote/confirm (TD-STUDIO-BE-003): signed binding quote, bound to job/actor/scope/cap/expiry; `generate`/media routes accept `quote_id`; stale → 409 `QUOTE_EXPIRED`/`QUOTE_CHANGED`; durable execution claim. | Crash-before/after-provider tests; two workers; expiry; changed price; replay. Then the FE sets `VITE_GENERATION_QUOTE_API` (adapter + tests exist). |
| R7 | Mount `GET /customer/billing/plans` with the **approved** catalogue; decide whether display name, support contact, trial, additional-usage and renewal wording belong in the contract (the UI shows "not published" otherwise). | Catalogue from canon; schema tests; 503 when absent. |
| R8 | Mount subscription management with a documented tenant-resolution mechanism; add an effective-date field on the confirmation if available; keep entitlement changes webhook-only. | Owner-only; member 404; mock Stripe; replay idempotency. |
| R10 | State the intended behaviour for an image/video replay with the same ids but a different request (return original, or 409). | Documented test. |
| R11 | Social accounts: `GET /customer/social-accounts`, `POST …/connect`, `POST …/:id/disconnect`; `GET /customer/publishing-queue` (shapes in `socialClient.js`); server-side OAuth callback with state/PKCE, encrypted tokens, scope/expiry tracking, reconnect; publisher worker with per-destination durable identity and reconciliation. | Provider-fake OAuth round trip; token refresh concurrency; `needs_reauth`; ambiguous publish → `needs_reconciliation`, no resend. No live OAuth without separate approval. |
| R12 | Results provenance and ingestion: `GET /customer/campaigns/:id/results` (`campaign-results.v1`, each metric with `source customer_entered\|platform_measured\|estimated`); Learning: `GET /customer/learning/insights`, `POST …/:id/decision` (`learning-insights.v1`, evidence required, owner decides). | A metric without a source is never returned; an insight without evidence is never returned. |
| R13 | Confirm the permission policy for generation and campaign actions for non-owner members (today members get 404 on `project:write`; the FE shows read-only). | Documented matrix. |

## 5. Activation gates (all off by default; none activated)

| Capability | Gate | Prerequisites before the gate may be turned on |
|---|---|---|
| Workspace calendar API | `VITE_WORKSPACE_CALENDAR_API` | #216 calendar deployed to staging; query plan/load evidence; founder approval |
| Plan catalogue | `VITE_PLAN_CATALOGUE_API` | Founder canon; catalogue injected (R7); Stripe mapping approved |
| Subscription management | `VITE_BILLING_MANAGEMENT_API` | Router mounted with tenant resolution (R8); portal configuration; Stripe test-mode review |
| Credit preview | `VITE_CREDIT_PREVIEW_API` | Billing router deployed; informational only |
| Binding quote | `VITE_GENERATION_QUOTE_API` | R6 shipped and reviewed |
| Customer image/video | `VITE_CUSTOMER_MEDIA_API` | Routes activated by the operator; spend caps; R3 for display/approval; separate paid-generation approval |
| Social accounts/publishing | `VITE_SOCIAL_ACCOUNTS_API` | R11; separate integration approval |
| Analytics/Learning | `VITE_ANALYTICS_API` | R12 |
| Professional services persistence | `VITE_PROFESSIONAL_SECTOR_PERSISTED` | Unchanged from 017/018 (key is `professional_services`) |

## 6. Customer-journey acceptance (five industries × owner/member)

Industries: vehicle leasing, professional services, aesthetics, fragrance, beverages. Classes: **M** mock-tested, **C** backend-contract-tested (run against the backend draft routes), **L** integrated locally (frontend + real backend code, in-memory), **S** staging-verified, **F** founder-accepted. **No stage is S or F.** Industry-specific content quality needs the real recommendation backend and is not claimed.

| Stage | Owner | Member | Class | Notes |
|---|---|---|---|---|
| Sign in, workspace choice, return session (reload) | yes | yes | M | five widths; one industry journey spec |
| Onboarding, sector (incl. professional services as inferred) | yes | read-only | M | persistence of `professional_services` is flag-off and backend-blocked |
| Brand Brain | yes | non-identity edits | M | owner/member rules unchanged |
| Strategy / campaign recommendation | yes | — | M | generation quality needs the real backend |
| Campaign create, rename, archive/restore | yes | refused (404) | M, **L** | rename/archive/restore/unschedule run against real routes |
| Text draft → preview → approval | yes | — | M | existing |
| Credit cost check | yes | — | M, **L** (preview) | non-binding |
| Image | yes | read-only | M, **L** | created and stored privately; **cannot be viewed or approved** (R3) |
| Video | yes | read-only | M, **L** | POST/poll proven; same limitation |
| Hybrid UGC + AI | — | — | **BLOCKED** | R4, R5 |
| Schedule / unschedule / manual publication | yes | — | M, **L** | needs R1 to survive a new device |
| Calendar (workspace-wide) | yes | yes | M, **L** | endpoint proven locally |
| Publishing to social | — | — | **BLOCKED** | R11 |
| Analytics / Learning | — | — | M (fixtures) | R12 |
| Plans, billing, management | yes | read-only | M, **C/L** | no approved catalogue |

The five-industry browser spec (owner, 7 sections, 5 widths) is in the default Premium matrix; member behaviour is covered in unit and gates-on specs for one industry. That asymmetry is stated, not hidden.
