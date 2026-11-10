# BG-LAUNCH-013 — Public website to Studio handoff contract (proposal; nothing published)

**Evidence.** This repository contains the Studio only. No public-website implementation was found here. The only record is the plan in PR #57 (`docs/website/BG_WEB_001_HOSTING_AND_CUTOVER.md`: `www` as a static site, recommended Firebase Hosting) and the hosting decision of Issue #65 (Studio on Cloudflare Pages, `app` hosts). The live website was not inspected or changed. This contract is therefore what each side must provide; it assumes nothing about the site's current code.

| Step | Contract | Owner | Status |
|---|---|---|---|
| 1 Landing call to action | One link, `https://app.getbizgenie.com/` (production) / `https://staging-app.getbizgenie.com/` (staging). No query data is needed or read. Link text: "Start", "Sign in" | website | NOT RUN |
| 2 Sign-in / sign-up | The Studio's own panel (email + password, Supabase). The website must not collect passwords or embed the panel | Studio | exists; hosted NOT RUN |
| 3 Account creation | Sign-up creates an auth user only. A workspace (tenant, project, brand in `app_metadata`) is created by BizGenie operations/provisioning; **no self-service workspace creation exists in the Studio yet**. A new sign-up without a workspace sees the Studio's unscoped state, so the website must not promise instant access until provisioning is automatic (decision needed) | Studio + API | GAP |
| 4 Plan selection and Stripe entitlement | Plans, prices and entitlement belong to the backend and the Stripe Price (no tariff in the Studio). Studio return paths: `/billing/checkout/success`, `/billing/checkout/cancel` (SPA fallback required). Needs `VITE_PLAN_CATALOGUE_API`/`VITE_BILLING_MANAGEMENT_API` on, after the tariff and commercial policies are approved. Website pricing copy must come from the same approved source | founder / API | BLOCKED |
| 5 First onboarding | Studio onboarding after the first sign-in with a scoped account | Studio | LOCAL REAL |
| 6 Arrival | The Studio opens on Overview; the tagline is not shown until placement is approved | Studio | exists |
| 7 Support and legal | Website and Studio must link the same Terms, Privacy and a support address. **The Studio has none today** (gap). URLs/address to be supplied by the founder | founder | GAP |

**Cross-origin facts.** The website needs no API access and no CORS entry. The Studio origin is the only browser origin the API allows. Cookies are not shared (sessions are `localStorage` per origin).

**Release checklist (to run before a website link goes live)**
1. Studio staging release done and `smoke-pages.mjs --url` PASS on the host.
2. A provisioned sandbox owner completes journey steps 2–12 on the hosted Studio (matrix in `BG_LAUNCH_013_STUDIO_ACTIVATION_READINESS.md`).
3. Terms, Privacy and support address agreed and linked from both.
4. Stripe test-mode checkout return verified on the host; tariff approved.
5. Production uses its own Pages project, API origin and Supabase project (the build refuses mixing).
6. Founder approves the single website link change; website published by its own process (not this repo).
