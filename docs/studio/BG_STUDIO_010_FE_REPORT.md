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

## 5. CI (isolated workflow dispatches of `studio-005-integration-ci.yml`; there are no native PR checks because the repository's workflows run only for PRs targeting `main`)
Tested code: `e1db8afd67de4fa4afc82b4b2b3a06597e2905c8`. Each job records the checked-out SHA and fails if it differs from `expected_sha`; both dispatches passed `expected_sha = e1db8af`. Commit `1aab6a1` (this report and evidence) is docs only. Run 22's GitHub "head SHA" shows `1aab6a1` because that is the branch head it was dispatched from; its `ref` input made it check out and test `e1db8af`.

| Run | Result |
|---|---|
| 21 (id 39934076514) | **11 of 13 jobs succeeded**, including `unit-build` (`npm ci`, `npm test`, `npm run build`), `premium-browser` at 1440x900, 768x1024 and 320x568 (the flag-on suite with axe, ran and passed), all `app-a11y-browser`, and `preview-browser` at 1440x900 and 320x568. `preview-browser` 768x1024 and 390x844 sat for over five minutes in the `playwright install --with-deps chromium` step (the same step takes about 20 s in the other jobs), before any test ran. I cancelled the run. Conclusion: **cancelled**. |
| 22 (id 39934885548) | A fresh dispatch on the same tested code. **11 of 13 jobs succeeded**, including `unit-build`, `premium-browser` at 1440x900, 768x1024 and 320x568, and `preview-browser` at 768x1024 and 390x844. `premium-browser` 390x844 and `app-a11y-browser` 1440x900 again sat in the same Chromium install step with no test started. |

What this does and does not show: **no job failed a test.** Every one of the 13 distinct jobs (unit-build; premium-browser x4; app-a11y-browser x4; preview-browser x4) completed with success on the tested code in at least one of the two runs, and the premium-browser steps ran rather than skipping. But **no single run is 13/13**, because in each run two jobs stalled in a runner/Chromium-install step. I did not treat that as green. I used the allowed re-run once and the hang recurred on different jobs, so I stopped rather than keep re-running; a clean 13/13 run still needs to be obtained (re-run the workflow when the runners are healthy). The same suites also pass locally (§3).
