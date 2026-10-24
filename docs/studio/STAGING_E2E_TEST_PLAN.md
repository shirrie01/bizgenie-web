# Staging E2E test plan: Premium Studio review and media (BG-STUDIO-006-FE, Workstream C)

**Status: DESIGN ONLY. Nothing here has been run. Running it needs founder approval and a backend-owned staging environment.** It targets the consolidated backend contract in `shirrie01/bizgenie-api` PR #208 (`bf12050939817ae6da3f696808fc5a7f054d74ab`, `docs/media/BG-MEDIA-INTEGRATION-003.md`). If Codex publishes a newer final contract, re-baseline this plan before running.

What local runs already prove (real #208 handlers, in-memory repository, stub verifier, mocked storage) is listed in the readiness report. This plan covers what they cannot: real Supabase tokens, real PostgreSQL, real private GCS, real CORS, real Chrome.

## 1. Preconditions (all need a named owner; none is done)
| # | Needs | Owner | Notes |
|---|---|---|---|
| P1 | Founder written approval to run against staging, with a start and end time | Founder | No production. Staging only. |
| P2 | A staging API deployment of #208 (or its merged successor) with Postgres, Supabase auth verification and GCS media storage **enabled for the test tenant only** | Codex / backend | Provider, billing, Stripe and publishing stay OFF. No migrations applied by the frontend team. |
| P3 | CORS on the staging API allowing the origin the test page is served from, including `Range`/`HEAD` on the media route and exposed `Content-Range` | Codex | An infrastructure change. Not made by the frontend side. |
| P4 | Where the frontend is served from. Preferred: local production build (`vite build` + `vite preview`) pointing at staging, so no frontend deployment happens | Frontend | A hosted preview deployment needs separate approval. |
| P5 | Two Supabase **test** users in two test tenants (A: owner; B: other tenant) with a known project and brand each | Backend | Created and deleted by backend owners. |
| P6 | Fixture assets uploaded to the private test bucket by the backend owner, never public (section 3) | Backend | Real bytes, small. |

## 2. Secrets and configuration (names only; values are never written to the repo, a URL or a log)
- `VITE_BIZGENIE_API_URL`: staging API base URL (not secret, but approved by the founder).
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`: the staging project's public values.
- `E2E_USER_A_EMAIL` / `E2E_USER_A_PASSWORD`, `E2E_USER_B_EMAIL` / `E2E_USER_B_PASSWORD`: test users only. Held in the runner's secret store, injected as environment variables, never echoed. Playwright traces and videos must be reviewed and scrubbed before sharing, since they can capture session storage; screenshots must not include the login form with typed values.
- Fixture identifiers (campaign, variant, revision, asset IDs) are produced by the setup step and written to a local, git-ignored file.
- The frontend must not hold, print or forward a service-role key, storage credential or signed URL. None is needed.

## 3. Fixtures
| ID | Content | Purpose |
|---|---|---|
| F1 | Campaign in Review with one Instagram feed image variant, PNG 640×640 (about 100 KB), alt text set | Image happy path |
| F2 | Variant with VP9-in-MP4, about 2 MiB, TikTok feed profile | Video playback in headless Chromium |
| F3 | Variant with **H.264** MP4, about 2 MiB | Real Chrome playback check (the main unverified item) |
| F4 | Variant with MP4 over 8 MiB and under 32 MiB (for example 12 MiB) | Range assembly |
| F5 | Variant with MP4 over 32 MiB (for example 40 MiB) | Client refusal (too large) |
| F6 | Variant whose asset the owner **revokes** after setup | Revoked rights |
| F7 | Variant with no media, text only | Text path unchanged |
| F8 | Instagram **feed video** variant | Known backend profile gap; expected 409 `PREVIEW_VERSION_UNAVAILABLE`. Record the actual result for Codex. |
| T-B | Tenant B user, and one asset in tenant B | Tenant isolation |

All fixtures are created by backend-owned scripts. Costs: no paid generation, no provider call; storage and egress for a few tens of MiB, and normal staging database and compute use. Expected incremental cost is negligible, but the owner should confirm before the run. Any step that would call a generation provider is out of scope and must fail the run if observed.

## 4. Test matrix
Run each at 1440, 768, 390 and 320 unless stated. Every row records the exact frontend SHA (and the checked-out SHA, not the dispatch SHA) and the backend SHA deployed.

| ID | Scenario | Expected | Pass criteria |
|---|---|---|---|
| A1 | Real login as user A; load campaign F1 | Session established; review panel shows saved copy | No console errors; no token in any URL |
| A2 | Session refresh: let the access token expire (or use a short-lived token) then open media | Exactly one refresh via the existing path, then success; if refresh fails, "sign in again" alert, no loop | Media requests with the old token: at most 2; no retry storm |
| A3 | Campaign and revision read from PostgreSQL | Copy and version match the database row | Direct DB read by the backend owner agrees |
| M1 | PNG (F1): HEAD then full GET | Image renders at expected natural size | Byte hash of the delivered blob equals the stored object hash (backend-supplied) |
| M2 | VP9 MP4 (F2) | `readyState` 4, controls shown, no autoplay | Playback starts on user press and advances |
| M3 | **H.264 MP4 (F3) in real Chrome** (headed or system Chrome, not Playwright's Chromium) | Plays | If it does not play, record it as a defect, never as a pass |
| M4 | 12 MiB MP4 (F4) | Assembled from single ranges of at most 8 MiB, each a 206 with exact `Content-Range` | Requests observed; played after assembly |
| M5 | 40 MiB MP4 (F5) | "Too large to preview here yet"; no bytes downloaded beyond HEAD | Network log shows HEAD only |
| M6 | Token in query string attempted by a test client (not the app) | 401/400; the app never does this | Network log of the app contains no token in any URL |
| M7 | Storage objects are private | A direct, unauthenticated request to the bucket path is refused | Backend owner confirms; the app never sees a bucket URL |
| T1 | User B requests tenant A's asset | 404, no leakage of existence | Response body is the generic not-available shape |
| T2 | User A requests tenant B's asset | Same | Same |
| R1 | Revoke F6's rights while displayed, then Render preview | Image dropped at the next version-bound revalidation; "A referenced visual is not available"; blob revoked | HEAD 404 observed; no stale image shown after revalidation |
| R2 | Revoked F6 then Acknowledge and Approve | Approval refused with 404 `RESOURCE_NOT_AVAILABLE`; panel shows the note from PR #44 | No approval row in the database; no publication |
| S1 | Stale version: change the campaign version from a second session, then Approve | 409; "Reload latest campaign"; no approval until reloaded | After reload the flow completes |
| S2 | Request with wrong revision | Rejected; the UI shows the safe stale/unavailable message | |
| C1 | Cancellation: navigate away or approve while a refetch is in flight | In-flight media request aborted; blobs created equal blobs revoked | Counter equality in the page |
| E1 | Full flow F1: Render preview, Acknowledge, Approve | Writes 201, 200, 200; approved card; text "Manual publication required. BizGenie will not claim this was published until you confirm it." | Audit log has exactly one render, one acknowledgement, one approval for this revision |
| E2 | Idempotent retry of each write (operation keys from #41) | Same result, no duplicate rows | Keys are at most 91 characters; no 400 |
| E3 | Statuses 401, 403, 404, 409, 429, 503 for read and write calls | Each maps to the documented safe message and recovery action | One screenshot each |
| P0 | **No accidental publication** | Nothing scheduled or posted anywhere; no publish endpoint called; no provider call | Backend owner confirms zero publish and zero provider events for the test tenant; network log shows no publish requests |
| K1 | Keyboard-only run of E1 | Every step reachable and operable; focus visible; error announced before actions | No mouse used |
| K2 | axe-core on the review panel and media states | No serious or critical violations | Report attached |
| K3 | Mobile layout (390, 320) | No horizontal page overflow; targets at least 24 px | Automated scan |
| L1 | Audit logs | Entries exist for login-scoped reads, render, acknowledgement, approval; none for publication | Backend owner exports and attaches |

## 5. Pass and fail criteria
- **PASS** for a row needs the stated evidence attached (network log excerpt with secrets redacted, screenshot, and the backend owner's confirmation where noted).
- **FAIL** if any of: a token appears in a URL or log; a bucket or storage URL reaches the browser; media is shown to the wrong tenant; any publication or provider event occurs; approval succeeds with revoked media; a stale or foreign result is displayed.
- **BLOCKED** if a precondition is missing. Blocked is not pass.
- Overall: GREEN only if all rows pass at all four widths including M3 in real Chrome. Any FAIL stops the run.

## 6. Rollback and clean-up
- The frontend side changes nothing in staging except through the test users' own review writes. Rollback is by the backend owner: delete the test tenants' campaigns and audit rows created by the run, remove the fixture objects from the bucket, disable the two test users.
- If the run is aborted: stop the local server, revoke the test users' sessions, tell the backend owner the exact start and stop time so they can reconcile.
- No migration, deployment, feature flag or infrastructure change is made or reverted by the frontend.

## 7. Evidence to collect
Per row: frontend SHA (checked-out), backend SHA, timestamp, viewport, screenshot, redacted network log, and the backend owner's DB or audit confirmation. Store under `docs/evidence/staging-<date>/` only after secret scrubbing.

## 8. Known risks to watch
- The Instagram-feed video profile gap (F8).
- H.264 playback (M3), and the 8 MiB per-response cap against real provider video sizes (not yet measured).
- CORS and `Range` behaviour on real infrastructure (P3).
- Token refresh timing against the real Supabase configuration (A2).


## BG-STUDIO-010-FE addendum: persistent onboarding (run only after the API migration is separately approved and applied to STAGING)
Preconditions (corrected 24 Oct 2026): API draft PR #213 at `120a874` deployed to an isolated staging target with **both** migrations applied in order, `20261023100000_create_workspace_onboarding_profiles.sql` then `20261024090000_harden_workspace_onboarding_profiles.sql`, and the read-only schema preflight passing (separate founder approval; not done; staging is currently RED / NO-GO). The authoritative walkthrough, F-row evidence checklist and prerequisites are in `BG_STUDIO_013_FE_FOUNDER_ACCEPTANCE.md`; where that file and this addendum differ, use that file. Note that the hardened API now answers a save that may have committed with 'Save not confirmed', not 'NOT saved', and that only the workspace owner can write. Premium Studio flag ON in a staging build only.
1. Fresh account: onboarding opens with nothing saved; `GET /customer/workspace/onboarding` returns version 0.
2. Choose a sector and two channels, press Save and exit: `PUT` returns 200 with version 1; reload: the same sector, channels and step return. Record the request/response (no tokens).
3. Type an answer, do not save, reload: the browser warns, and the unsaved answer is lost (truthfully). Save progress first, reload: it returns.
4. Confirm setup without a real description: Confirm stays disabled. Save a real description, then Confirm: status `completed`; the workspace opens.
5. Two browser tabs: save in tab A, then save in tab B from stale data: tab B shows the version-conflict message and keeps its typed answers.
6. Stop the table (or point at an API build without the routes): the app says saved setup is unavailable and does not claim any save.
7. Account switch / second workspace: no data from the first account appears; each workspace has its own record.
8. A customer whose Brand Brain was only seeded by bootstrap (website address, challenge) must not appear complete.
Record real SHAs, URLs and results here; none of the above has been executed.
