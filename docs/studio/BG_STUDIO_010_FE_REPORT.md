# BG-STUDIO-010-FE report: persistent onboarding in the real Premium Studio

Authority: Google Sheets Mission Control Register v1.0 (DEC-015). This report is evidence for it, not a status change. **Draft. Not founder-accepted, not production-ready, not deployed. The flag is not activated. The backend it depends on is an unmerged draft whose migration has not been run anywhere. Every API interaction in the evidence below is mocked.**

## 1. Verified starting state (live GitHub, 23 Oct 2026)
| Item | State |
|---|---|
| Frontend PR #47 (`bg-studio-008-fe-production-integration`) | open draft, head `412ede3388c405ac013b44cf9b514ec6a97b5415` (code `9ad697f` + docs). This branch is **stacked on it**: it is the only tree containing the Premium Studio `src/` code. |
| BG-STUDIO-009-FE | no branch or PR exists; nothing to reuse or duplicate. |
| API draft PR #213 | open draft, head `d0e1142c91c0c12b907227f2881e14f3bb2a44e2`, base `main` `ddcc26c`, CI #350 green per the repository owner's checkpoint comment. Contract read: `docs/studio/FE_BE_CONTRACT_BG_STUDIO_010.md` and the migration plan on that PR. |
| Governance | no merge, retarget, deployment, migration, provider call, publish or flag activation was done. |

## 2. What was built (`src/premium/`, `src/App.jsx`)
| Requirement | Implementation | Where tested |
|---|---|---|
| 1. Load saved sector, channels, progress | `GET /customer/workspace/onboarding` (bearer token only; scope never sent) alongside the Brand Brain. The response shape is validated; an unexpected shape is an error, never "empty". | Vitest, browser |
| 2. Explicit Save and exit | **Save progress** and **Save and exit** on every step, plus **Confirm setup**. `PUT` sends only what changed (`expected_version`, `idempotency_key`, `sector_key/_source`, `industry_text`, lower-case `channels/_source`, `current_step`, partial `draft`, `complete`). Nothing autosaves. | Vitest, browser |
| 3. Resume after refresh / sign-in | The start view and step come only from the saved record; unsaved typed answers saved as `draft` return. A `beforeunload` warning protects unsaved typing. | Vitest, browser (reload) |
| 4. Conflicts, idempotency, 503 | One idempotency key per action, reused for an identical retry, new for a changed payload; replays accepted. `VERSION_CONFLICT` reloads the latest saved record, **keeps the typed answers**, and the next save uses the new version. 503 and 404 (an API without the routes) mean **"NOT saved"**, keep the answers and never navigate away. A dropped connection on a write says the outcome is unknown and that resending is safe. 400/401/403/422 each say nothing was saved. | Vitest (unit + App), browser |
| 5. Workspace/account change | Onboarding state, the key keeper and all late responses (GET and PUT) are reset or ignored on any scope change, like the other premium state. | Vitest (including a mutation check) |
| 6. Backend placeholder flag | `brand_name_placeholder` replaces the hard-coded `GENERIC_BRAND_NAMES`; a test scans the source to ensure no placeholder string is built in. While the flag is unknown the name is shown but the profile is never "complete". | Vitest |
| 7. Truthful provenance | Sector and channels are labelled **Saved · you chose this**, **Saved · inferred, not confirmed**, **You entered this · not saved yet**, **Inferred from what you typed · not saved yet**, or not provided. An inferred sector is sent as `inferred` and never over a saved customer choice. | Vitest, browser |

### The correction: bootstrap seeding never means "complete"
`bootstrap` stores a web address as the Brand Brain description (`Customer-provided website or profile: <url>`) and the marketing challenge as the call to action. The frontend now:
* counts a profile complete **only when** the saved onboarding status is `completed` (which the customer reaches by pressing **Confirm setup**, and which the API accepts only with a saved sector and channel) **and** the backend says the name is not a placeholder **and** the Brand Brain holds a description that is not that seeded text;
* never prefills the seeded text as "what the business does", and shows "Only the web address given at setup is stored" instead;
* keeps **Confirm setup** disabled, with the reasons listed, until a sector, a channel, a real name and a written description are all saved, and while any answer is unsaved.

Consequence to note: customers who finished the earlier (BG-STUDIO-008-FE) flow have no onboarding record, so they are shown as "Needs your input" until they confirm once. That is intended.

### Not changed
Entitlement, billing, tenant isolation, campaign, preview, acknowledgement, approval and revocation code is untouched; its tests still pass. The V3 preview is untouched. No browser storage is used. The workspace **chooser** for `selection_required` (API contract G5) is **not built**; the existing message remains and a chooser is a follow-up. Only the reset/refresh behaviour on a scope change (the requirement) is delivered.

