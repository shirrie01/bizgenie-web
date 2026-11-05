# BG-PROGRAMME-001 — Mission Control reconciliation

27 Oct 2026. **Not performed against the live workbook**: `docs.google.com` is unreachable and the Google Drive connector is not connected (source index §0). No write was made or attempted. Per-tab audit therefore cannot be done; this file lists what each tab must be checked for, using repository evidence.

| Tab | Audit status | Check to perform once readable |
|---|---|---|
| SOURCE_REGISTRY / VERSION_REGISTER | NOT READ | add rows for: web `main e9e5a1f`, api `main ddcc26c`, #56 head `205a983`, #57 head `0077c7b`, api #218 `9346055`; Canon v2 `VER-009` |
| LOCK_REGISTER | NOT READ | founder reports duplicate historical `LOCK-002`/`LOCK-004`: preserve both, add a note row, do not delete |
| DECISION_LOG | NOT READ | verify `DEC-011/014/015/020–023/025` against quotations in repo docs |
| CHECKPOINT_INDEX / BACKUP_REGISTER | NOT READ | add this programme's PR as checkpoint |
| EVIDENCE_REGISTER | NOT READ | add: 023 hosted CI runs, #57 Website CI runs 40428230096/40428236274, api #217/#218 checks, trial-merge results |
| TASK_REGISTER | NOT READ | confirm BG-STUDIO-023, BG-WEB-001 (and WEB-002…007 suggestions in the web report) exist once; **do not create duplicate IDs**; add BG-PROGRAMME-001 |
| LAUNCH_BLOCKERS / DASHBOARD | NOT READ | founder suspects shifted cells: compare against Gate P table |
| CURRENT_STATUS / PHASE_PLAN / SESSION_LOG / EOD_REPORT / AUDIT_LOG / TECHNICAL_DEBT | NOT READ | refresh to this programme's facts |

Agent-reported test counts (BG-STUDIO reports) must be entered as "agent-reported"; hosted CI results as "CI-verified"; nothing in this programme is independently verified by the founder.
