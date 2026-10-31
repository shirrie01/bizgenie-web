# BG-STUDIO-005 — Premium Studio integration, hardening and founder acceptance (report, 2026-10-22)

**Assessment: AMBER.** The frontend stacks integrate cleanly and pass isolated GitHub CI, and the media and review flow works against the real #208 request handlers locally. Nothing is deployed, nothing is founder-accepted, and there is no staging end-to-end run. This is not "production-ready" and not launch GREEN.

No merges, retargeting, deployment, infrastructure or migration changes, paid generation, provider activation, publishing, spend or pricing changes were made. Mission Control stays the canonical governance authority. BG-STUDIO-ACCEPTANCE-005 and BG-STUDIO-MEDIA-005 are **superseded** by this order, not completed.

## 1. Exact heads
| PR | Branch | SHA |
|---|---|---|
| main | main | e9e5a1f4f208787248fc9dd18ee8f5df1c60d05a |
| #34 | bg-launch28-w05-studio-review | 4074dfa5e7a806bb37d2de8a7b6c393d2af07845 |
| #35 | bg-studio-creative-review-content | a4ec2f710e23e09788144640efe0399105dd63a4 |
| #38 | bg-studio-premium-002-creative-preview | 5d3650c0be4303e82e5b042166e582104b34374f |
| #40 | bg-studio-integration-004-media | c42bc0c21b3beb1c4ba26a9bb29cdc490a6e916d |
| #43 (new) | bg-studio-005-media-revalidate | bf1f2b7123463902d51fccc709da5ef3d064f5e6 |
| #27 | feature/studio-v3-premium-concepts | fba04d86ffa49dc69ebfdedb4b38574e502bfebb |
| #36 | bg-studio-v3-proposal-fidelity | be1a134428b5d4535959576edbf1eef5712cd918 |
| #37 | bg-studio-premium-002-onboarding | 0b1e0c8556008376004169cec1a613c127e46fee |
| #42 (new) | bg-studio-005-onboarding-standalone | fb562410e2cab882ee7e5d5f21c37c9871229392 |
| #39 | bg-a11y-eyebrow-select-overflow | 759bbc557f70a194f6c6b4eb698a375fd9716d1d (the work order's SHA was one character short) |
| #41 (new) | bg-fix-review-idempotency-key-length | 0342b19363142b65a1669d5306fed36417510768 |
| rehearsal | bg-studio-005-integration-rehearsal | 3e94d0690e309f8cdaa03fc8c4b0fe8c5b1e5c02 |
| backend #208 (read-only) | | bf12050939817ae6da3f696808fc5a7f054d74ab |

## 2. CI (real GitHub Actions)
The repo's workflows trigger only on PRs to `main`, so stacked PRs get none. I added an isolated workflow, `studio-005-integration-ci.yml`, on the rehearsal branch only (push and `workflow_dispatch` with a ref input). It runs `npm ci`, `npm test`, `npm run build`, the Studio preview Playwright checks (v1 and v3) and the app accessibility browser checks, at 4 widths.
- Run 39861650760 on the rehearsal head 3e94d06: **success**.
- Run 39860937759 dispatched on exact #40 head c42bc0c: **success**.
- Run 39860934289 dispatched on exact #37 head 0b1e0c8: **success**.
- Run 39860922806 (workflow head 045d10c): **success**.
- #39 PR checks: success (earlier report). #41 is a PR to `main`, so the repo's own CI applies to it; check its PR page for the current result.

Local test runs are not counted as CI.

