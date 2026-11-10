# BG-LAUNCH-015 — First-customer activation (engineering result)

4 Nov 2026. Branch `bg-launch-015-first-customer-activation`, stacked on Web #67 (`c58d53bc`), which is stacked on #66 (`ae2933d9`). No merge, deployment, DNS, IAM, traffic, production, shared-database, Stripe, OAuth or paid-provider action. Staging RED, launch NO-GO.

## 1. Correction of BG-LAUNCH-013 (read this first)
BG-LAUNCH-013 said sign-up "creates no workspace" and called it a gap. That was imprecise. **A provisioning path exists on both sides and is tested**; what was missing was a proof of the failure paths and operational prerequisites:
- Studio: after sign-in an account without `app_metadata` scope is `scope-missing`; the onboarding screen calls `GET /customer/workspace` then `POST /customer/workspace/bootstrap` (business name; optional website and challenge), then refreshes the session. More than one workspace returns `selection_required` and the customer chooses; nothing is guessed. Tenant, project and brand are never typed, never taken from the URL, form or environment (`session.js` reads only the server-written `app_metadata`).
- API #226: `src/customer-workspace` mounts `GET /customer/workspace`, `POST /bootstrap`, `/brands`, `/select`; bootstrap is idempotent and sets trusted scope through `CustomerScopeProvisioner` (Supabase Auth admin `updateUserById`), asking the client to refresh. The request body cannot carry identity or metadata claims (test "does not allow the request body to supply identity or metadata claims"). I ran `customer-scope-provisioner`, `customer-workspace` and `workspace-onboarding` tests at `f1fc2f51`: 58/58 pass (they use a stand-in Supabase Auth admin client, so this is not proof against real Supabase).
- **Operational prerequisite (Codex/founder, unverified):** the staging revision needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (server side only; `scripts/staging/staging.env.example`). Without a provisioner the API answers `ready` but never writes the scope, and the customer is told to "sign out and back in" forever. Whether revision `00030-pob` has it is **NOT CHECKED**. Checking it is read-only: the revision's environment variable names (never values).

## 2. Defects found and fixed (each reproduced, fixed narrowly, with regression coverage)
| # | Defect | Fix | Regression |
|---|---|---|---|
| D1 | Expired sign-in during workspace creation/check (HTTP 401) was shown as a generic "could not be created" with no way forward | 401 is typed as a session problem; the screen shows "Your session has ended" and Sign in again (`App.jsx`) | browser test "workspace creation with an expired sign-in…" (**fails without the fix**, passes with it); asserts no campaign data is shown |
| D2 | Sign-up for an address that already has an account, with email confirmation on, says "Check your inbox" and nothing ever arrives | one neutral notice for every address ("…If you already have an account with this email, sign in instead."): no dead end, and the form does not reveal which addresses are registered | `AuthPanel.test.jsx` (5 tests incl. identical wording for new and existing) |
| D3 | The Delete control for customer uploads uses HTTP DELETE, which the API's CORS policy refuses from a browser | hidden unless `VITE_CUSTOMER_MEDIA_DELETE_API=true` (default off); Withdraw (POST) is unaffected; a blocked DELETE is reported as unconfirmed, never as deleted | `PremiumMedia.test.jsx`, `mediaIntakeClient.test.js` |
| D4 | No support or legal destinations anywhere in the Studio | `SiteLinks` footer: `VITE_SUPPORT_URL` (https or mailto), `VITE_TERMS_URL`, `VITE_PRIVACY_URL`; an unset or non-https value is plain text "…: not set up yet". No link and no legal text invented | `SiteLinks.test.jsx` |
Failed workspace creation (503) was already handled ("Nothing was saved", retry enabled); a browser test now pins it.

## 3. Backend contract compatibility (BG-LAUNCH-012 contract, Codex branch `bg-launch-012-backend-completion` @ `d44b29f1`)
Vendored extract: `qa/contracts/BG_LAUNCH_012_CUSTOMER_API.extract.json`. `src/test/customerApiContract.test.js` (8 tests, MOCKED transport):
- every `/customer/*` path the Studio calls is in the contract, or is named in the test with its reason (gated off, legacy, or "not in the contract");
- the 24 journey-critical contract endpoints are all called by the Studio;
- request bodies for quote, confirm, add content item, submit for review and unschedule contain exactly the contract's fields (none missing, none extra), and no client-chosen identity or price/provider field;
- execution classes equal the contract's; every contract job state is known to the Studio.
**Mismatches for Codex (contract only; the code works):** the contract omits `POST /customer/workspace/bootstrap` and `POST /customer/workspace/brands`, `GET /customer/campaigns` (list) and `POST /customer/campaign-recommendations`, all of which the first-customer journey uses and API #226 implements. The Studio also calls `GET /customer/billing/invoices` (gate off), which has no implementation in API #226 source. This proves the Studio matches the *documented* contract; it does not prove a deployed revision implements it (NOT RUN).

