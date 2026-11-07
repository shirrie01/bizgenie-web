# BG-017C-05B — Final frontend closure: acceptance plan, Stripe readiness, release & rollback

Evidence labels: **MOCKED** (browser/unit tests against a bridge-faithful mock), **HOSTED NOT RUN**, **VERIFIED HOSTED PASS**. Nothing here is VERIFIED HOSTED PASS. No live write or checkout has been executed.

## Route-contract alignment
Codex API PR #229 head `90f83790` — `src/studio-bridge/service.js` blob `89226b16…` is identical to the blob vendored in `qa/contracts/BG_STUDIO_BRIDGE.extract.json`; the route table is unchanged. Customer routes keep their `/customer/...` paths; Supabase customer bearer is forwarded as `Authorization`; the bridge adds `X-Serverless-Authorization` server-side; it answers CORS preflight itself (allowed headers `authorization,content-type,range`, exact origin only); writes are blocked with `STAGING_WRITES_DISABLED` until a separately approved phase. Workspace bootstrap/retrieval and Brand Brain/onboarding routes are carried. Not carried: `POST /billing/stripe/checkout`, manual publication, OAuth callbacks (the UI says so honestly via `VITE_API_ROUTE_LIMITS=bridge-v1`). The bridge's public URL is UNKNOWN; none is hardcoded.

## SM Properties live acceptance sequence (all HOSTED NOT RUN)
Run only after: bridge deployed and smoke-tested by Codex, origin listed in a reviewed commit, release run `deploy=true` approved, and — for step 3 — a separately approved write phase (`allowWrites`) plus `HOSTED_ALLOW_WORKSPACE_WRITE=create-sm-properties-once`.

| # | Step | Mocked | Hosted |
|---|------|--------|--------|
| 1 | Login and session restoration | MOCKED | HOSTED NOT RUN |
| 2 | Workspace retrieval (`GET /customer/workspace`) | MOCKED | HOSTED NOT RUN |
| 3 | Step 2→3 bootstrap (`POST /customer/workspace/bootstrap`; single write) | MOCKED | HOSTED NOT RUN |
| 4 | Form-state persistence across steps | MOCKED | HOSTED NOT RUN |
| 5 | Reload and resume | MOCKED | HOSTED NOT RUN |
| 6 | Tenant isolation (foreign selectors → 404, no cross-tenant data) | MOCKED | HOSTED NOT RUN |
| 7 | Brand Brain completion (`PUT /customer/workspace/brand-brain`, `/onboarding`) | MOCKED (partial) | HOSTED NOT RUN |
| 8 | Recommendations and campaign preview | MOCKED (partial) | HOSTED NOT RUN |
| 9 | Calendar and draft scheduling | MOCKED (partial) | HOSTED NOT RUN |
| 10 | Stripe checkout entry (test mode) | MOCKED (UI states the route is not carried) | HOSTED NOT RUN — needs a separately approved safe test-mode procedure |

Scripts: `qa/hosted/hosted-acceptance.mjs` (read-only H01–H08) then `qa/hosted/sm-properties-acceptance.mjs` (A1–A11).

## Stripe checkout readiness — NOT READY
The frozen launch contract (#128, L4) requires a customer able to pay. The bridge carries no checkout route and Codex has defined no request/response contract, server-side price verification, tenant verification, or error codes for it. Required before paid launch: a Codex-reviewed checkout route on the bridge (server-resolved price/plan; tenant from trusted scope only; no client-supplied price), an approved plan/price, and a founder-approved test-mode procedure. Until then the UI makes no checkout call and says so.

## Deployment configuration
- Pages project `bizgenie-studio-staging` (Direct Upload; no Git integration). Current production deployment `0508d40e-88ca-41dc-aa3e-35901dd23ae0` (source `1e08cbce`).
- Workflow `studio-staging-release.yml`: manual only; exact 40-char SHA; `deploy` default false; `staging-studio` environment approval.
- Bridge origin: add the verified origin to `APPROVED_API_ORIGINS` and `BRIDGE_API_ORIGINS` and `qa/hosted/staging-settings.json` in one reviewed commit; pass it as `api_origin`. Bridge must set `BG_BRIDGE_STUDIO_ORIGIN=https://bizgenie-studio-staging.pages.dev`.
- **No silent fallback:** the default origin is the private IAM-protected API; `deploy=true` is now refused unless the origin is in `BRIDGE_API_ORIGINS` (empty today, so every deploy is refused). Origins must be https, bare, and approved; localhost is rejected in the workflow and at runtime (`apiConfig.js` shows "isn't set up for this address yet" on hosted pages).

## Staging deployment procedure (after approval)
1. Codex deploys and smoke-tests the bridge; origin recorded.
2. Reviewed commit lists the origin; hosted CI green on that SHA.
3. Run release with `deploy=false` (build check), then `deploy=true`, `api_origin=<bridge>`, approve `staging-studio`.
4. Confirm the Cloudflare deployment listing and smoke job pass; run H01–H08; then the SM Properties script.

## Rollback
Cloudflare dashboard → Workers & Pages → `bizgenie-studio-staging` → Deployments → `0508d40e…` → Rollback; or re-run the release with `sha=1e08cbce…` (this baseline still targets the private API: safe but known-blocked for customers). The release job records the previous deployment id in its summary. The bridge has no prior revision: disable it (keep writes off) rather than roll back.
