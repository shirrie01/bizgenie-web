# BG-LAUNCH-011 — Suggested placement of the approved tagline (for founder review; nothing implemented)

The locked public campaign tagline is **Make. Launch. Learn what converts.** (Canon v2, DEC-011 / LOCK-017). Its wording, capitalisation and punctuation must not change without a new founder decision. It describes the proposition, not that autonomous publishing or every learning feature is live, so it must never sit next to a status claim.

No colour is proposed: the approved coral hex is not recorded in either repository (palette sign-off is still open in Issue #51), and none was invented. Charcoal (`#16211d`) and the warm grey surface already in the Studio are unchanged.

| # | Where | Proposal | Reason / risk |
|---|---|---|---|
| 1 | **Sign-in screen** (first thing a customer sees) | The tagline as a quiet line under the "Sign in to BizGenie" heading, in the Fraunces serif at body size, charcoal | The one screen with room and no status text; first impression |
| 2 | **Top bar, desktop only** | Wordmark `BizGenie`, a thin divider, the tagline in small caps text in the grey already used for secondary text; hidden below 680 px | Brand presence without crowding the 13-item navigation |
| 3 | **Empty first workspace** (Overview, before a campaign exists) | Tagline as the welcome line above "Welcome to your workspace." | Reinforces the three-step journey (create, launch, learn) at the moment a customer has nothing yet |
| 4 | **Not recommended** | Campaign Studio, billing, accounts, calendar, error and failure messages | These carry truth-critical wording (charged / not charged, draft / published); marketing copy must not sit beside it |

Implementation when approved: one shared constant, rendered by one small component, with a unit test that asserts the exact string, so the wording cannot drift. Accessibility: plain text (not an image), normal contrast, no animation.
