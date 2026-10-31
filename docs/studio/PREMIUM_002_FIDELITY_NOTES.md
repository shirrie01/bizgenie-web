# BG-STUDIO-PREMIUM-002 — onboarding fidelity notes (isolated V3 preview)

Scope: `studio-preview/v3/` only, built on PR #27's V3 foundation (via #36). Original artwork only. No import, upload or OAuth is simulated; no network, storage, saving or publishing.

## Implemented vs the founder six-screen reference

| Stage | Reference element | Status here |
|---|---|---|
| All | Segmented progress with step names, "n / 6" | Done: labelled, keyboard-operable progress; completed steps navigate back; current step announced |
| 1 Welcome | Checklist incl. "No publishing without your approval"; creative tiles | Done with original illustrative tiles. Not done: photographic/product imagery, "trusted by" proof (cannot be fabricated), Skip for now |
| 2 Your Business | URL import and "We found this" card | **Not simulated.** Import button disabled ("not available yet"); planned items listed; live profile of what the user typed, each marked "Your input · not verified"; extra optional fields (type, location, offer) |
| 3 Your Goals | Image goal cards, "Not sure yet" | Done: icon cards with outcome-first microcopy, five options incl. "Not sure yet" that flows into the proposal as "To confirm". Not done: photography |
| 4 Brand Setup | Logo, colours, voice, key messages, visual inspiration | Colours (≤5), voice and key messages (≤5) are working, user-entered, unsaved. Logo upload disabled and labelled. Visual inspiration omitted (needs real assets/import) |
| 5 Channels | Platform cards, Connect, permissions note | Selection is separate from connection: every card shows "Not connected" and a disabled "Connect: coming soon"; permission/approval note. Not done: channel thumbnails (needs real assets), real OAuth |
| 6 Proposal | Creative hero, structured brief, what happens next, approve CTA | Done (see #36) plus brand voice and key messages in the brief |

## Remaining gaps (need decisions or backend, not design effort alone)
- Rights-cleared photography/product imagery for hero, goal cards, channel thumbnails.
- Website import, logo/asset upload, channel OAuth: no backend. Planned-state only.
- Save and exit / Skip: see `SAVE_AND_EXIT_GAP.md`.
- The workspace screens (Mission Control, Studio, Calendar) are untouched.
- Shell contrast tokens were darkened for the shell and onboarding screens only (AA). Workspace screens were not audited.
