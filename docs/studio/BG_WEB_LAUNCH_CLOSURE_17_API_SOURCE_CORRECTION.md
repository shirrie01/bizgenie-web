# BG-WEB-LAUNCH-CLOSURE-17 — source compatibility correction after API #240–#244

**Date:** 13 November 2026. **Accepted API source:** `5cd1d774e04fcbfb0745d9bd5c7a0b974cd982f5`. **WEB baseline:** `6b02f101f65742d5f6a591648ddbf170959172e0`. No deployment, live provider call or customer-journey acceptance performed for this correction.

This is a versioned correction to `BG_WEB_LAUNCH_CLOSURE_16_CONTRACT_MATRIX.md`, which accurately recorded an **older** API main `d3ec6c37` at its checkpoint. Do not silently rewrite its historical test evidence. Its statements that 15 API PRs were open and that creative-job, social, insights or media-intake routes were absent **no longer describe accepted source**: #240–#244 have since merged; all 15 historical PRs were closed (14 superseded; #231 deferred unmerged); open API PRs are **zero** at the verified checkpoint. This supersession applies to the Closure-16 source-route matrix and the old route-gap handover, **not** its pending legal, commercial, Stripe or hosted acceptance gates.

## Current accepted API route/composition map (read from `index.js` and `src/activation/premiumComposition.js`)

| Feature | Source mount on accepted main | Actual composition or gate | Evidence classification |
| --- | --- | --- | --- |
| Quote/confirm and creative jobs | `/customer/generation-quotes`, `/customer/creative-jobs` | `createPremiumComposition` supplies `generationQuoteService` and job worker only when `QUOTED_GENERATION_ENABLED` and required server configuration exist; otherwise defaults to null/fail-closed | SOURCE PRESENT AND MOUNTED; RUNTIME CONFIGURATION / STAGING TEST NOT VERIFIED |
| Calendar and unschedule | `/customer/calendar` and campaign unschedule route | campaign repository and application authorization; SQL/RLS and staging revision still require evidence | SOURCE PRESENT; STAGING REVISION / ROLE NOT VERIFIED |
| Social OAuth, connections and publishing | `/customer/social` | `SOCIAL_PUBLISHING_ENABLED`; vetted `SOCIAL_PLATFORMS`, connector configuration, token-vault key and privileges; TikTok draft upload additionally requires reviewed video/toolchain/config | SOURCE PRESENT AND MOUNTED; DEFAULT OFF / EXTERNAL APPROVAL NOT VERIFIED |
| Customer media intake | `/customer/assets` | `MEDIA_INTAKE_ENABLED`; durable storage, scanner/inspection and reviewed rights policy required; staging-only UNSCANNED restrictions apply | SOURCE PRESENT AND MOUNTED; REAL STORAGE/SCANNER/RIGHTS NOT VERIFIED |
| Insights/learning | `/customer/insights` | `LEARNING_ENABLED` requires enabled social service and bounded evidence policy | SOURCE PRESENT AND MOUNTED; DEFAULT OFF / HOSTED NOT VERIFIED |
| Strategy and product/creative intelligence | `/customer/strategy-workflows`, `/customer/product-intelligence`, `/customer/intelligence` | requires independently configured services/policies | SOURCE PRESENT AND MOUNTED; HOSTED NOT VERIFIED |
| Catalogue and credit preview | billing route family | approved catalogue/policy and activated billing setup not established | APPROVAL / STAGING NOT VERIFIED |
| Billing management, invoices and refund/dispute | inspect precise current API mounts and policy before enabling WEB controls; earlier drafts may remain deliberately unmounted | cancellation/legal, test mode, entitlement and refund/dispute review needed | NOT VERIFIED; DO NOT ASSERT READY |
| Provider monthly spend | source of durable monthly GBP admission and fenced worker, including real transport guards | approved worst-case price/FX/cohort, database authority and runtime acceptance still missing; unknown cost denies | SOURCE GUARD PRESENT; LIVE £100 LIMIT NOT PROVEN |

**Mounting is not hosted operation.** In particular, `createApp` may mount an authenticated router with a null service that returns 503 rather than executing; startup/service composition is conditional and requires operator inputs. This document does not claim the serving staging revision, image digest, Cloudflare Pages feature flags or actual backing service configurations are known.

## P0 next work (owned by Claude and Codex separately)

1. **Claude source-only:** reconcile all `VITE_*` staging flags to the **actual deployed API revision**, not just main source. Create a build-time compatibility/fail-closed gate to prevent enabling quote, creative jobs, media intake, social and insights on unverified or disabled backend routes. Keep controls off until a supported revision and permitted runtime features are demonstrated. Review the WEB error copy for 404/503 to avoid blaming customers. No deployment without approval.
2. **Codex/backend:** CI stability [#246](https://github.com/shirrie01/bizgenie-api/issues/246), monthly GBP aggregate provider budget [#234](https://github.com/shirrie01/bizgenie-api/issues/234), and operator-authorised staging app-pool/RLS/metadata evidence [#245](https://github.com/shirrie01/bizgenie-api/issues/245). Do not recreate mounted routes based on Closure-16's obsolete gap list.
3. **Founder/adviser:** confirm the actual legal entity from incorporation evidence; VAT and catalogue approval; video class/price evidence; credit rollover, trial and cancellation/refund decisions; monitored support/privacy addresses and legal review. No company number or legalReviewed flag inferred.
4. **Acceptance:** review live (not assumed) migration history, backup restore, private R2/GCS media, Stripe test-mode, TikTok/LinkedIn external permission, then execute the documented 15 customer scenarios and media case only when independently approved.

## Evidence hierarchy

- WEB PR [#81](https://github.com/shirrie01/bizgenie-web/pull/81) exact head `be9e5aee44eea5d107be3f696097f936be170a08`, merged `6b02f101f65742d5f6a591648ddbf170959172e0`, hosted 23/23 checks green. Source docs/guard tests only.
- API #240–#244 source accepted main `5cd1d774e04fcbfb0745d9bd5c7a0b974cd982f5`; [combined main CI](https://github.com/shirrie01/bizgenie-api/actions/runs/43493956098) failed first attempt on one asynchronous PostgreSQL teardown case, then passed attempt 2 (2/2 jobs). [#246](https://github.com/shirrie01/bizgenie-api/issues/246) tracks deterministic repair.
- Real hosted customer acceptance, production Cloudflare Pages deployment, live Stripe/customer/provider/social calls and legal publication remain **NOT RUN / HOLD**. **LAUNCH NO-GO.**
