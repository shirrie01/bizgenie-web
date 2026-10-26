# BG-STUDIO-020-FE — integrated Premium experience, creative production and launch acceptance (frontend)

26 October 2026. Frontend draft only. **Staging RED. Launch NO-GO.** Nothing was merged, deployed, migrated, activated, paid for, connected or published. The Google Sheets Mission Control was not reachable; section 12 is the evidence handoff for ChatGPT. Contract detail, the compatibility matrix and every request to Codex are in `BG_STUDIO_020_FRONTEND_BACKEND_HANDOFF.md`.

## 1. Executive summary

The main result of this session is not another set of screens: it is that **the frontend adapters were run against the backend's real draft routes for the first time**, and doing so overturned several assumptions that mocked tests had hidden.

* The customer campaign detail does **not** carry the schedule id, the waiting manual-publication attempt or the publication record that the 018/019 screens relied on. Against the real backend, "Prepare manual publication" would never have opened the record form and a planned time could not have been described. Fixed with remembered ids plus the calendar API; the proper fix is a backend change (R1).
* The calendar adapter asked for 200 rows and a 120-day window; the real route refuses both.
* The plan catalogue, the credit "quote" and the subscription-management contracts I had proposed did not match what Codex built (different path and schema; a read-only preview instead of a quote; Stripe-hosted confirmations instead of "requested" results; no invoices route).
* Video does not finish by being read; `POST …/poll` drives it.
* Finished images and videos carry a **private storage address**, and the backend has no delivery, approval or upload route. A finished creative can therefore be created but **not viewed or approved** by the customer yet. The app says exactly that rather than faking a preview.

All adapters were rewritten to the real contracts. A new opt-in harness (20 tests) re-runs them against the backend code. Premium panels are now lazy-loaded, taking the initial JavaScript from 174.7 KB to 150.2 KB gzip. Social accounts/publishing and analytics/Learning Brain have gated, validated adapters and honest views; the backend has none of those routes, so they are **BLOCKED**, not "done".

## 2. Branches, SHAs, PRs and CI

