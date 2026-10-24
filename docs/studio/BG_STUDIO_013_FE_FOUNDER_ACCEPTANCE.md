# BG-STUDIO-013-FE: Premium Studio founder acceptance preparation (24 Oct 2026)

**Status: PREPARATION ONLY. Nothing here is accepted.** Founder acceptance, staging readiness, production readiness and launch GREEN are **not** claimed. Every result below that says "passes" is a **mocked** result (login session, Supabase refresh and API replaced in the browser or in Vitest). A mocked pass shows what the screen does when the API answers in the documented shape. It does not show that the real API answers that way. Mission Control (Google Sheets) stays the governance authority; this document changes no status there.

Scope of this work: documentation and read-only verification. No feature code, merge, deployment, migration, flag activation or paid generation.

## 1. What this is based on (read, not assumed)
| Item | Value |
|---|---|
| Frontend onboarding PR #48 (draft), branch `bg-studio-010-fe-persistent-onboarding` | `40f41ff3b1ba3622a0f3419aaf769627bb6d325a` |
| Frontend integration PR #49 (draft), branch `bg-studio-011-fe-workspace-selection` | head `dc06cf68e174ab7fe6595f74638dc6a7b7efe761`; **code identical to the CI-verified `6ee493b1dd68461a48254a245338a0a6186541d5`** (`git diff 6ee493b dc06cf6` lists only `docs/studio/BG_STUDIO_011_FE_REPORT.md` and this file). Later docs-only commits may move the head; the final SHA is stated in the PR comment that accompanies this pass |
| Exact-head CI for the tested code | isolated workflow run 26, `40103742885`: 13/13 jobs succeeded on `6ee493b` (mocked API) |
| Backend PR #213 (draft), `workspace-onboarding.v1` | `120a874dfa02313a8c28dad82ddb6582f0065469` (read live today: unchanged, still draft, migration not applied anywhere) |
| Staging plan | `docs/studio/STAGING_E2E_TEST_PLAN.md` (design only; its onboarding addendum names the **superseded** migration file, see section 7) |
| Flag | `VITE_PREMIUM_STUDIO_ENABLED`, build-time, exactly `"true"`, default off. Not activated anywhere. |

## 2. Founder walkthrough (about 15 minutes)
### Part A: what can be shown today (mocked; the founder watches, nothing is real)
Run on the reviewer's machine, no deployment: build the flag-on bundle with placeholder public values, serve it locally, and run the browser suite headed.
```
VITE_PREMIUM_STUDIO_ENABLED=true VITE_SUPABASE_URL=http://supabase.test VITE_SUPABASE_PUBLISHABLE_KEY=placeholder-public-key VITE_BIZGENIE_API_URL=http://api.test npx vite build --outDir dist-premium
npx vite preview --outDir dist-premium --port 4180 --strictPort --host 127.0.0.1 &
BG_VIEWPORT=1440x900 npx playwright test --config qa/premium.playwright.config.mjs --headed   # also 768x1024, 390x844, 320x568
```
`BG_VIEWPORT` must be `WxH`. Or look at the stored screenshots in `docs/evidence/010/{after,alignment}/` and `docs/evidence/011/after/` (all four widths). Every screen was produced against a mock. Then ask, per screen: is the wording true, is anything shown as confirmed that the customer did not confirm, can I recover?

Suggested order: chooser with two businesses → choose one → onboarding (labels, inferred sector prompt) → Save and exit → resume → switch business → the other business shows only its own data → 503 "Save not confirmed" → stale version → 422 guidance → read-only member → refused write.

### Part B: what needs a real staging environment (the founder cannot see these today)
Real sign-in, real two-tenant isolation, real owner/member permissions, the real hardened responses, a real database record surviving a reload, and a real lost-acknowledgement retry. See section 5. **Until Part B is run and every row has its evidence, acceptance cannot be given.**

## 3. Checklist by journey: demonstrable now versus staging-only
Legend: **MOCK** = can be demonstrated now (mocked API, existing test or screenshot named). **STAGING** = needs the real environment in section 5. A journey that is MOCK-only is *not* verified; it is only *demonstrated*.

