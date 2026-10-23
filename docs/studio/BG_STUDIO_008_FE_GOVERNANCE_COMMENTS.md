# BG-STUDIO-008-FE: register entries to post (not posted)

Not posted by Claude: `shirrie01/bizgenie-api` is outside this session's GitHub scope and attaching it needs credentials the session was told not to broaden, so API issues #128, #191 and #197 could not be read or updated. For reconciliation by ChatGPT or an owner with access. The Google Sheets BizGenie Mission Control Register v1.0 remains the single canonical operational authority (DEC-015); reference PRs and evidence rather than creating a duplicate register.

## For API Issue #197 (Premium Studio): implementation progress

**BG-STUDIO-008-FE, 2026-10-23. AMBER. Not founder-accepted. No staging run.**

The Premium Studio onboarding and industry-aware workspace now exist in the real application (`src/`), behind `VITE_PREMIUM_STUDIO_ENABLED` (build-time, default off). With the flag off, the rendered app is byte-identical to the base (DOM compared across 7 states).

- Draft PR [#47](https://github.com/shirrie01/bizgenie-web/pull/47), code head `9ad697f300095984ff1a8b5a6739705c50edc7af`, base `bg-studio-007-integration-rehearsal` @ `fb80c97af2f47f2a0e89a1950bbeefdcffc9fe79` (scratch integration of every stack; not mergeable to `main` directly; re-base after the merge order in the report).
- Report and evidence: `docs/studio/BG_STUDIO_008_FE_REPORT.md`, `docs/evidence/008/`, `docs/studio/FE_BE_CONTRACT_BG_STUDIO_008.md` on `bg-studio-008-fe-production-integration`.
- Real data only, with provenance on every fact; no invented metrics, posts, results, creative or demonstration brands in production code. Persistence only through existing endpoints; sector and channels stay session-only and labelled because the backend has no field for them.
- Verified locally with labelled mocks: Vitest 260/260, flag-on browser QA with axe at 1440, 768, 390 and 320, existing flag-off suites unchanged, and review, media, revocation and the `PREVIEW_VERSION_UNAVAILABLE` fail-closed behaviour re-run against the real #208 handlers through the premium shell (12 runs). Isolated workflow runs are listed in the report. There are no native PR checks (stacked base).
- Not proven: deployed backend, real Supabase, Postgres, GCS, OAuth, H.264 in real Chrome. Founder acceptance not claimed.

## For API Issue #191 (engineering index): cross-system checkpoint

Frontend only; no backend, deployment, migration, provider, paid generation, publishing, pricing or secret change. Newly observed: backend #210 (`e26b79d`) proposes an Instagram-feed video preview contract (docs and tests only).

Items for the owning workstreams (details in `FE_BE_CONTRACT_BG_STUDIO_008.md`):
- **Codex / BG-STUDIO-008-BE:** G1 sector field; G2 channel-preference field (optionally a recommendation input); G3 onboarding draft persistence; G4 confirm the placeholder workspace name and stop generating it; G5 workspace selection flow; G6 stability of the campaign list fields and ordering. Video: `byte_size`, `width`, `height`, `duration_ms`, `video_codec`, `container`, `has_audio`, captions and transcript availability, and the preview-profile status on the creative-preview read. Questions: is approval of revoked media meant to return the generic 404, and what is the recovery path; will the Instagram-feed contract be accepted.
- **Founder:** accept or reshape the plainer production design; decide whether the premium workspace becomes the default after staging; commission G1 and G2; approve or decline a staging E2E (plan to be re-baselined against #209 and #210).
- **Not claimed:** founder acceptance, production readiness, launch GREEN.
