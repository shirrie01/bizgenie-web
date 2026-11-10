# BG-STUDIO-011-FE evidence index

**Every image and result here comes from a local build with the login session, the Supabase refresh and the API MOCKED in the browser or in Vitest.** None is a deployed customer journey; nothing ran against the real API (bizgenie-api draft PR #213), a database, a real token or staging.

| Path | What it shows |
|---|---|
| `after/<width>-chooser-required.png` | A signed-in customer with two authorised workspaces and none selected: the chooser, with nothing pre-selected. |
| `after/<width>-chooser-switch.png` | Switching from a workspace: the current workspace is marked and disabled. |
| `after/<width>-chooser-revoked.png` | The API refuses a selection ("not available to your account any more"). Note: the mock keeps the refused workspace in its list, so it still appears; a real revocation removes it from the refreshed list. |
| `after/<width>-chooser-unapproved.png` | A workspace that is not yet approved: shown, disabled and explained. |
| `after/<width>-chooser-discard-confirm.png` | Unsaved answers: an explicit "Discard and switch" / "Stay here" decision. |
| `after/<width>-workspace-a.png`, `workspace-b.png`, `workspace-after-select.png` | The two mocked workspaces (vehicle leasing; aesthetics) after switching: own name, sector, data. |
| `after/<width>-resume-after-switch.png` | Returning to the first workspace restores its own saved progress. |
| `after/<width>-onboarding-3-about.png` | "How answers are labelled" legend and the "needs your confirmation" prompt for an inferred sector. |
| `flag-off-dom-equivalence/` | Script and SHA-256 hashes: with the flag OFF the rendered DOM equals the PR #48 head across 7 states. |

Widths: 1440, 768, 390, 320. Other screens are unchanged from `docs/evidence/010/` and `docs/evidence/008/`.
