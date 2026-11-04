# BG-LAUNCH-013 — Studio activation readiness (staging)

4 Nov 2026. **Preparation only.** Nothing was created, deployed, merged or changed outside this branch: no Pages project, DNS record, IAM binding, Supabase setting, secret or Cloud Run revision. Staging RED, launch NO-GO. Builds on `BG_LAUNCH_011_STAGING_STUDIO_DEPLOYMENT_MANIFEST.md` (which stays the settings reference).

## 1. Canonical state read (4 Nov 2026)
Web PR #66 head `ae2933d98f90adf74332918065d9654b2992774d`, hosted run 67 17/17 (unchanged; this work is on a separate branch `bg-launch-013-staging-activation`, PR #66 untouched). API PR #226 head `f1fc2f51…` unchanged. **API PR #227 head is now `b400d27f…`** (its description still names `4d197ce2…`): Codex has moved it; LinkedIn remains undeployed and text posting disabled. Issue #191 shows no newer superseding hosting evidence. No Cloudflare tool or credential is reachable from this session, so **whether the Pages project `bizgenie-studio-staging` or the host `staging-app.getbizgenie.com` already exists is NOT CHECKED**; the only record is Issue #65 (BG-OPS-001), which names the plan, not an object. First read-only check for whoever has Cloudflare access: Workers & Pages list, and `dig CNAME staging-app.getbizgenie.com` (no answer = not created).

## 2. Hosting package: what is now verified locally
| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | Production build | PASS | `npm run build:pages` with the staging variables; bundle scanned |
| 2 | Command / output | `npm run build:pages` / `dist` | manifest §2 |
| 3 | Staging API origin | PASS | build refuses any other API origin (`PAGES_EXPECT_API_ORIGIN`); smoke fails on another BizGenie origin in the bundle |
| 4 | Supabase URL / key | PASS | build refuses another project ref; workflow refuses an empty key and anything starting `sb_secret_` or `eyJ` (service-role JWT shape) |
| 5 | Headers and CSP | PASS | `scripts/smoke-pages.mjs --dir` checks script-src `'self'`, object/frame-ancestors none, connect-src exactly self + API + Supabase, no wildcard/unsafe-eval, all six headers |
| 6 | SPA routes | PASS (emulated) / hosted NOT RUN | no `404.html`, no `_redirects` (smoke refuses both); `smoke-pages.mjs --url` proves `/billing/checkout/success`, `/billing/checkout/cancel`, a deep link all return `index.html` with status 200 once a host exists |
| 7 | Cross-origin | see §3 | API allows exactly the configured origin; Studio sends only `authorization`, `content-type`, `range` |
| 8 | noindex | PASS | `X-Robots-Tag: noindex, nofollow`; smoke fails if missing on staging or present on a non-staging build |
| 9 | Session / callbacks | see §4 | |
| 10 | Staging vs production | PASS | per-environment Pages project; guards above; staging workflow hard-codes only staging values |
| 11 | Safe logging | PASS | `src` has no `console.*` calls outside tests, so tokens cannot be logged by the app; errors are shown as plain sentences; Pages/Cloudflare keep access logs only |
| 12 | Rollback | documented §7 | previous deployment id recorded by the workflow |
No secret marker (`service_role`, `sk_live/test`, `client_secret`, private keys, `whsec_`, a JWT) is in the built bundle (checked on the real staging build, and the check is a guarded test).

## 3. Isolated backend compatibility (`bizgenie-api-staging-00030-pob`, 0% traffic; `00029-wtc` 100%)
Nothing about the revision could be queried (no GCP access here), so this is **from code at API #226 `f1fc2f51`**.
- **Base URL.** The Studio takes one `VITE_BIZGENIE_API_URL`, used as-is for every route. It is fixed at build time.
- **Authentication.** Every customer route is called with `Authorization: Bearer <Supabase access token>`. Tenant, project and brand ids come from the signed-in user's Supabase `app_metadata` and are sent as scope fields; the API re-checks membership server-side (nothing from the URL or an env var).
- **CORS (the API allows exactly this).** `src/activation/cors.js`: needs `CORS_ENABLED=true` and `CORS_ALLOWED_ORIGINS` containing the exact origin; **methods `GET,POST,PUT,PATCH,OPTIONS`; request headers only `authorization,content-type`** (plus `range` on the asset-preview route). Any other origin, method or header gets 403.
  - Studio calls use GET/POST/PUT/PATCH. **Defect (small, found now): one call uses `DELETE`** (`deleteAsset`, customer upload removal, `mediaIntakeClient.js:89`). The API would answer 403. Impact is nil on staging because uploads are OFF (`VITE_CUSTOMER_MEDIA_INTAKE_API` unset). Needed before uploads are enabled: Codex adds `DELETE` for that one route, or the Studio uses a POST variant. Recorded for Codex; not changed here.
