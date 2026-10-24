# BG-STUDIO-010-FE evidence index

**Every image and result here comes from a local build with the login session and the API MOCKED in the browser or in Vitest.** None is a deployed customer journey, none ran against the real API (bizgenie-api draft PR #213), a database or a real token, and the onboarding migration has not been applied anywhere.

| Path | What it shows |
|---|---|
| `after/<width>-<name>.png` | The flag-ON production build at 1440, 768, 390 and 320 for the screens new in this work: `resume-channels` (unfinished setup reopened at its saved step), `unsaved-changes`, `saved-and-exited`, `save-unavailable` (503: NOT saved, answers kept), `load-unavailable`, `version-conflict`, `seeded-brain-not-complete` (bootstrap-seeded Brand Brain is not a finished profile), `onboarding-6-brain` (Confirm setup), `workspace-after-onboarding`. 36 images. The other screens are unchanged from `docs/evidence/008/after/`. |
| `flag-off-dom-equivalence/` | Script and SHA-256 hashes: with the flag OFF the rendered DOM of this branch is byte-identical to the BG-STUDIO-008-FE base (`412ede3`) across 7 states. |
