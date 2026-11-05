# BG-PROGRAMME-001 — execution handover (dependency-ordered)

Corrected 27 Oct 2026 after founder review of PR #58. Supersedes the planning content of the earlier master plan and 90-day roadmap. Priority: **working integrated premium customer journey, then controlled production launch.** Nothing here has been executed: no merge, deploy, shared migration, provider activation, DNS or billing change.

## 1. Governing scope (verified by the founder; not re-derived by me)
Mission Control = canonical register (17 tabs). `DEC-014` supersedes `DEC-009`: **core Learning Brain, Hybrid UGC and social connection are PRE-LAUNCH**. #128 stays the launch contract, read with #191 and Mission Control; #191 is an engineering cross-reference only (`DEC-015`). `LOCK-015`: prior verified PASS evidence is preserved. `DEC-020`: Architecture A onboarding approved, implementation gated. `DEC-025`: workspace-wide calendar required before full launch. **No public pricing or credit tariff is approved.** Nothing in this programme defers Hybrid, shrinks scope, substitutes manual invoicing or publishes prices.

## 2. Exact SHAs (re-fetched 27 Oct 2026)
| Item | SHA |
|---|---|
| web `main` | `e9e5a1f4f208787248fc9dd18ee8f5df1c60d05a` |
| web PR #56 head (docs) / last code | `205a9830ceb84a497b9bf09b551e5a5f1241fdc6` / `cf5fec937087bdafcf4cd43d0471622698099886` |
| web PR #57 head / tested code | `0077c7b9904be0fe7f325155ab999ad9c4ec901f` / `a21184a24b062329e619fcc21050a08f964c2714` |
| api `main` | `ddcc26cb4111303f0c8fbf9745db5fed1e40ca6f` |
| api PR #213 / #214 / #215 / #216 / #217 | `120a874` / `51e8ca4` / `e84c6d0` / `f8d81bf` / `23f4903` (full: `23f49038f36acf8414a079e27a8d5ffc8d302f2b`) |
| api PR #218 head | `9346055a4b0c2057f8ab13274396ecf502296ed6` |

## 3. Evidence classes (never merge them)
| Class | Meaning | What exists |
|---|---|---|
| **H — historical staging PASS** | Earlier verified staging results held in Mission Control (preserved by `LOCK-015`) | **Not visible to my session.** Preserve; do not downgrade; do not cite as current |
| **L — local draft integration PASS** | Draft code from #56/#218 run together on a local PostgreSQL | Yes: 023 `quoteConfirm`, `backendDraft`, `performanceEvidence`, `backend218` tests; browser matrix; hosted CI green on #56 code `cf5fec9` (13/13 via exact-SHA dispatch), #217/#218 (Node 22 tests/syntax and Docker/Buildpack checks success). Additionally this session: 9-migration rehearsal on a throwaway PG16 (§5) |
| **D — current deployed operational acceptance** | The chain deployed to an approved environment and a customer journey passed there | **None evidenced.** Required before launch |
Only class D can lift NO-GO. Classes H and L inform it but do not replace it.

## 4. Smallest safe integration candidate
Both stacks are linear, so the smallest unit that *advances the customer journey* is the **pair**: **api #218 (tip of #213→#218; 57 commits, 49 files vs #217, clean merge into main, hosted CI green) + web #56 (gates default OFF; clean trial merge into main).** Reasons it cannot be made smaller without losing value: #56's integration tests consume `generation-quote.v1`, `/customer/insights/*`, media-intake and social routes that exist only at #218; #217→#218 adds 1,270 lines across 49 files including four of the nine migrations' consumers. Smaller prefixes (#213–#217, web #34–#47) are mergeable but deliver no customer-visible step. Sequence inside the pair: backend first, then frontend with every `VITE_*` capability gate OFF; enable per gate in an approved staging environment. Risk controls: optional services return stable 503s unless configured; frontend gates strictly `"true"`.
Open caveat: #213's migrations create the onboarding tables for `DEC-020` Architecture A, whose *implementation is gated*. Decide before merge whether code merges with those migrations withheld from the runner, or the gate is lifted (founder/Codex; task B1).

## 5. Migration rehearsal
Done locally (throwaway PostgreSQL 16, Supabase role/auth stubs, nothing shared): applied main's 20 migrations, seeded 2 `stripe_webhook_events` rows (processing/failed), then the 9 new migrations in order — **all 9 applied; the seeded rows took the new defaults (`claim_token` null, `attempt_generation` 0)**; each ran in <50 ms on near-empty tables. Re-applying fails on migrations 4–9 (plain `create table`): they are **forward-only**; the runner must track versions and never replay. Not covered (must be done in an approved copy-of-staging): real data volume; lock time of `alter table stripe_webhook_events add column … not null default` and the onboarding constraint drop/re-add (`20261025090000`) on populated tables; the runner and rollback path; backend Postgres integration suites (`test:*:postgres`) on the migrated copy; RLS/role behaviour against real Supabase roles. Rollback: additive tables can be dropped; column additions on `stripe_webhook_events` and the constraint change on `workspace_onboarding_profiles` need a written down-script (task B2).

