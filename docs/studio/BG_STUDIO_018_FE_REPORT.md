# BG-STUDIO-018-FE — Premium customer experience, commercial readiness and frontend completion

25 October 2026. **Frontend CI green on the tested code SHA below. Staging RED. Launch NO-GO.** This is engineering evidence for the sole Google Sheets Mission Control (DEC-015), not a second register. Every browser and unit result below uses a **mocked** API and Supabase. Nothing was merged, deployed, migrated or activated; no paid provider, Stripe, social account or real publication was touched.

Evidence classes: **[M]** local mocked test · **[C]** backend contract read from code · **[CI]** GitHub-hosted run on the exact SHA · **[B]** backend-dependent · **[S]** real staging verification required · **[—]** not implemented.

## 1. Executive summary

* Added a **workspace-wide calendar** (month, week, day; campaign, channel and status filters; stated time zone and period; clash notes; a "not yet scheduled" list; customer-initiated refresh and period loading). It is assembled from the **existing** campaign endpoints for the most recently updated campaigns, capped and labelled, because the backend has no workspace endpoint yet. The campaign-level calendar stays available and labelled.
* Added the first way to **create what the calendar shows**: a **planned publication time** for approved content, through the backend's existing `schedule`/`reschedule` endpoints (previously unused by the frontend). It records a plan; BizGenie still does not publish.
* Added a **voice, positioning and strategy editor** to the Brand tab for the large part of the existing Brand Brain schema the screen never exposed (voice, mission/vision/values, audience insight, offer and claims, competitors, visual style), saved by the same read-latest-then-apply-only-edits path, never touching the owner-only name and description.
* **Aligned the professional-services sector key with the backend contract** (`professional_services`, not `professional`). Still not persisted; the flag stays off.
* Billing: customer-initiated **Check again** after a failed lookup, and the backend-proposed wording for it. A 401 on the campaign list now reports an ended session.
* Found and fixed, before release, a 320 px overflow from the native date-time input.
* Local totals on the final code SHA: **526 unit tests, 52 browser tests at each of five widths, axe clean, flag-off CI jobs pass** (section 11). GitHub CI: see section 3.
* **Not done and not claimed:** real staging, a workspace calendar endpoint, billing management, pricing, social connections, image/video/hybrid UGC creation UI, analytics beyond manual results, Learning Brain (section 9).

## 2. Canonical reconciliation (verified before editing)

| Item | Result |
|---|---|
| Frontend `main` | `e9e5a1f4f208787248fc9dd18ee8f5df1c60d05a`, unchanged |
| #48 / #49 | `7fe2bcc15f489b32fc7e80ffd2e0fc9ab24b7645` / `6c8e7b6bb68aee83843f567b5ba4dea84f3a0a1b`, unchanged, draft |
| #50 (base #49) | head `f25c1f3d271e4f8c13943bef5d590c2c39bf467c` (code `5dab6cc9…`), unchanged since the handover |
| Backend `main` / #213 / #214 / #215 | `ddcc26cb…` / `120a874d…` / `51e8ca49…` / `e84c6d0e…`, unchanged, draft |
| **New since the handover** | Backend branch `dec-023-backend-contract-support` (tested code `f8a7dba0bb97accdc23c04bf68805990d0672c6f`, docs head `6279832d3e424613c220c1ffab88ace068960dec`), no PR; and Codex's `bg-studio-016-staging-isolation-recovery` (`ed336e15…`), S1 documentation only |
| Backend DEC-023 contract | Read in full. Key facts: proposed key is **`professional_services`**; the calendar endpoint is per campaign, `from` inclusive / `to` exclusive, with a new 400 for reversed or equal windows; entries carry only ids, workflow and time; no price, currency or `payment_verified` in any billing DTO; no pricing canon found by Codex either |
| Issues | #191 read to its latest comment (BG-STUDIO-016 reconciliation, 24 Oct 22:09); #128 and #197 were **not** re-read in this pass |
| Mission Control (Google Sheet) | Not reachable from this environment. DEC-023/024/025 are taken from the work order and from the backend branch's own record, not read from the sheet |

Nothing newer superseded the handover. One correction came from the new backend evidence: my earlier `professional` key would have been rejected; it is now `professional_services`.

## 3. Branches, SHAs and CI

Dependency chain: `main` ← … ← #47 ← #48 ← #49 ← #50 (`bg-studio-017-fe-acceptance`) ← **`bg-studio-018-fe-premium-completion`** (this work, draft PR stacked on #50).

