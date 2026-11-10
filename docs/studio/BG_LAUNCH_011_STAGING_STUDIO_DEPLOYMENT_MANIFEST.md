# BG-LAUNCH-011 — Staging Studio deployment manifest (Cloudflare Pages)

4 Nov 2026. **Preparation only. Nothing was created, changed or deployed.** No Pages project, DNS record, Supabase setting, secret or Cloud Run setting was touched. Staging RED, launch NO-GO. This manifest is for a **controlled staging** deployment of the Studio; it does not claim BizGenie has launched, that TikTok is connected, or that anything is hosted-proven.

## 0. Does hosting already exist? (checked before asserting it does not)
Checked on 4 Nov 2026: Issue #191 (newest comments), `bizgenie-web` `main` (unchanged since 19 Oct), all open web PRs and branches, and the Studio repository tree. **Nothing supersedes the earlier report.** The only hosting decision on record is Issue #65 (BG-OPS-001, 9 Sep): *web hosting Cloudflare Pages; staging web `staging-app.getbizgenie.com`; staging API `staging-api.getbizgenie.com` (Cloud Run); GoDaddy DNS; Supabase for Auth/database only*, with no recorded follow-up. The Studio repository has no Pages configuration, headers file, deploy workflow or `wrangler` file; this change adds the headers generator only. The separate public-website plan (PR #57, `docs/website/BG_WEB_001_HOSTING_AND_CUTOVER.md`) concerns `www` and recommends Firebase Hosting for the static marketing site; it does not cover the Studio and does not conflict with this manifest.

