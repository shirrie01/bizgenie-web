# BG-STUDIO-008-FE: Premium Studio in the production application (report, 2026-10-23)

**Assessment: AMBER.** A genuine production-code integration exists, is flag-gated and default-off, and is verified locally. It is not founder-accepted, not production-ready, not staged, and nothing was deployed or activated. Mission Control (Google Sheets Register v1.0, DEC-015) remains the canonical operational authority; this report is evidence for it, not a replacement.

## Required checkpoint
| | |
|---|---|
| **Completed** | Flag-gated Premium Studio in `src/`: authenticated entry, 7-step onboarding, industry-aware workspace from real data, real-campaign restore after refresh, tenant and account isolation, truthful failure states. Flag off proven byte-identical to base. Review, media and revocation safety preserved and re-run. FE/BE contract notes for Codex. Draft PR. |
| **Verified (local, mocks labelled)** | Vitest 260/260 (200 base + 60 new); production build; flag-on browser QA with axe, overflow and target size at 1440/768/390/320 (11 checks each); existing flag-off browser suites unchanged (33 preview + 2 app accessibility per width); real #208 handlers through the premium shell (12 runs); flag-off DOM identical across 7 states; mutation checks on the isolation logic. |
| **Blocked** | Sector and channel persistence (no backend field); Save and exit; website import; logo/UGC upload; channel OAuth; captions/transcripts; real publishing, analytics, learning; the Instagram-feed video preview profile (owner decision, #210); staging E2E (needs approval); H.264 in real Chrome (no Chrome here). |
| **Exact SHA** | Code head `9ad697f300095984ff1a8b5a6739705c50edc7af`, branch `bg-studio-008-fe-production-integration`, base `bg-studio-007-integration-rehearsal` @ `fb80c97af2f47f2a0e89a1950bbeefdcffc9fe79`. Docs-only commits may follow. |
| **Draft PR** | [#47](https://github.com/shirrie01/bizgenie-web/pull/47) (draft). Base is the scratch integration branch, not `main` (see section 2). |
| **CI** | CI_TABLE_008 |
| **Founder review evidence** | `docs/evidence/008/` (section 8) and the walkthrough in section 9. |
| **Next action** | Founder reviews #47 and decides the open questions (section 10); Codex answers the contract questions (`FE_BE_CONTRACT_BG_STUDIO_008.md`); then, only with founder approval, a staging E2E per `STAGING_E2E_TEST_PLAN.md`. |

## 1. State verified first (not assumed)
`main` is unchanged at `e9e5a1f4f208787248fc9dd18ee8f5df1c60d05a`. #45 is `2f114f0…` and #46 is `49ad57b…`, both open drafts. #27 and #34 to #44 are unchanged. `bg-studio-007-integration-rehearsal` is `fb80c97…`. Backend `bizgenie-api`: #208 `bf12050…`, #209 `6911ffc…`, **#210 `e26b79d273fe2a906245b1ce52fd6d7e67df4250`** (new: an Instagram-feed video contract proposal with docs and tests only; no endpoint change), backend `main` `ddcc26c…`.

**Not read:** API issues #128, #191 and #197. `bizgenie-api` is outside this session's GitHub scope and attaching it needs credentials I was told not to broaden, so the work order's text was my authority. Comments for #191 and #197 are prepared in `BG_STUDIO_008_FE_GOVERNANCE_COMMENTS.md` for reconciliation.

## 2. Why the PR base is a scratch integration branch
The production code in `src/` depends on fixes that live in separate stacked PRs (review, media, revalidation, preview-profile 409, key hashing, accessibility). Cherry-picking them would duplicate work and risk drift, so the work is based on the one tree that already merges them all cleanly (`bg-studio-007-integration-rehearsal`). **This PR is therefore not mergeable to `main` directly.** After the predecessors merge in the order below, it should be re-based; its own code diff is small and isolated (14 files plus tests and evidence).

Merge order (nothing was merged): #41, #39, then #34 → #35 → #38 → #40 → #43 → #44 → #46, then #27 → #36 → #37 → #42 → #45, then #47 re-based; #25 closed as superseded.

## 3. Architecture
- **Flag:** `src/premium/flag.js`, `VITE_PREMIUM_STUDIO_ENABLED`. Enabled only by the string `true` (case and whitespace tolerant); `false`, empty, `1`, `yes`, unset and anything else mean off. Build-time only: never read from a URL, storage or the backend. `.env.example` documents it, commented out. No environment variable was changed anywhere.
- **Presentation layer:** `sectors.js` (resolution and general guidance), `workspaceModel.js` (pure view model with provenance), `PremiumStudio.jsx` (navigation, session-only draft, where to start), `PremiumOnboarding.jsx`, `PremiumWorkspace.jsx`. `App.jsx` keeps every existing network function, session, billing and review flow; the three existing sections (Brand Brain, recommendation, campaign) were extracted into constants so the flag-off markup is unchanged.
- **Preview is a reference, not a second product.** The production model deliberately contains none of the preview's fixtures (sample concepts, KPIs, schedule, demonstration brand). A drift test keeps its sector keyword rules in step with the preview.
- **Identity** comes from the authenticated session scope; the business name from the Brand Brain. A placeholder name is treated as missing. Scope is never taken from form fields or the environment (unchanged).

## 4. Onboarding and persistence (what really happens)
| Step | What it does | Persisted? |
|---|---|---|
| 1 Welcome | Explains what is saved and what is not | no |
| 2 Your business | New workspace: business name (required), optional website and challenge → `POST /customer/workspace/bootstrap`, exactly the entered values, empty optionals omitted | **yes, existing endpoint** |
| 3 What you do | Industry text and sector (session only); description and customer action | description and action saved only on Save |
| 4 Customers and goal | Audience summary; goal | audience saved only on Save; goal used for the recommendation and saved only when a campaign is created |
| 5 Channels | Channels you plan for | **no**: no backend field; labelled "planning only, not connected" |
| 6 Brand Brain | Shows what is saved; explicit **Save** → existing `PUT /customer/workspace/brand-brain` | yes, on Save |
| 7 First recommendation | `POST /customer/campaign-recommendations` with the typed goal; shows the real result; campaign creation stays in Campaign Studio | recommendation not saved; campaign when created |

Every fact carries one of four sources: saved in the Brand Brain; entered this session (not saved); inferred from the customer's own text (changeable); not provided. Nothing claims a save that did not happen (a failed save shows an error and never "saved"). Where it opens is decided from **saved** data (a real name and description in the Brand Brain), never a local completion flag, so a refresh is consistent. Refresh loses unsaved answers, which is stated; the backend cannot hold them (gap G3).

## 5. The workspace
Real only: the business and sector (inferred and labelled, or chosen), status tiles, next steps derived from real state, sector **general guidance** labelled as not generated content or a claim, "What BizGenie knows" with sources, real campaigns (restored after refresh from `GET /customer/campaigns`, newest loaded via the existing detail call, archived excluded), and an honest Results panel ("no measured results are recorded yet"). Campaign Studio is the existing creative, review, approval and manual-publication UI. Calendar and billing reuse the existing implementations. **No** metrics, posts, campaign results or AI-generated assets are invented.

Failure handling: an unavailable Brand Brain or campaign list is stated **once**, reports no field as missing (unknown is not absent), guesses no next step, and offers Try again. Requests have a 20 second limit; a write that times out says it may or may not have been saved.

## 6. Safety that was preserved, and how it was checked
| Concern | Result |
|---|---|
| Flag off unchanged | DOM compared on base and branch across 7 states: identical (`docs/evidence/008/flag-off-dom-equivalence/`). The 200 pre-existing tests are unchanged and pass. |
| Revoked media not approvable | Real #208 handler refuses approval (404); UI shows one alert and one hint; nothing approved. |
| Missing destination preview profile fails closed | Real handler returns 409 `PREVIEW_VERSION_UNAVAILABLE` for an Instagram-feed video; render disabled; no acknowledge, approve or reload; no further requests. |
| No refresh loop on that 409 | Exactly one render request; request count stable afterwards (unit and real-handler). |
| Version-only media reuse, private media auth | Untouched code; re-run with PNG and VP9 through the premium shell (writes 201, 200, 200). |
| Acknowledge and approve explicit; no publish implied | Tested: no acknowledgement or approval request until each is clicked; "manual publication required"; no publish or schedule request. |
| Idempotency keys | Tested valid on every review write (`op:<operation>:<64 hex>`). |
| Tenant isolation | Switching account or workspace resets every piece of state and ignores late responses from the previous scope. Verified by tests that **fail when the reset or the stale-response guard is removed** (mutation checks). Sign-out also clears typed answers and any recommendation. |
| Cross-industry isolation | Six scenarios (vehicle leasing, fragrance, aesthetics, soft drinks, charity, unknown) never show another industry's wording; unknown is neutral; Northgate never shows another brand. A source scan fails the build if a demonstration brand or example metric enters production code. |
| Duplicate submissions | Three rapid clicks send one bootstrap request. |

## 7. Tests and checks (local unless stated)
- **Vitest:** 260/260 across 19 files (base 200 + 21 model tests + 39 App integration tests). Production build passes.
- **Flag-on real-browser QA** (`qa/premium-studio.browser.qa.mjs`; mocked API and session; axe wcag2a/2aa/21aa/22aa, page overflow, 24px target size on every screen): 11 checks at each of 1440, 768, 390, 320, all passing. They cover leasing, fragrance, aesthetics, soft drinks, charity and unknown customers; the full new-customer journey through bootstrap, Brand Brain save, recommendation and review to approval; Brand Brain failure; incomplete profile; signed out; keyboard.
- **Existing flag-off suites on this branch:** preview 33/33 and app accessibility 2/2 at each width.
- **Real #208 handlers, through the premium shell** (in-memory repository, stub auth, mocked storage with real bytes; browser session mocked): 12 runs: PNG (2 widths), VP9 MP4 (2), media revoked mid-review (2), Instagram-feed video (4), revoked from the start (2).
- **Defects found and fixed along the way:** the new campaign list call correctly exposed my own mock gap; the failure state initially repeated itself and reported fields as "Missing" when they were merely unavailable (fixed with tests); two short controls in the existing sign-in and campaign UI (19px and 21px) fail the 24px target size and were raised **inside the premium shell only**. The same two controls remain short in the flag-off app, which I did not change.

CI results (isolated workflow runs of my own workflow, not native PR checks):

CI_TABLE_008_DETAIL

There are **no native PR checks**: the repository's workflows run only for PRs targeting `main`.

## 8. Evidence index (`docs/evidence/008/`)
- `before/`: the real current app with the flag off, at 1440, 768, 390 and 320 (home and campaign), 8 images.
- `after/`: the flag-on production build at four widths, 72 images: onboarding 1 to 7, workspaces for vehicle leasing, fragrance, aesthetics, soft drinks, charity and unknown, a completed Campaign Studio approval, workspace after onboarding, Brand Brain failure, incomplete profile, signed out.
- `real-handlers/`: screenshots and `summary.json` for the 12 real-handler runs.
- `flag-off-dom-equivalence/`: script and hashes proving the flag-off DOM is identical.

I viewed these images: the vehicle-leasing and soft-drinks workspaces at 1440, the onboarding "What you do" step at 390, the recommendation step at 1440, the Brand Brain failure state at 320 and 390, and the "before" home at 390. I did not open every image.

## 9. Founder walkthrough: what is real, simulated, blocked or not yet implemented
Mocked in these screenshots: the login session and, except in the real-handler runs, the API. **None of it is a deployed customer journey.**

| Screen | Evidence | Real code path | Simulated | Blocked / not implemented |
|---|---|---|---|---|
| Today's app (flag off) | `before/` | yes | mocked session, billing shows an unverified state | n/a |
| Vehicle-leasing customer | `after/*-workspace-leasing`, onboarding set | production code, real request shapes | mocked backend | sector not persisted (G1) |
| Fragrance, aesthetics, charity, unknown customer | `after/*-workspace-*` | same | same | same |
| Soft-drinks customer ("Fonzo") | `after/*-workspace-soft-drinks` | same; the name is the customer's own entry, never a fixture | same | same |
| Missing data | `after/*-missing-brand-brain` | yes | mocked | n/a |
| Failure | `after/*-failure-brand-brain` | yes | mocked | n/a |
| Creative review to approval | `after/*-studio-approved`, `real-handlers/` | real #208 request handlers | session, storage mocked | not deployed; H.264 unverified |
| Not built | | | | website import, logo upload, channel OAuth, Save and exit, captions, real publishing, analytics |

Fidelity gaps: the production design system is deliberately plainer than the V3 preview (no photography; sector shown as an accent colour, a chip and guidance, not hero art). A polished visual pass is a separate, founder-directed step.

## 10. Founder questions
1. Is the plainer production look acceptable for the first slice, or should the V3 hero imagery be ported (needs rights-cleared assets)?
2. May the premium workspace become the default for authenticated customers once staging passes (the flag is a build-time switch)?
3. Should the legacy goal-first page remain reachable inside the premium shell?
4. Sector and channel persistence: commission the two small backend fields (G1, G2)?
5. Staging E2E: approve a window and environment (plan: `STAGING_E2E_TEST_PLAN.md`, to be re-baselined against #209 and #210 gates).

## 11. Dependencies and risks (carried forward; none is optional polish)
| Capability | Status |
|---|---|
| Authenticated entry, onboarding, workspace from real data, campaign restore | implemented, locally proven |
| Sector and channel persistence | blocked (backend field) |
| Save and exit | not started (backend) |
| Website import; logo and UGC upload; channel OAuth | not started (backend) |
| Captions, transcripts, media accessibility | not started |
| Instagram-feed video preview profile | blocked on owner decision (#210) |
| Real publishing, analytics, Learning Brain | not started; prohibited in this order |
| Workspace chooser (multiple workspaces) | not started (reported honestly) |
| Staging E2E; H.264 in real Chrome; real Supabase, Postgres, GCS | not run |
| Legacy name heuristic and the two short controls in the flag-off app | known, unchanged by design |

## 12. Next safe step
Founder reviews #47 and the questions above. Codex answers the contract questions. With founder approval only, run the re-baselined staging plan against a backend-owned staging environment with the flag built on. Until then, the flag stays off everywhere.
