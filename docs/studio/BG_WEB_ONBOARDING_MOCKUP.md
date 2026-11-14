# BG-WEB-ONBOARDING-MOCKUP (Issue #85) — six-panel onboarding: mapping, inventory, evidence, blockers

14 Nov 2026. WEB base `01016cc9292100ed42c81c12f02ad3a0ab673cbe`; API main `1858417f0fc0d21d7211795881c0eaa7732b63d0`. Source-level only: **no deployment, no staging write, no customer persistence claim, no OAuth, no paid call, no Stripe.** Hosted customer journey remains **NOT RUN**; launch **NO-GO**.

## 0. Design reference: the image was not available
Issue #85 describes the six panels in words but contains **no image or attachment link**, and the mock-up was not visible in the session that implemented this. The structure, order, content and behaviour below follow the written spec in the Issue; the look uses the existing Studio design system. **Visual fidelity to the founder's image is therefore NOT verified.** To close that, the exact reference (the image file, or a link to it in Issue #85) is needed, and a short review pass against it will follow. Nothing was invented to imitate it.

## 1. Mapping: seven stored stages → six panels (nothing renumbered)
`onboarding.current_step` is an integer index into the seven stored stages (contract `workspace-onboarding.v1`). Those indexes are a stored contract, so they are **never renumbered or reordered**: a saved step 4 still reopens Channels (tested in unit, App and real-browser tests). The panels only group them and set the walking order.
| Panel | Stored stage(s) | What it holds | Persistence (unchanged) |
|---|---|---|---|
| 1 Welcome | 0 welcome | hero, three assurances, what is saved and what is not | none |
| 2 Your business | 1 identity, 2 about | name (creates the workspace through bootstrap), optional website address and challenge, sector, description, customer action; “Part 1/2” and “Part 2/2” | `POST /customer/workspace/bootstrap`; Brand Brain `PUT` on Save; onboarding progress `PUT` |
| 3 Your goals | 3 customers+goal | who the customers are, six selectable objectives, the goal text | Brand Brain (audience); the objective is saved as the existing goal text, no new field |
| 4 Brand setup | 5 Brand Brain | voice, key messages (what sets you apart), colours/style cards read from the stored Brand Brain with Edit into the full editor; logo card says upload is unavailable; confirm setup | Brand Brain `PUT`; completion through the existing confirm |
| 5 Channels | 4 channels | six channel cards (planning only) | onboarding progress `PUT` |
| 6 Review proposal | 6 recommendation | summary of what the plan is built from with Edit links, what happens next, then the existing recommendation request | recommendation request only |
Walking order: **0 → 1 → 2 → 3 → 5 → 4 → 6** (Brand setup before Channels, as in the design). Save progress, Save and exit, view-only members, version conflicts, unconfirmed saves and session-ended handling are all the existing, unchanged code paths.

## 2. What works, and what is clearly unavailable
| Control | State |
|---|---|
| Get started, Continue/Back, panel progress, resume at the saved step | works (tested) |
| Business details, sector, Brand Brain save, save progress, confirm setup | works as before (existing contracts and tests) |
| Objectives | works; saved as goal text |
| Brand setup cards | read what is stored; Edit opens the real Brand Brain editor |
| **Website import** | **unavailable**: no import capability exists; the panel says so and the address is stored as typed only |
| **Logo upload** | **unavailable**: no upload path in this build; the card says so; no file control exists |
| **Channel Connect** | **only** for a platform the verified build offers (the PR #83 compatibility gate must verify `social` for the API revision, and the platform must be in the verified provider list); otherwise “connecting isn't available in this version yet”. Today the shipped manifest is empty, so **no Connect appears** |
| Publishing, scheduling, generation | never started from onboarding; the review panel states nothing is generated, scheduled or published until the customer approves and separately authorises it |
| Imagery | none: no stock photography (rights/provenance); decorative shapes are CSS |

## 3. Component inventory (new or changed)
`onboardingPanels.js` (mapping, order, objectives, channel and brand-card logic) · `PremiumOnboarding.jsx` (panel count + six-item progress, hero, assurances, objective cards, brand cards, channel cards, review summary; handlers untouched) · `PremiumStudio.jsx` (passes Edit/Open-accounts callbacks) · `styles.css` (existing palette and radii) · tests: `onboardingPanels.test.js` (10), `PremiumOnboarding.panels.test.jsx` (21), `qa/premium-onboarding.browser.qa.mjs` (2 real-browser specs at four widths), 18 existing App tests updated to the new walking order.

## 4. Evidence (local only)
Full WEB suite, `npm run build`, real-browser run at 1440, 768, 390 and 320 px: all six panels visited, layout (no overflow, no tiny targets) and axe WCAG 2.x A/AA clean, saved step 4 resumes Channels, no generation/social/billing request made. Screenshots (24) are attached to Issue #85. These are mocked-API browser checks, **not staging and not customer acceptance**.

## 5. Staging footer: Help, Terms, Privacy “not set up yet”
The Studio footer is configuration-driven (`VITE_SUPPORT_URL`, `VITE_TERMS_URL`, `VITE_PRIVACY_URL`; the staging workflow maps `STAGING_SUPPORT_URL`, `STAGING_TERMS_URL`, `STAGING_PRIVACY_URL`). “Not set up yet” is the correct output while those repository variables are unset. **No approved destination exists anywhere**: the privacy, terms, data-deletion and support pages are drafts in the website source (`legalReviewed:false`), the public site was not reachable from the implementing session (so whether anything is published could not be checked), and no company identity or contact address is verified. Nothing was invented or configured. To fix it: founder approves and publishes the pages, then sets the three variables and the staging Studio is rebuilt and redeployed under the founder's approval.

## 6. Staging write restriction (API Issue #249): traced, not bypassed
The message “Changes are switched off in this test environment, so nothing was saved” is the Studio's text for the bridge error code `STAGING_WRITES_DISABLED` (`src/bridgeErrors.js`). It is **not generated by WEB**: the Studio bridge (`src/studio-bridge/service.js`, API main) returns it for any non-GET request unless the bridge was started with a matching allowance: `allowWorkspaceBootstrap` (only `POST /customer/workspace/bootstrap`), `allowDraftWorkflow` (Brand Brain and onboarding `PUT`, campaign recommendation, campaign and content-item writes, review/approval/schedule), `allowGenerationConfirmation`, `allowSocialWrites`, `allowStripeCheckout`, or `allowWrites`. So for the founder's step “Create my workspace”, the bridge needs `allowWorkspaceBootstrap`, and for saved onboarding progress and the Brand Brain it needs `allowDraftWorkflow`. This is a deliberate safety gate and an **operator configuration/deployment decision (Codex, #249, founder approval)**, not a WEB defect, and nothing in this change weakens it. **Customer persistence is not verified and is not claimed.**
