# BG-STUDIO-011-FE report: workspace selection and founder-acceptance readiness for the Premium Studio

Authority: Google Sheets Mission Control Register v1.0 (DEC-015); founder decision DEC-020 / LOCK-018 as recorded in the comment on bizgenie-api PR #213 (24 Oct 2026). This report is evidence for it, not a status change. **Draft. Not founder-accepted, not production-ready, not deployed. The flag is not activated. Every API, session and Supabase-refresh interaction in the evidence is mocked.**

## 1. Verified starting state (live GitHub, 24 Oct 2026)
| Item | State |
|---|---|
| Web PR #48 (`bg-studio-010-fe-persistent-onboarding`) | open draft, head `bf56a2d0790a3c3f3613af7251de6a9ca1f3d50f` (code `e1db8af`, CI fix `9fa0582`). **This work is stacked on it** as PR #49 because it is a distinct customer-facing feature with its own evidence and does not alter the onboarding contract. |
| Web PR #47 | open draft, head `412ede3`; the base of #48. No BG-STUDIO-009-FE work exists. |
| API PR #213 | open draft, head `d0e1142c91c0c12b907227f2881e14f3bb2a44e2` (unchanged; Codex's hardening is not pushed yet). Contract `workspace-onboarding.v1` is **preserved unchanged**. |
| Architecture | A (PR #213) approved and canonical; B (`bg-studio-010-be-persistent-onboarding`) superseded and **not used**. Pre-workspace Save and exit is deferred: a customer must select or create a workspace first, which is how this app already behaves. |
| Not done | no merge, deployment, migration, flag activation, provider call, publishing or paid generation. |

## 2. What was built
### 2.1 Multi-workspace selection (G5), in the real authenticated `src/` app
Backend routes used (both existing, unchanged, identity token): `GET /customer/workspace` and `POST /customer/workspace/select`.

| Requirement | Behaviour | Where |
|---|---|---|
| Show authorised workspaces | When the API returns `selection_required`, or the customer opens the new **Workspaces** section, exactly the returned workspaces are listed (name, project, role; an id suffix only if two names are identical). A malformed list shows nothing rather than a guess. | `PremiumWorkspaces.jsx`, `workspaceClient.js` |
| Never select silently | Nothing is pre-selected; no `select` request is sent until the customer presses a workspace. Creating a workspace when the customer already has several (`selection_required` from the pre-check) goes to the chooser instead of creating or choosing one. | tests |
| Explicit selection | `POST /customer/workspace/select` with only the three ids. The response must confirm **exactly** the chosen workspace, otherwise nothing is switched. | `workspaceClient.js` |
| Session refresh | `requires_session_refresh: true` calls `refreshCustomerSession()`, otherwise `getCustomerSession()`. The new workspace's data is requested **only after the refreshed sign-in carries exactly the chosen tenant, project and brand**; a session that has not switched (or carries a different workspace) shows "your sign-in has not switched yet", shows nothing from the new workspace, and reloads the current one. | `App.jsx` |
| Correct data loads | Brand Brain, onboarding, campaigns, calendar and recommendations all use the new session's token; nothing from the old workspace is requested or shown. | tests (token on every request) |
| Clear old state immediately | At the moment of selection the previous workspace's state is cleared and "Switching to X…" replaces the whole screen, so nothing of the old workspace is visible. | `App.jsx` |
| No stale responses | Responses started under an earlier scope (GET, PUT, select, session refresh, list) are ignored, including after sign-out or an account change mid-switch. | tests, mutation checks |
| Revoked / unavailable | A `400` from select means "no longer available to your account": the list is refreshed and nothing is selected. A `403` on the current workspace offers **Choose a workspace** instead of a dead end; a current workspace missing from a refreshed list is called out. A workspace whose brand is not approved is **shown, disabled and explained**, not hidden. | tests, browser |
| Unsaved answers | Switching with unsaved onboarding answers needs an explicit **Discard and switch** (or **Stay here**); saved answers are kept. | tests, browser |
| Sign out while choosing | A customer who must choose a workspace has a **Sign out** button (premium only). | `App.jsx` |

### 2.2 Premium onboarding wording
* One shared **"How answers are labelled"** legend on the onboarding steps and the workspace card: **You entered this** (this screen only, not saved), **Saved** (stored and confirmed), **Inferred, needs your confirmation**, **Not provided yet**.
* An inferred sector (typed text, or saved as inferred) shows "BizGenie worked this out from your words. It needs your confirmation before it counts as your answer" with a **"Yes, X is right"** action that turns it into the customer's own choice.
* The workspace no longer says an unqualified "Complete": when setup has been confirmed but details are missing it says "Setup confirmed by you. N details are still not provided."
* Unchanged from #48 and re-tested: a seeded website address or marketing challenge, or any inferred value, **never** counts as a completed profile; completion requires the customer's explicit Confirm setup (server-enforced: saved sector and channel) plus a name the backend says is real and a description the customer wrote.
* **Coordination with BG-STUDIO-011-BE:** Codex's hardening of customer-confirmed completion and provenance is not yet on PR #213. The frontend wording above relies only on the existing contract fields (`status`, `sector.source`, `channels.source`, `completeness`, `brand_name_placeholder`). If the server changes those semantics, this wording needs one more pass, and any contract change needs Codex and founder approval first.

### 2.3 Visual and usability review of the production `src/` Studio
I reviewed the actual flag-on production build (not the preview) at 1440, 768, 390 and 320 px, using the screenshots in `docs/evidence/011/` and the earlier sets in `docs/evidence/008/` and `010/`. Fixed here: the page heading's focus ring spread the full container width (now fits the text); workspace tab pills are a little tighter on very small screens; the in-page "Complete" tile no longer overstates setup. **Seen and not fixed (known limitations, §5):** the seven-section tab bar wraps to three rows at 390 and 320 px and pushes content down; the legacy "Execution mode" select in Campaign Studio clips its long option text at 320 px; and uppercase micro-copy there is hard to read. Those parts of Campaign Studio are the shared, pre-existing campaign UI, which this work did not restyle. I did not add any fake metric, campaign, integration or customer result; the only business names shown are the customer's own or clearly mocked fixtures in the tests.

## 3. Verification
Mocked API/session/Supabase-refresh fixtures throughout, explicitly labelled as such in the test files and the evidence index.

| Check | Result |
|---|---|
| Vitest | **363 / 363** across 24 files (#48 head: 331). New: workspace client (7), App workspace-selection (22), MediaPreview load-order regression (3). Production build passes. |
| Flag-OFF DOM vs the #48 head | identical in 7 states (`docs/evidence/011/flag-off-dom-equivalence/`) |
| Flag-ON browser QA (Chromium): axe wcag2a/2aa/21aa/22aa, overflow, 24 px targets | **26 / 26 at each of 1440, 768, 390, 320** (18 earlier + 8 new journeys: two workspaces and forced choice; switching; session refresh and reload persistence; revoked access; unapproved workspace; stale-response isolation; save and resume across switching; unsaved-answer dialog; keyboard) |
| Mutation checks | 8 distinct mutants: **7 caught** (session scope not checked; server confirmation not checked; a late select result applied after an account change; a late session refresh applied after an account change, which first survived and needed a new test; chooser bypassed; unsaved answers discarded silently; unapproved workspace selectable). The eighth, "do not clear state at the start of a switch", is behaviourally equivalent: the same state is cleared again when the new session arrives, so I kept the early clear as defence in depth and say so rather than claim it is tested. |
| Real connected staging | **none**: no real API, database, migration, token or Supabase refresh. The staging plan in `STAGING_E2E_TEST_PLAN.md` still applies, and should add: two real workspaces, select, refresh, revoke one. |

## 3a. CI repair: the failed run and the fix
**Run 24 (`40100249994`, tested `a91d99f`): 12 of 13 jobs passed; `unit-build` failed.** `npm test`: 359 of 360 passed. The failure was `src/MediaPreview.test.jsx:37`: `expected 'loading' to be 'displayed'` after `fireEvent.load(img)`. The DOM dump in the log shows the `<img>` present, the figure `aria-busy` and "Preparing the image…" on screen.

**Root cause: a latent race in production code (`src/MediaPreview.jsx`), not test synchronisation.** The component kept "the image rendered" as a state flag and reset it from a passive effect keyed on the image URL (`useEffect(() => { setRendered(false) }, [preview.url])`). A browser may deliver an image's `load` event before React has run the passive effects of the commit that created the element. The reset then runs afterwards and erases the real result, and the preview is stuck at "Preparing…" for good. Whether that ordering happens depends on timing (a slow first commit makes it likelier, and this was the first test in its file on a CI runner), which is why it failed there and not here.
* **Reproduction:** I could **not** reproduce the timing flake locally: 400 repeats under CPU load and several ordering experiments all passed. I did reproduce the **defect itself** deterministically: a new test (`src/MediaPreview.loadOrder.test.jsx`) delivers `load` from a layout effect, which always runs before passive effects. On the old code it fails with the same message as CI (`expected 'loading' to be 'displayed'`); it passes after the fix. The original assertion is untouched.
* **Fix:** the browser's verdict is stored **per URL** (`renderedUrl` / `failedUrl`) and compared with the current URL, with no reset effect, so effect ordering cannot undo it. A new URL still has to load for itself, and a failed image gets a fresh chance on a new URL (both pinned by tests). No timeout was changed, no test skipped or weakened, and nothing else in the product changed. The component is shared with the flag-off app, whose rendered output is unchanged.

## 3b. CI result: run 25 (`40100866374`), tested SHA `4348e43b60af2426125c5419bea7c850e6accdc0`
Isolated dispatch of `studio-005-integration-ci.yml` with `ref` and `expected_sha` both set to that SHA (every job's checked-out-SHA guard passed). **13 of 13 jobs succeeded** in one run:

| Job | Viewports | Evidence read in the job log |
|---|---|---|
| `unit-build` | n/a | **"Test Files 24 passed (24), Tests 363 passed (363)"** (includes `MediaPreview.loadOrder.test.jsx` 3 tests and `MediaPreview.test.jsx` 9 tests), then `vite build` succeeded |
| `premium-browser` | 1440x900, 768x1024, 390x844, 320x568 | 390x844 log: all **26 tests listed and "26 passed"**, including the 8 workspace-selection journeys; the other three ran the same step (21 to 26 s) and succeeded |
| `app-a11y-browser` | the same four | 1440x900 log: "2 passed" |
| `preview-browser` | the same four | 1440x900 log: "33 passed" |

I read the full pass listing for one viewport of each suite and the step timings for the rest, not every log line. The Chromium install step took 19 to 39 s in every browser job (the apt fix from PR #48). Documentation commits after `4348e43` do not change tested code.



## 3c. Contract alignment with the hardened API (API PR #213 at `120a874dfa02313a8c28dad82ddb6582f0065469`)
The corrections live on the #48 onboarding stack (commit `40f41ff3b1ba3622a0f3419aaf769627bb6d325a`; see section 6 of `BG_STUDIO_010_FE_REPORT.md`) and were merged into this branch as `6ee493b1dd68461a48254a245338a0a6186541d5`. No endpoint, envelope, CAS or idempotency change; no backend change; Architecture A is canonical (DEC-020 / LOCK-018).

- **503/network/timeout on a save:** "Save not confirmed — your changes may already have been saved." Answers stay; retry sends the same key and body; "Check what was saved" re-reads the record.
- **422 incomplete setup:** field-by-field list (business name, description, sector, channels) with a link to the fixing step; nothing marked confirmed.
- **403 on a write:** owner-only. A known non-owner (role from `GET /customer/workspace`) is view-only with Save progress, Save and exit and Confirm setup disabled; reading still works. A 403 on read still sends the customer to the chooser. The workspace chooser, `ProvenanceLegend` and the `MediaPreview` per-URL fix are unchanged.

**Evidence on `6ee493b` (mocked API; not staging):**
- Local: Vitest 385/385 (25 files); build passes; premium browser QA 30/30 at each of 1440x900, 768x1024, 390x844 and 320x568.
- CI: isolated workflow run 26 (`40103742885`), `workflow_dispatch` once on this exact SHA: **13/13 jobs concluded success** (unit-build; premium-browser x4; app-a11y-browser x4; preview-browser x4). The premium-browser jobs ran the Playwright step (read: 30 passed at 390x844). Guard steps named "Skip when this ref has no ... checks" are no-op checks that succeeded; the Playwright steps ran.
- Not re-run on the merged tree: the flag-off DOM-equivalence script (flag-off behaviour is covered by the unit tests and CI only).

**Limits:** the role comes from a separate list request and can be stale (the server decides); a 403 on write cannot distinguish "member" from "access ended"; the 503 uncertainty cannot be removed, only handled safely; Brand Brain save permissions are a separate, unchanged backend policy, so "Save to Brand Brain" is not disabled for members; the hardened schema migration is not applied anywhere, so nothing here has met a real API.

## 4. Founder walkthrough (all screens mocked)
1. **Two workspaces, none chosen** (`chooser-required`): a signed-in customer with two authorised workspaces sees "Choose a workspace… BizGenie will not pick one for you." Nothing is loaded yet.
2. **Choose** (`workspace-after-select`): pressing "Use Brookside Aesthetics" shows "Switching…" with nothing from any workspace, then that workspace only (its name, sector and data).
3. **Switch later** (`chooser-switch`): the new **Workspaces** section marks the current workspace and disables it.
4. **Unsaved answers** (`chooser-discard-confirm`): switching asks "Discard unsaved answers?"; **Stay here** changes nothing.
5. **Refused or revoked** (`chooser-revoked`, `chooser-unapproved`): a refused selection says nothing was changed; a not-yet-approved workspace is visible but cannot be selected.
6. **Resume** (`resume-after-switch`): each workspace keeps its own saved progress; switching back restores it, and the other workspace's answers never appear.
7. **Labels** (`onboarding-3-about`): the legend, and the "needs your confirmation" prompt for an inferred sector.

## 5. Known limitations and outstanding gaps
1. **Not founder-accepted.** Product stays AMBER until a connected, authenticated staging proof exists: real API, applied migration, real Supabase refresh, two real workspaces.
2. **Backend dependency:** PR #213 and its migration are unmerged and unapplied; Codex's BG-STUDIO-011-BE hardening is pending. Completion wording may need one more pass after it lands.
3. A real session refresh after `select` depends on the provisioner having updated `app_metadata`. The frontend refuses to show data unless the refreshed token carries the chosen scope, but whether the real deployment achieves that on the first refresh is **unproven**; the fallback message tells the customer to retry or sign out and in.
4. Tab bar: seven sections wrap to three rows on phones. A compact workspace switcher in the header would be tidier; I did not change the shared header.
5. Campaign Studio's legacy execution-mode select clips long text at 320 px and uses tiny uppercase hints (pre-existing shared UI).
6. The chooser shows a workspace name as stored; the API's placeholder flag exists only for the current workspace, so a placeholder-named workspace in the list is shown as stored (with its project name for context).
7. Pre-workspace Save and exit is deliberately not offered (founder decision).
8. The 24 px target check passes; I did not test with a real screen reader.
