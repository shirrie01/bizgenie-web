# BG-LAUNCH-FINAL-WEB-01: customer journey map and Golden Journey

Source: WEB `main` 81e1014e plus this branch. Evidence class: **LOCAL PASS** only (mocked API and session in a real browser). It is not hosted CI, not staging and not customer acceptance. Hosted customer acceptance: **STAGING NOT RUN**.

## Functional matrix (landing to return visit)

| Step | Component / route | Contract | State from this pass |
|---|---|---|---|
| Landing, sign-up, sign-in | `App.jsx` auth screens (Supabase session) | Supabase Auth | Signed-out visitors see sign-in and no customer data (`premium-studio` spec). Real sign-up not exercised: needs staging. |
| Welcome | `PremiumOnboarding.jsx` stage 0 + Genie guide | none | Works. Genie guide added (prepared guidance, see `BG-GENIE-V1-ACTIVATION.md`). |
| Business setup | stages 1-2 | `POST /customer/workspace/bootstrap`, `PUT /customer/workspace/onboarding` | Works with fixtures. Website import is stated as unavailable. Staging writes are gated off by the bridge until the founder-only release. |
| Brand Brain | stage 5 (Brand setup) | `GET/PUT /customer/workspace/brand-brain` | Works. Identity fields owner-only; edits applied to the latest stored version. |
| Growth goal | stage 3 | draft `goal` in the onboarding record | Works. Stale copy fixed here: the goal is saved with Save progress, and becomes a campaign only when created. |
| Channels | stage 4 | `channels` in the onboarding record | Planning only. No Connect button exists unless a platform is verifiably connectable (none today). |
| Recommendation | stage 6 | `POST /customer/campaign-recommendations` | Works with fixtures. |
| Campaign Studio | `PremiumStudio` `studio` view | `POST /customer/campaigns`, content items, generate, previews, approval | Works with fixtures to approval; "manual publication required". |
| Calendar | `calendar` view | workspace calendar API (gated) | Opens in the journey. Behaviour with data is covered by `premium-billing-calendar` and `premium-journey` specs. |
| Dashboard | `overview` view | derived from saved Brand Brain, onboarding and campaigns | "Welcome back, <brand>". No fabricated performance. |
| Return visit | reload | server records | Passes with fixtures: same workspace, saved campaign listed, nothing published or scheduled. |
| Text, image, video generation UI | `GenerateWithQuote`, `QuotedGeneration`, `CreativeStudio` | quote then confirm, creative jobs | **Not re-verified in this pass.** Existing component and gate suites remain in CI. No provider was called. |
| Billing and access | `PremiumBilling`, `PlanCatalogue` | billing APIs (gated) | Displays only what the API returns; no live checkout. |

## Golden Journey test
`qa/premium-studio.browser.qa.mjs`, test `GOLDEN JOURNEY`: signed-in new customer, keyboard-only start, Genie guide, workspace creation (exactly one bootstrap call), goals, Skip for now on Brand setup, Channels (no Connect), Brand Brain save, Save progress, Confirm setup, recommendation, campaign, draft, preview, approval, Calendar, Overview, **reload**, saved campaign found, no publish or schedule request, sign out. Layout and axe (WCAG 2.x A/AA, 2.2 AA) scans run at the points shown. The premium browser job runs it at 1440, 768, 390 and 320 px.

Mock-fidelity fixes made so the test can be honest: the mock now lists a campaign only after the customer created it in that test, and keeps an issued session token across a reload as a real session does.

## Not covered here (cannot be proved from source)
Real sign-up and email confirmation, a real Fonzo workspace, persistence on staging, real text/image/video generation, social connection, billing activation. These are the hosted acceptance steps.