- **Critical: a private tagged revision cannot be reached by a customer's browser.** Cloud Run reads its IAM identity token from `Authorization`; the Studio needs that header for the Supabase session, so the browser cannot carry both, and a browser holds no Google identity. Options:
  1. **Rehearsal by an authorised operator (no IAM change, 0% preserved)** — `scripts/staging/operator-proxy.mjs`: a local 127.0.0.1 proxy that adds the Google token in `X-Serverless-Authorization` (Cloud Run accepts it there and leaves `Authorization` for the app), forwards the Supabase `Authorization`, and answers preflight only for the one local Studio origin. Run the built Studio locally (`vite preview`) with `VITE_BIZGENIE_API_URL=http://127.0.0.1:8787` (the build guard needs `PAGES_ALLOW_HTTP_ORIGINS=1`, test builds only; **never** a hosted build). This produces HOSTED-BACKEND evidence for the API revision with a LOCAL Studio. It is not hosted-Studio acceptance.
  2. **Customer-reachable hosted staging** — requires the `staging-api` host to route to the revision that is to be tested, which means either moving traffic to `00030` (traffic change) or making a tagged URL public (IAM change). **Both are outside this work order and need a founder decision.** Recommended smallest safe form when the time comes: keep the service's existing public access, give `00030` a tag, and build a *separate* Studio with `VITE_BIZGENIE_API_URL` = the tag origin; the guard `PAGES_EXPECT_API_ORIGIN` would be set to it for that project; add that Studio's origin to `CORS_ALLOWED_ORIGINS` on the revision. Caveat: TikTok's redirect URI is registered on `staging-api…`, so OAuth cannot complete against a tagged host; that one step needs `staging-api` to serve the revision.
  3. Not recommended: shipping an identity token in the browser, or a public proxy in front of the revision.
  Unknown and needed from Codex: whether the service already allows unauthenticated invocation (if it does, the tagged URL is already public and option 1 is unnecessary).
- **Supabase identity compatibility.** The Studio uses the staging project `zrczojyxebwjgpymbmgu` publishable key with email+password; the API verifies the same project's JWTs (its configuration, not checked here). A mismatch shows as the "session ended" screen, not data exposure.
- **Routes** the gates enable: quotes/confirm/status (generation), workspace calendar, customer media preview, social accounts. Credit/billing display routes (`VITE_PLAN_CATALOGUE_API`, `VITE_BILLING_MANAGEMENT_API`, `VITE_CREDIT_PREVIEW_API`) stay **off** until staging billing and the tariff are approved; the credits/billing journey step is therefore NOT RUN.
- **Errors** the Studio expects: 401/403 (session ended or not allowed), 409 (stale version), 428 (legacy route needs quote), `MEDIA_NOT_SUITABLE`, `VIDEO_OUTPUT_INVALID`; each has a plain-sentence handling and unit tests.