| # | Journey | MOCK today (evidence that exists) | STAGING required to accept | Known risk to watch |
|---|---|---|---|---|
| 1 | **Real account sign-in** | Signed-out visitors see sign-in and no customer data (`premium-studio.browser.qa.mjs` "signed-out visitors"); session is injected by the test | Real Supabase password sign-in for test users A and B; token refresh; sign-out; no token in any URL or log | The browser tests never exercise real Supabase. Nothing proves the real token carries the claims the API expects. |
| 2 | **Workspace selection between two different businesses** | Chooser with two businesses, nothing pre-selected; switch; revoked; not-yet-approved (disabled and explained); keyboard (`premium-workspaces.browser.qa.mjs`, 8 tests; images `docs/evidence/011/after/*-chooser-*`) | A real user who is a member of two tenants and sees exactly their own two; selection refreshes the session scope; the second business loads | Needs real `GET /customer/workspace` and `POST /customer/workspace/select` and the session refresh. The "revoked" mock keeps the refused workspace in its list; the real API may differ. |
| 3 | **Completing genuine business onboarding** | Seven-step onboarding, labels for customer vs inferred, Confirm closed while anything is missing, seeded Brand Brain not treated as complete (`...-onboarding-*`, `...-seeded-brain-not-complete`, `...-confirm-incomplete`) | A new test business completes onboarding with real text; the real record reaches `completed` only after the owner presses Confirm | Hardened API requires a real business name and a description that is not the bootstrap text or a bare web address. A tester typing placeholder text will hit 422 (this is correct). |
| 4 | **Saving, exiting and resuming** | Save progress, Save and exit, resume at the saved step, unsaved-changes warning (`...-saved-and-exited`, `...-resume-channels`, `...-unsaved-changes`) | Save, close the browser, sign in again on another device, and the same sector, channels, step and answers return; version increments in the database | Draft text typed and not saved is lost, by design, and the page says so. |
| 5 | **Switching workspaces without data leakage** | Old workspace cleared at once; late responses ignored; each workspace keeps its own saved progress; unsaved answers need an explicit "Discard and switch" (`...-workspace-a/b`, `...-resume-after-switch`, `...-chooser-discard-confirm`) | Two real tenants, different data in each (name, sector, channels, Brand Brain). Switch repeatedly and quickly. Neither screen ever shows the other's name, sector, channels, drafts, campaigns or media. Backend owner confirms each response was scoped by the token | Leakage can only be disproved against real scoping and real timing. The mock cannot prove the server never returned the other tenant's row. |
| 6 | **Owner versus read-only member** | Read-only member sees the "View only" note; Save progress, Save and exit, Confirm setup disabled; reading works; a 403 on write explains itself and switches to view-only once the role is read (`...-read-only-member`, `...-write-refused`) | A real owner can write; a real member of the same tenant can read but is refused on write with the real 403; a non-member is refused entirely | The API uses **one** 403 code (`WORKSPACE_NOT_AUTHORIZED`) for "not a member" and "member without owner rights". The screen cannot tell them apart from the response. The role comes from `GET /customer/workspace` and can be stale. |
| 7 | **403, 409, 422 and uncertain 503** | 403 write and read; 409 `VERSION_CONFLICT` (latest loaded, typed answers kept, nothing overwritten); 409 `IDEMPOTENCY_KEY_CONFLICT`; 422 `ONBOARDING_INCOMPLETE` with per-field guidance; 503 "Save not confirmed" with retry using the same key and body, including a lost acknowledgement (`...-version-conflict`, `...-confirm-incomplete`, `...-save-not-confirmed`, `...-load-unavailable`) | Each response produced by the **real hardened API**: 403 by a member, 409 by two tabs, 422 by confirming with a placeholder name or a bare-URL description, 503 by the backend owner making the API unavailable (or faulting the commit acknowledgement) while the founder watches the retry replay one receipt | A 503 after a committed save cannot be eliminated, only handled safely. A mock cannot show that the real API replays on the same key; the backend's own PostgreSQL test shows that. |
| 8 | **Brand Brain persistence; inferred vs confirmed** | Labels: customer-written vs inferred vs not provided; an inferred sector stays labelled inferred until the customer confirms it; onboarding never writes Brand Brain (the API does not either); a bare web address is shown as "not a description" (`...-onboarding-6-brain`, `...-onboarding-3-about`) | After a real "Save to Brand Brain", reload and sign in elsewhere: the Brand Brain content persists. After onboarding, Brand Brain is **unchanged** by onboarding alone. A bootstrap-seeded business is not shown as complete | The description rule ("customer-written") is a text rule plus the owner pressing Confirm. It does not detect who wrote the text, and there is no per-field authorship record. **Verified in the backend code at `120a874` (second pass, section 9):** `PUT /customer/brand-brain` checks only that the caller is a tenant member of the selected approved workspace; it has no owner check. A member can therefore overwrite the Brand Brain that onboarding completion depends on. "Save to Brand Brain" is correctly left enabled in the UI (it matches the API), but the product decision is open. |
| 9 | **Desktop, tablet, mobile usability** | 1440, 768, 390, 320: screenshots exist; automated axe and overflow checks run in CI; keyboard-only runs of the chooser and of Save | A human pass on real devices (iOS Safari, Android Chrome, a desktop browser): tap targets, on-screen keyboard covering Save, long business names, slow connections, zoom 200% | The automated checks use Playwright's Chromium only. Real Safari and real phones have not been used. |
| 10 | **Customer-visible errors and recovery** | Plain wording for 401, 403, 409, 422, 503 and network failure; answers kept; recovery action offered (retry, "Check what was saved", "Choose a workspace", go to the step that fixes a missing field) | The same wording seen from real failures, read aloud by someone who is not the developer: is it understandable, is anything alarming, is there always a next step | Wording was written from the contract. It has not been reviewed by a real customer. |

