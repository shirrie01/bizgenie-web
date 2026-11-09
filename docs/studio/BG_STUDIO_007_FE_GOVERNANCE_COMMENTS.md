# BG-STUDIO-007-FE: register entries to post (not posted)

Not posted by Claude: `shirrie01/bizgenie-api` is outside this session's GitHub scope and attaching it needs credentials the session was told not to broaden. Someone with access should paste these. Reference PRs and evidence; do not create a new master register.

## For API Issue #197 (Premium Studio UX and Onboarding): implementation progress

**BG-STUDIO-007-FE, 2026-10-23. AMBER. Not founder-accepted.**

Founder-reported defect fixed in the isolated V3 preview: onboarding as "Northgate Vehicle Leasing" showed "Your growth plan for Fonzo" and drinks cans. Workspace, Campaign Studio and Calendar now render from one sector-aware presentation model; goals, channels and brand inputs carry through; the only brand shown is the one typed; unknown industry and missing brand fall back to neutral wording.

- Draft PR [#45](https://github.com/shirrie01/bizgenie-web/pull/45), head `2f114f056bc096383280d60b221b7c122c50bacb`, base `bg-studio-005-onboarding-standalone`.
- Draft PR [#46](https://github.com/shirrie01/bizgenie-web/pull/46), head `49ad57b2fc4b4b643073cf37c80eb1934294b21c`, base `bg-studio-006-approval-media-hint`. Explains `PREVIEW_VERSION_UNAVAILABLE` per #209 and removes duplicated failure messages.
- Evidence: `docs/studio/BG_STUDIO_007_FE_REPORT.md` and `docs/evidence/007/` on `bg-studio-007-integration-rehearsal`.
- Local: Vitest 200/200 integrated; Playwright preview checks 33/33 at 1440, 768, 390, 320; axe clean; real #208 handler review flow intact. Isolated workflow runs listed in the report. No native PR checks (stacked PRs). Not proven: deployed backend, real Supabase, Postgres, GCS, OAuth, H.264 in real Chrome.
- Still preview-only: the production app (`src/`) has no onboarding flow. Next recommended task: a flagged, frontend-only port using existing endpoints.
- Open founder decisions: workspace behaviour for unknown industries, photography and copy, 32 MiB video ceiling, staging approval.

## For API Issue #191 (master Mission Control checkpoint)

**BG-STUDIO-007-FE checkpoint, 2026-10-23.** Frontend only; no backend, deployment, migration, spend or publication. See #197 entry for PRs and evidence.

Cross-system items for the owning workstreams:
- **Codex / backend:** (1) Instagram-feed video has no trusted preview profile: needs the owner decision recorded in #209 (keep the locked set or approve a new contract). The frontend now reports the 409 `PREVIEW_VERSION_UNAVAILABLE` as "destination profile unavailable", keeps acknowledgement and approval blocked, and does not loop. (2) Approval of content whose media was revoked returns a generic 404 `RESOURCE_NOT_AVAILABLE`; please confirm intended and the recovery path. (3) Publish typical and maximum generated-video sizes so the client's 32 MiB ceiling can be judged.
- **Founder:** approve or decline a staging E2E run (plan: `docs/studio/STAGING_E2E_TEST_PLAN.md`, to be re-baselined against #209's gates); decide the production-adoption slice; supply photography and copy decisions.
- **Not claimed:** founder acceptance, production readiness, launch GREEN.
