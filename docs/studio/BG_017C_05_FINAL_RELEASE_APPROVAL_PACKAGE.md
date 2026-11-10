# BG-017C-05 — Final release approval package (Studio frontend)

Evidence labels: **MOCKED PASS** (unit/browser tests against a bridge-faithful stand-in), **HOSTED NOT RUN**, **HOSTED PASS** (only when independently evidenced). Nothing below is HOSTED PASS. No deployment, merge, IAM/DNS change, live Stripe call or customer write was made.

## 1. Route inventory alignment (Task 1)
- Source of truth: Codex API PR #229 head `86b39d70be1d9adfa9ab51d56b2799af94d48182` (hosted CI run 42385664735 success), `src/studio-bridge/service.js` blob `e1c72f478ebf3b5eb09e8ed2f21ff3949b3dbcf9`. The earlier extract (`6adeed03`/`90f83790`, blob `89226b16`) lacked the checkout route; that is why the inventory said "not carried".
- Change at `86b39d70`: `POST /billing/stripe/checkout` is allowlisted (plus matching OPTIONS), body `{tenant_id, plan_code, request_id}` (strict; `plan_code` `standard|pro`), 32 KiB cap, new refusal codes `STRIPE_CHECKOUT_DISABLED` (403, own gate `BG_BRIDGE_ALLOW_STRIPE_CHECKOUT`, default off, on top of `BG_BRIDGE_ALLOW_WRITES`) and `STRIPE_BILLING_VALIDATION_ERROR` (400). Tenant selector must equal the verified token's trusted tenant (else 404). Plan→price, return URLs and owner membership are decided server-side; unknown fields (price, URLs, user id) are refused before IAM.
- Updated (derived from code, not typed): `qa/contracts/BG_STUDIO_BRIDGE.extract.json`, `qa/bridge-gate.mjs` (checkout gate and strict body), `qa/contracts/studio-route-inventory.json`, `docs/studio/BG_017C_05B_ROUTE_TABLE.md` (generated; a test fails on drift), `src/test/bridgeContract.test.js`, `src/test/routeInventory.test.js`.
- Result against frozen launch contract #128: every mandatory (A) route is now carried by the bridge: workspace (GET/bootstrap/select), onboarding and Brand Brain (GET/PUT), campaign recommendations, campaigns (+ content items, review, preview-renders, acknowledgements, approval, schedule/reschedule/unschedule), calendar, generation quotes (+ confirm/cancel), creative jobs, billing subscription/plans/credit-preview, and Stripe checkout. Still deferred (class C, UI honest or hidden): manual publication, billing management/invoices (no API implementation for invoices), insights, uploads, social writes, provider OAuth callback (must reach the API host, not the bridge). Class B: none.

## 2. Stripe request-ID retry verification (Task 2) — MOCKED PASS
Before: `requestId()` was generated inside every `startStandardCheckout` call, so a retry after a lost response would have used a new ID (a possible second Checkout Session). Corrected in `src/billingClient.js`:
- One `request_id` per checkout intent, stored per tenant+plan in `sessionStorage` (memory fallback), reused after any unclear outcome (no answer/timeout, 5xx, 502/504, unreadable reply, unsafe URL), after 429 and after 401; ended only by success or a definitive refusal (400/403/404); expires after 12 h (Stripe honours keys for 24 h).
- Double click: concurrent calls share one in-flight request (one POST); the button is also disabled while running.
- Refresh: ID survives a reload. Cross-tenant/plan: never shared, each keeps its own. Expired session: 401 → "Sign in again… Nothing was charged." and the ID is kept.
- Truthful wording: unclear outcome → "We couldn't confirm whether checkout started. Nothing is shown as charged. Try again: it reuses the same request, so you won't be charged twice." Closed gate → "Subscribing isn't switched on in this test environment yet. Nothing was charged." After an unclear outcome the plan status is re-read silently (an active plan hides checkout).
- Gate: a bridge-marked build (`VITE_API_ROUTE_LIMITS=bridge-v1`, set only for a listed bridge origin) sends no checkout request at all. Both gates (Studio, bridge) stay OFF until separate Stripe test-mode approval. Enabling the Studio gate is a reviewed code/config change.
- Tests: `src/billingClient.checkout.test.js` (18), `src/BillingPanel.checkoutRetry.test.jsx` (3), `src/test/bridgeContract.test.js` (checkout gate/strict body/cross-tenant), updated `src/test/BillingPanel.test.jsx` (5xx wording).
- Contract note for Codex: the bridge doc says an unknown outcome must be retried with the SAME request_id; the Studio now does. Backend cannot tell two different IDs are one intent, so the Studio never makes a second ID for an unresolved intent. No contract correction needed.

