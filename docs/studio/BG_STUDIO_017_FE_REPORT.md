# BG-STUDIO-017-FE — Premium Studio customer acceptance and final integration readiness

25 October 2026. **Staging RED / NO-GO. Launch not authorised.** This is engineering evidence for the sole Google Sheets Mission Control (DEC-015); it is not a second register. Nothing here was run against staging, production, Stripe, Supabase or any provider: every browser result below used a **mocked** API and Supabase.

> **Update (DEC-023):** the professional-services sector, billing display, calendar window and payment wording gaps listed below were addressed in `BG_STUDIO_017_FE_DEC023_ADDENDUM.md`; read that for the current state.

Evidence classes: **[M]** local mocked browser/unit test · **[R]** repository/code read · **[C]** contract read from backend code at the stated SHA · **[F]** founder-supplied · **[—]** not tested.

## 1. Canonical inputs (verified live against GitHub before work)

| Item | Exact head | State |
|---|---|---|
| Frontend #48 `bg-studio-010-fe-persistent-onboarding` | `7fe2bcc15f489b32fc7e80ffd2e0fc9ab24b7645` | draft, unchanged |
| Frontend #49 `bg-studio-011-fe-workspace-selection` | `6c8e7b6bb68aee83843f567b5ba4dea84f3a0a1b` | draft, base #48, unchanged |
| Backend #213 `bg-studio-010-be-onboarding-persistence` | `120a874dfa02313a8c28dad82ddb6582f0065469` | draft, base `main` |
| Backend #214 `bg-studio-014-identity-write-policy` | `51e8ca493be1bfd6b45da1cb540d4bc090de2a85` | draft, base #213 |
| Backend #215 `bg-studio-015-backend-reliability` | `e84c6d0e8eacc6600a0d6e9a3971ccc7ee81384b` | draft, base #214 (opened since BG-STUDIO-015; new) |
| Backend `main` / frontend `main` | `ddcc26cb…` / `e9e5a1f4…` | unchanged |

This work: branch `bg-studio-017-fe-acceptance`, based on #49's head `6c8e7b6`. **Code commit `11b1e1251cb61feafa8205c6433f5d6b54629a8a`** (this report is a documentation-only commit on top). Backend contract references below are read from #215's head `e84c6d0` (which contains #213 and #214). BG-STUDIO-015 (frontend audit) and BG-STUDIO-016 (staging isolation, Codex-owned infrastructure) were not repeated.

## 2. What changed

| File | Change |
|---|---|
| `src/App.jsx` | `sessionEnded` state, set when a Premium Studio load or save is refused with 401 (`kind: "auth"` or `AUTHENTICATION_REQUIRED`); cleared on the next successful load or a new access token; passed with `handleSignOut` to the shell |
| `src/premium/PremiumStudio.jsx` | When `sessionEnded`, shows a polite `role="status"` notice: "Your session has ended. Sign in again to continue. Answers you have typed but not saved on this screen may be lost when you do." with a **Sign in again** button |
| `src/test/App.premium.test.jsx` | +3 unit tests (401 shows the notice and the button signs out; a 503 outage does not claim the session ended; a successful retry clears it) |
| `qa/premium-industries.browser.qa.mjs` (new) | Four businesses × seven workspace sections: own name, no other business's name, description or sector language, "Fonzo" only for the drinks business actually named Fonzo, no horizontal overflow, axe WCAG 2.x A/AA clean, no page error |
| `qa/premium-session.browser.qa.mjs` (new) | Session ended (401 everywhere, refresh token refused): notice visible, button leads to the sign-in screen, no overflow, axe clean |

**Defect fixed (bounded, within approved scope):** when the session had ended the workspace said "Sign in again" but offered only "Try again" buttons that could never succeed; the only escape was the unlabelled header "Sign out". No application behaviour was invented: the new button calls the existing sign-out. No backend behaviour was assumed. Flag-off app is untouched (the notice exists only in the Premium Studio shell).

## 3. Test evidence

| Run | Result |
|---|---|
| `npx vitest run` | **454 passed** (451 before this work, +3) in 28 files [M] |
| Premium browser matrix, production build with the Premium flag on, mocked API, at 1440×900, 1024×768, 768×1024, 390×844 and 320×568 | **41 passed at each of the five widths** (36 existing + 4 industries + 1 session) [M] |
| axe-core 4.10 (WCAG 2.0/2.1/2.2 A and AA) on every view in the new specs and on the existing workspace/chooser scans | no violations [M] |
| Layout scan (no horizontal overflow; interactive targets ≥ 24 px) | pass on existing scans; overflow checked on every new view [M] |
| Not run here | the flag-off browser job (`qa/playwright.config.mjs`) — covered by the unit suite and unaffected by this change; it runs in CI |

Screenshots for every industry × section × width were produced locally (370 images); they are not committed.

## 4. Multi-industry result (item 2)

