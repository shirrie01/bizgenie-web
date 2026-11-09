# BG-STUDIO-021 — frontend ↔ backend handoff

26 October 2026. Staging RED. Launch NO-GO. Verified against bizgenie-api draft PR #217, head `23f49038f36acf8414a079e27a8d5ffc8d302f2b` (read from git). "Integrated locally" = the backend's own routers, a throwaway local PostgreSQL and fixture identity/providers. It is not staging.

## Compatibility matrix

| Area | Route (customer, bearer) | Contract | FE adapter | Harness | Result | Remaining backend need |
|---|---|---|---|---|---|---|
| Workspace calendar | GET `/customer/workspace/calendar` (≤93 days, limit ≤100) | `workspace-calendar.v1` | `workspaceCalendarApiClient.js` | backendDraft | integrated locally | deployment; load/query plan |
| Plan catalogue | GET `/customer/billing/plans` | `commercial-catalog.v1` | `planCatalogueClient.js` | backendDraft | 503 (none approved) and valid case pass | approved catalogue (founder canon) |
| Credit preview (non-binding) | GET `/customer/billing/credit-preview` | `execution-cost-preview.v1` | `creditPreviewClient.js` | backendDraft | integrated locally | none |
| Subscription management | POST portal/change/cancel (Stripe-hosted `confirmation_required`) | draft router | `billingManagementClient.js` | backendDraft (mock Stripe) | router unmounted in app | R8 mount + tenant resolution |
| Invoices | GET `/customer/billing/invoices` | `billing-invoices.v1` (draft) | `fetchInvoices` | backendDraft | integrated locally | mount |
| Binding quote | POST `/customer/generation/quotes` | `generation-quote.v1` | `generationQuoteClient.js` | quoteConfirm | integrated locally | none for contract |
| Confirm / status / cancel | POST confirm; GET/DELETE quote | `generation-quote.v1` | same | quoteConfirm | queued-job semantics, replay, expiry, insufficient credits, cancel all pass | worker dispatch is not wired into the product (see R3) |
| Image / video | quotes with `image.*` / `video.normal|premium` | same | `QuotedGeneration.jsx`, `CreativeStudio.jsx` | quoteConfirm | quote→confirm→worker→attach→approve→authenticated delivery→revocation proven by harness | R3 below |
| Private asset delivery, media approval | authenticated media route | same | `mediaPreviewClient.js` | quoteConfirm | passes locally | product wiring |
| Campaign management | rename, archive/restore, add content item, unschedule | draft | `campaignManagementClient.js` | backendDraft | integrated locally | R1 |
| Manual publication | start/record completed, failed, cancelled | existing | `ManualPublicationPanel` | backendDraft | integrated locally | R1 |
| Tenant authority | owner/member separation | existing | role-gated UI | backendDraft | covered | — |
| Social accounts/publishing | none | proposed | `socialClient.js` (gated, off) | none | BLOCKED | R11 |
| Analytics / Learning | none (only `customer_attestation` measurements) | proposed | `insightsClient.js` (gated, off) | none | BLOCKED | R12 |
| Media library / hybrid UGC+AI | none | proposed | disabled blocker message | none | BLOCKED | R4, R5 |

## Requests (priority order)

* **R1** Customer campaign detail must return `active_schedule_id`, `schedules`, `pending_attempt_id`, `publication_id`, `publications`. Until then the app uses remembered ids plus the calendar; this only works on the same browser. The harness asserts the gap and will flip when fixed.
* **R3** Product wiring: dispatch a worker for confirmed jobs and attach a succeeded output to a content-item revision. The UI currently says results cannot be shown yet ("Finished is not approved and not published").
* **R4/R5** Customer media intake (upload, rights acknowledgement, quarantine, revoke, library) and composition. No arbitrary-URL fetch.
* **R6** Done in #217 (binding quote). Frontend consumes it.
* **R7** Approved plan catalogue (needs founder canon). **R8** Mount and tenant-resolve the management router.
* **R11** Social: OAuth connections, publisher, statuses incl. pending dispatch, cancelled, needs reconciliation; evidence `platform_api` vs customer attestation; no auto-resend of ambiguous publications.
* **R12** Analytics: expose `performance-observation.v1`, `performance-snapshot.v1`, `evidence-recommendation.v1` (observed change only, `causal_claim:false`, customer acceptance required) over routes. The frontend adapter currently targets an earlier proposed shape (`campaign-results.v1`, `learning-insights.v1`) and must be re-aligned to the backend reference models once routes exist; not done in this branch.
* **R10/R13** unchanged from the 020 handoff.

## Activation prerequisites (all separate founder approvals)

Staging isolation (S1; the £1/30-day ceiling is not approved), Stripe test mode, capped provider run, real OAuth review, migration approval, capability flags. Nothing here was activated.
