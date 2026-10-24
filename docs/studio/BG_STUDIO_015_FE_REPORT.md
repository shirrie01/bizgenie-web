# BG-STUDIO-015-FE: Premium Studio deep product audit, hardening and founder acceptance preparation (24 Oct 2026)

**Everything below that "passes" passed against MOCKED APIs and a MOCKED sign-in. None of it is live E2E proof. Staging is RED / NO-GO (Issue #191). Founder acceptance, staging readiness, production readiness and launch GREEN are not claimed.** Mission Control (Google Sheets) is the sole operational authority (DEC-014/015); this report creates no register. It belongs to the existing Premium Studio workstream (Issue #197) and references the existing BG-STUDIO-014 task. DEC-020/021/022 and LOCK-018/019/020 are preserved.

## A. Executive summary
**Improved.** The audit found **no P0** (no cross-workspace leakage, no false "saved" state, no demonstration content in production code) and **six P1 defects (five in Brand Brain data integrity or permissions UX, one in a misleading headline), all now fixed on the frontend**. The most important: a Brand Brain save was a whole-document write built from the copy loaded when the screen opened, and the backend has **no compare-and-set** for these writes (#214 Q6), so it could silently overwrite a colleague's later edits to any field. Saves now read the latest stored Brand Brain first and send only the fields the customer edited. Second, the Premium "Brand" tab reused the legacy panel, so a member could edit the owner-only name and description there and any refused save turned the whole Brand Brain into a "could not be loaded" state; it now has its own owner-aware tab.

**Still unsafe or incomplete.** (1) The lost-update window is shortened to one round trip, **not closed**: only a backend compare-and-set or ETag closes it (requirement in section H). (2) Nothing has run against a real API, database, auth provider or device; the 403 "member or no longer a member" ambiguity, a lost-acknowledgement retry and cross-tenant isolation can only be proved on a real target. (3) B2B professional services and local service businesses have **no sector** (the backend accepts only seven keys), so they get honest but generic "Not specified" guidance: a product gap that needs a backend change to fix. (4) Staging is blocked on credential isolation, unapplied migrations and an untested restore.

## B. Product-quality findings (ranked)
| # | Pri | Finding | Reproduction (deterministic) | Impact | Status |
|---|---|---|---|---|---|
| 1 | P1 | **Lost update.** Brand Brain saves sent the whole document built from the screen-load copy; backend has no CAS. | Owner opens the screen, a colleague saves a new audience, the owner edits only the customer action and saves: the old audience is written back (test D1; D1b for name/description). | Silent loss of others' edits; identity overwrite by a second owner. | **Fixed (mitigated)**; residual window and backend requirement in section H. |
| 2 | P1 | **Brand tab bypassed DEC-021/022 UX.** Legacy panel in the Premium shell: editable name/description for members, generic failure sentence, and a refused save set the Brand Brain to an error state shown as "could not be loaded". | Member opens Brand and edits the description; or any 403 on save (browser test "refused save"; vitest D9). | Misleading state, permission confusion, apparent data loss. | **Fixed** (`PremiumBrandBrain`); flag-off panel untouched. |
| 3 | P1 | **Revoked workspace looked like an outage.** `GET brand-brain` answers an unauthorised workspace with 400 `trusted_scope` (#214 Q3); the app said "could not be loaded" with Try again, plus separate banners for setup and campaigns. | Brand Brain GET 400 trusted_scope and onboarding 403 (workspace test). | Dead end for a revoked member. | **Fixed**: one message and the chooser. |
| 4 | P1 | **Member permanently refused for stored edge whitespace.** Backend trims what it receives then compares exactly (#214 Q1), so a stored name/description with edge spaces can never be repeated by a member. My earlier "byte for byte" assumption was wrong for such data. | Stored description "x.  ", member saves audience (D5). | Every member save fails with a generic refusal. | **Fixed (messaged)**: the member is told only the owner can correct it, nothing is sent. |
| 5 | P1 | **No error boundary.** Any render error blanked the Studio. | Component throws (PremiumErrorBoundary test). Fuzzed five odd-but-valid Brand Brain shapes: none crashed. | Blank page, no recovery. | **Fixed** (calm message, reload button, no error text shown). |
| 6 | P2 | Step 6 "Save to Brand Brain" enabled with nothing to save, then errored on press. | Open step 6 untouched. | Hostile micro-copy. | **Fixed** (disabled with the reason beside it). |
| 7 | P2 | Neutral layout wording implied a sector always fits. | Overview for a B2B or local-service fixture. | Misleading to customers outside the six sectors. | **Fixed (wording)**; the real gap is #8. |
| 8 | P2 | **No sector for B2B professional services or local services**; backend `sector_key` enum has seven values. | Fixtures "Ashdown & Pryce" and "Brightside Window Cleaning": neutral, labelled "Not specified". | Generic guidance for a large customer segment. | **Open, backend-dependent.** |
| 9 | P2 | Keyword inference can misread ("mobile car valeting" to leasing; "hair salon" to aesthetics; "food safety consultancy" to takeaway). | industryFixtures tests. | Wrong sector guidance if the customer does not read the label. | **Safe by design**: always labelled inferred, needs confirmation, explicit choice wins. Recommend tightening keywords. |
| 10 | P2 | No history routing: browser Back leaves the app; no deep links. | n/a (code search: no `pushState`/router). | Lost place; unsaved work protected only by the leave-page warning. | Open (needs a routing decision). |
| 11 | P2 | A 401 asks the customer to sign in again without trying a silent session refresh first. | Brain save with a 401 (workspace test). | Avoidable sign-ins after idle. | Open (recommend one refresh retry for reads). |
| 12 | P2 | Single JS chunk of about 515 kB (about 144 kB gzip) triggers the build warning; Premium code ships to flag-off visitors. | `npm run build`. | Slower first load. | Open (lazy-load the Studio; changes flag-off loading, so needs approval). |
| 14 | P1 | **"Complete" headline beside missing details.** The overview tile said "Business profile: Complete" while the same page listed audience, customer action, tone, sector and goal as missing. | Overview for a confirmed setup whose Brand Brain has only a name and description (rendered at 390 and 1024 wide; vitest tile test). | A customer reads "Complete", then sees a list of gaps: lost confidence. | **Fixed**: the tile says "Confirmed" with "N details are still not provided" unless nothing is missing. |
| 13 | P2 | PR #48/#49 descriptions were stale after the alignment work. | Read PR bodies. | Reviewer confusion. | Fixed earlier; refreshed again below. |

## C. Implemented corrections (all on the existing draft stack; flag-on only)
Branches and SHAs: #48 `bg-studio-010-fe-persistent-onboarding` `7fe2bcc15f489b32fc7e80ffd2e0fc9ab24b7645`; #49 `bg-studio-011-fe-workspace-selection` merge `89eb79f3f9999a3ec6c9cef290d0672fa1d5c002` (final head stated in the PR comment).
| Change | Files | Regression tests |
|---|---|---|
| Latest-version, edited-fields-only Brand Brain saves; typed read client; unconfirmed outcomes; owner/member merge | `src/premium/brainClient.js`, `src/App.jsx` (`premiumSaveBrain`, `premiumLoadBrain`) | `brainClient.test.js` (unit), `App.premium.test.jsx` D1 to D10 |
| Draft baseline and "untouched fields follow the stored value" | `src/premium/PremiumStudio.jsx` | D4, `rebaseDraft` unit tests |
| Premium Brand tab (owner-only identity, member-editable rest, honest replace warning) | `src/premium/PremiumBrandBrain.jsx` | D9, member Brand-tab vitest, 3 browser journeys |
| Revoked-workspace single message and chooser | `src/premium/PremiumWorkspace.jsx`, `PremiumBrandBrain.jsx`, `PremiumOnboarding.jsx` | workspace tests "no longer use", "ended session" |
| Error boundary | `src/premium/PremiumErrorBoundary.jsx`, `src/App.jsx` | `PremiumErrorBoundary.test.jsx`, fuzz tests |
| Step-6 disabled save; neutral wording; spacing | `PremiumOnboarding.jsx`, `workspaceModel.js`, `styles.css` | updated step-6 tests, industry fixtures |
| "Confirmed" instead of "Complete" while details are missing | `PremiumWorkspace.jsx` | `App.premium.test.jsx` tile tests (mutation checked) |
| Five industry fixtures; inference limits | tests only | `industryFixtures.test.js` |
Mutation checks (each reverted after the run): stale base for the write (D1, D1b caught), sending all fields (3 caught), removing the edge-space guard (D5 caught), removing the draft rebase (D4 caught), removing the double-click guard (not caught: the button is already disabled while saving, so that guard is redundant belt-and-braces), plus the six from the earlier pass.

## D. Cross-industry assessment (deterministic, test-only fixtures)
| Fixture | Sector shown | Result |
|---|---|---|
| Vehicle leasing (Northgate Vehicle Leasing) | Vehicle leasing | Own name and sector language; no other fixture's text |
| Beauty / aesthetics (Clearskin Studio) | Aesthetics clinic | Pass |
| Fragrance (Maison Aurelle) | Fragrance & perfume | Pass |
| B2B professional services (Ashdown & Pryce Chartered Accountants) | Not specified | Honest neutral guidance; no consumer-sector terms; **no sector exists** |
| Local service (Brightside Window Cleaning) | Not specified | Same |
No Fonzo, Bubblo or drinks language exists in production `src` (grep of the source; the only beverage text is the optional "Soft drinks & beverages" sector, shown only when chosen or inferred from the customer's own words). All fixtures are mock-labelled and imported only by tests. Guidance is labelled "general guidance, not generated content". Recommendations and imagery come from the backend and are not rendered from hard-coded copy.

## E. Security and permissions assessment
**Confirmed (mocked, with #214's documented shapes):** owner-only name and description in both the setup step and the Brand tab; members keep other edits; 403 and 409 and 5xx/network/timeout/malformed-200 are told apart and never shown as plain failure or success; a save never goes out when the latest version cannot be read, the session ended, the workspace is gone, or a member's stored identity has edge spaces; late responses after an account or workspace change are ignored; no cross-workspace text appears after switching; a render error cannot blank the page.
**Remaining weaknesses:** (a) no backend compare-and-set, so concurrent writers can still race inside one round trip and a stale owner payload cannot be detected by the server; (b) the same 403 code means "owner-only" and "no longer a member", so the app re-reads the role and says only what it can; the role can be stale; (c) the flag-off Brand Brain editor still sends a whole document and shows generic errors (not changed without founder approval; separately scoped recommendation: apply the same latest-version, edited-fields-only save and the owner-only fields there); (d) real auth, token refresh, tenant scoping and the Q-answers have not met a real server.

## F. Test evidence
Local, MOCKED, on `89eb79f` unless stated (final head and CI in the PR comment):
| Check | Result |
|---|---|
| Vitest (jsdom), #48 head `7fe2bcc` | 413/413 (25 files) |
| Vitest, #49 head `89eb79f` | 449/449 (28 files) |
| Production build | passes; flag-off JS 515 kB (144 kB gzip) |
| Premium browser suite incl. axe, overflow, 24 px targets, keyboard: 1440x900, 1024x768, 768x1024, 390x844, 320x568 | #48: 28/28 at each of the five widths; #49: see PR comment |
| Flag-off DOM equivalence, 7 states, against the #47 base dump | 7/7 identical |
| CI | isolated workflow on the final #49 head: see PR comment (earlier run 27 `40117831802` was 13/13 on `9749254`) |
Rendered screenshots were inspected by eye (390 and 1024 wide): Brand tab member and refused states, step 6, and the neutral overview. Spacing between the notice and the Save button was tightened. Evidence: `docs/evidence/010/audit/`.
Port discipline: the browser runner now refuses a busy port, builds the current tree, proves the server serves that exact bundle hash, and stops only its own server. (A leftover server from a previous run, not product code, caused eight false failures earlier.)

## G. Founder acceptance readiness (F-01 to F-12; see `BG_STUDIO_013_FE_FOUNDER_ACCEPTANCE.md`)
Legend: MOCK = demonstrated against mocks only. STAGING = needs a real target (blocked: staging RED). DEVICE = needs real devices.
| ID | Journey | State |
|---|---|---|
| F-01 | Sign-in | STAGING (real Supabase never exercised) |
| F-02 | Chooser, two businesses | MOCK verified; STAGING for real memberships |
| F-03 | Genuine onboarding | MOCK verified; STAGING |
| F-04 | Save, exit, resume | MOCK verified; STAGING |
| F-05 | No leakage on switching | MOCK verified (isolation, in-flight and double-select tests); STAGING with backend per-request scope confirmation |
| F-06a/b/c | Owner / member / non-member | MOCK verified; STAGING (real roles, forced writes) |
| F-07a/b/c | 409 / 422 / uncertain 503 | MOCK verified; STAGING (fault harness off shared staging) |
| F-08a to e | Brand Brain persistence and identity ownership | MOCK verified (owner, member, 403, 409, 503, stale, whitespace); STAGING with #214 deployed |
| F-09 | Real devices | DEVICE: not started |
| F-10 | Errors read by a non-developer | not started |
| F-11 | No side effects (no provider, billing or publish call) | By code reading only (the onboarding and Brand flows make no such request); not asserted from a network log. STAGING with the backend owner's confirmation |
| F-12 | Revocation | MOCK verified (revoked on read and on write); STAGING (lock ordering is backend-owned) |

## H. Backend contract questions (Q1 to Q8) and requirements
Codex's written answers exist in `docs/studio/BG_STUDIO_014_FE_CONTRACT_Q1_Q8.md` on #214 head `51e8ca493be1bfd6b45da1cb540d4bc090de2a85` (documentation-only commit after code SHA `2319e5e8`; that doc commit has no CI result of its own). Status after reading them:
| Q | Answer (Codex) | Frontend consequence |
|---|---|---|
| Q1 | Unchanged repeat passes; **input is trimmed, then compared exactly**; omitted description is deletion; name required | Member saves repeat stored values; stored edge spaces cannot be repeated, so the member is told (done) |
| Q2 | 403 `BRAND_BRAIN_WRITE_FORBIDDEN`, atomic, no details | Handled |
| Q3 | Same 403 for non-member/revoked on PUT; GET stays 400 `WORKSPACE_VALIDATION_ERROR` trusted_scope | GET 400 now read as "workspace unavailable" (done) |
| Q4 | No capability field; `membership_role` for guidance only | As implemented |
| Q5 | Exactly `name` and `identity.description` | As implemented |
| Q6 | 409 `BRAND_BRAIN_VERSION_CONFLICT`, no details; **no client CAS; sequential stale payloads not detected; lost-response retry is not exactly-once** | Latest-version read and edited-fields-only writes (done); 5xx told as unconfirmed |
| Q7 | Onboarding rechecks unchanged; completion not an immutable freeze | No change needed; the UI re-reads |
| Q8 | Admin route separate; customer-visible changes are the 403/409/400-to-403 above; bootstrap unchanged | No admin calls in the app (source search) |
**Residual requirements for Codex / founder:** (R1) add `expected_version` or an ETag to `PUT /customer/workspace/brand-brain` with a 409 on mismatch, so a stale owner payload is detected; deterministic reproduction: two owner sessions load the Brand Brain at the same version, session A saves a new audience, then session B (stale copy) saves any whole document; the server accepts B's write and A's audience is lost. The Premium client now avoids this by reading the latest version and sending only edited fields, but the flag-off editor, any other client, and the one-round-trip window remain unprotected. (R2) a distinct code or reason for "owner-only" versus "no longer a member". (R3) add sector keys for professional services and local services, or a free "other" with its own guidance. (R4) an idempotency key on Brand Brain writes for exactly-once retry.

## I. Next three highest-value actions
1. **Unblock a real, isolated staging** (founder + operators): separate staging service-role credentials, apply the two onboarding migrations to a disposable copy after a tested restore, then run the F-rows with a real owner, member and two-business user. Nothing else moves the product toward paying customers as much, because every customer journey is unproven against a real backend.
2. **Close the lost-update gap on the backend (R1) and give professional-services and local-service customers a real sector (R3).** These are the two product-integrity and market-coverage gaps the audit found that the frontend cannot fix alone.
3. **Real-device pass (F-09) and a non-developer read of every error message (F-10)** on the Premium flow, then decide the flag-off Brand Brain editor improvement and the lazy-load of the Studio bundle.

## Governance
No merge, deployment, migration, flag activation, paid generation, provider call, publishing, IAM or secret change, staging write or production change occurred. #48, #49, #213 and #214 remain draft. This work updates existing documents only (`BG_STUDIO_013_FE_FOUNDER_ACCEPTANCE.md`, this report) and links to the existing BG-STUDIO-014 task; ChatGPT reconciles into Mission Control.
