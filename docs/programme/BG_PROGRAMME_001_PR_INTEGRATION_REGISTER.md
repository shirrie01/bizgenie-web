# BG-PROGRAMME-001 — PR and branch integration register

27 Oct 2026. All 47 PRs are **draft**. Facts from native git on fetched PR heads (ancestry, `git cherry`, trial merges) and GitHub CI. **Nothing merged or closed.** Mergeability is "clean trial merge into current `main`" unless stated.

## Frontend `shirrie01/bizgenie-web` (main `e9e5a1f`)
| PR | Head | Relation | Disposition |
|---|---|---|---|
| #25 neutral onboarding (remove Fonzo defaults) | 22f12c0 | **not** in #56; goal re-done in #42 | **Close candidate** (superseded) — founder to confirm |
| #27 Fonzo premium design proof | fba04d8 | in #56 | Merge via #56 |
| #34–#47 | see list | linear ancestors of #56 | Merge via #56 (no separate merge) |
| #48–#55 (Brand Brain saves, CI-record docs, 018/019/020/021/022 reports) | up to 1b43ce3 | ancestors of #56 | Merge via #56; record-only PRs (#47,#49,#50,#52–#55) are **close-after-#56** candidates |
| **#56** BG-STUDIO-023-FE acceptance | cf5fec9 code / 205a983 docs | contains #27, #34–#55 linearly (106 commits ahead); trial merge into main **clean**; hosted CI 13/13 | **Merge candidate — needs integration fixes first** (socialClient routes, media/creative-job UI, artefact policy accepted) and founder confirmation of single-merge strategy |
| **#57** BG-WEB-001 public site | 0077c7b | independent; one conflict (`.gitignore`) | **Needs rebase** (trivial) after founder facts; publication blocked on A2 checklist |

Recommended frontend batch: **merge #56 once, as one squash-free merge** (preserves ancestry), then #57. Rollback: revert merge commit; gates default OFF so app behaviour is unchanged if reverted.

## Backend `shirrie01/bizgenie-api` (main `ddcc26c`)
| PR | Head | Ahead of main | In #218 | Disposition |
|---|---|---|---|---|
| #167 stripe return fixture test | 82fa747 | 2 | no | Close candidate (stale, 8 behind main) unless test still needed |
| #175 provisional component interfaces | f00cb58 | 4 | no | Hold / close candidate (superseded by BG-STUDIO-019 contracts in #216) |
| #189 media upload requires approved brand identity (#188 hybrid) | ae0f148 | 6 | no | **Needs rebase + tests (pre-launch, `DEC-014`)**; merges cleanly with #218 — task B6 |
| #204 engagement intelligence (#20) WIP | 3e9d656 | 10 | no | Needs integration review (part of Learning); merges cleanly with #218 |
| #205–#212 media preview / capability / cleanup / evidence | 69dd72a … b60e380 | 1–13 | no | **Duplicated lineage.** `git cherry` vs #218: #206 fully, #208 2/4, #209 3/5, #210 4/7, #211 6/9, #212 10/13 patch-equivalent. Conflicts with #218 (add/add `src/media/previewDelivery.js`, `index.js`, campaigns repository/router). **Hold pending Codex decision**: take #218's version, port only residual unique commits from #207/#208/#209, close the rest |
| #213 onboarding hardening | 120a874 | 3 | yes | Merge via chain |
| #214 Brand Brain contract Q1–Q8 | 51e8ca4 | 7 | yes | chain |
| #215 cold-Postgres contract evidence | e84c6d0 | 12 | yes | chain |
| #216 BG-STUDIO-019 contracts/launch gates | f8d81bf | 24 | yes | chain |
| #217 quoted jobs against frozen snapshots | 23f4903 | 48 | yes | chain; hosted CI success |
| **#218** BG-STUDIO-021-BE | 9346055 | 57 | — | **Merge candidate** as the single chain tip (clean trial merge, hosted CI success). Requires: migration review (shared migrations are founder-gated), env-gated optional services stay off |

Recommended backend batch: **#218 alone (chain tip)**, then Codex PR "reconcile media lineage", then #189, then #204. Rollback: migrations are additive; no execution of shared migrations has occurred — **a migration rehearsal on a throwaway DB copy is a precondition**, not done here.

## Test/CI status: what is verified
Hosted: web #56 13/13 (exact SHA via dispatch), #57 Website CI 6/6, api #217/#218 success. Agent-reported only: counts quoted in BG-STUDIO reports. Not tested anywhere: cross-repo run of #56 against **#218's real server in hosted CI** (done locally only), staging, real browsers beyond Chromium.

## Artefact pollution remedy
`dist-*`/`test-results` were tracked in earlier commits (≈73 MB uncompressed). #56 untracks, ignores, and guards by test. History is not rewritten (rewrite would invalidate every stacked PR). Remedy if repository size matters: after #56 merges, one-off `git filter-repo` on a mirror with founder approval; clones remain heavy until then.