## 1. What is deployed
The Vite single-page Studio built from `bizgenie-web` branch `bg-launch-010-fe-customer-journey` (Web PR #66) at the **exact SHA recorded in the approval**. It contains the stacked work of PRs #63, #64, #65 and #66. Build command `npm run build:pages` (= `vite build`, then `scripts/pages-headers.mjs` writes `dist/_headers`). Output directory `dist`.

## 2. Cloudflare Pages settings
| Setting | Value |
|---|---|
| Project | `bizgenie-studio-staging` (one project per environment; never reuse for production) |
| Source | **Direct upload from the manual release workflow** (BG-LAUNCH-017 correction: the earlier "Git source" row contradicted the workflow). Production branch label `main`, the value the workflow deploys with (`PAGES_PRODUCTION_BRANCH`). No Git integration, so nothing builds or deploys on push |
| Preview deployments | **None** (no Git integration; the workflow deploys only the approved SHA to the production branch label) |
| Framework preset | None |
| Build command / output | built by the workflow (`npm run build:pages`), uploaded from `dist` |
| Root directory | `/` |
| Node | `NODE_VERSION=22` (what CI uses). Pages' build image runs `npm clean-install` when a lockfile exists, which honours `package-lock.json` (confirm in the first build log) |
| Custom domain | `staging-app.getbizgenie.com` (GoDaddy `CNAME staging-app -> <project>.pages.dev`; one new record, nothing existing edited) |
| Cloudflare Access | Not enabled by default (TikTok review and the founder's phone must reach it). The build adds `X-Robots-Tag: noindex, nofollow`. Enable Access only if you prefer a private staging, knowing review reviewers then cannot open it. |

## 3. Environment variables (Pages, "Production" environment, plain text; every `VITE_*` value ships to the browser)
| Variable | Staging value | Notes |
|---|---|---|
| `VITE_BIZGENIE_API_URL` | `https://staging-api.getbizgenie.com` | the API origin the app may call (also written into the CSP `connect-src`) |
| `VITE_SUPABASE_URL` | `https://zrczojyxebwjgpymbmgu.supabase.co` | BizGenie Staging project |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | the project's **publishable** key (public by design) | **never** the secret or `service_role` key; never any other secret |
| `VITE_PREMIUM_STUDIO_ENABLED` | `true` | premium Studio |
| `PAGES_EXPECT_API_ORIGIN` | `https://staging-api.getbizgenie.com` | build **fails** if the API URL is anything else |
| `PAGES_EXPECT_SUPABASE_REF` | `zrczojyxebwjgpymbmgu` | build **fails** if the Supabase URL is any other project (tenant-safe) |
| `PAGES_NOINDEX` | `1` | adds `X-Robots-Tag: noindex, nofollow` |

**Capability gates (first build).** Each gate makes the Studio call a route; turn on only what the isolated revision `bizgenie-api-staging-00030-pob` serves and Codex's read-only acceptance has covered.
| Gate | First staging build | Why |
|---|---|---|
| `VITE_GENERATION_QUOTE_API` | `true` | price, confirm, status; credits are set aside only on confirm; **no paid call happens unless a customer confirms a quote and the backend's provider flags are on** |
| `VITE_WORKSPACE_CALENDAR_API` | `true` | calendar |
| `VITE_CUSTOMER_MEDIA_API` | `true` | authenticated preview of stored images |
| `VITE_SOCIAL_ACCOUNTS_API` | `true` | accounts screen |
| `VITE_SOCIAL_PROVIDERS` | `tiktok` | offers the **TikTok Connect button only**. It does not mean TikTok is connected or operational: the screen says "No accounts are connected yet" until a real, owner-authorised sandbox connection completes. Unset = every known platform (not recommended on staging) |
| `VITE_CUSTOMER_MEDIA_INTAKE_API` | unset | customer uploads stay OFF (no malware scanner exists) |
| `VITE_BILLING_MANAGEMENT_API`, `VITE_PLAN_CATALOGUE_API`, `VITE_CREDIT_PREVIEW_API` | unset until staging billing (Stripe test, commercial policies) is verified | no price, plan or tariff is invented by the Studio |
| `VITE_ANALYTICS_API` | unset until needed | insights screen |
The app reads only `VITE_BIZGENIE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and the gates above. Tenant, project and brand come **only** from the signed-in user's Supabase `app_metadata`, never from an environment variable, URL or form.

## 4. API origin, callback and authentication requirements (owners: founder / Codex)
1. **CORS:** the staging API must allow exactly `https://staging-app.getbizgenie.com` (`CORS_ENABLED=true`, `CORS_ALLOWED_ORIGINS`). Whether the isolated revision already does is **unconfirmed**; if not, it needs a revision configuration change (separate approval).
2. **TikTok:** `TIKTOK_REDIRECT_URI=https://staging-api.getbizgenie.com/customer/social/oauth/callback/tiktok` and `TIKTOK_BROWSER_RETURN_URI=https://staging-app.getbizgenie.com/` on the API; the same redirect URI registered in the TikTok sandbox app; TikTok credentials and the vault key as secrets. Flow: Studio asks the API for a sign-in URL (the Studio checks it against TikTok's contract and the two reviewed callback origins) → TikTok → API callback relays with a 303 to `https://staging-app.getbizgenie.com/?code=…&state=…` → the Studio completes the connection **in the same tab** using the verifier kept in `sessionStorage` and removes the query from the address bar. Pages must serve `/` with its query unchanged (it does).
3. **Authentication:** Supabase Auth email and password only. `detectSessionInUrl` is false, so no Supabase redirect URL is needed for sign-in. If **email confirmation** is enabled on the staging project, its Site URL and redirect allow-list must include `https://staging-app.getbizgenie.com` (a Supabase setting: separate approval). A sandbox **owner** account is required whose `app_metadata` carries tenant, project and brand and whose membership is owner (the staging database has 2 tenants; which user to use is a founder decision). Sessions live in `localStorage` per origin, so staging and production sessions never mix.
4. **Session end:** "Sign in again" now always ends this device's session first (`signOut({ scope: "local" })`), so it cannot strand the customer if the server is unreachable.

## 5. SPA routing, headers and assets
- No `_redirects` file and **no `404.html`**: Cloudflare Pages then serves `index.html` for unknown paths, which Stripe's return paths (`/billing/checkout/success`, `/billing/checkout/cancel`) and deep links need. (The release-candidate browser check emulates this; the first hosted check must confirm it on the real URL.)
- `_headers` is generated at build time from the two origins: `script-src 'self'` (no inline script), `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`, `font-src https://fonts.gstatic.com`, `img-src 'self' data: blob:`, `media-src 'self' blob:`, `connect-src 'self' <API origin> <Supabase origin>`, `frame-ancestors 'none'`, `object-src 'none'`, plus HSTS (3600 s while staging), `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, a restrictive `Permissions-Policy`. Hashed files under `/assets/*` are cached for a year (immutable); `index.html` is `no-cache`.
- Fonts still load from Google Fonts (allowed in the policy); self-hosting them is a later privacy improvement.

## 6. Verification after deployment (read-only, owner signed in; no paid action)
Response headers and CSP on the real URL (browser console shows no violation); sign-in screen; owner sign-in; the session-end path; deep link `/billing/checkout/success`; each enabled screen loads without an error from the API; calendar; accounts shows **no connection** and the TikTok Connect button only. Then Codex's read-only acceptance of the revision. Only then the single founder-supervised TikTok sandbox connection (Issue #191 Phase B).

## 7. Rollback
Pages → Deployments → roll back to the previous deployment (or pause the project); remove the `staging-app` CNAME to take the host offline. Nothing else depends on it: the TikTok redirect URI points at the API, and the API CORS entry is harmless without the host. No database or secret is involved.

## 8. Smallest founder approval
"Approve creating Cloudflare Pages project `bizgenie-studio-staging` from `shirrie01/bizgenie-web`, branch `bg-launch-010-fe-customer-journey` at the SHA named below, with the settings and variables in sections 2 and 3, and the GoDaddy record `CNAME staging-app -> <project>.pages.dev`." Further, separate approvals (not part of this one): staging API CORS entry and TikTok settings, a Supabase Auth URL setting, the sandbox owner account, and any traffic change.

## 9. Remaining hosting dependencies (verified unknowns)
Cloudflare account and GoDaddy DNS access (founder); API CORS on the isolated revision; staging billing readiness (gates left off); TikTok callback registration and secrets; owner account; Codex's tag-URL acceptance; legal pages for TikTok review.
