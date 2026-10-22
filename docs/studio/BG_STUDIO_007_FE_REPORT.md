# BG-STUDIO-007-FE: industry-aware Premium Studio (implementation report, 2026-10-23)

**Assessment: AMBER.** The founder-reported defect is fixed and regression-protected in the isolated V3 preview, and the review flow is intact against the real #208 handlers locally. Not founder-accepted, not production-ready, no staging run, and the industry-aware workspace is still the **isolated preview**, not the production app in `src/`.

No merges, retargeting, deployment, migrations, infrastructure, paid generation, provider activation, publishing, pricing or staging execution. No backend edits. Mission Control remains the governance authority.

## 1. What was found and fixed
**Defect (founder-reported, reproduced):** onboarding as "Northgate Vehicle Leasing" ended in "Your growth plan for Fonzo" with drinks cans. The workspace, Campaign Studio and Calendar were static drinks fixtures. Before: `docs/evidence/007/before/` (4 widths).

**Fix:** one pure presentation model, `studio-preview/v3/industry-profiles.js`, is the single source of truth. It resolves a sector (customer's explicit choice, else inferred from what they typed, else neutral) and derives the headline, scene, concepts, schedule, goal action, metric focus, channel chart and inputs panel. The UI renders it. The only brand name shown is the customer's own. Invented product detail (flavour names, "zero sugar") was removed. After: `docs/evidence/007/after/`.

| Scenario | Business | Resolves to | How |
|---|---|---|---|
| Vehicle leasing | Northgate Vehicle Leasing | Vehicle leasing | inferred from the name |
| Fragrance | Maison Aurelle (demo) | Fragrance & perfume | inferred from "Fragrance house" |
| Aesthetics | Clearskin Studio (demo) | Aesthetics clinic | inferred from "Aesthetics clinic" |
| Soft drinks | Fonzo | Soft drinks & beverages | inferred from "Soft drinks"; cans carry the typed name |
| Charity | WOW Charity | Charity & community | inferred from the name |
| Unknown | Harbour Partners | Neutral fallback | not identified, labelled as such |

Also: goals and channels carry through; a visible "Your onboarding inputs" panel states each value's status; one sector control stays in sync across Business, Proposal and Studio; missing brand falls back to neutral wording with a "Missing" status and never a demonstration brand.

## 2. Exact branches, SHAs and PRs
| Item | Branch | Head SHA | Base | PR |
|---|---|---|---|---|
| Industry-aware workspace | bg-launch28-w05-industry-aware-studio | 2f114f056bc096383280d60b221b7c122c50bacb | bg-studio-005-onboarding-standalone @ fb562410e2cab882ee7e5d5f21c37c9871229392 (#42) | #45 (draft) |
| Review copy and profile 409 | bg-launch28-w05-review-copy-and-profile-409 | 49ad57b2fc4b4b643073cf37c80eb1934294b21c | bg-studio-006-approval-media-hint @ 26e01e46745cb9d52cb252a40212bd7c463a5611 (#44) | #46 (draft) |
| Scratch integration (not a PR) | bg-studio-007-integration-rehearsal | INTEGRATION_SHA | bg-studio-005-integration-rehearsal @ a5057be66eb7cc188cf3559dae9f34986a658d5b | none |

`main` is unchanged at `e9e5a1f4f208787248fc9dd18ee8f5df1c60d05a`. Backend #208 is still `bf12050939817ae6da3f696808fc5a7f054d74ab`; a newer backend checkpoint exists, PR #209 at `6911ffc2aaa8687432b6e28fd34bdca59a40be90` (docs and tests only, no endpoint change). Existing PR heads #27 and #34 to #44 are unchanged.

## 3. Files changed
**#45:** `studio-preview/v3/industry-profiles.js` (new, 245 lines), `studio-preview/v3/index.html`, `studio-preview/v3/browser.check.mjs`, `src/studioIndustryProfiles.test.js` (new, 34 tests), `docs/evidence/007/{before,after}/`.
**#46:** `src/App.jsx`, `src/CreativeReviewPanel.jsx`, `src/CreativeReviewPanel.test.jsx`, `src/test/App.campaign-create.test.jsx`.
**Integration branch only:** this report, the governance drafts, `docs/evidence/007/real-handlers/`.

## 4. Results, by kind of evidence
**Local (this machine, not CI):**
- Vitest: 71/71 on #45; 161/161 on #46; **200/200 on the integrated tree** (all stacks, #39, #41, #42, #43, #44, #45, #46). Production build succeeds on each.
- Playwright preview checks: 33/33 at each of 1440, 768, 390 and 320, on #45 and on the integrated tree. The app accessibility checks (#39) pass 2/2 at each width on the integrated tree.
- The key regression test was run against the pre-change page and **fails** there (it finds Fonzo), and passes after.
- axe-core (WCAG 2.0, 2.1, 2.2 A and AA): no violations across Welcome, Business, Proposal, Workspace, Studio and Calendar, six scenarios, 1440 and 320. This needed contrast fixes on the workspace, Studio and Calendar, which the earlier #37 pass had not covered.
- No page overflow in 24 scenario runs (6 scenarios, 4 widths). The new workspace had overflowed at 320 and Studio at 320; both fixed.
- **Real #208 handlers (local; in-memory repository, stub auth, mocked storage with real bytes; session and non-review reads mocked in the browser):** PNG and VP9 MP4 review to approval (201, 200, 200); media revoked mid-review (approval 404, one alert plus one specific hint); revoked from the start; and an **Instagram-feed video returns 409 `PREVIEW_VERSION_UNAVAILABLE`**, which the UI now explains with every review action blocked and no further requests, at four widths.

**Isolated GitHub workflow runs (my own workflow on the rehearsal branch, not native PR checks):** CI_TABLE_PLACEHOLDER

**Native PR checks:** none. The repository's workflows trigger only for PRs targeting `main`, and #45 and #46 are stacked. #39 and #41 (which target `main`) have their own checks on their PR pages.

**Not proven, and not claimed:** deployed backend, real Supabase tokens, PostgreSQL, real GCS, OAuth, and H.264 playback in real Chrome (no real Chrome available here; unchanged from 006).

## 5. Behaviour changes a reviewer should know
- The proposal's old "Preview the layout in a demo style" selector is now "Illustration style for your sector" and is the same control as on the Business step and in Studio. It no longer previews an unrelated sector; it **is** the sector.
- "Wow Charity" and similar names now infer a sector. Inference is keyword-based, always labelled "inferred from what you typed", and overridable. It is deliberately simple and will miss many businesses (they get the neutral fallback).
- Review panel (#46): a failed step shows one alert and at most one media hint instead of three overlapping messages; the profile-unavailable 409 disables Render and offers neither retry nor reload.

## 6. Outstanding dependencies and risks
| Item | Owner | Status |
|---|---|---|
| Industry-aware workspace exists only in the isolated preview; the production app (`src/`) still shows real data only, with no onboarding flow and no demonstration brand anywhere in it (verified by search) | Frontend, founder decision | Not started |
| Website import, logo and UGC upload, channel OAuth, Save and exit | Backend and product | Not started |
| Instagram-feed video preview profile: backend says RED and needs an owner decision (keep the locked set, or approve a new contract). The frontend now reports it correctly | Founder, Codex | Blocked |
| Client 32 MiB video ceiling versus backend object cap (backend lists as a frontend integration blocker; the client already refuses >32 MiB from HEAD) | Frontend, founder | Implemented, unverified on real sizes |
| H.264 playback in real Chrome | Frontend or CI with Chrome | Unverified |
| Staging E2E (plan in `STAGING_E2E_TEST_PLAN.md`; #209 adds required gates: two-tenant matrix, refresh, revocation residual, egress controls) | Founder approval, Codex | Not run |
| Rights-cleared photography; copy decisions | Founder | Open |
| Captions, transcripts, media accessibility | Product, backend | Not started |
| Publishing, analytics, Learning Brain | Separate approved work | Not started |

## 7. Remaining effort (estimates, not commitments)
- Founder review of #45 and #46: about 1 hour.
- Stage-1 production adoption (port the model and onboarding into `src/` behind a flag, wired to the existing Brand Brain, recommendation and campaign endpoints only): roughly 3 to 5 engineer-days with tests.
- Staging E2E execution after approval: about 1 to 2 days plus environment readiness owned by the backend.
- Photography and copy integration: depends on supplied assets.

## 8. Next recommended engineering task
Port the onboarding and industry-aware workspace into the production app as a flagged, frontend-only slice that uses only existing endpoints, so the founder reviews the real product rather than a preview. In parallel, and not blocked by it, prepare the staging environment checklist with Codex against #209's gates so a run can be approved.

## 9. Governance
`docs/studio/BG_STUDIO_007_FE_GOVERNANCE_COMMENTS.md` holds ready-to-post entries for API issues #197 and #191. I could not post them: the API repository is outside this session's GitHub scope and attaching it would need broader credentials than I was given, so nothing was written there and I could not read #191, #197 or #128 either. The work order's own text was my authority.