| Item | Value |
|---|---|
| Frontend branch | `bg-studio-020-fe-integration`, stacked on `bg-studio-019-fe-launch-completion` (PR #52, head `1a84bbe`), itself on #51 → #50 → #49 → #48 |
| Tested code SHA | `9aac8dff4c05f0acbaf9bd0ba87ca11a074bad55` (documentation commits after it change only `docs/`) |
| Commits | `f4cd414` reconcile adapters with the backend draft; `0be52e3` lazy-load, social and analytics adapters, unschedule; `9aac8df` real-route findings and integration harness |
| Backend verified against | bizgenie-api draft PR #216 head `f8d81bf07977b57496d97db0df75e984bc8c425f` (matches the head stated in the work order; read from git, not from its report). No BG-STUDIO-020 backend branch existed yet |
| Hosted CI on the tested SHA | CI_RESULT_PLACEHOLDER |
| Draft PR | DRAFT_PR_PLACEHOLDER |

## 3. Five-direction launch checklist

Vocabulary: NOT STARTED / IMPLEMENTED — LOCAL / TESTED — MOCK / BACKEND BLOCKED / INTEGRATION READY / VERIFIED — REAL STAGING / ACCEPTED — FOUNDER. "Run against the real route" means the backend's own router code, in memory, not staging.

| # | Direction | Status | What is true now |
|---|---|---|---|
| A | Pricing and customer terms | **TESTED — MOCK; run against the real route; BACKEND BLOCKED; canon NOT RECOVERED** | Catalogue UI consumes `commercial-catalog.v1` and shows only a fully valid catalogue; the real route answers 503 until Codex is given an approved catalogue, and the app then says plans are not published. No price exists in source (test enforces). Founder must supply the canon |
| B1 | Workspace calendar | **INTEGRATION READY** (against the real draft route locally); staging dependency: deployment, query plan/load | Windows ≤93 days, limit ≤100, cursor paging, no silent truncation, schedule ids kept, 503 ≠ empty, stale responses discarded, old fan-out kept as a labelled, bounded fallback |
| B2 | Subscription management | **TESTED — MOCK; run against the unmounted draft router; BACKEND BLOCKED** | Owner-only Stripe-hosted portal/change/cancel; nothing reported as changed; invoices and receipts are in Stripe's portal (no own invoice list) |
| C | Image, video, hybrid | **Image/video: run against the real routes locally; BACKEND BLOCKED for viewing/approval. Hybrid: BACKEND BLOCKED** | Real request shapes, stable ids for safe retries, honest "created and stored privately", video polling. No preview, approval or composition exists server-side (R3–R5) |
| D | Credit-cost transparency | **Preview: INTEGRATION READY (non-binding). Binding quote: BACKEND BLOCKED** | "Current price, not a locked quote", no reservation claimed; the generate body is strict, so quote ids are never sent. Needs R6 |
| E | Campaign management, manual publication | **INTEGRATION READY** (run against the real routes) with finding F1 | Rename, archive/restore (+ archived list), unschedule, manual completed/failed/cancelled. Survives a new device only after R1 |

## 4. Social accounts and publishing

Backend: nothing (no OAuth, tokens, connected-account store or publisher). Frontend: `socialClient.js` (16 tests) and `PremiumConnections.jsx` (a new "Accounts and publishing" view) built to a proposed contract, off by default. With the gate off the page says nothing is connected, BizGenie does not publish for you, and that manual publication records are the customer's own statement. With it on (fixtures only) it shows connection health, reconnect/disconnect (owner), and a queue where **"Confirmed by the platform" appears only when the server says the platform confirmed it and gave an https post**; failures show their reason code and attempts; an unknown outcome says it will not be re-sent until checked. No OAuth or publishing was attempted. Status: **BACKEND BLOCKED** (R11).

## 5. Image, video and hybrid

Journey today: Campaign → brief (shape, length, quality; Brand Brain and campaign as context) → cost check → one request with stable ids → status → "created and stored privately". **Not possible yet:** preview, revision, approval, calendar attachment of media (R3), customer-owned media and composition (R4–R5). The UI offers only image and video and states why hybrid is unavailable. Nothing is labelled generated unless the server says `completed` with a stored asset; the private address is dropped in the client. No provider is named in app source. All paid operations stay off (`VITE_CUSTOMER_MEDIA_API`).

## 6. Analytics and Learning Brain

Backend stores only customer-entered results. Frontend: `insightsClient.js` (13 tests) and `PremiumInsights.jsx` ("Results and insights"). With the gate off it says BizGenie has measured nothing and learned nothing, and defines the four labels (entered by you / measured by the platform / estimate / AI suggestion). With it on (fixtures) every result row carries its origin; a row without a known origin and a suggestion without evidence are **not shown** (and counted); suggestions are labelled AI and accepting one changes nothing by itself. **BACKEND BLOCKED** (R12).

## 7. Tests

| Check | Result |
|---|---|
| `npx vitest run` (default) | **827 passed**, 20 skipped (the integration harness skips without a backend checkout); 47 files run + 1 skipped |
| Local integration against bizgenie-api PR #216 (`BIZGENIE_API_DIR=… npx vitest run qa/integration`) | **20 passed** (calendar 4, campaign management 3, catalogue/preview 5, management 2, image/video 6) |
| Premium browser matrix, gates off, 1440/1024/768/390/320 | **52 passed at each width** |
| Gates-on browser matrix (plans, member view, cancel via Stripe, portal, preview, image, calendar API, campaign management, accounts, insights), same widths | **10 passed at each width**; axe WCAG 2.x A/AA clean; no horizontal overflow |
| Flag-off: build, app a11y (2), preview contract (5), preview browser (33) at 1440 and 390 | pass |
| Flag-off DOM equivalence vs the 018 snapshots | **identical** (7 captures) |
| Keyboard, focus, reduced motion | native controls and `details`; new views add no animation; not separately audited site-wide. **Real assistive technology, devices and network profiles: NOT TESTED** |

Real defects fixed through testing: label-chip contrast, mobile overflow of a wide table in a grid, an ambiguous accessible name, an in-flight form being unmounted by the first click (lost the error and risked a duplicate paid request), an unknown-outcome image having no safe retry (now "send the same request again" with the same ids).

## 8. Bundle and performance

| | Initial JS (gzip) | Notes |
|---|---|---|
| #49 base | 146,150 B | reference |
| 019 head | 174,656 B (+19.5%) | before this work |
| **This branch, flag off** | **150,151 B** | Premium panels no longer ship to flag-off visitors |
| **This branch, flag on** | **150,177 B** | plus lazy chunks on first use |

Lazy chunks (gzip): PremiumStudio 19,780; PremiumBilling 5,753; CreativeStudio 2,910; PremiumConnections 2,611; PremiumInsights 2,452; ManualPublicationPanel 1,835; GenerateWithQuote 1,720; ScheduleControls 990. CSS 5,035 B. Net: initial JS −24.5 KB (−14.0%) against 019 and +4.0 KB (+2.7%) against #49, which now includes everything added since. Suspense fallbacks are visible "Loading…" statuses. Browser-test timing is unchanged (about 57 s per width). First-navigation timing on real networks was **not measured**.

## 9. Backend dependencies

R1–R13 in the handoff, in priority order: **R1** (ids in the campaign detail), **R3** (private delivery and media approval), **R6** (binding quote), **R7** (approved catalogue), **R8** (mount management), R4/R5 (media intake and hybrid), R11 (social), R12 (results and learning), R10, R13.

## 10. Founder decisions genuinely required

1. Supply the pricing/terms canon with its reference (still the first blocker).
2. Approve R1/R3 as the next backend work, ahead of more frontend screens.
3. Approve paid image/video execution and its spend cap (and whether video is launch-mandatory with image first).
4. Approve code-splitting as shipped, and whether to keep Premium code out of the flag-off bundle (it now is).
5. Decide the rights wording for customer-uploaded media with Legal (R4).
6. Approve a provider-specific social integration review (R11) before any OAuth.

## 11. Mock versus real

Real: the backend's own route code, validation and in-memory repositories for calendar, campaign management, plans, preview, management (mock Stripe) and image/video (fixture providers). Mock: identity, database, Stripe, providers, the browser journeys. Not real anywhere: staging, deployed services, real Stripe test mode, real providers, real OAuth.

## 12. Mission Control reconciliation handoff (no write made)

* Evidence for BG-STUDIO-020-FE against existing rows: branch/SHAs/CI above; the compatibility matrix and R1–R13; the finding that the customer campaign detail omits schedule/attempt/publication ids (affects the 018/019 claims "pending attempt survives reload" and "planned time shown" — both true only for the mocks until R1).
* Correction to a previous report: 019 §4 listed E as "INTEGRATION READY… survives reload"; that holds only on the same browser until R1.
* New debt candidates: private media delivery and media approval absent; image/video replay with a changed brief returns the original job silently (R10); management router unmounted with unclear tenant resolution (R8); binding quote absent (TD-STUDIO-BE-003 unchanged); no list-by-variant for creative jobs (browser remembers ids).
* Write by identifier, not row position.

## 13. Next controlled work sequence

1. Codex: R1, then R3, R7/R8, R6; reply on R10/R13. 2. Frontend: re-run the integration harness on each new backend head; flip the harness expectations for R1 and drop the remembered-id fallbacks only after R1 is deployed. 3. Founder: canon, paid-media and social approvals. 4. Isolated staging only after separate approval: real owner/member two-workspace journeys, Stripe test mode, capped provider run, backup/recovery; then founder acceptance. 5. Remaining frontend: media preview/approval UI after R3, hybrid UI after R4/R5, social UI against the real contract after R11, analytics views against real data after R12, member-role browser matrix for all five industries.