## 4. Authentication and callback readiness
- Email + password through Supabase (`AuthPanel.jsx`). **Sign-up exists in the UI.** `signUp` passes no `emailRedirectTo`, so if email confirmation is enabled the link uses the Supabase **Site URL**: set it (and the allow-list) to `https://staging-app.getbizgenie.com` on the *staging* project only (Supabase setting, separate approval). With confirmation off, a new account is signed in at once but has **no tenant/project/brand in `app_metadata`**, so the Studio cannot scope it; a sandbox owner must be provisioned by an operator (existing activation script) for the journey. Self-service tenant creation is not in this build.
- `detectSessionInUrl:false`: sign-in needs no Supabase redirect. Sessions are per-origin `localStorage`; staging and production never share a session.
- TikTok return: API 303 → `https://staging-app.getbizgenie.com/?code=…&state=…` → the Studio completes it in the same tab, verifies state, and strips the query. Needs `TIKTOK_REDIRECT_URI=https://staging-api…/customer/social/oauth/callback/tiktok`, `TIKTOK_BROWSER_RETURN_URI=https://staging-app…/` (API #226 accepts exactly these) and the same redirect URI in the TikTok sandbox app.
- Stripe return paths `/billing/checkout/success|cancel` are served by SPA fallback (to be proven on the real host by `smoke-pages.mjs --url`).
- Session end: "Sign in again" removes the device session first (BG-LAUNCH-011).

## 5. First-customer journey matrix (staging)
Classes: HOSTED REAL = hosted Studio against hosted staging; LOCAL REAL = real backend, disposable local PostgreSQL, labelled stand-ins; MOCKED = deterministic browser stand-in; NOT RUN. **No hosted Studio exists, so every HOSTED REAL cell is NOT RUN.**
| # | Step | HOSTED REAL | Best evidence today |
|---|---|---|---|
| 1 | Open the hosted Studio | NOT RUN | build + Pages-headers browser check (MOCKED, emulated host) |
| 2 | Sign in (staging test account) | NOT RUN | MOCKED browser; sign-in flow in real-backend harness (LOCAL REAL) |
| 3 | Onboarding | NOT RUN | LOCAL REAL |
| 4 | Brand Brain | NOT RUN | LOCAL REAL |
| 5 | Create campaign | NOT RUN | LOCAL REAL |
| 6 | Request generation quote | NOT RUN | LOCAL REAL (provider stand-in) and MOCKED gates-ON |
| 7 | Confirm; inspect an existing safe asset | NOT RUN | LOCAL REAL (stand-in provider; **no new paid generation under this order**); the existing accepted image is viewable once signed in |
| 8 | Review and approve | NOT RUN | LOCAL REAL |
| 9 | Schedule in calendar | NOT RUN | LOCAL REAL + MOCKED |
| 10 | Accounts and capabilities | NOT RUN | MOCKED gates-ON (typed capabilities); TikTok shows "No accounts are connected yet" |
| 11 | Credits and billing display | NOT RUN (gates off) | MOCKED; blocked on approved tariff and staging billing |
| 12 | Sign out and in again | NOT RUN | MOCKED browser, unit tests |
The machine-readable matrix is `qa/acceptance-matrix.json` (guarded).

## 6. Launch-facing gaps found (not built here; no new features)
- **No visible help, support or legal link anywhere in the Studio** (no `mailto:`, terms or privacy link). TikTok review and paying customers need them. Needs founder-approved URLs/address; then a one-line footer.
- Tagline: the exact string now exists as a tested constant (`src/brand/tagline.js`), not rendered; placement per `BG_LAUNCH_011_TAGLINE_PLACEMENT.md` awaits approval. No coral hex was invented.
- Plan selection is not in the Studio while `VITE_PLAN_CATALOGUE_API` is off (see handoff doc).

## 7. Deploy and rollback (the one controlled decision)
Prerequisites (founder): Cloudflare Pages project `bizgenie-studio-staging` (direct upload is enough; Git integration not needed) and the GoDaddy CNAME; GitHub Environment `staging-studio` with required reviewers holding `CLOUDFLARE_API_TOKEN` (Pages:Edit for that one project) and `CLOUDFLARE_ACCOUNT_ID`; repository variable `STAGING_SUPABASE_PUBLISHABLE_KEY` (the publishable key).
1. Actions → **Studio staging release (manual)** → sha = the approved 40-character commit, `deploy` = false. It builds from the lockfile, runs the tests, builds with the staging guards, runs the bundle/headers verification and uploads `studio-staging-dist-<sha>` with its sha256. Review.
2. Run again with `deploy` = true. The `staging-studio` Environment waits for a reviewer. The job re-checks the artefact hash, records the previous deployment id, deploys, and smoke-tests the live host (headers, CSP, noindex, SPA fallback, immutable assets, bundle scan).
3. Evidence for GitHub/Mission Control is the job summary: commit, dist sha256, previous deployment id, smoke result.
**Rollback:** Cloudflare → Workers & Pages → `bizgenie-studio-staging` → Deployments → the recorded previous deployment → Rollback (or pause the project / remove the CNAME to take the host offline). Nothing else depends on the Studio host. No database, secret or traffic is touched by a Studio deploy.
There is no deploy on push, pull request or schedule. `wrangler` is fetched only inside the approved deploy job (`npx wrangler@3`; pin an exact version when the first run succeeds).

## 8. Smallest founder approval
Create the Pages project, DNS record and the `staging-studio` Environment as in §7, and decide the backend path in §3 (option 1 for operator rehearsal now; option 2 only with a separate traffic/IAM decision). Then step 1 of §7 can run without further input.
