# BG-PROGRAMME-001 — completion checkpoint (27 Oct 2026)

Scope per founder: existing approved work continues; Learning Brain, Hybrid UGC and social connection are pre-launch (`DEC-014`); the reduced founder-assisted scope is **not** approved. Codex owns backend recovery, generation safety and backend contract reconciliation; items below marked **Codex** are not duplicated here. No merge, deployment, migration, paid generation, publishing or DNS change was made.

## Task ledger
| Task | PR | Exact SHA | Status | Evidence |
|---|---|---|---|---|
| Studio creative review (review panel, platform-aware preview, authenticated media preview, refused-approval wording) | web #34–#46, contained in #56 | #56 code `cf5fec937087bdafcf4cd43d0471622698099886` (head `205a9830ceb84a497b9bf09b551e5a5f1241fdc6`) | **Complete** (draft; unmerged) | Exact-SHA hosted CI run 42, 13/13 |
| Industry profiles / neutral onboarding / five-industry workspace | web #42, #45, #48 in #56 | same | **Complete** (draft) | five-industry × owner/member browser matrix; `studioIndustryProfiles` tests; run 42 |
| BG-STUDIO-021/022/023-FE (billing, growth, acceptance harness) | #54, #55, #56 | same | **Complete** (draft) | run 40–42 green; local integration vs #218 |
| Public landing page BG-WEB-001 | web #57 | head `0077c7b9904be0fe7f325155ab999ad9c4ec901f`, code `a21184a24b062329e619fcc21050a08f964c2714` | **Complete as draft; publication blocked** on founder facts; needs trivial `.gitignore` rebase | Website CI 6/6 push + PR; `site-dist` untracked |
| Programme reconciliation | web #58 | `cf5e7a44af560fe687ad5da81de7b18fe69dd71b` (+ this file) | **Complete** (docs) | PR register, handover |
| **F1 social connection adapter on real #218 contract** | web **#59** (stacked on #56) | `4ebbe13cae9b331d46030855a47c074e1724eec6` | **Complete locally; hosted CI run 43 pending** | unit 948 pass / 41 skip; integration vs real #218 41/41 on local PG; gates-on browser 13/13 × 5 widths; build OK |
| F2 creative-job / media-intake UI | — | — | **Pending (next)** | consumes #218 routes; backend lineage choice B3 is Codex's, #218's version is the base |
| F3 workspace-wide calendar (`DEC-025`) | — | — | **Pending**; client + model already in #56 (`workspaceCalendarClient`, `PremiumWorkspaceCalendar`), blocked on Codex confirming the backend endpoint (B5) | tests in #56 |
| F4 Hybrid UGC UI | — | — | **Blocked** on Codex B6 (#189 rebase) | — |
| F5 Learning wired to `/customer/insights` for the full journey | — | — | **Pending** after B4 (row-level contract version) | `performanceEvidence`/`backend218` tests |
| F6 rebase #57 / separate landing-page correction branch | — | — | **Pending**, separate branch, not interrupting F2 | — |
| Premium visual upgrade (further) | — | — | **Pending**, separate branch; the upgrade already in #56 is inside the existing app | — |
| Cross-repo hosted CI of #56 + #59 against real #218 | — | — | **Pending**: only local so far | — |
| Real-device / assistive-technology / slow-network tests | — | — | **Not done** | — |

## Contract gaps now owned by Codex (no frontend workaround)
S1 provider `authorize_url` missing from `POST /customer/social/oauth-intents`; S2 account display name; S3 redirect URI; B3 media lineage; B4 `contract_version` on insight rows; B5 workspace calendar endpoint; B6 Hybrid UGC (#189) on #218. Detail: `BG_STUDIO_024_FE_SOCIAL.md` (web #59) and `BG_PROGRAMME_001_EXECUTION_HANDOVER.md` §6.

## Shortest safe integration sequence (existing work only)
1. Codex: B1 (DEC-020 gating decision with founder), B2 (approved rehearsal; local 9-migration rehearsal already passed), B3, S1–S3.
2. Founder: approve merge of backend #218 then web #56 with all gates OFF; #59 follows #56.
3. Claude (now): F2 → F3 (after B5) → F5 (after B4) → F4 (after B6); landing-page rebase and visual-upgrade branches in parallel, separate.
4. Approved environment: gates on one by one → founder walkthrough of the full journey → class-D evidence.