## 3. Frontend deployment configuration (Task 3) — verified from the workflow and code
| Requirement | Evidence |
|---|---|
| No localhost fallback in hosted builds | `src/apiConfig.js` + `src/main.jsx`: a hosted page without an explicit https origin (missing/http/localhost/path/credentials) never mounts the app (tests `apiConfig.test.js`) |
| No direct browser call to the private Cloud Run API | Customers reach the API only through the bridge origin; deploy is refused for any origin outside `BRIDGE_API_ORIGINS`; the private IAM host is not a bridge origin; the bridge adds IAM server-side |
| Only an approved bridge origin may deploy | `studio-staging-release.yml`: origin must be a bare https origin, in `APPROVED_API_ORIGINS`, and (for `deploy=true`) in `BRIDGE_API_ORIGINS`; smoke check asserts the built bundle's API origin |
| Missing bridge configuration fails closed | `BRIDGE_API_ORIGINS` is empty today, so every `deploy=true` is refused; a build without `VITE_BIZGENIE_API_URL` is refused by the build gate |
| No unintended production deployment | manual `workflow_dispatch` only; exact 40-char SHA; `deploy` default false; `staging-studio` environment approval; project fixed to `bizgenie-studio-staging`; DNS untouched |
| No new customer writes | build/verify performs none; the SM Properties script writes only with `HOSTED_ALLOW_WORKSPACE_WRITE=create-sm-properties-once` and a bridge write phase |
| Rollback available | deployment `0508d40e-88ca-41dc-aa3e-35901dd23ae0` (source `1e08cbce…`); release job records the replaced deployment id |

## 4. Real SM Properties acceptance — procedure to run immediately after the founder-approved staging release
Prerequisites (all HOSTED NOT RUN today): bridge deployed and smoke-tested by Codex with the verified origin; reviewed commit lists the origin in `APPROVED_API_ORIGINS`/`BRIDGE_API_ORIGINS`/`qa/hosted/staging-settings.json`; release run `deploy=false` then `deploy=true` approved; for step 3 only, a separately approved bridge write phase.

Run 1 (read-only, safe): `HOSTED_TEST_EMAIL=… HOSTED_TEST_PASSWORD=… HOSTED_IDENTITY_APPROVED=yes node qa/hosted/hosted-acceptance.mjs --target https://bizgenie-studio-staging.pages.dev` then `node qa/hosted/sm-properties-acceptance.mjs --target https://bizgenie-studio-staging.pages.dev`.
Run 2 (only with write-phase approval): add `HOSTED_ALLOW_WORKSPACE_WRITE=create-sm-properties-once`.

| # | Journey step | Script check | Mocked | Hosted |
|---|---|---|---|---|
| 1 | Login and session restoration | A1, A2 | MOCKED PASS | HOSTED NOT RUN |
| 2 | Workspace retrieval | A3 | MOCKED PASS | HOSTED NOT RUN |
| 3 | Step 2→3 bootstrap (single write) | A4, A5 | MOCKED PASS | HOSTED NOT RUN |
| 4 | Form-state persistence | A6 | MOCKED PASS | HOSTED NOT RUN |
| 5 | Reload and resume, no duplicate workspace | A7, A8 | MOCKED PASS | HOSTED NOT RUN |
| 6 | Tenant isolation (foreign tenant read refused) and session loss/recovery | A9, A10 | MOCKED PASS | HOSTED NOT RUN |
| 7 | Brand Brain: readout loads (read-only) / completion (write) | A12 / A14 | MOCKED PASS (read, write) | HOSTED NOT RUN; completion needs the write phase (BG-017C-06) |
| 8 | Campaign recommendations and preview | A14 (write: NOT RUN by design) | MOCKED PASS (browser suites) | HOSTED NOT RUN |
| 9 | Calendar and draft scheduling | A13 (read-only) | MOCKED PASS | HOSTED NOT RUN; scheduling is a write phase |
| 10 | Checkout entry | A15 observes only (no click, no checkout request, gate OFF); A16 Stripe test mode | MOCKED PASS (A15); A16 NOT RUN | HOSTED NOT RUN; A16 needs separate Stripe test-mode approval |
A11 (no script errors) runs throughout. Exit codes: 0 all pass, 1 any fail, 3 pass with NOT RUN. Report output is redacted; no secret is printed.

## 5. Release and rollback
Order: Codex bridge deploy (gates off) → verified origin → reviewed commit → exact-head hosted CI → release `deploy=false` → `deploy=true` + `staging-studio` approval → smoke → Run 1 → (write approval) Run 2 → (Stripe approval) BG-017C-06.
Rollback: Cloudflare dashboard → Workers & Pages → `bizgenie-studio-staging` → Deployments → `0508d40e-88ca-41dc-aa3e-35901dd23ae0` → Rollback; or re-run release with `sha=1e08cbce69b0ec47e19d067c96445ef20045feda`. That baseline still targets the private API (safe, but customers cannot sign in to a workspace). The bridge has no prior revision: close its write gates / disable it.

## 6. Remaining blockers
1. Bridge not deployed; browser-facing origin unverified (Codex: origin, identity, private upstream audience, image digest, secrets/IAM).
2. Founder approvals still needed: staging release of this exact SHA; bridge write phase; Stripe test-mode activation (both gates) and an approved plan/price.
3. Class C deferrals need founder confirmation (manual publication, cancellation self-service).
4. Real hosted acceptance not run.