## 4. Error and recovery map (what the customer sees; mocked-verified wording, real behaviour unverified)
| Situation | Customer sees | Kept | Recovery |
|---|---|---|---|
| 401 | "Your session has ended. Sign in again to continue." | Not verified for a real session expiry (see journey 1) | Sign in again |
| 403 on **read** | "This workspace is not available to your account right now. Choose a workspace to continue." | n/a | Chooser |
| 403 on **write** | "Saving was refused. Only the workspace owner can save or confirm setup, or your access to this workspace has ended. You can still view your setup. Nothing was saved." Then the role is re-read: a known member sees "View only" and disabled buttons | Typed answers | View only, or choose another workspace |
| 409 `VERSION_CONFLICT` | "Your saved setup was changed somewhere else... The latest saved version has been loaded; your typed answers are still here... Nothing was overwritten." | Typed answers | Review, then save again |
| 409 `IDEMPOTENCY_KEY_CONFLICT` | "That save could not be matched to your earlier attempt. Press save again to send it as a new request. Nothing was changed." | Typed answers | Save again |
| 422 `ONBOARDING_INCOMPLETE` | "Setup cannot be confirmed yet. Still needed: ..." with a list per field (business name, description, sector, channels) and a button to the step that fixes each | Everything | Fix the named fields, confirm again |
| 503 / dropped connection / timeout on a **save** | "Save not confirmed — your changes may already have been saved." plus "Press save again to retry safely: the same request is sent, so it cannot be saved twice. Or check what was saved first." | Typed answers; the same key and body | Retry, or "Check what was saved" |
| 503 / 404 on a **read** | "Your saved setup could not be loaded right now. Nothing has been changed..." | n/a | Retry; the page never calls setup complete or incomplete |
| 404 on a save (route not found) | "...the setup service was not found... they are NOT saved." | Typed answers | Contact support; this means the API build has no onboarding route |

