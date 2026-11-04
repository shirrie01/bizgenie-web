# BG-LAUNCH-011 — Studio acceptance matrix and evidence classes

Source of truth: `qa/acceptance-matrix.json` (guarded by `src/test/acceptanceMatrix.test.js`: every entry names a real test, uses one of the three classes, and nothing can be HOSTED REAL without an evidence URL).

**HOSTED REAL** — verified against a live staging environment. **LOCAL REAL** — the real application and backend code on an isolated local database; every stand-in is listed. **MOCKED** — stand-in identity, API, payment or social behaviour. Mocked authentication, billing or social publishing is never reported as real acceptance.

**Hosted status: NOT RUN.** No hosted Studio exists (no Cloudflare Pages project, no staging-app host); see docs/studio/BG_LAUNCH_011_STAGING_STUDIO_DEPLOYMENT_MANIFEST.md. Every row below is therefore LOCAL REAL or MOCKED; no journey has hosted evidence.

Stand-ins present in every LOCAL REAL run: sign-in/identity (bearer fixture), workspace bootstrap, billing and Stripe endpoints, image and video providers (an H.264 stand-in; a real 1080x1080 PNG), media inspector and storage, TikTok HTTP (stand-in), no real platform data.

| Journey | Class | Spec | Test | Stand-ins |
|---|---|---|---|---|
| Landing and sign-in boundary | MOCKED | `qa/premium-studio.browser.qa.mjs` | signed-out visitors see sign-in and no customer data… | placeholder Supabase/API origins, mocked responses |
|  | MOCKED | `qa/pages-headers.pages.qa.mjs` | signed-out boundary… | placeholder Supabase/API origins, mocked responses |
| Onboarding and Brand Brain | MOCKED | `qa/premium-studio.browser.qa.mjs` | onboarding for a new customer: create workspace, save to Brand Brain… | placeholder Supabase/API origins, mocked responses |
|  | MOCKED | `qa/premium-studio.browser.qa.mjs` | Brand tab, owner: edits are applied to the latest stored Brand Brain… | placeholder Supabase/API origins, mocked responses |
| Campaign creation | LOCAL REAL | `qa/real-backend/acceptance.rb.qa.mjs` | F2 creative: price -> confirm… | sign-in/identity (bearer fixture); image and video providers (an H.264 stand-in; a real 1080x1080 PNG) |
|  | MOCKED | `qa/premium-gates.gates.qa.mjs` | campaign management: rename, then archive with a reason… | placeholder Supabase/API origins, mocked responses |
| Content generation quote and confirmation | LOCAL REAL | `qa/real-backend/acceptance.rb.qa.mjs` | F2 creative: price -> confirm… | sign-in/identity (bearer fixture); image and video providers (an H.264 stand-in; a real 1080x1080 PNG) |
|  | MOCKED | `qa/premium-gates.gates.qa.mjs` | creative: add an image item, get a binding price, confirm… | placeholder Supabase/API origins, mocked responses |
| Existing image attachment and authenticated preview | LOCAL REAL | `qa/real-backend/acceptance.rb.qa.mjs` | the image is shown through authenticated, revision-scoped delivery… | sign-in/identity (bearer fixture); media inspector and storage |
| Failed generation and zero-charge messaging | LOCAL REAL | `qa/real-backend/acceptance.rb.qa.mjs` | VIDEO rejected by media validation: reason shown, no charge… | sign-in/identity (bearer fixture); image and video providers (an H.264 stand-in; a real 1080x1080 PNG) |
| Content review and approval | LOCAL REAL | `qa/real-backend/acceptance.rb.qa.mjs` | VIDEO rehearsal (stand-in transport)… | sign-in/identity (bearer fixture); image and video providers (an H.264 stand-in; a real 1080x1080 PNG) |
|  | MOCKED | `qa/premium-studio.browser.qa.mjs` | onboarding for a new customer: create workspace, save to Brand Brain… | placeholder Supabase/API origins, mocked responses |
| Calendar and scheduling | LOCAL REAL | `qa/real-backend/acceptance.rb.qa.mjs` | F3 calendar… | sign-in/identity (bearer fixture); no real platform data |
|  | MOCKED | `qa/premium-journey.browser.qa.mjs` | approved content can be given a planned time… | placeholder Supabase/API origins, mocked responses |
| Accounts and platform capability states | MOCKED | `qa/premium-gates.gates.qa.mjs` | accounts and publishing: only what the server reports… | placeholder Supabase/API origins, mocked responses |
|  | LOCAL REAL | `qa/real-backend/acceptance.rb.qa.mjs` | F1 accounts… | sign-in/identity (bearer fixture); no real platform data |
|  | LOCAL REAL | `qa/real-backend/tiktok-draft.tt.qa.mjs` | TikTok: connect -> a bound TikTok video… | sign-in/identity (bearer fixture); TikTok HTTP (stand-in); image and video providers (an H.264 stand-in; a real 1080x1080 PNG) |
| Credits and billing presentation | MOCKED | `qa/premium-billing-calendar.browser.qa.mjs` | billing: an active entitlement shows the API plan… | placeholder Supabase/API origins, mocked responses |
|  | MOCKED | `qa/premium-gates.gates.qa.mjs` | credit cost: a read-only price preview… | placeholder Supabase/API origins, mocked responses |
| Session expiry and reauthentication | MOCKED | `qa/premium-session.browser.qa.mjs` | session expired: the customer is told plainly and can sign in again… | placeholder Supabase/API origins, mocked responses |
|  | MOCKED | `qa/pages-headers.pages.qa.mjs` | signed-in (mocked): the workspace and a session that has ended render under the policy… | placeholder Supabase/API origins, mocked responses |
| Desktop and mobile responsiveness | MOCKED | `qa/premium-industries.browser.qa.mjs` | every workspace section shows only this business, in its own language, with no overflow… | placeholder Supabase/API origins, mocked responses |

Run all of it at 1440, 768, 390 and 320 wide: CI runs the mocked suites at all four widths; the LOCAL REAL suites run locally (`qa/real-backend/run.sh <width>x<height>`, see its header; it never calls a paid provider unless `RB_PROVIDERS=real` and a founder-approved spend are set). The legacy live video GET, which can settle billing, is never called by any of them.
