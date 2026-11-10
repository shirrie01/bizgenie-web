# BG-LAUNCH-019 — Hosted customer recovery (SM Properties) — frontend result

6 Nov 2026. Evidence labels: HOSTED REAL = ran in the founder's browser against `https://bizgenie-studio-staging.pages.dev`; LOCAL REAL / MOCKED / NOT RUN / FAILED as before. Nothing here is a launch claim; staging is RED.

## 1. The failing call: is it a frontend contract mismatch? No.
Both routes are legitimate and the Studio uses them in the right order: `GET /customer/workspace` (look up the customer's workspace, `missing_workspace | ready | selection_required`) and then `POST /customer/workspace/bootstrap` (create it). Both are in API #226 (`src/customer-workspace/router.js`) and in Codex's BG-LAUNCH-012 contract (`workspaces`; bootstrap is one of the four routes the contract omits, already reported). The hosted failure, `No 'Access-Control-Allow-Origin' header … https://staging-api.getbizgenie.com/customer/workspace` from origin `https://bizgenie-studio-staging.pages.dev`, is the API not allowing that Studio origin (or the request never reaching the application). It is a backend/connectivity item owned by Codex, not a Studio request defect. **Hand-off to Codex (exact):** the Studio origin actually in use is `https://bizgenie-studio-staging.pages.dev`, not only `https://staging-app.getbizgenie.com`; `CORS_ALLOWED_ORIGINS` must contain the origin(s) the founder will use, exactly, and the preflight (`OPTIONS`, request headers `authorization,content-type`) must answer 204 with `Access-Control-Allow-Origin` echoing it. The Studio sends nothing else.

## 2. What was wrong in the Studio, and what changed (implemented, not yet deployed)
| # | Defect found in the hosted run | Fix | Evidence |
|---|---|---|---|
| F1 | The customer saw the browser's raw `Failed to fetch`: the App-level API helpers called `fetch` directly, so a blocked or unreachable request surfaced as a bare TypeError | one `apiFetch` for every API call: a failed connection becomes a plain sentence (reads: "couldn't reach BizGenie just now… Nothing was changed"; writes: "can't confirm that went through… nothing is shown as saved until BizGenie confirms it") with no infrastructure detail | 2 unit + 1 browser test (MOCKED; the browser test aborts the request as a blocked CORS call does) |
| F2 | Refusals were all "could not be created" | status-specific wording: 401 session ended (Sign in again), 400/422 "some details need another look", 403, 429, 5xx "temporarily unavailable. Nothing was saved…" | unit tests (MOCKED) |
| F3 | Entered details after a failure | already kept (the form state lives above the step); now pinned: business name and website survive every failure, the button re-enables, a double-click makes one request, and no failure is described as a created workspace | unit + browser (MOCKED) |
| F4 | The stale `#error=access_denied&error_code=otp_expired…` stayed in the address bar for good, and a good link's access token would have stayed there too (the Studio deliberately does not let supabase-js read the address) | `authCallback.js`: classify the result, remove every auth parameter from the address, show a notice on the sign-in screen only: expired link → explanation plus "Send me a new confirmation email" (never says whether the address has an account); good link → "Your email is confirmed. Sign in to continue."; a customer who already has a valid session is not shown it and is not signed out; token values are never read into the result, logged or shown | 6 + 3 + 2 unit tests, 2 browser tests (MOCKED) |
| F5 | The sign-in/create-account form had no styling at all | focused polish with the existing palette only: card, segmented Sign in / Create account, 46 px inputs, clear focus ring, full-width submit, distinct notice and error blocks; works at 320 px | browser axe scan (MOCKED) |
| F6 | Is SM Properties shown another industry's content? | no: no sector covers property, so the neutral reading applies ("general guidance… not your approved offer"), the goal is read as lead generation from the customer's own word "enquiries", and nothing from vehicle leasing, perfume, aesthetics, drinks, charity or takeaway can appear | 4 unit tests (LOCAL, pure functions) |

## 3. Seven-step onboarding, honest status for the SM Properties customer
| Step | Hosted (HOSTED REAL) | Frontend readiness |
|---|---|---|
| 1 Welcome | PASSED (navigation) | MOCKED browser, all widths in CI |
| 2 Your business | form completed | MOCKED; failures now keep the form |
| Workspace creation (end of step 2) | **FAILED** — browser CORS preflight (backend) | MOCKED success, 401, 422, 5xx, blocked-connection paths pass; real creation NOT RUN |
| 3 What you do | NOT RUN | MOCKED (sector "Not specified" is expected for property; free text accepted) |
| 4 Customers and goal | NOT RUN | MOCKED |
| 5 Channels | NOT RUN | MOCKED |
| 6 Brand Brain | NOT RUN | MOCKED; LOCAL REAL in the real-backend harness |
| 7 First recommendation | NOT RUN | MOCKED; the recommendation is the API's output, never a fixture |
Nothing above is marked passed in the hosted column unless the customer actually did it.

## 4. Support, Terms and Privacy
No approved destination exists. The API's canonical `config/branding.json` records `supportEmail: null`, `legalName: null`, `copyright: null`, `urls: {}`; its README says unapproved values are deliberately null. The Studio's settings are wired and waiting (`STAGING_SUPPORT_URL`, `STAGING_TERMS_URL`, `STAGING_PRIVACY_URL` repository variables; unset shows "not set up yet"). **Founder decisions needed:** (1) a support email address or page; (2) published Terms URL and approved text; (3) published Privacy URL and approved text (also needed for TikTok review); (4) legal entity name. Nothing is invented.

## 5. Commercial path (no change to pricing or Stripe)
Unchanged from `BG_LAUNCH_017_COMMERCIAL_JOURNEY.md`: registration, sign-in, checkout entry, entitlement read and credits display are implemented; plan selection, Stripe test-mode return URLs on the staging API, an approved plan/price/credit entitlement and the public site link are not decided/configured; none has run hosted. No live charge was or will be made.

## 6. Resume SM Properties without rework
After Codex confirms the preflight passes for `https://bizgenie-studio-staging.pages.dev` and the founder deploys this branch's fix, the customer signs in again (the stale error is cleaned automatically) and continues from step 2: their typed details are not stored until creation, so re-enter the business name and website once. Then: Create workspace → steps 3–7 → first recommendation → create campaign → content workspace → calendar, each as a hosted checkpoint recorded HOSTED REAL only when it actually happens. No generation is paid until a quote is confirmed, and provider flags are off.
