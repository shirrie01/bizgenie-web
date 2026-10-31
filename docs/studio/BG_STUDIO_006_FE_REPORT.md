# BG-STUDIO-006-FE: Premium Studio acceptance and staging-test preparation (readiness report, 2026-10-22)

**Assessment: AMBER.** The frontend is ready for founder visual review and for a controlled staging run to be approved. It is not founder-accepted, not production-ready, and no staging run has happened. Two product gaps would be visible to the founder immediately (section 5). H.264 playback in real Chrome is still unverified.

No merges, retargeting, deployment, infrastructure changes, migrations, paid generation, provider activation, publishing, pricing changes or spend. No backend edits. Mission Control stays the governance authority. Founder acceptance is not claimed.

## 1. GitHub state at start (read live)
`main` is unchanged at `e9e5a1f4f208787248fc9dd18ee8f5df1c60d05a`. All stack PRs are open drafts at the heads below; none merged or retargeted. The backend `bizgenie-api` has no newer checkpoint: PR #208 is still `bf12050939817ae6da3f696808fc5a7f054d74ab` and no PR newer than #208 exists. Before running staging, confirm Codex's final contract has not moved.

| PR | Branch | Head SHA |
|---|---|---|
| #34 | bg-launch28-w05-studio-review | 4074dfa5e7a806bb37d2de8a7b6c393d2af07845 |
| #35 | bg-studio-creative-review-content | a4ec2f710e23e09788144640efe0399105dd63a4 |
| #38 | bg-studio-premium-002-creative-preview | 5d3650c0be4303e82e5b042166e582104b34374f |
| #40 | bg-studio-integration-004-media | c42bc0c21b3beb1c4ba26a9bb29cdc490a6e916d |
| #43 | bg-studio-005-media-revalidate | bf1f2b7123463902d51fccc709da5ef3d064f5e6 |
| #44 (new, this order) | bg-studio-006-approval-media-hint | 26e01e46745cb9d52cb252a40212bd7c463a5611 |
| #27 | feature/studio-v3-premium-concepts | fba04d86ffa49dc69ebfdedb4b38574e502bfebb |
| #36 | bg-studio-v3-proposal-fidelity | be1a134428b5d4535959576edbf1eef5712cd918 |
| #37 | bg-studio-premium-002-onboarding | 0b1e0c8556008376004169cec1a613c127e46fee |
| #42 | bg-studio-005-onboarding-standalone | fb562410e2cab882ee7e5d5f21c37c9871229392 |
| #39 | bg-a11y-eyebrow-select-overflow | 759bbc557f70a194f6c6b4eb698a375fd9716d1d |
| #41 | bg-fix-review-idempotency-key-length | 0342b19363142b65a1669d5306fed36417510768 |
| scratch | bg-studio-005-integration-rehearsal | see section 2 |

Stack #44 is stacked on #43 and extends the creative stack: #34 → #35 → #38 → #40 → #43 → #44.

## 2. CI and browser checks (Workstream E)
The repository's own workflows run only for PRs targeting `main`, so stacked PRs get no repo CI. The isolated workflow `studio-005-integration-ci.yml` (on the rehearsal branch only: no deployment, no secrets, API and session mocked) runs `npm ci`, `npm test`, `npm run build`, the Studio preview Playwright checks (v1 and v3) and the app accessibility checks (4 widths each).

**Workflow SHA versus tested SHA.** In a `workflow_dispatch`, `github.sha` is the commit of the *rehearsal branch the workflow file lives on*, not the commit under test. The workflow now writes both to the job summary and fails if the checked-out commit differs from an `expected_sha` input. In the table, "Workflow/dispatch SHA" is the rehearsal commit that carried the workflow, "Tested SHA" is the exact commit checked out and passed as both `ref` and `expected_sha`.

| Run | PR | Tested SHA (checked out, and passed as `ref` and `expected_sha`) | Workflow/dispatch SHA | Conclusion |
|---|---|---|---|---|
| 7 | #43 | bf1f2b7123463902d51fccc709da5ef3d064f5e6 | e1af544a5c5752f692570bf7abf7700d5fd20c06 | success |
| 8 | #42 | fb562410e2cab882ee7e5d5f21c37c9871229392 | e1af544 | success |
| 9 | #41 | 0342b19363142b65a1669d5306fed36417510768 | e1af544 | success |
| 10 | #39 | 759bbc557f70a194f6c6b4eb698a375fd9716d1d | e1af544 | success |
| 11 | #44 | 26e01e46745cb9d52cb252a40212bd7c463a5611 | e1af544 | success |
| 12 | #40 | c42bc0c21b3beb1c4ba26a9bb29cdc490a6e916d | e1af544 | success |
| 13 | #37 | 0b1e0c8556008376004169cec1a613c127e46fee | e1af544 | success |
| 6 | rehearsal (push) | e1af544a5c5752f692570bf7abf7700d5fd20c06 | same | success |
| 14 | rehearsal (push) | b6fe38634daba84f58781892a4aa86fde688d1ae | same | success |