## 3. Verification: what is real and what is mocked
| Check | Result | Real or mocked |
|---|---|---|
| Vitest | **331 / 331** across 21 files (base 260, plus 71 net new) | API, session mocked with the `workspace-onboarding.v1` shapes from #213 |
| Production build, flag on and off | pass | real build |
| Flag-OFF DOM vs base | identical in 7 states (`docs/evidence/010/flag-off-dom-equivalence/`) | production code |
| Flag-ON browser QA (Chromium): axe wcag2a/2aa/21aa/22aa, overflow, 24 px targets | **18 / 18 at each of 1440, 768, 390, 320** (11 existing + 7 new: resume, Save and exit with reload, 503 on save, 503 on load, seeded Brand Brain, version conflict, keyboard) | API and Supabase session **mocked in the browser** |
| Mutation checks (fail when the logic is removed) | 8 of 8 caught: complete ignoring confirmation, seeded description counted, no clear of a customer sector, a new key on every retry, a late save applied to another account, placeholder flag ignored, unchanged sector re-sent, Brand Brain text duplicated into the draft | Vitest |
| CI | see §5 | isolated GitHub Actions run |
| **Real connected staging** | **none** | the API, database, migration, token flow and storage were never exercised; see the staging addendum in `STAGING_E2E_TEST_PLAN.md` |

I viewed the saved-state, 503, seeded-Brand-Brain screenshots at 390 and the workspace at 1440; not every image.

Issues found while building and fixed before the first commit: an "unsaved changes" flag that a merely inferred sector would have triggered (it now counts only customer actions); a bootstrap-seeded call to action (up to 1,000 characters) that would have exceeded the API's 500-character draft limit if copied into the draft (it is not duplicated); and, through the mutation checks, a test that let a late save for another account pass (strengthened until the mutant failed).

## 4. Known limits and follow-ups
1. **Backend dependency:** nothing works against a real API until PR #213 is merged and its migration is applied by the founder. Until then the app (flag on) shows "saved setup is unavailable" and never claims a save.
2. Resuming does not merge a stale tab field-by-field; on a conflict the customer's typed answers are kept and the next save overwrites with them, after the explicit warning.
3. "Work it out from what I have typed" after a saved customer sector clears the saved choice; an inferred sector is saved on the following save.
4. The recommendation request is unchanged. Per the API contract, completed channel preferences reorder its suggestions server-side; the frontend does not duplicate that.
5. Workspace chooser (G5) and recovery for revoked media / the Instagram video profile are outside this slice.

## 5. CI (isolated workflow dispatches of `studio-005-integration-ci.yml`; no native PR checks exist because the repository's workflows run only for PRs targeting `main`)

### 5.1 First attempts (tested code `e1db8af`): 11 of 13 twice, then cancelled
Runs 21 (`39934076514`) and 22 (`39934885548`) each had two browser jobs sitting in `npx playwright install --with-deps chromium`; no test had started. I cancelled each after about six to seven minutes. No test failed.

### 5.2 Root cause (from the job logs of the stalled jobs `120349201892` and `120351896145`)
The time was spent in **`apt`, not in the Chromium download.** `--with-deps` runs `apt-get install` for about 17 packages (fonts, xvfb, glib, nss). The logs show `Get:N http://azure.archive.ubuntu.com/...` lines for small packages (50 kB to 5.6 MB) taking **2 to 2.5 minutes each**, one `Ign:` (a fetch given up on, then retried by name), then progress resuming. The runner's apt had no retries and a long default timeout, so a throttled Azure mirror turned a normal 20-second step into many minutes. Because the 13 jobs start together and all hit the same mirror, a different two jobs were slow each time. This also corrects my earlier wording: the jobs were **slow, probably not deadlocked**: the run-21 job I read had reached package 10 of 17 when I cancelled it, and my cancellations are what ended both runs. The job timeout (20 minutes) was never reached.

Reviewed and not the cause: the workflow's `timeout-minutes` (20, ample), concurrency (none defined; unrelated), dependency caching (`npm ci` took 3 to 6 s; the browser download is not what stalled), runner setup (identical `ubuntu-latest`, Node 22, Playwright 1.56.1 in every job).

### 5.3 Fix (`9fa0582`, `.github/workflows/studio-005-integration-ci.yml` only)
In the three browser jobs the install step now writes `Acquire::Retries "5"; Acquire::http::Timeout "20"; Acquire::https::Timeout "20";` to `/etc/apt/apt.conf.d/` and then runs the **same** `npx playwright install --with-deps chromium`, with `timeout-minutes: 12`. A stalled fetch now fails after 20 s and is retried instead of waiting minutes. The same packages are installed, so rendering and every browser, accessibility, preview and onboarding check is unchanged: `git diff e1db8af 9fa0582` touches nothing under `src/`, `qa/`, `studio-preview/`, `package*.json` or the build config. No test, matrix entry or viewport was removed or weakened. `app-a11y-qa.yml` and `studio-browser-qa.yml` (which run for PRs to `main`) have the same install pattern; I left them unchanged to keep the fix minimal.

### 5.4 Result: run 23 (`40096781641`), tested SHA `9fa058232ba50209c8c26946fcb4b8744a577332`, dispatched with `ref` and `expected_sha` both set to that SHA
Run conclusion **success; 13 of 13 jobs succeeded**, each with the checked-out-SHA guard passing. The install step took **19 to 27 s** in every browser job (it had taken minutes in the stalled jobs).