## 3. Integration rehearsal (scratch worktree, not retargeted or merged)
Stack A (#34, #35, #38, #40) + stack B (#27, #36, #37) + #39 + #41 + the two new branches. Conflicts: only the end of `src/styles.css` (keep both) and one import line in `src/App.jsx`. Result: tests, build, preview and accessibility checks pass; no page overflow at 390 or 320.

## 4. #40 against the real #208 handlers (local only)
Scratch Node harness: the real #208 handlers, an in-memory repository, stub token verifier and mocked storage returning real bytes. The session and writes are mocked in the browser; reads go through the real handlers. Observed:
- PNG renders at 1440/768/390/320; exact bytes.
- VP9 MP4 plays at all four widths; a 9.4 MiB MP4 is assembled from two ranges.
- H.264: honest "can't be displayed in your browser" (Playwright's Chromium has no H.264).
- 40 MiB refused from HEAD before bytes move; revoked media, expired token (one refresh then stop), foreign tenant, stale version, token in query rejected; transient error then retry; cancellation revokes blobs.
- CORS allows `Range` on this route only.

**Defect found and fixed (#41):** review operation keys were 145–160 characters, but the API allows 128, so preview-render, acknowledge, approve and manual-publish returned 400 against the real backend. Keys are now hashed.

**Backend gap (not edited):** an Instagram-feed video returns 409 `PREVIEW_VERSION_UNAVAILABLE`; the default preview profiles do not cover it. Video fixtures used TikTok/feed.

## 5. A5 — video size and H.264
- Backend docs: Veo output is MP4, 720p, 4/6/8 seconds, no audio. Sizes of that kind are well below the 32 MiB client ceiling but can exceed the 8 MiB single-response cap, which the range assembly handles. I have not measured real provider output, because paid generation is prohibited.
- Real Chrome with H.264 could not be installed here (proxy returned 403). **H.264 playback in a real Chrome remains unproven.** Founder or CI with Chrome must check it.

## 6. Dependency and risk register
| Capability | Status | Notes |
|---|---|---|
| Authenticated creative-preview read (#205) | Locally proven | real handlers, mocked auth/storage |
| Authenticated PNG/MP4 delivery (#207/#208) | Locally proven | no staging, no real GCS/Supabase/Postgres |
| Review: preview → acknowledge → approve | Locally proven | writes mocked in browser; #41 key fix needed for the real API |
| Approved-card media | Not started | not refetched |
| Videos over 32 MiB | Blocked by design | refused; decide limit |
| H.264 in Chrome | Staging/browser unverified | |
| Instagram-feed video preview profile | Blocked (backend) | |
| Captions / transcripts / media accessibility | Not started | |
| Website/business import | Not started | no backend; shown as planned |
| Logo/brand asset/UGC upload | Not started | no backend; disabled |
| Channel OAuth | Not started | no backend; "Connect: coming soon" |
| Save-and-exit / persisted drafts | Not started | `SAVE_AND_EXIT_GAP.md` |
| Real publishing, analytics, learning | Not started | out of scope and prohibited |
| Staging end-to-end | Not run | needs founder-approved environment |
| Rights-cleared photography | Founder decision | illustrations only today |

These are prelaunch core capabilities. They are listed, not deferred silently.

## 7. Founder walkthrough
Screens and video: `docs/evidence/real-handlers/` (39 images, four widths for PNG, VP9, ranges, H.264, 40 MiB, revoked, expired, foreign tenant, retry, cancel); onboarding screens: `docs/evidence/premium-002/` on #37. The demo video is `studio-media-demo-1440.webm`, sent separately. I did not open every image.
- **Mocked:** session, onboarding data, campaign writes.
- **Real local handlers:** all media and creative-preview reads.
- **Deployed end-to-end:** none.

Visual fidelity gaps: no photography; no "We found this" import card; no logo or inspiration upload; no real Connect cards. See `PREMIUM_003_REFERENCE_GAPS.md`.

## 8. Founder decisions and copy
1. Welcome headline and CTA (kept provisionally); labels for the two new goals.
2. Rights-cleared imagery set across industries (aesthetics, car leasing, perfume, drinks, others).
3. Video ceiling (32 MiB) and the H.264 requirement.
4. Staging E2E run and environment.
5. Commission import, upload, OAuth and draft-persistence APIs, and the Instagram-feed video profile.
6. Merge order below. Close #25 as superseded by V3?

## 9. Proposed safe merge order (no merging done)
1. #41 (key fix; to `main`, own CI).
2. #39 (to `main`).
3. Stack A in order: #34, #35, #38, #40, #43. Retarget each to `main` after its predecessor merges so the repo CI runs. Resolve the single `styles.css` end-of-file conflict once.
4. Stack B in order: #27, #36, #37, #42.
5. #25 closed as superseded, or last.
Merge nothing until the backend #208 contract is accepted and a staging run passes. Any merge needs founder approval.

## 10. 006
Not needed yet. It would be warranted by a founder-approved staging end-to-end run or the backend profile gap.
