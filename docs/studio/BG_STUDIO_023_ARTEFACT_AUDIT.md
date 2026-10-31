# Stacked-PR artefact audit and safe cleanup proposal

26 October 2026. **Audit and proposal only. No history was rewritten, no branch was force-pushed, nothing was merged.** Measured on `origin/main` `e9e5a1f4` against the frontend stack #47–#55 and this branch.

## Findings

| Item | Where it entered | At each PR head | Size in history |
|---|---|---|---|
| `test-results/.last-run.json` (1 file) | `e1db8af`, first in PR #48 (`bg-studio-010-fe-persistent-onboarding`) | tracked at #48's head only; absent at #49–#53 | trivial |
| `dist-gates/`, `dist-off/`, `dist-premium/`, `dist-size-on/`, `dist-size-off/` and `test-results/` (57 files) | `3025921`, first in PR #54 | **tracked at #54's head** (57 files) | see total |
| the same directories plus ~780 more `test-results/` files | `1ac4505`, first in PR #55 | **absent at #55's head** — removed by the later "stop tracking build output" commit, which also adds `.gitignore` rules | see total |
| **Total reachable from main..#55** | 547 blobs | — | **72.8 MB uncompressed** |
| `docs/evidence/` screenshots and recordings | PRs #46–#55 over time, intentionally | tracked in every PR from the first that added it; 587 `.png`, 1 `.webm`, 35 `.json`, 4 `.md`, 3 `.txt` | **692 blobs, 95.6 MB**; none is on `main` |

So: unintended build/test output is **currently tracked only at PR #54's head (57 files)** and sits in the history of #54 and #55 (and one file in #48). `main` is clean (0 such files). `docs/evidence` is intentional evidence but is the larger weight and is not on `main`.

The latest branch adds a guard test (`src/test/repoHygiene.test.js`) and `.gitignore` rules (`dist-*`, `test-results`, `playwright-report`) so it cannot recur.

## Options (none executed)

| Option | What it does | Risk |
|---|---|---|
| **A. Squash-merge each PR later (recommended)** | The final tree of every squash has no `dist-*`/`test-results`; they would live only in the closed PR branches' history, never in `main` | none to existing branches; needs the merge decision, which is not authorised here |
| B. Delete the tracked files on #54 with a normal follow-up commit | Fixes #54's tip without touching history; #55 already does this | adds a commit to a shared branch; CI re-run on #54 |
| C. Rewrite history of the unmerged branches (`git filter-repo`/rebase, force-push) | Removes the blobs everywhere | **shared, stacked, re-targeted PRs; invalidates every recorded CI SHA and every SHA quoted in reports; coordination with Codex and reviewers; irreversible if branches are deleted**. Not recommended without separate approval |
| D. Move `docs/evidence` binaries out of Git (artefact store or Git LFS) and keep a hash manifest | Reduces clone size | needs an agreed store and retention policy; touches every PR; do it once, before merging |

## Recommendation

1. Do nothing destructive. Keep SHAs stable (reports cite them).
2. Prefer **A** (squash merge) when merging is authorised; optionally **B** for #54 if it must stand alone.
3. Decide the `docs/evidence` retention policy (**D**) before the first merge: either keep a small curated set (e.g. one screenshot per width per view) in the repo, or publish the full set as a build artefact and commit a manifest.
4. Keep the guard test and ignore rules (present from PR #55).

## Verification commands

```
git fetch origin
git rev-list --objects origin/main..<branch> | awk '$2 ~ /^(dist|test-results)/ {print $1}' | git cat-file --batch-check='%(objectsize)' | awk '{s+=$1;n++} END{print n, s}'
git ls-tree -r --name-only <branch> | grep -cE '^(dist|test-results|playwright-report)'
git ls-tree -r --name-only origin/main | grep -cE '^(dist|test-results|docs/evidence)'
```