| Business | Sector shown | Result [M] |
|---|---|---|
| Northgate Vehicle Leasing | Vehicle leasing | PASS — own name and language only, all seven sections, five widths |
| Ashdown & Pryce Chartered Accountants (professional services) | **Not specified** (neutral guidance) | PASS for isolation and honesty; **product gap**: no professional-services sector exists |
| Clearskin Studio | Aesthetics clinic | PASS |
| Fonzo | Soft drinks | PASS (the only workspace where "Fonzo" appears) |

No Fonzo imagery or text appears in any other workspace; this is also enforced by existing unit tests and a repository-wide source scan. **Professional services:** the sector list is leasing, fragrance, aesthetics, drinks, charity, takeaway, plus neutral. The backend validates `sector.key` against the same frozen list (`SECTOR_KEYS` in `src/workspace-onboarding/schema.js`) [C]. A professional-services sector therefore cannot be added on the frontend alone; it needs a founder decision, a backend enum change, and a check of the database constraint. Until then such customers get honest, neutral guidance and a note that no sector was chosen. This was **not** silently worked around.

## 5. PASS / FAIL / NOT TESTED matrix for the founder's real staging acceptance

"PASS (mock)" means a local test with mocked API passed: it is **not** staging proof. Every row remains **NOT TESTED against real staging**. The founder must run the real column.