| Job | Viewports | Browser step actually ran | Evidence read in the job log |
|---|---|---|---|
| `unit-build` | n/a | `npm test`, `npm run build` | build output (`vite build ... built in 1.56s`); step succeeded |
| `premium-browser` | 1440x900, 768x1024, 390x844, 320x568 | `playwright test --config qa/premium.playwright.config.mjs` | 390x844 log: **"Running 18 tests ... 18 passed"** with each test listed (all 7 onboarding journeys); the other three viewports' test steps ran for 10 to 15 s and succeeded |
| `app-a11y-browser` | the same four | `playwright test --config qa/playwright.config.mjs` | 1440x900 log: **"2 passed"**; the "Skip when this ref has no app browser checks" step reported run=true |
| `preview-browser` | the same four | `playwright test studio-preview/...` | 1440x900 log: **"33 passed"** (v1 + v3) |

I read the full test listing for one viewport of each browser suite and the step timing for the rest; I did not read all 13 logs line by line.

Honest limits: this is **one** clean run, so the fix is supported by the log evidence for the cause and by this result, not by repeated runs. The mirror slowness may have been transient, so a 13/13 would have been possible by chance; I deliberately did not re-dispatch the unchanged workflow to test that. The tested code is `9fa0582`; the report and later docs commits are documentation only.

### 5.5 Governance note
The API PR #213 owner comment of 24 Oct 2026 places the backend contract under an architectural hold (a competing Codex branch `bg-studio-010-be-persistent-onboarding` exists). This frontend was built against #213. **No frontend adapter change, new PR, merge, deployment, migration or flag activation was made in this CI work**, and none should be made until the architecture decision selects one canonical contract.

## 6. Contract alignment with the hardened API (BG-STUDIO-011-FE; API PR #213 at `120a874dfa02313a8c28dad82ddb6582f0065469`)
Read from the exact diff `d0e1142` to `120a874` and its report `docs/studio/BG_STUDIO_011_BE_HARDENING.md`, not inferred. **No endpoint, request field, envelope, `contract_version`, CAS or idempotency rule changed; no backend change; Architecture A is canonical (DEC-020 / LOCK-018).**

| What the backend now does (read from its code) | Frontend correction |
|---|---|
| A **503 on a write can follow a commit** whose acknowledgement was lost (its own PostgreSQL test proves a same-key retry returns the single committed receipt). | A 503 (and a dropped connection, and a timeout) on a **write** now says **"Save not confirmed — your changes may already have been saved."**, never "NOT saved". Typed answers stay. The retry sends the **same idempotency key and the same body**, so the server replays one receipt. A **Check what was saved** button re-reads the record. Only a 404 (service not found, request not processed) still says "NOT saved". A 503 on a **read** says nothing was changed. |
| `ONBOARDING_INCOMPLETE` (422) now also lists **`business_name`** and **`description`** (placeholder, empty, bootstrap-seeded or a bare web address), plus `sector_key` and `channels`. `completeness.missing` carries the same paths. | The error shows a **field-by-field list** with plain guidance and a button to the step that fixes each one. Nothing is marked confirmed; the sector's inferred or customer source is untouched. **Confirm setup** stays closed whenever the server's `completeness.missing` is non-empty, even if this screen thinks the facts are saved, and a description that is only a web address now counts as missing here too. |
| Only the workspace **owner** may write; a member's `PUT` is a plain **403 `WORKSPACE_NOT_AUTHORIZED`**, the same answer as "not a member". Authorised member `GET` still works. | The role is read from the existing `GET /customer/workspace` list (`membership_role`) for the signed-in workspace. A **known non-owner** gets a "View only" explanation, **Save progress, Save and exit and Confirm setup are disabled**, typing is not treated as unsaved work (no leave-page warning), and everything stays readable. An **unknown** role is never guessed: the server decides, a refused write explains "only the workspace owner can save or confirm setup, or your access to this workspace has ended", and the role is re-read. |

**Verification (MOCKED API with the documented shapes; not staging):** Vitest 353/353 (331 before); flag-off DOM identical in 7 states; flag-on browser QA 22/22 at 1440, 768, 390 and 320 (4 new journeys: lost acknowledgement with replay, 422 guidance, read-only member, refused write). Evidence: `docs/evidence/010/alignment/`.

**Limits:** the role comes from a separate list request and can be stale (the server remains the authority). At the time of this alignment, Brand Brain save permissions were a separate policy that the backend left unchanged, so **Save to Brand Brain is not disabled** for members. **Superseded by founder decision DEC-021 / LOCK-019 (24 Oct 2026):** only owners may write the authoritative business name and description; members keep other Brand Brain edits. Backend enforcement is pending, and the frontend adjustment is a proposal only (`BG_STUDIO_013_FE_FOUNDER_ACCEPTANCE.md`, section 12). A real unconfirmed-save recovery depends on the deployed API honouring the replay; this has only been proved against the backend's own tests and this repository's mocks.