| Commit | SHA | Contents |
|---|---|---|
| Code 1 | `15204383ccd4ac87350f2561b054f02e9d94c2e6` | workspace calendar, key alignment, billing recheck, list-401 |
| Code 2 | `c47a4f3003ab5d095a87cf5746817881c0d8b675` | Brand voice/strategy editor |
| Test | `48e129efaa06376e3789dec7b3a91d2f7a94236d` | keyboard-only calendar test |
| **Code 3 (tested code SHA)** | **`7d2bfbb82486f7369da76a6cb0e04070aec1bda2`** | planned publication time, 320 px fix |
| Documentation | the commit that adds this file | documentation only, **not** re-run |

GitHub CI (`Studio 005 integration CI`, dispatched on this branch so the Premium jobs run, with `expected_sha`): run 31 (`15204383`) success, [run 32](https://github.com/shirrie01/bizgenie-web/actions/runs/40199853340) (`c47a4f30`) success, [run 33](https://github.com/shirrie01/bizgenie-web/actions/runs/40200393170) (`48e129ef`) success, and **[run 34](https://github.com/shirrie01/bizgenie-web/actions/runs/40202696256) on the tested code SHA `7d2bfbb82486f7369da76a6cb0e04070aec1bda2`: success** (all jobs of the 13-job workflow, dispatched with `expected_sha` and the workflow file taken from this branch). Each is the 13-job set: unit-build, flag-off app a11y ×4 widths, preview browser ×4, Premium browser ×4 (1440, 768, 390, 320).

## 4. Completed frontend improvements

| Area | Change | Evidence |
|---|---|---|
| Workspace calendar | `workspaceCalendarModel.js`, `workspaceCalendarClient.js`, `PremiumWorkspaceCalendar.jsx`, wired in `PremiumStudio.jsx`/`App.jsx`. Default view of the Calendar tab; **This campaign** keeps the earlier view | 17 + 11 unit tests, 4 App tests, browser journeys, axe, keyboard-only test [M] |
| Planned publication time | `scheduleModel.js` (time-zone and clock-change safe), `ScheduleControls.jsx`, `scheduleVariant` in `App.jsx`; Premium Studio only; manual publication now also allowed for a scheduled item | 7 model + 4 App tests, 1 flag-off absence assertion, 1 browser journey [M] |
| Brand voice and strategy | `PremiumBrandStrategy.jsx`, extended-field registry in `brainClient.js` (limits mirror the backend schema) | 4 + 6 unit, 2 App tests, 1 browser test [M] |
| Sector | `professional_services` key, gate unchanged (`VITE_PROFESSIONAL_SECTOR_PERSISTED`, default off) | unit and browser [M] |
| Billing | **Check again** on a failed lookup; "We can't check your subscription right now. Please try again." | 1 unit test [M] |
| Session | 401 on the campaign list and on scheduling now shows **Sign in again** | unit [M] |
| Industries | Fragrance added to the cross-industry browser spec (now leasing, professional services, aesthetics, fragrance, drinks, all seven sections, five widths) | browser [M] |

**Flag-off behaviour** is unchanged: the earlier DOM-equivalence harness (seven states) matches the #49 baseline everywhere except the billing panel, which is the DEC-023 change in a shared component, plus a flag-off assertion that no scheduling control appears. The Premium code is, as before, in the same bundle for both modes (section 11).

## 5. Workspace calendar: architecture and the backend contract it needs

**What exists [C]:** `GET /customer/campaigns` (summaries), `GET /customer/campaigns/:id` (items, variants with platform, placement, destination label, workflow, and schedules), `GET /customer/campaigns/:id/calendar` (scheduled and published occurrences only; drafts are not returned).

**What the frontend does:** reads the (up to) eight most recently updated unarchived campaigns, three at a time; for each the document and the calendar for an explicit window (the visible month plus a week either side), joins them, shows dated items on their day in the stated time zone (the viewer's), and lists undated items under "Not yet scheduled". A failed campaign is named while the rest are shown; a 401 stops with **Sign in again**; a late answer from a previous workspace is discarded. Empty days in an unloaded period are never shown as empty (an explicit "Load this period" appears).

**Limitations it states to the customer:** only the most recently updated campaigns are read (the cap is shown); the API gives no channel or title on entries, so these come from the campaign document; clashes are detected only among items in hand.

**Proposed endpoint for Codex (not assumed to exist):**

```
GET /customer/calendar?tenant_id&project_id&from&to[&campaign_id][&platform][&workflow][&cursor][&limit]
200 { window: { from, to }, display_timezone, entries: [ {
  campaign_id, campaign_name, content_item_id, content_item_name, format,
  variant_id, platform, placement, destination_label, workflow,
  occurrence_at, occurrence_kind: "scheduled" | "published", schedule_id | publication_id } ],
  unscheduled: [ { campaign_id, content_item_id, variant_id, workflow, platform, destination_label } ],
  next_cursor }
```

Semantics: authorised project read; `from` inclusive, `to` exclusive, ISO 8601 with offset, `from < to` (as the new campaign validation); ordered by `occurrence_at` then `variant_id`; archived campaigns and items excluded; a maximum window length and a page size stated by the backend; one query for all campaigns (the current per-campaign read loads the project history each time, so the fan-out multiplies cost). Acceptance: an item scheduled in campaign A and one in B both appear; a foreign tenant's never does; a reversed window is 400; pagination is stable. When it exists, only `workspaceCalendarClient.js` changes.

## 6. Billing and subscription

**Frontend states built on the real API [C][M]:** loading; lookup failed (with **Check again**, checkout blocked); not subscribed (checkout offered; Stripe shows the price and terms); active; grace (with end date); cancel pending (with the date access ends); cancelled; inactive (checkout offered again); return from Stripe without an entitlement ("not active yet… do not pay again", **Check again**); checkout cancelled. Access, credits included, credits available and the period come only from `GET /customer/billing/subscription`. A redirect is never proof of payment, and the page says it is not a payment receipt.

**Prices and terms:** none shown or assumed (no £99/£149/£199 or any figure). The canon was not found in either repository, in issues, or by Codex; it must be supplied with its source.

**Proposed UX and API for what does not exist (no screen was built, so there are no dead buttons):**

| Capability | Customer experience proposed | Backend requirement (not assumed) |
|---|---|---|
| Plan catalogue | Read-only plans with approved price, currency, cadence, tax wording and credit allowance, each with its source version | `GET /billing/plans`: server-owned list, no keys; present only after the canon is supplied |
| Change plan | Owner-only; shows the effect and date before confirming; result shown only after the entitlement changes | `POST /billing/subscription/change` returning a Stripe-hosted confirmation or an updated entitlement |
| Cancel | Owner-only; states the end date from `cancellation_effective_at`; never "refund" unless approved wording exists | `POST /billing/subscription/cancel` (idempotent), webhook-confirmed |
| Billing details, invoices, receipts | A single "Manage billing" action to Stripe's customer portal | `POST /billing/portal-session` returning a short-lived https URL for the tenant owner |
| Support | An approved support address or form | A decision, not an API |
| Cancellation and refund terms | A link to the approved text | The canon and a stable URL |

## 7. Brand Brain and strategy

* Owner-only identity is unchanged and re-tested (DEC-021/022): a member's save repeats the stored name and description exactly and keeps every other field; a refused write keeps what was typed.
* The new editor covers voice, positioning, mission, vision, values, audience insight, offer and claims, competitors and visual style, with the backend's limits, removal warnings, and "written by you, not checked by BizGenie, not a measured result" wording. No Learning Brain insight is claimed anywhere.
* **Not built:** a revision history or approval workflow screen (the backend exposes only `metadata.version` and `status` to this app); editing the name or description by a member (correctly refused); clearing the legacy four fields (unchanged).

## 8. Content creation, hybrid and publishing: what a customer can really do

| Step | Status |
|---|---|
| Campaign recommendation from a goal | Implemented, calls the backend; the content is generated server-side, so industry fit of real output is **[S]** |
| Create campaign and content items | Implemented [M], [S] |
| Text draft ("Generate draft") | Implemented, calls the real generation endpoint, which may use a paid provider and credits. **The screen does not show a credit cost before generating** — a gap; it needs a cost preview contract (section 12). Not executed here |
| Preview, acknowledge, approve | Implemented [M], [S] |
| **Planned publication time** | **New**, implemented [M], backend endpoints exist [C], [S] |
| Image / video generation | **No customer UI.** Backend routers exist but no frontend integration; paid; not triggered |
| Media preview of attached assets | Implemented against #208-chain contracts [M], [B], [S] |
| Hybrid UGC + AI | **Not implemented.** The Execution mode shows a **disabled** "Hybrid — … add-media picker coming next" option (shared with the flag-off app) — a visible promise, flagged for the founder |
| Manual publication and confirmation | Implemented [M]; "I published" records evidence, not a publication |
| Manual publication failure/cancel, campaign archive/restore, rename | Backend endpoints exist [C]; **no frontend UI** |
| Results | Customer-entered results only; labelled as such |

## 9. Publishing, integrations, analytics and learning: classification

| Feature | Class |
|---|---|
| Sign-in, session expiry recovery, workspace chooser and switching | Implemented and locally tested; [S] |
| Persistent onboarding | Implemented and locally tested; [B] (#213 migrations); [S] |
| Professional-services persistence | [B]: enum, CHECK, preflight contract, migration, deployment sequence not approved; flag off |
| Brand Brain (core and extended) with owner/member rules | Implemented and locally tested; [S] (F-08d/e) |
| Workspace-wide calendar | Implemented and locally tested on existing endpoints; efficient endpoint [B]; [S] |
| Scheduling a planned time | Implemented and locally tested; [S] |
| Subscription display, checkout start, delayed-confirmation recheck | Implemented and locally tested; [S] (real Stripe test mode, with approval) |
| Billing management, plan catalogue, price display | [B] and a pricing canon decision; **not implemented** |
| Social account connection (OAuth) | **Not implemented** in frontend or backend (no module in `src/`) |
| Automatic scheduled publishing, publishing retry | **Not implemented**: publishing is manual by design today |
| Analytics beyond customer-entered results; recommendations from results | **Not implemented** (backend engagement-intelligence work is a WIP draft) |
| Learning Brain | **Not implemented** in this app; nothing here implies it |
| Image/video generation UI; hybrid UGC | **Not implemented** in the frontend |

## 10. Multi-industry and first-session journeys

* **Five industries** (vehicle leasing, professional services, aesthetics, fragrance, drinks), seven sections each, five widths: own name, no other business's name, description or sector language, "Fonzo" only for the drinks business actually named Fonzo, no overflow, axe clean [M]. Professional services shows its own guidance labelled "Inferred from what you typed" until the backend accepts the key. Strategy and campaign wording from the real recommendation endpoint cannot be judged without it [S].
* **Journeys [M]:** returning customer chooses a workspace, sees its campaign and calendar, reloads and resumes the same workspace; **switching workspace while the first workspace's calendar is still loading never shows the first workspace in the second**; owner Brand-tab save keeps the confirmed identity and survives a reload; approved content gets a planned time that appears in the all-campaigns calendar with nothing published; keyboard-only calendar operation with a visible focus indicator. Owner/member behaviour is covered by the 36 earlier specs plus the new tests above.

## 11. Accessibility, responsiveness, performance and test totals

| Check | Result |
|---|---|
| `npx vitest run` | **526 passed**, 33 files [M] |
| Premium browser matrix (production build, flag on) at 1440, 1024, 768, 390, 320 px | **52 passed at each width** [M] |
| axe-core WCAG 2.0/2.1/2.2 A and AA on every new view and state | no violations [M] |
| Overflow and target-size scans | pass at all widths after the 320 px fix [M] |
| Keyboard-only calendar | pass [M]; the calendar is built from native buttons, selects, a captioned table and `aria-pressed` controls |
| Reduced motion | the new calendar disables transitions under `prefers-reduced-motion`; a site-wide audit was not done |
| Screen-reader testing with real assistive technology | **NOT TESTED** (automated semantics only) |
| Flag-off jobs run locally: build, app a11y browser (2) at 1440 and 390 px, preview contract (5), preview browser (33) at 1440 and 390 px | pass [M] |
| GitHub CI on the tested code SHA `7d2bfbb82486f7369da76a6cb0e04070aec1bda2` | **success**, [run 34](https://github.com/shirrie01/bizgenie-web/actions/runs/40202696256) [CI] |
| Bundle (flag off or on, same code): JS gzip | #49 base **146,150 B** → #50 head 152,106 B → this branch **155,749 B** (+9,599 B, +6.6% over #49; raw 559,708 B); CSS gzip 4,081 → **4,676 B**. No lazy loading yet; the Premium code ships to flag-off visitors too (pre-existing) |
| Runtime performance, network latency profiles | **NOT TESTED** beyond the stale-response and delayed-calendar journey |

Documentation commits after `7d2bfbb8` change only this file and are not re-run.

## 12. Backend dependency handoff for Codex

| Area | Required backend contract | Frontend implementation | Acceptance test | Blocking decision |
|---|---|---|---|---|
| Professional services | Add `professional_services` to the enum and to `workspace_onboarding_profiles_sector_key_check` by a new additive migration; update `schemaContract.json`; coordinate old/new fingerprints so old binaries do not 503; re-check the preflight after any logical restore | Key aligned; flag `VITE_PROFESSIONAL_SECTOR_PERSISTED` (off) offers and sends it | Save, reload, resume, replay, conflict; inference never overwrites a customer choice; old and new target states | Migration and deployment approval; flag activation |
| Workspace calendar | `GET /customer/calendar` (section 5) | Swap the client only | Two campaigns appear; tenant isolation; reversed window 400; pagination | API contract and approval |
| Scheduling | Existing `schedule`/`reschedule`; a route for `unschedule` exists only in the repository, not the router | Planned time set and changed | Past time and non-existent local time refused; 409 on stale version; calendar shows it | None for set/change; an `unschedule` route if wanted |
| Billing | Plan catalogue, change, cancel, portal session (section 6); a public price/terms source; optionally `payment_verified` provenance | Subscription states, recheck, wording | Entitlement transitions via Stripe test mode; delayed confirmation | **Pricing and terms canon** |
| Brand Brain | Existing write policy; optional revision list and approval history | Core and extended editors | F-08d/e on real staging; 403/409 | Real staging |
| Generation | A **credit cost preview** before "Generate draft"; image/video customer routes and quotas; a hybrid asset-selection contract (`bg-media-hybrid-188-contract`) | Honest unavailable states; no simulated provider success | Provider-safe staging test with a spend cap | Separate paid-generation approval |
| Publishing | Social OAuth, connected-account status, publishing and retry APIs | None built | Provider-safe end to end | Separate integration approval |
| Analytics / Learning | Measurement ingestion and feedback APIs; engagement-intelligence policy | Customer-entered results only | Real-data provenance on every insight | Integration readiness |

## 13. Unimplemented or mocked

All of section 9's "Not implemented" rows; every result in this report is mocked, not staging; the professional-services key is never sent while the flag is off; no real Stripe, Supabase, backend or provider was reached.

## 14. Remaining launch blockers

Codex/infrastructure (BG-STUDIO-016/S1: shared service-role secret, production runtime identity, restore untested, staging flags); #213/#214/#215 and the DEC-023 backend branch unmerged and unmigrated; pricing and terms canon; workspace calendar endpoint (DEC-025: required before full launch); credit-cost visibility before generation; the professional-services backend chain; billing management; social connections and publishing; Learning Brain and analytics; real-device, assistive-technology and staging acceptance (F-01–F-12, F-08d/e, D23-1–5).

## 15. Founder decisions genuinely required

1. Supply the pricing and terms canon with its source (or confirm none exists and decide).
2. Approve (or not) the proposed `GET /customer/calendar` and billing-management contracts for Codex.
3. Decide whether the disabled "Hybrid — coming next" option stays visible to customers.
4. Decide the credit-cost disclosure before "Generate draft".
5. Decide whether customers may rename, archive and restore campaigns and record failed or cancelled manual publication (the backend supports them; the app has no screens).

## 16. Mission Control reconciliation handoff (for ChatGPT to record; no write was made)

* Task: **BG-STUDIO-017-FE / 018-FE** (existing rows; do not create duplicates). Evidence to append: frontend draft PR #50 head `f25c1f3d…` and the stacked branch `bg-studio-018-fe-premium-completion` tested code `7d2bfbb8…`; CI runs 40195930323 (#50 head `5a702f06…`), 40198946448, 40199853340, 40200393170 and 40202696256 (tested code SHA `7d2bfbb8…`); unit 526; browser 52 ×5 widths; flag-off jobs pass.
* DEC-023: items 1–4 implemented in the frontend as drafts; item 2 (pricing) **blocked on the canon**; professional-services persistence **blocked on the backend chain**. DEC-025: campaign-level interim milestone remains accurate; a frontend workspace calendar now exists on existing endpoints, **not** a substitute for the backend endpoint.
* New technical-debt candidates: no credit-cost preview before generation; disabled hybrid option; no archive/rename/fail-cancel screens; flag-off bundle includes Premium code; calendar fan-out cost until the endpoint exists.
* A previously noted register row-alignment issue (launch blockers/dashboard) was **not** touched; write by identifier, not row position.

## 17. Recommended next controlled work order

1. Codex: approve and draft `GET /customer/calendar` and the professional-services schema chain (local disposable PostgreSQL only).
2. Founder: supply the pricing/terms canon; approve the billing-management contract.
3. Frontend: credit-cost preview and honest generation states once that contract exists; billing management screens against Stripe test mode; swap the calendar client to the real endpoint.
4. Staging (separate approval, after S1): run F-01–F-12, F-08d/e and D23-1–5, with the schedule and calendar journeys added.