| ID | Check | Local result | Real staging |
|---|---|---|---|
| F-01 | Sign-in, token refresh, sign-out | PASS (mock): session load, refresh path, and (new) session-ended recovery | NOT TESTED |
| F-02 | Chooser with two businesses; nothing pre-selected | PASS (mock) | NOT TESTED |
| F-03 | Genuine onboarding, confirm | PASS (mock) | NOT TESTED; needs #213 migrations on staging |
| F-04 | Save, exit, resume | PASS (mock) | NOT TESTED |
| F-05 | No leakage across switching, fast switches, stale responses | PASS (mock) incl. four-industry cross-leak check | NOT TESTED; per-request scope needs the backend owner's confirmation |
| F-06a | Owner writes | PASS (mock) | NOT TESTED |
| F-06b | Member reads, cannot write; forced refused write explained | PASS (mock) | NOT TESTED |
| F-06c | Non-member refused | PASS (mock, 403/400 handling) | NOT TESTED |
| F-07a | 409 conflict, nothing overwritten | PASS (mock) | NOT TESTED |
| F-07b | 422 incomplete setup, field guidance | PASS (mock) | NOT TESTED |
| F-07c | Uncertain 503 → "not confirmed", identical retry replays | PASS (mock) | NOT TESTED; needs a backend fault harness |
| F-08a | Owner Brand Brain save persists | PASS (mock) | NOT TESTED |
| F-08b | Onboarding does not write Brand Brain | PASS (mock) | NOT TESTED; DB-side proof |
| F-08c | Seeded Brain is not "complete" | PASS (mock) | NOT TESTED |
| **F-08d** | Member cannot change name or description (DEC-021/022): UI makes them read-only with the reason; a forced write must answer 403 `BRAND_BRAIN_WRITE_FORBIDDEN` and save nothing | PASS (mock) for UI, repeat-stored-values rule, and 403 explanation | NOT TESTED; the 403 itself is backend-owned (#214) |
| **F-08e** | Member keeps other Brand Brain edits (audience, customer action) and the stored identity is repeated exactly | PASS (mock) | NOT TESTED; includes the untrimmed-identity edge: a stored name/description with leading or trailing spaces blocks every member save until the owner fixes it |
| F-09 | Real phone, tablet, desktop | PASS (mock) only at emulated 320–1440 px; axe clean | NOT TESTED; real devices not available |
| F-10 | Error wording read by a non-developer | — | NOT TESTED; founder review item (section 8) |
| F-11 | No publish, provider or billing side effects | PASS (mock): approval never publishes; no provider or billing request in flows tested | NOT TESTED; backend-owner confirmation; staging has generation and billing flags on (Codex, BG-STUDIO-016) |
| F-12 | Revocation while the page is open | PASS (mock): revoked workspace refused, list refreshed; stale responses discarded | NOT TESTED; needs a backend-controlled revocation |
| New | Session ended shows "Sign in again" | PASS (mock, unit + browser) | NOT TESTED |
| New | Four industries, no cross-leakage | PASS (mock) | NOT TESTED with real data |

There is no FAIL in the local matrix after the fix. Before it, session expiry was a customer-facing dead end (section 2).

## 6. Campaign, calendar, content preview and billing against the backend contract (item 4)

Read from #215 `e84c6d0` [C]; request-body schemas for campaign create/generate/approval were verified in BG-STUDIO-013/015 and not re-audited here.

| Area | Finding |
|---|---|
| Campaign endpoints | Every frontend path exists in `src/campaigns/router.js`: list, create, get, content-items, generate, preview-renders, preview-acknowledgements, approval, manual-publication (+confirm), measurements |
| Calendar | `GET /customer/campaigns/:id/calendar?tenant_id&project_id&from&to` matches the frontend call. The API returns only `campaign_id, content_item_id, variant_id, workflow, occurrence_at`; the frontend shows "Scheduled/Published — date/time". It is **one campaign's list**, loaded by pressing a button, over −30/+90 days. It is not a month grid and shows no channel or title because the API sends none. The window is not stated to the customer |
| Content preview | Version-bound creative preview and authenticated media endpoints exist on #208 (not in #215's chain); previews of media need that branch and a media-enabled backend. Text preview works through the campaign chain |
| Billing read | `GET /customer/billing/subscription?tenant_id` returns `{status:"not_subscribed",subscription:null}` or `{status:"ready",subscription,available_credits}`; the frontend handles both; 401/404 messages are honest |
| Billing checkout | `POST /billing/stripe/checkout` body `{tenant_id, plan_code, request_id}` and `{checkout_session_id,url}` response match. Backend also supports plan `pro`; the UI offers only Standard |
| Billing copy | "Standard includes 60 credits each month" is hard-coded in the UI; it matches backend policy `paid-beta-standard-v1` (60), but it is not read from the API. **No price is shown anywhere**, and the page says terms are not yet approved |

## 7. Working versus mock versus not implemented (item 9)

| Capability | Status |
|---|---|
| Premium Studio shell, onboarding, chooser and switching, owner/member Brand Brain rules, save/exit/resume, error and conflict recovery, session-ended recovery | **Implemented in the frontend; verified only against mocks.** Real behaviour depends on backend #213/#214/#215 being deployed with migrations |
| Campaign creation from a recommendation, text creative review, approval, manual publication confirmation, measurement entry | **Implemented; mock-verified.** Approval never publishes; publication is manual |
| Calendar | **Partial**: per-campaign list only; no workspace-wide calendar API exists |
| Billing status and Stripe Checkout start | **Implemented; mock-verified.** Price display, plan choice, cancel, change, invoices, portal: **not implemented, and no customer cancel/delete API exists** (BG-STUDIO-015-BE) |
| Image/video generation and media preview | **Behind backend flags and paid providers; not tested and prohibited here** |
| Professional-services sector; any seventh+ industry | **Not implemented**; needs a backend enum change |
| Real Supabase sign-in/sign-up, real tokens, real database | **Not tested** |
| Publishing to social platforms | **Not implemented by design** (manual only) |

Placeholder screens: none found in the tested sections. Misleading success states: none found; "Save not confirmed", "Confirmed" (not "Complete") and "payment not verified" wording are deliberately conservative. Customer-facing dead ends found: the ended session (fixed); billing with no price or terms (founder item); calendar that is empty until a campaign exists and a button is pressed (by design, noted).

## 8. Outstanding blockers and founder review items

Blockers (not frontend): shared service-role secret between staging and production, production runtime over-privileged, restore untested, staging flags enabled (all Codex/BG-STUDIO-016); #213/#214/#215 unmerged and #213 migrations not on staging; backend gaps listed in BG-STUDIO-015-BE (generation exclusivity, stuck Stripe event claim, 11 dependency audit findings, no cancel/delete API, campaign-list N+1); the onboarding preflight rejects a logically restored database until one constraint is re-issued (BG-STUDIO-016).

Founder decisions: (1) add a professional-services sector (backend enum + UI)? (2) approve pricing and terms so billing can show a price; (3) should the calendar load automatically and show the window; (4) review wording of "Access entitlement found — payment not verified" for non-technical customers (F-10); (5) real-device test owner for F-09.

## 9. Dependency map and recommended final integration sequence

Dependency chain: backend `main` ← #213 (onboarding persistence, migrations) ← #214 (owner-only identity writes) ← #215 (reliability); frontend `main` ← … ← #47 (008, flag-off by default) ← #48 (persistent onboarding; needs #213) ← #49 (workspace selection; needs the existing workspace endpoints) ← this branch (needs nothing new). Media preview additionally needs backend #208. All are draft; none is merged.

Recommended sequence (each step needs the founder's approval; none done here): (1) Codex: staging credential isolation and safe flags (BG-STUDIO-016 Gates A, B, E). (2) Backend: review and merge #213 → #214 → #215 in order, then apply the onboarding migrations to staging (Gate C2) and run the preflight. (3) Frontend: merge #47 → #48 → #49 → this branch, flag still off. (4) Deploy staging with the Premium flag on and run the real F-01–F-12 matrix with three synthetic customers. (5) Fix defects, then decisions in section 8, then production hardening (BG-STUDIO-016 Gate G). (6) Only then consider enabling the flag for the first paying customers; billing and media behind their own approvals.

## 10. Safe boundaries observed

No merge, deployment, staging or production write, IAM or secret change, migration, paid generation, publishing or Stripe activity. Existing PRs were not altered. No second Mission Control register was created.