Run URLs: `https://github.com/shirrie01/bizgenie-web/actions/runs/<id>` with ids 39864812322 (7), 39864815740 (8), 39864820066 (9), 39864823754 (10), 39864827398 (11), 39864831416 (12), 39864835445 (13), 39864787587 (6), 39865211884 (14).

Caveats: the run-to-PR mapping follows my dispatch order, because the run list does not echo workflow inputs; each run's `expected_sha` guard would have failed it on a mismatched checkout, so every success means the checked-out commit equalled the SHA it was dispatched with. These are isolated runs of my own workflow on the rehearsal branch, not the repository's CI on those PRs, which does not trigger for stacked PRs. #39 and #41 target `main`, so their own PR checks are separate.

Earlier results still stand: runs 1 to 5 all succeeded (run 2 and 3 were dispatched against #40's and #37's exact heads under the older workflow, where only the unit job printed the checked-out SHA).

## 3. Workstream B: frontend hardening (local, against the real #208 handlers)
Method: production build of the integrated rehearsal tree; the browser session and non-media writes mocked; creative-preview, media and all review writes forwarded to the **real #208 request handlers** (in-memory repository, stub token verifier, mocked object storage returning real bytes). Not a deployed backend.

| Check | Result |
|---|---|
| **#41 operation keys vs real handlers** | Render, acknowledgement and approval return 201, 200, 200 with the real API-valid keys (at most 91 characters). Before the fix these returned 400. Re-verified on the final tree. |
| **#43 reuse across acknowledgement and approval** | One full GET only. Later version bumps cost a HEAD revalidation under the new version, with a bearer token and no token in any URL. Blob created once and revoked once at unmount. |
| **Revocation mid-flow (new)** | Media revoked server-side after display. The image stays until the next version-bound revalidation (the acknowledgement bump), then the HEAD 404 drops it, revokes the blob and shows "A referenced visual is not available". The real handler then refuses approval with 404 `RESOURCE_NOT_AVAILABLE`. Nothing is approved or published. |
| **Defect found, fixed in PR #44** | The refusal left a generic "Approval could not be completed yet" with Approve still offered. PR #44 adds a conditional note: an attached visual is not available, approval may not be possible until it is replaced. |
| **#39 accessibility** | Contrast and overflow tests run in CI (see section 2). App browser checks run at 1440, 768, 390 and 320. |
| **Page overflow** | None at 1440, 768, 390, 320 on PNG, VP9, H.264, oversize, revoked and revoke-mid-flow runs, and none on the onboarding and workspace screens. |
| **Video size and error handling** | H.264 in Playwright's Chromium: honest "couldn't be displayed in your browser". 40 MiB: "too large to preview here yet", HEAD only, no body. Revoked from start: no media request. |
| **H.264 in real Chrome** | **Unverified.** No real Chrome or system chromium is available here and the install was blocked (proxy 403). It is step M3 of the staging plan. |
| **Stack conflicts (scratch worktree only)** | Re-integrated #34 → #35 → #38 → #40 → #43 + #44, #27 → #36 → #37 → #42, #39, #41. Only conflicts: end of `src/styles.css` (keep both) and one `src/App.jsx` import line, as before. #44 cherry-picks cleanly. Unit tests 160/160 and build pass on the integrated tree. |

Unit tests: 158/158 on the rehearsal tree before #44, 160/160 with it. Counts are local and are not CI.

### Backend findings for Codex (raised, not edited)
1. Approval of content whose media was revoked returns the generic 404 `RESOURCE_NOT_AVAILABLE`. Confirm that is intended and state the recovery path (replace the asset or create a new revision).
2. Instagram-feed video returns 409 `PREVIEW_VERSION_UNAVAILABLE`; default preview profiles cover video only for TikTok feed and YouTube shorts. Confirm the intended coverage.
3. Real generated-video sizes are unknown. The documented output is 720p MP4, 4/6/8 seconds, no audio; the client refuses above 32 MiB and the route caps a single response at 8 MiB. Please publish typical and maximum object sizes.

## 4. Workstream A: founder walkthrough
Everything below is in `docs/evidence/006/` on the rehearsal branch. Onboarding and workspace come from the isolated V3 preview, which has no network, storage or API, so **every business detail, metric, creative and date in it is simulated**. The review and media screens come from the real application build with the real #208 handlers (reads and review writes) but a mocked login session; nothing is deployed.

### 4.1 Journey and where to look
| # | Step | What you see | Real or illustrative | Evidence |
|---|---|---|---|---|
| 1 | Welcome | Standalone page, no workspace rail, "No publishing without your approval", sector strip: aesthetics, vehicle leasing, fragrance, drinks, charities | Illustrative artwork; not photographs, not generated for the business | `walkthrough/{1440,768,390,320}-01-welcome.png` |
| 2 | Your Business | Name and optional fields; website import shown as planned and disabled | User input only; nothing imported | `…-02-business.png` |
| 3 | Your Goals | Seven goals, including the new "Increase online sales" and "Support a specific promotion", plus "Not sure yet" | Real choice, stored locally in the page only | `…-03-goals.png` |
| 4 | Brand Setup | User-entered colours, voice, key messages; logo upload disabled | Nothing verified or saved | `…-04-brand.png` |
| 5 | Channels | Platform cards with marks; every one "Not connected", Connect disabled | No OAuth | `…-05-channels.png` |
| 6 | Review Campaign Proposal | Structured brief with status chips; demo-style selector for vehicle leasing, fragrance and aesthetics (and charity, takeaway, drinks) | Layout is illustrative and labelled so | `…-06-proposal-{leasing,perfume,aesthetics}.png` |
| 7 | Workspace | Mission Control, Campaign Studio, Calendar | **Simulated fixture ("Fonzo" drinks), see gap G1** | `…-07/08/09-workspace-*.png` |
| 8 | Saved creative preview | Title, body, caption, alt text from the saved revision in a generic layout, not a platform rendering | Real handler | `real-handlers/png-*-media-displayed.png` |
| 9 | Authenticated image and video | PNG and VP9 MP4 fetched with the bearer token; H.264, too large, revoked and expired states | Real handler, mocked login | `006/png-*`, `vp9-*`, `h264-*`, `toobig-*`, `revoked-*`; expired and foreign-tenant in `real-handlers/expired-*`, `foreign-*` |
| 10 | Review, acknowledge, approve | Three steps; "You have seen the attached media" only after the browser rendered it; approval records a decision and publishes nothing | Real handler | `006/*-approve-with-media.png`, `006/revokemid-*-final.png` |

Demo video of the onboarding and workspace at 1440: `docs/evidence/006/walkthrough/video/` (WebM, simulated data). The earlier media demo video from 005 is `studio-media-demo-1440.webm` (delivered separately). I did not open every screenshot. I viewed the Welcome and proposal at 1440, the leasing proposal, the workspace growth plan, the 320 goals screen, and the 390 approve-with-media and revoked-media panels.

### 4.2 Implemented versus illustrative versus disconnected
- **Implemented and exercised locally against the real handlers:** authenticated creative-preview read; authenticated PNG and MP4 delivery with ranges; render, acknowledge and approve with idempotency keys; stale, revoked, expired, foreign-tenant and cancellation handling.
- **Illustrative:** all onboarding and workspace content, demo styles, sector illustrations, metrics and charts.
- **Disconnected (no backend or deliberately off):** website import, logo and brand-asset upload, channel OAuth, Save and exit, captions and transcripts, real publishing, analytics and the Learning Brain.

## 5. Gaps the founder will see
- **G1: the workspace is drinks-only.** After onboarding as a vehicle-leasing business the workspace still reads "Your growth plan for Fonzo" with drinks cans. It is labelled "design fixture · no live data", and it is the locked V3 foundation, but it contradicts the multi-industry direction and issue #26's "no cross-industry hardcoding". Fixing it means making the workspace fixtures follow the chosen demo style. I did not change it: it is a design decision and a larger edit than a bounded fix. **Founder decision: should the workspace follow the chosen industry, or stay a single labelled proof?**
- **G2: Welcome hero** has a large empty dark-teal area; no photography.
- **G3:** no "We found this" import card, logo or inspiration upload, or real Connect (no backend).
- **G4:** the revoked-media screen repeats the same idea three times ("This step did not complete", the alert, the new note). It is honest but wordy; polish, not a defect.
- **G5:** media preview is the original file in a generic layout, not a platform rendering.

## 6. Workstream D: dependency and risk register (carried from BG-STUDIO-005, updated)
Statuses: implemented, locally proven, staging unverified, blocked, not started. None of these is optional polish; each is a prelaunch core capability.

| Capability | Status | Next |
|---|---|---|
| Authenticated creative-preview read | Locally proven | Staging run (A1, A3) |
| Authenticated PNG and MP4 delivery | Locally proven | Staging M1 to M7 |
| Review: render, acknowledge, approve; stale and revoked recovery | Locally proven (PR #44 adds revoked guidance) | Staging E1, E2, R1, R2, S1 |
| Approved-card media | Not started (not refetched) | Decision |
| H.264 in real Chrome | Staging unverified | M3 |
| Videos over 32 MiB | Blocked by design (refused) | Founder decides limit; Codex supplies real sizes |
| Instagram-feed video preview profile | Blocked (backend) | Codex |
| Captions, transcripts, media accessibility | Not started | Product and backend |
| Website or business import | Not started (no backend) | Commission API |
| Logo, brand-asset and UGC upload | Not started (no backend) | Commission API |
| Channel OAuth | Not started (no backend) | Commission API |
| Save and exit, persisted onboarding drafts | Not started | `SAVE_AND_EXIT_GAP.md`; commission API |
| Real publishing, analytics, Learning Brain | Not started; prohibited in this order | Separate approved workstream |
| Multi-industry workspace (G1) | Not started | Founder decision |
| Staging E2E | Not run | `STAGING_E2E_TEST_PLAN.md`, needs approval |
| Rights-cleared photography | Founder decision | Illustrations only today |

## 7. Founder acceptance checklist
Each item is a question for the founder; none is answered by me.
1. Onboarding shell: standalone focused flow, rail returns afterwards. Accept?
2. Welcome copy and the headline "Your next chapter in marketing starts here." Accept, change or replace?
3. Goals: the two new goals and their wording ("Increase online sales", "Support a specific promotion"). Accept?
4. Multi-industry illustration set (aesthetics, vehicle leasing, fragrance, drinks, charities): is original illustration acceptable for now, or must rights-cleared photography come first?
5. G1: should the workspace follow the chosen industry?
6. Disabled and "planned" states for import, upload and Connect: acceptable as an honest interim?
7. Creative review: text plus original media in a generic layout (no platform rendering): acceptable?
8. Wording "Approval records your decision. Nothing is scheduled or published." Accept?
9. Revoked-media behaviour: approval is refused and the user must replace the visual. Accept, and what is the replacement path?
10. 32 MiB video ceiling and the H.264 requirement.
11. Approve a staging E2E run (plan in `STAGING_E2E_TEST_PLAN.md`), its environment, window and owner.
12. Merge order (section 8) and whether to close PR #25 as superseded.
13. Commissioning order for import, upload, OAuth, draft persistence.

## 8. Proposed merge order (nothing merged)
Unchanged from BG-STUDIO-005, with #44 added after #43: #41, #39, then #34 → #35 → #38 → #40 → #43 → #44 (retarget each to `main` after its predecessor merges so the repo CI runs; one `styles.css` end-of-file conflict to resolve once), then #27 → #36 → #37 → #42; #25 closed as superseded. Do not merge before the founder approves, the backend contract is final, and a staging run has passed.

## 9. Deliverable index
- This report: `docs/studio/BG_STUDIO_006_FE_REPORT.md`
- Staging plan: `docs/studio/STAGING_E2E_TEST_PLAN.md`
- Earlier report: `docs/studio/BG_STUDIO_005_REPORT.md`
- Screenshots and video: `docs/evidence/006/`, `docs/evidence/006/walkthrough/`, `docs/evidence/real-handlers/`, `docs/evidence/studio-005-onboarding/`
- Draft PR for the one real defect found: #44

## 10. Assessment: AMBER
**For:** all heads unchanged and green in isolated CI (section 2); real-handler checks pass including the new revocation case; no overflow at four widths; one real defect found and fixed in a bounded draft PR.
**Against:** no staging, no real Supabase, Postgres or GCS; H.264 unverified; workspace is drinks-only (G1); no founder acceptance.
Not GREEN until the founder accepts and the staging plan passes, including M3 in real Chrome.
