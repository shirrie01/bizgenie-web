# BG-PROGRAMME-001 — proposed register corrections (NOT APPLIED)

27 Oct 2026. **This manifest was NOT applied.** Mission Control was unreadable, so row numbers cannot be stated; rows are keyed by identifier and must be located by the person applying them. History is preserved: add or annotate, never delete. Each line cites its authority.

| Tab | Action | Key | New / changed value | Authority |
|---|---|---|---|---|
| VERSION_REGISTER | add | web main | `e9e5a1f4f208787248fc9dd18ee8f5df1c60d05a`, observed 27 Oct 2026 | git |
| VERSION_REGISTER | add | api main | `ddcc26cb4111303f0c8fbf9745db5fed1e40ca6f` | git |
| VERSION_REGISTER | add | web PR #56 | code `cf5fec9`, docs head `205a983`, CI 13/13 | GitHub Actions |
| VERSION_REGISTER | add | web PR #57 | head `0077c7b`, tested `a21184a24b062329e619fcc21050a08f964c2714` | GitHub Actions |
| VERSION_REGISTER | add | api PR #218 | `9346055a4b0c2057f8ab13274396ecf502296ed6`, CI success | GitHub Actions |
| TASK_REGISTER | update status (if row exists; else add once) | BG-STUDIO-023 | Draft PR #56, CI-verified, awaiting integration fixes | PR #56 |
| TASK_REGISTER | same | BG-WEB-001 | Draft PR #57, CI-verified; publication blocked on founder facts | PR #57 |
| TASK_REGISTER | add | BG-PROGRAMME-001 | Draft docs PR (this branch) | this PR |
| EVIDENCE_REGISTER | add | Meta business verification | Approved 26 Oct 2026 (founder-reported; attach founder's evidence); note: not Tech Provider access verification | founder |
| LAUNCH_BLOCKERS | add/verify | Meta access verification | deadline 25 Dec 2026 | founder |
| LAUNCH_BLOCKERS | verify | pricing canon missing | `DEC-023` pricing item | repo quotation |
| LOCK_REGISTER | annotate | LOCK-002, LOCK-004 duplicates | add note "historical duplicate — preserved"; no deletion | founder note |
| CURRENT_STATUS | refresh | all stale rows | replace with Gate P/W tables | launch gate register |
| TECHNICAL_DEBT | add | media lineage duplication; artefact history size; record-only PRs | PR register | git |
| AUDIT_LOG | add | BG-PROGRAMME-001 read-only audit, 27 Oct 2026, no writes | this PR | — |
