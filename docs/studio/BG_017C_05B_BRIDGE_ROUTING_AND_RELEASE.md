# BG-017C-05B — Studio routing to the trusted staging bridge, acceptance and release plan

7 Nov 2026. Preparation only: implemented and tested in CI, **not deployed**. No merge, deployment, DNS, IAM, traffic, secret, customer write or paid action. Staging RED. Evidence labels: HOSTED REAL / LOCAL REAL / MOCKED / NOT RUN / FAILED. Nothing here is HOSTED REAL.

## 1. What is deployed today vs what this branch holds
| | Pages project | Source SHA | Calls |
|---|---|---|---|
| **Current staging production** | `bizgenie-studio-staging` | `1e08cbce69b0ec47e19d067c96445ef20045feda` (deployment `0508d40e-88ca-41dc-aa3e-35901dd23ae0`) | `https://staging-api.getbizgenie.com` directly (IAM-protected, so the browser's preflight is refused) |
| PR #71 preview | a **different** project, `bizgenie-web` (Cloudflare Git preview) | `cf6bfec7…` | not the staging Studio; do not confuse it |
| This branch | none yet | the commit named in the PR #71 checkpoint | the API origin chosen at release time (see §4) |

## 2. The Studio ↔ bridge contract (what the Studio needs, and what it sends)
Source of the bridge side: Codex API PR #229 head `6adeed03…`, `src/studio-bridge/service.js` (vendored extract `qa/contracts/BG_STUDIO_BRIDGE.extract.json`). The bridge is NOT deployed and its browser-facing URL is NOT verified; nothing below hard-codes one.
- **Base URL.** One build-time value, `VITE_BIZGENIE_API_URL`, an origin only. The bridge exposes the same `/customer/...` paths as the API, so pointing the Studio at the bridge changes only this value; no Studio path changes. It is also written into the page's CSP `connect-src`, so the page can reach nothing else.
- **Hosted pages need an explicit https origin.** A hosted build with the value missing, `http`, `localhost`, with a path, query or credentials does not start; it shows "BizGenie isn't set up for this address yet" and sends nothing. Before this, ten modules silently fell back to `http://localhost:8080`, which on a hosted page would have sent a customer's bearer token to their own machine (`src/apiConfig.js`, `src/main.jsx`).
- **Requests.** `Authorization: Bearer <Supabase access token>`, `Content-Type: application/json` on writes, `Range` on media preview; nothing else. The browser never holds a Google identity token; the bridge adds `X-Serverless-Authorization` server-side, and refuses any request that already carries it (the Studio never sends it; a test and the hosted harness assert that).
- **Preflight.** The bridge answers `OPTIONS` itself with `204`, `Access-Control-Allow-Origin` equal to its one configured Studio origin, allowed headers `authorization,content-type,range`, and `Allow-Methods` equal to the requested method. Required Studio origin: `https://bizgenie-studio-staging.pages.dev` (Codex sets `BG_BRIDGE_STUDIO_ORIGIN`). Every request type the Studio makes was checked against these rules in a real browser (MOCKED stand-in; see §6).
- **Scope.** On every non-identity route the bridge requires any `tenant_id`/`project_id`/`brand_id` in the query or JSON body to equal the verified token's trusted scope, else `404 RESOURCE_NOT_AVAILABLE`. The Studio only ever names the signed-in customer's own ids (browser test).
- **Refusals the bridge can send, and what the customer reads** (`src/bridgeErrors.js`): `STAGING_WRITES_DISABLED` "Changes are switched off in this test environment, so nothing was saved. Your details are still here."; `GENERATION_CONFIRMATION_DISABLED` "…Nothing was started and nothing was charged."; `SOCIAL_WRITES_DISABLED`; `BRIDGE_RATE_LIMITED`; `STUDIO_BRIDGE_TIMEOUT` / `PRIVATE_API_UNAVAILABLE` (temporarily unavailable, check before retrying a save); `ORIGIN_FORBIDDEN` / `HEADERS_FORBIDDEN` / `SERVER_HEADERS_FORBIDDEN` (this address isn't set up yet; contact support); `AUTHENTICATION_REQUIRED` (session ended, Sign in again). No infrastructure names appear.
- **Writes are off by default in the bridge** (`BG_BRIDGE_ALLOW_WRITES`). That includes `POST /customer/workspace/bootstrap`: until Codex's bridge is configured with writes on, SM Properties will see the "switched off" message, correctly, and nothing is created.

**Shared route table (method, route, purpose, bridge status, auth, risk, launch class, owner), kept honest by tests: `docs/studio/BG_017C_05B_ROUTE_TABLE.md`.** It shows that Stripe checkout entry is the one mandatory route the bridge does not carry.

### Unresolved interface items (recorded on WEB #71 and API #229; none invented)
1. **The bridge's browser-facing origin** (and whether it is publicly reachable). Needed to add it to `APPROVED_API_ORIGINS`. Owner: Codex/founder.
2. **Stripe checkout entry cannot work through the bridge (blocks a paid launch, #128 L4; class A).** A bridge-pointed build (`VITE_API_ROUTE_LIMITS=bridge-v1`) says so and sends nothing. The Studio starts checkout with `POST /billing/stripe/checkout` (outside `/customer/`); the bridge carries only `/customer/...` routes. Billing/plan selection is therefore not testable through this bridge. Owner: Codex (decide route) before any billing test.
3. **Social connection.** The provider's OAuth callback is an unauthenticated redirect to the API host and is not (and should not be) carried by the bridge. Connecting TikTok therefore stays out of scope until the callback path is decided. Owner: Codex/founder.
4. Not carried by the bridge and gated off in the staging build: manual publication, insights, billing management, legacy generate. No effect on the first-customer journey.
5. Writes: the founder must approve switching bridge writes on before SM Properties can be created.

## 3. Frontend changes in this batch (PR #71)
`apiConfig.js` + `main.jsx` (hosted-origin guard); `bridgeErrors.js` wired into the workspace, generation-quote and campaign clients and the App-level workspace calls; release workflow `api_origin` input with an approved-origin list (a reviewed change adds the bridge origin; any other origin fails before the build); `qa/bridge-gate.mjs` + vendored extract; mocked bridge-faithful browser tests; `qa/hosted/sm-properties-acceptance.mjs` and its self-test. Preserved unchanged: OTP/email-link cleanup, plain connection errors, status-specific workspace messages, form-state keeping, one request per click, neutral property copy, the styled sign-in.

## 4. Staging release plan (nothing here has been run)
Backend first, then the Studio, under separate founder approvals.
1. **Codex (separate approval):** deploy the reviewed staging bridge with `BG_BRIDGE_STUDIO_ORIGIN=https://bizgenie-studio-staging.pages.dev`; record its browser-facing origin, serving SHA, revision and digest; writes per the founder's decision. Run `scripts/staging/workspace-preflight-readonly.sh` (204 with the exact origin on both routes).
2. **Frontend reviewed commit:** add that verified origin to `APPROVED_API_ORIGINS` (workflow) and `approved_api_origins` + `bridge` (`qa/hosted/staging-settings.json`); exact-head hosted CI. Record the final SHA.
3. **Build and verify (no deploy):** dispatch `studio-staging-release.yml` from the branch with `sha=<that SHA>`, `api_origin=<bridge origin>`, `deploy=false`. It resolves the origin against the approved list, builds from the lockfile with `PAGES_EXPECT_API_ORIGIN` equal to it, verifies headers/CSP/bundle, fingerprints the artefact.
4. **Deploy:** same inputs with `deploy=true`; approve once in the `staging-studio` Environment. Pages project: `bizgenie-studio-staging` (not `bizgenie-web`). The job re-checks the artefact hash, records the previous deployment id, uploads, requires Cloudflare to list the deployment for the exact SHA in the production environment, then smoke-tests.
5. **Verify:** `node qa/hosted/hosted-acceptance.mjs --target https://bizgenie-studio-staging.pages.dev` (H04 must PASS: the browser reaches the API from the Studio origin and gets a readable 401).
6. **SM Properties:** `node qa/hosted/sm-properties-acceptance.mjs --target https://bizgenie-studio-staging.pages.dev` with the approved identity; add `HOSTED_ALLOW_WORKSPACE_WRITE=create-sm-properties-once` only if the account has no workspace and the founder approves the one staging write.
7. **Rollback:** Cloudflare → `bizgenie-studio-staging` → Deployments → **`0508d40e-88ca-41dc-aa3e-35901dd23ae0`** (source `1e08cbce`) → Rollback (the baseline; note it still calls the API host directly). The deploy job records the replaced deployment id in its summary. Backend rollback is Codex's and independent.

## 5. SM Properties Step 2 → 3 acceptance criteria and the script that checks them
| # | Criterion | Script step | Hosted status |
|---|---|---|---|
| 1 | Sign-in succeeds | A1 | NOT RUN |
| 2 | Existing session recognised | A2 | NOT RUN |
| 3 | Workspace GET returns the authorised context | A3 | NOT RUN |
| 4 | Bootstrap POST works (once; only if approved and no workspace exists) | A4 | NOT RUN |
| 5 | Step 2 advances to Step 3 | A5 | NOT RUN |
| 6 | Entered business information preserved | A6 | NOT RUN |
| 7 | Refresh restores state | A7 | NOT RUN |
| 8 | No duplicate workspace | A8 | NOT RUN |
| 9 | Cross-tenant data cannot be accessed | A9 (read-only probe, token stays in the page) | NOT RUN |
| 10 | Expired session gives a clear recovery path | A10 (and the mocked expired-session browser test) | NOT RUN |
The script refuses any host that is not the approved staging Studio, needs an approved identity, never saves Brand Brain, creates a campaign, generates, bills or connects a social account, and reports `HOSTED REAL` only for an allowlisted host with nothing intercepted. Its self-test (5 browser tests) is MOCKED.

## 6. Evidence classes of what exists now
- **MOCKED (bridge-faithful):** the Studio's requests pass the bridge's route allowlist, header rule, write gate and tenant rule; Step 2→3; reload creates no second workspace; read-only message; expired session; tenant isolation. Playwright answers CORS preflights itself, so each request's preflight is rebuilt by the browser's own rule from the headers actually sent and judged by the bridge's rules; the actual responses are enforced by the real browser against the exact-origin headers.
- **LOCAL REAL:** unit tests of the guards, error mapping, route contract and workflow logic (bash).
- **HOSTED REAL:** none. **NOT RUN:** everything in §5.

## 7. GO / NO-GO
**NO-GO for a staging deployment aimed at fixing SM Properties now:** there is no verified bridge origin to point the Studio at, and the current staging API host cannot answer a browser preflight. The Studio is READY to be released to the bridge as soon as items 1–2 of §4 exist. (Releasing this branch to the existing host would only deliver the recovery messages, not the connection.)