## 5. Staging prerequisites (none exists today; owners must be named by the founder)
Reuse the preconditions P1 to P6 of `STAGING_E2E_TEST_PLAN.md`, plus these specific to onboarding and workspace selection. **None of this is done, and the frontend side cannot do any of it.**
| # | Needs | Owner |
|---|---|---|
| S1 | Founder written approval to run against staging, with start and end times. No production. | Founder |
| S2 | API #213 at the approved SHA (or its merged successor) deployed to **staging** only | Backend |
| S3 | The **two pending migrations** applied to staging and the read-only schema preflight passing: `20261023100000_create_workspace_onboarding_profiles.sql` and `20261024090000_harden_workspace_onboarding_profiles.sql`. Until then the hardened API answers every onboarding request with 503 by design. | Backend, with founder approval; reviewed rollback and backup first |
| S4 | Two test businesses (tenants) with different data, two owner users, **one extra user who is a member but not owner** of tenant A, and **one user who is a member of both tenants** (to see the chooser with two real businesses). A third user in neither tenant for refusal tests. | Backend |
| S5 | A tenant with a bootstrap-seeded Brand Brain (website address and challenge only) to prove it is not shown as complete | Backend |
| S6 | Staging frontend: preferably a local `vite build` + `vite preview` pointed at staging with the flag **on** in that build only, so nothing is deployed. A hosted preview needs separate approval. | Frontend |
| S7 | CORS on staging allowing the origin used | Backend |
| S8 | A way for the backend owner to make the API return 503 for one onboarding write, and to lose one commit acknowledgement, on request | Backend |
| S9 | Secrets held only in the runner's secret store (names only in the plan): staging API URL, Supabase public values, test user credentials. Never in the repo, URLs or logs. Traces and videos scrubbed before sharing. | Backend / frontend |
| S10 | Cost note: no provider call, no generation, no publishing, no billing action in scope. Any observed provider or publish event fails the run. | Backend confirms zero events |

## 6. Evidence checklist (to be filled during a real staging run; every cell is empty today)
For every row record: frontend SHA **as checked out**, backend SHA deployed, timestamp, viewport, screenshot, redacted network log, and the backend owner's confirmation where noted. A row without its evidence is **BLOCKED, not passed.**

| ID | Journey | Staging steps (short) | Evidence to attach | Backend owner confirms | Result |
|---|---|---|---|---|---|
| F-01 | Sign-in | Sign in as A, then B; refresh a token; sign out | Screenshot; network log with no token in any URL | Tokens are real and scoped | NOT RUN |
| F-02 | Chooser, two businesses | Sign in as the two-tenant user; no workspace pre-selected; pick one | Screenshot of chooser; log of `GET /customer/workspace` and `POST .../select` | The list equals the user's real memberships | NOT RUN |
| F-03 | Genuine onboarding | Complete all steps for tenant A with real text; Confirm | Screenshots per step; `PUT` responses (status, version) | Database row `completed`, version and `updated_by` as expected | NOT RUN |
| F-04 | Save, exit, resume | Save and exit; close; sign in elsewhere | Before/after screenshots; `GET` response | Same row, same version | NOT RUN |
| F-05 | No leakage | Switch A to B to A repeatedly, including fast switches and unsaved answers | Screenshots of each side; network log showing each request's workspace | Every response scoped to the token's workspace; no cross-tenant row returned | NOT RUN |
| F-06a | Owner writes | Owner saves and confirms | `PUT` 200 | Row updated | NOT RUN |
| F-06b | Member reads, cannot write | Member opens setup, tries to save | Screenshot "View only"; `PUT` response 403 (the buttons are disabled, so a refused write needs a forced attempt by a test client) | No row change | NOT RUN |
| F-06c | Non-member refused | Third user requests the tenant | 403 and the safe message | No row change; nothing about tenant A visible | NOT RUN |
| F-07a | 409 | Two tabs; save in one, then the other | Screenshot; both `PUT` responses | Version conflict, no overwrite | NOT RUN |
| F-07b | 422 | Confirm with a placeholder name, then a bare-URL description | Screenshots; `PUT` 422 with detail paths | No row change | NOT RUN |
| F-07c | Uncertain 503 | Backend owner faults one write; founder presses save again | Screenshot of "Save not confirmed"; both requests' key and body (must be identical); response with `replayed:true` if the first committed | Exactly one committed version | NOT RUN |
| F-08a | Brand Brain persists | "Save to Brand Brain", reload, sign in elsewhere | Screenshots | Brand Brain row updated by that action only | NOT RUN |
| F-08b | Onboarding does not write Brand Brain | Complete onboarding; compare Brand Brain before and after | Before/after screenshots | Brand Brain row (version, content, timestamps) unchanged | NOT RUN |
| F-08c | Seeded Brain not complete | Open the seeded tenant S5 | Screenshot "not complete" | No `completed` row | NOT RUN |
| F-09 | Devices | Run F-03 and F-07 on real phone, tablet and desktop | Photos or screen recordings; notes | n/a | NOT RUN |
| F-10 | Errors read by a non-developer | Show each error screen to one person unfamiliar with the build | Their notes on anything confusing | n/a | NOT RUN |
| F-11 | No side effects | Whole run | Network log: no publish, provider or billing request | Zero publish, provider, billing events for the test tenants | NOT RUN |