| Migration (#218 vs main) | Touches existing table? |
|---|---|
| 20261023100000 create onboarding profiles; 20261024090000 harden; 20261025090000 add professional sector | new table; constraint drop/re-add (professional services sector, `DEC-023`) |
| 20261026100000 quotes/claims; …120000 revision links; …130000 media intakes; …140000 social; …150000 performance/learning | new tables; …150000 adds a column to `generation_execution_claims` and constraints on `social_dispatches` |
| 20261026110000 stripe event recovery fences | **adds 3 columns to `stripe_webhook_events`** (billing table; highest care) |

## 6. Contract mismatches (exact)
Consumer → expected → actual provider → consequence → correction → owner → test.
1. web `socialClient.js` → legacy routes → api #218 `/customer/social/*` → connection UI cannot work → rewrite client; keep gate OFF → Claude → contract test vs #218 server.
2. web insights validator → row-level `contract_version` → #218 persisted rows omit it → tolerance in FE (shipped) → add field in backend → Codex → `backend218` test.
3. web feedback body → `{recommendation_id, decision, expected_version, idempotency_key}` → #218 route matches → none (reference-implementation `recommendation_hash` removed) → — → `backend218`.
4. web media/creative-job UI → creative jobs + media attach → #218 provides, FE not wired → no upload/preview in the app → adopt UI → Claude → browser matrix.
5. web calendar → workspace-wide calendar (`DEC-025`) → campaign facts only (workspace endpoint not confirmed in #218) → full launch gate unmet → confirm/add endpoint → Codex then Claude → integration test.
6. web campaign discovery → #218 discovery routes → partly adopted → finish → Claude.
7. api media delivery: #205–#212 vs #218 → two lineages, add/add conflict in `src/media/previewDelivery.js`, index, campaigns repo/router → decide lineage → Codex → media tests on merged head.
8. web #57 form → `early-access-interest.v1` `POST /public/early-access-interest` → no route (existing `/public/paid-beta-interest`) → lead capture fails → extend paid-beta domain → Codex → `site/contract`.
9. api billing management routes not mounted; Stripe inactive → no live billing → unchanged (no billing change authorised) → — .
10. Hybrid UGC #189 and engagement #204 are not in #218; both merge cleanly with it → pre-launch scope outstanding → rebase onto #218 with tests → Codex.

## 7. Existing application visual upgrade and PR #57
* **Visual upgrade = the Premium Studio design in the existing React application** (design proof #27 plus #34–#46 refinements, five-industry neutral onboarding, 023 button/contrast fixes). It is delivered inside #56, behind gates, in the same app. It is **not** a replacement application; `src/` of the original app is the base and `main` keeps working with gates OFF (flag-off test exists).
* **PR #57 is a separate static landing page** (`site/` → `site-dist/`, own build, no shared bundle). Its output is not the app's `dist`. Correction to carry (my reading of "build-output correction", please correct if you meant otherwise): `site-dist*`/`dist` are ignored and untracked (verified: 0 tracked build files); rebase #57 to resolve its single `.gitignore` conflict; confirm the publication build writes only `site-dist/`; keep `dist` (app) and `site-dist` (landing) independent in hosting. The web repo already has a Cloudflare Pages check on #56; whether that project serves the app or the landing page, and which one `getbizgenie.com` points to, is a hosting fact for the founder — no DNS change is proposed.

## 8. Dependency-ordered bounded tasks
Each task is one PR-sized unit with a stated check. "A" = after.
| ID | Task | Owner | Depends | Done when |
|---|---|---|---|---|
| B1 | Decide migration/gating of #213 onboarding tables vs `DEC-020` | founder + Codex | — | written decision |
| B2 | Approved rehearsal on copy-of-staging; down-scripts for stripe columns and onboarding constraint; run `test:*:postgres` | Codex | B1 | log + SHAs |
| B3 | Media lineage: keep #218 versions, port only unique commits from #207–#209, close the rest | Codex | — | merged-head media tests green |
| B4 | Row-level `contract_version` on insights rows | Codex | — | `backend218` strict-mode test |
| B5 | Confirm/add workspace calendar endpoint (`DEC-025`) | Codex | B3 | route + contract test |
| B6 | Rebase #189 (Hybrid UGC) onto #218 with tests | Codex | B3 | CI green on #218 base |
| B7 | Lead route `early-access-interest.v1` + export/deletion + retention (extends paid-beta) | Codex | — | `site/contract` green on real server |
| B8 | Social connection adapter(s) behind gate (real OAuth only in approved staging, after Meta access) | Codex | B2 | gated test; no provider call without approval |
| F1 | Rewrite `socialClient.js` to `/customer/social/*` | Claude | — | contract test vs local #218 |
| F2 | Wire creative-job / media-intake UI, preview delivery | Claude | B3 | browser matrix 5 industries × owner/member |
| F3 | Calendar: workspace-wide view | Claude | B5 | browser + integration |
| F4 | Hybrid UGC upload/compose UI | Claude | B6 | browser matrix |
| F5 | Learning Brain wired to real `/customer/insights` for the full journey, no fixture fallback when gate ON | Claude | B4 | integration |
| F6 | Rebase #57; keep `site-dist` independent; strict build once founder facts supplied | Claude | — | Website CI green on exact SHA |
| M1 | Merge decision: #218 then #56 (gates OFF) | founder | B1–B3, F1 | founder approval |
| D1 | Deployed acceptance (class D): five industries × owner/member × full journey in approved environment | Codex + Claude + founder | M1, B8 | recorded D-class evidence |
Parallel throughout: Meta Tech Provider access verification (founder; deadline 25 Dec 2026). Business verification (26 Oct) is not that.
Not scheduled by me: editing (captions/voice/music/trim), video, floating Genie, Creative Director are Canon Ring-1 items; their order is a founder call — add them as bounded tasks in Mission Control once ordered, and treat them as launch-blocking unless a locked decision says otherwise.