## 4. CORS and uploads
- The API (`src/activation/cors.js`) allows methods `GET,POST,PUT,PATCH,OPTIONS`, request headers `authorization,content-type` (+`range` on asset preview), exact origins; anything else gets 403 at the preflight.
- Upload removal: `DELETE /customer/assets/:id` (owner, `deleteAsset`). Uploads are off in the launch scope (`VITE_CUSTOMER_MEDIA_INTAKE_API` unset, no malware scanner). The Studio's Delete is now off by default (D3). **Exact backend requirement for Codex:** add `DELETE` to `ALLOWED_METHODS`/`Access-Control-Allow-Methods` for `/customer/assets/:assetId` only (not globally), keep header list unchanged, add a preflight test; or provide a POST variant. Until then Withdraw (`POST …/revoke`) is the supported removal. After the API change, turn the gate on and run a hosted preflight check.

## 5. Staging connectivity (operator proxy, hardened)
`scripts/staging/operator-proxy.mjs`, 3 tests: refuses any upstream except the `bizgenie-api-staging` Cloud Run service or a revision tag of it (production names, other services and look-alike hosts fail at start-up); forwards only `/customer/` paths and only when the browser sent a Supabase `Authorization`; never forwards DELETE (matches the API's CORS list); the Google identity token is added server-side in `X-Serverless-Authorization`, never returned in any body or header, never logged (the proxy logs nothing per request); upstream failures are a generic 502; listens on 127.0.0.1 only, answers preflight only for one local Studio origin. Staging builds cannot use production Supabase or API (`PAGES_EXPECT_*` guards, smoke check). Live use needs an authorised operator's token: NOT RUN.

## 6. First-customer activation matrix
HR = HOSTED REAL, LR = LOCAL REAL (real API, disposable PostgreSQL, labelled stand-ins), MK = MOCKED, NR = NOT RUN. **HR is NR for every step: no hosted Studio exists.**
| Step | Studio side | Backend side | Evidence |
|---|---|---|---|
| New user registration | MK | Supabase Auth NR | `AuthPanel.test.jsx` |
| Email confirmation state | MK | real email NR | `AuthPanel.test.jsx` |
| Workspace provisioning | MK browser (success, 401, 503) | API unit tests with stand-in Auth admin (58 pass); LR through the Studio NR (the real-backend harness stubs bootstrap) | `premium-studio.browser.qa.mjs`; API tests |
| Brand Brain setup | MK | LR (harness) | `acceptance.rb.qa.mjs`, `premium-studio.browser.qa.mjs` |
| Campaign creation | MK | LR | same |
| Generation quote | MK | LR (provider stand-in) | contract test + gates-ON browser + harness |
| Credit availability | MK | LR (seeded credits) | harness; hosted billing NR (gates off) |
| Generation confirmation | MK | LR (stand-in; no paid call) | contract test; harness |
| Existing media asset review | MK | LR (stand-in) | harness |
| Calendar scheduling | MK | LR | harness |
| Session expiry and recovery | MK | n/a | `premium-session.browser.qa.mjs`, D1 test |
Machine-readable: `qa/acceptance-matrix.json`.

## 7. Updated staging release checklist (nothing here is done; each item names who does it)
1. **Pages project** `bizgenie-studio-staging` (founder). 2. **Domain**: GoDaddy `CNAME staging-app` (founder). 3. **GitHub Environment** `staging-studio` with required reviewers and secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (founder). 4. **Repository variables**: `STAGING_SUPABASE_PUBLISHABLE_KEY` (publishable only), optional `STAGING_SUPPORT_URL`, `STAGING_TERMS_URL`, `STAGING_PRIVACY_URL` (leave unset until real). 5. **API connectivity** (Codex + founder): `staging-api` serves the revision under test, or a tagged-URL decision (see BG_LAUNCH_013 §3); confirm the revision has `SUPABASE_SERVICE_ROLE_KEY` set (names only). 6. **CORS** (Codex): `CORS_ENABLED=true`, `CORS_ALLOWED_ORIGINS` includes `https://staging-app.getbizgenie.com`; `DELETE` only after §4. 7. **Auth callbacks** (founder): Supabase Site URL and redirect allow-list on the *staging* project if email confirmation is on; TikTok redirect and return URIs. 8. **Sandbox owner** (operator): a staging auth user whose workspace is created by the Studio's own onboarding (or the activation script). 9. Run "Studio staging release (manual)" with `deploy` false, review, then true (approval gate). 10. **Rollback** as in BG_LAUNCH_013 §7. 11. **Hosted acceptance**: run the matrix above on the real host; only then does any cell become HOSTED REAL.
**No automatic deployment:** `studio-staging-release.yml` is `workflow_dispatch` only, its deploy job needs `inputs.deploy` and the Environment approval; guarded by `stagingReleaseWorkflow.test.js`. No new workflow was added here.

## 8. Remaining genuine blockers
Hosting objects (founder); revision's Supabase admin configuration, CORS entry and the `DELETE` route (Codex); a customer-reachable API path (founder decision); real email confirmation and Supabase Site URL; staging billing/tariff; support and legal URLs and approved legal text; tagline placement and coral hex approval.