**Pass rule:** GREEN only if every row has evidence at 1440, 768, 390 and 320, plus a real-device pass (F-09). Any of these fails the run: a token in a URL or log; data from another tenant on screen; a save shown as confirmed that the database does not hold; a save shown as "NOT saved" when it was committed; an inferred value shown as customer-confirmed; a member able to write; any publish or provider event.

## 7. Gaps and open decisions the founder should know about
1. **No staging exists.** Everything in Part B is unrun. The staging plan's onboarding addendum names only the first migration; the hardened API needs both (S3). It has not been edited here (documentation-only, and the plan is a separate stack's file); correct it when the staging run is scheduled.
2. **Hardened migration unapplied.** Until applied, onboarding is unavailable by design (503), so a staging run before S3 will show "could not be loaded", which is correct behaviour but not a pass.
3. **403 ambiguity** (journey 6): one code for two causes; the role hint can be stale.
4. **503 uncertainty** cannot be removed; the safe retry depends on the real API replaying a same-key request.
5. **Brand Brain write policy** is separate and unchanged (backend report); members may or may not be able to edit Brand Brain. This must be recorded as found in F-08.
6. **"Customer-written" is a text rule**, not authorship tracking (backend report); an owner can press Confirm on text they did not write.
7. **Founder decisions still open** (not for the frontend): retention periods, erasure and actor attribution on account deletion, backup expiry and restore objectives, migration approval, who owns staging.
8. **Browser coverage:** Playwright Chromium only. No real Safari, Firefox or phone.
9. **Flag off by default:** with the flag off the screens are DOM-identical to the base across 7 states (verified on #48 and #49 before the alignment work; not re-run on the final merged #49 tree, where flag-off is covered by unit tests and CI only).
10. **Media review (earlier stack)** has its own unrun staging plan (H.264 in real Chrome and others); out of scope here.

## 8. What I did and did not do for the first order
Read: the current frontend code and QA specs, the staging plan, the 006 and 011 reports, and PR #213 (live: head `120a874`, still draft). Wrote: this file only (and its link from the 011 report). Did not: change feature code, merge, deploy, migrate, activate the flag, call a provider, or record any status in Mission Control. Nothing was run against a server; the browser and unit results quoted are the existing mocked results from the 011 alignment work (Vitest 385/385, browser 30/30 per width locally, CI run 26 13/13 on `6ee493b`). The commit carrying this file changes documentation only, so the tested code remains `6ee493b`.

## 9. Second-pass reconciliation (24 Oct 2026, against #49 `dc06cf6` and #213 `120a874`)
This section reconciles sections 1 to 8 with the current GitHub state: #48/#49/#213 (all draft, unmerged), Issue #191 and #197 checkpoints up to comment `6386087653`, and the Codex readiness documents `BG_STUDIO_012_STAGING_READINESS.md` (`46008ae`) and `BG_STUDIO_013_LIVE_INFRASTRUCTURE_VERIFICATION.md` (`03d5b87`). Those two documents sit on separate docs-only commits one and two ahead of #213; **#213's code head is unchanged at `120a874`**. Codex's 012 report was written against #49 `417122815` and says the 503 wording was a release blocker; that is **now corrected in the frontend** (`40f41ff`, merged into #49), and its own table lists the 503, 422 and member-403 items as the pending frontend work. This is not a new register: it reconciles the existing checklist (DEC-015: Google Sheets Mission Control is the only operational authority; #191 is an index).

### 9.1 Current authority state (quoted from the checkpoints, not re-verified by me)
- **Staging is RED / NO-GO** (#191 comments 6385436889, 6385793007, 6386087653). Product AMBER; frontend isolated CI GREEN; none of that is staging proof.
- Founder read-only inventory (6386087653): staging Cloud Run `bizgenie-api-staging` and production `bizgenie-apii` are separate services with separate Supabase projects; **both reference the identical `SUPABASE_SERVICE_ROLE_KEY` secret (version 1)**; staging identity can read that secret; whose project that key belongs to is UNKNOWN; **restore is untested**; staging config has `STRIPE_BILLING_ENABLED`, `MEDIA_STORAGE_ENABLED`, `IMAGE_GENERATION_ENABLED` and `VIDEO_GENERATION_ENABLED` **true**.
- Nothing is approved: no merge, shared migration, deploy, flag activation, connected E2E writes, secret access or IAM change.

### 9.2 F-01 to F-11 validated against the implementation and the current contract
"Valid" means the row is achievable and its expected result matches the code I read (frontend at `dc06cf6`, backend at `120a874`). It does not mean the row passes.

| ID | Verdict | Reconciliation |
|---|---|---|
| F-01 sign-in | Valid, **backend-dependent** | `GET /customer/workspace` verifies identity only (`verifyIdentityAccessToken` ignores scope claims), so the scoped token the app holds after selection also works for the role lookup. Real refresh and issuer/audience correctness are UNKNOWN until staging auth is shown. |
| F-02 chooser | Valid; two details added | The list contains `approved` **and** `draft` brands; selection is allowed for `approved` only, which is why the app shows unapproved workspaces disabled. One workspace returns `ready` (no chooser); two or more return `selection_required`. So the two-business user must belong to **two** approved workspaces. |
| F-03 genuine onboarding | Valid | Completion requires a saved real business name, a saved description that is not the bootstrap text or a bare web address, a sector, a channel, and the owner's explicit Confirm. The 422 detail paths are `sector_key`, `channels`, `business_name`, `description`, all mapped in the UI. |
| F-04 resume | Valid | |
| F-05 no leakage | Valid, **cannot be proved by the UI alone** | Needs the backend owner's per-request scope confirmation (Codex 012 cases 3, 4, 5 and 12 are the same assertions at API level). |
| F-06a/b/c permissions | Valid, **corrected** | The database allows only two roles, `owner` and `member` (`tenant_memberships_role_allowed`), so the UI's "known non-owner = view only" rule covers every real case. A refused write returns the same 403 for a member and for a non-member. F-06b must use a forced attempt from a test client because the buttons are disabled; add that a **member's replay of an owner's earlier key is also refused** (backend case, Codex case 8). |
| F-07a 409 | Valid | Both `VERSION_CONFLICT` and `IDEMPOTENCY_KEY_CONFLICT` are handled. |
| F-07b 422 | Valid | |
| F-07c uncertain 503 | Valid, **needs a fault harness** | The backend's own PostgreSQL test proves a same-key retry returns the one committed receipt. Faulting a commit acknowledgement must be done in disposable integration infrastructure, **not** on shared staging (Codex 012, section 5). On staging, only the plain 503 (schema unavailable) and the network-drop path are safely demonstrable. |
| F-08a Brand Brain persists | Valid | |
| F-08b onboarding leaves Brand Brain unchanged | Valid | Backend report: completion never writes preferences or drafts into Brand Brain. |
| F-08c seeded Brain not complete | Valid | |
| F-09 devices | Valid, **not started** | |
| F-10 error wording read by a non-developer | Valid, **not started** | |
| F-11 no side effects | Valid, **strengthened** | Because the staging service config has billing, media storage, image generation and video generation enabled (9.1), the run must also show that **no generation, billing, media or publish request** appears in the network log, and the backend owner must confirm zero provider and billing events. Prefer the backend owner switching those flags off in the test target before the run. |
| (missing) F-12 revocation | **Add** | Backend-controlled test: revoke a member while the page is open; the next request is refused; the app must not show stale protected data after the denied refresh, and must not claim recall of already-delivered data (Codex 012 case 9). Frontend part: the 403 on read sends the customer to the chooser. |

Mapping to Codex's twelve API-level cases (so the two documents are not competing): F-01 = 1; F-02 = 2, 3; F-05 = 4, 5, 12; F-04 = 6; F-07 = 7, 11; F-06 = 8; F-12 = 9; F-03 = 10. Codex's cases are API assertions; F-rows are the founder-visible screens. Both are needed.

### 9.3 Genuine frontend blockers versus backend or security dependencies
**Frontend blockers found: none that change code.** I re-read the sources and re-ran the checks (9.5). The three earlier frontend release blockers (503 wording, 422 guidance, member 403) are done and covered by tests. Two documentation items were stale and are corrected in this pass: the #48 and #49 PR descriptions (the #48 text still said 503 means "NOT saved"), and the staging plan's onboarding addendum (it named only the first migration).

**Backend / security / operations dependencies (not for the frontend):**
1. Staging isolation unproven: shared service-role secret, whose issuing project is unknown (9.1).
2. Both onboarding migrations unapplied anywhere; ledger, role, RLS execution path, locks and backups unknown (Codex 012, section 3).
3. Backups exist but **restore is untested**.
4. Real auth and the scoped-claims session refresh unproven.
5. Brand Brain write policy (below).
6. Retention, erasure and `updated_by` handling, cost ceiling, and who owns staging, are founder decisions.

### 9.4 Specific assessments
- **403 member versus non-member.** The API gives one answer for both, and for "access ended". The frontend therefore does not guess: a known `member` (from the workspace list) gets view-only; an unknown or not-listed role leaves the server in charge and the refused-write message names both causes. This is honest but not elegant. A real fix needs the backend to return a distinct code or reason (for example `WORKSPACE_READ_ONLY`), which would be a contract change and is **not** proposed here. Gap to prove in staging: after "access ended", the list no longer contains the workspace, so the role becomes unknown and Save stays enabled; the next write is refused again. That is safe but repeats the refusal; a founder-visible improvement (send the customer to the chooser when the workspace has disappeared from the list) is a small frontend change I have **not** made, because this order is documentation only.
- **Brand Brain member write.** Verified in `src/customer-workspace/router.js` and `service.js` at `120a874`: `PUT /customer/brand-brain` and `GET` require only a tenant membership on an approved brand; there is no role check, while onboarding writes are owner-only. A `member` can therefore edit the business name and description that completion depends on. Completion is rechecked on later onboarding writes, and the app reads the live Brand Brain to say "N details are still not provided", so the screen stays truthful, but the policy is inconsistent. **Founder / backend decision**: either make Brand Brain writes owner-only too (then the frontend should disable "Save to Brand Brain" for known members, a small change to make afterwards), or record that members may edit it. Do not accept the onboarding permission story until this is decided.
- **503 lost-acknowledgement recovery.** Frontend: wording, retained answers and same key/body retry are implemented and tested in unit and browser tests with a mock that replays by key. Backend: proved by its own PostgreSQL test. Not proved: the deployed API behaving that way. The retry path is only safe as long as the app sends the identical body; the app builds the key from the payload and clears it only on success or conflict.
- **Migrations.** Two pending files, in order: `20261023100000_create_workspace_onboarding_profiles.sql` then `20261024090000_harden_workspace_onboarding_profiles.sql`. Until both are applied and the read-only preflight passes, the hardened API answers every onboarding request with 503, so a staging walkthrough before that shows "could not be loaded" and proves nothing about saving.
- **Real-device coverage.** None. Automated coverage is Playwright Chromium at four viewports plus axe. Minimum real-device set for F-09: one current iPhone (Safari), one Android phone (Chrome), one iPad or Android tablet, one desktop Chrome and one desktop Safari or Firefox; for each: F-03 on a long business name, keyboard covering Save, 200% zoom, a throttled connection during Save and exit, and rotation.

### 9.5 Re-run on the exact head (local, all mocked)
Head `dc06cf68e174ab7fe6595f74638dc6a7b7efe761`, Node and dependencies as installed in the work tree; no network, no real API.
| Check | Result |
|---|---|
| Vitest (jsdom) | 385/385 passed, 25 files |
| `npm run build` (flag off) | passed |
| Flag-on build with placeholder public values, premium browser suite (`qa/premium.playwright.config.mjs`) | 30/30 at each of 1440x900, 768x1024, 390x844 and 320x568 |
| Flag-off DOM equivalence, 7 states (signed-out, unconfigured, scope-missing, ready initial, brain, recommendation, campaign) | 7/7 byte-identical to the earlier dumps from the #47 base tree, from #48 after the alignment and from #49 before the merge |
| CI | Not re-dispatched. `git diff 6ee493b dc06cf6` shows only documentation, so isolated run 26 (`40103742885`, 13/13 on `6ee493b`) still describes this code. A further dispatch on an unchanged code tree would add nothing. |

## 10. Exact staging prerequisites (consolidated; none exists today)
Everything in section 5 stands. Additions or changes from this pass:
1. **Founder approval, in writing,** naming the exact isolated target, the synthetic fixtures, the test writes, the duration, a cost ceiling, the rollback and the operator (Codex 012 section 7, steps 4 to 7). Architecture approval (DEC-020 / LOCK-018) covers none of this.
2. **Staging credential isolation resolved first:** an authorised operator confirms by metadata only (no secret values) which Supabase project the staging service-role secret belongs to, and that the production default compute identity cannot read it; separate staging-only credentials if not (#191 comment 6386087653). Until then no test writes.
3. **Provider and billing switches:** the backend owner shows effective configuration with image generation, video generation, media storage use and billing disabled or unreachable for the test tenant, or accepts in writing that the test cannot reach them. F-11 is the check.
4. **Database:** target PostgreSQL major version matches the preflight fingerprint (17); read-only data checks quantify rows that could violate the new constraints; both migrations applied in order by the approved operator after a **tested restore** into a disposable copy; the hardened preflight passes as the real backend role.
5. **Accounts and data (synthetic only):** owner O in two approved workspaces W1 and W2 of one tenant T, with deliberately different business names, sectors, channels and Brand Brain; member M of T (read access only); user X in a different tenant F; one tenant whose Brand Brain was only bootstrap-seeded. Different marker text in each workspace so leakage is visible.
6. **Real auth:** nonproduction Supabase issuer and audience, approved redirect origins, the scope provisioner and a real token refresh after selection.
7. **Frontend artifact:** a local `vite build` and `vite preview` from the exact approved SHA pointed at the staging API, with the flag on in that build only, so nothing is deployed. CORS allows that origin and `Authorization`.
8. **Fault harness:** a disposable integration environment (not shared staging) for the lost-acknowledgement and revocation-race cases.
9. **Evidence handling:** tokens only in ephemeral tooling; traces and screenshots scrubbed; evidence stored under `docs/evidence/staging-<date>/` only after scrubbing; each row records the checked-out frontend SHA and the deployed backend SHA.
10. **Decisions still owed by the founder or data owner:** Brand Brain write policy; retention, erasure and backup expiry; who owns staging; migration approval and window.

## 11. Founder-ready acceptance summary
- **What is built and CI-verified:** the Premium Studio onboarding, workspace chooser and the contract alignment with the hardened API, behind a default-off flag, in draft PRs #48 and #49. Unit, build, four-width browser and accessibility checks pass in isolated CI (13/13). All of it ran against mocks.
- **What the founder can look at now:** the walkthrough in section 2 (headed local run or the stored screenshots). It shows the wording and the behaviour, not a real customer journey.
- **What you cannot yet accept:** sign-in, two real businesses, real saves and resumes, owner and member permissions, the real 403/409/422/503 responses, Brand Brain persistence and real devices. They need the staging prerequisites above, and staging is RED / NO-GO until isolation, migrations, restore and credentials are resolved.
- **Open decisions:** Brand Brain write policy; whether a distinct "read-only" reason is worth a contract change; retention and erasure; staging ownership and cost.
- **Recommended next actions, in order:** (1) the operator resolves the shared service-role secret and proves isolation; (2) the backend owner decides the Brand Brain write policy; (3) approve a disposable-copy migration rehearsal with a tested restore; (4) approve one bounded staging walkthrough using the F-rows; (5) run F-09 on real devices; (6) only then consider founder acceptance. Keep #48, #49 and #213 draft until then.
