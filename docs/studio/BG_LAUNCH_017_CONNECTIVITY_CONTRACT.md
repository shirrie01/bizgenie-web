# BG-LAUNCH-017 — Studio ↔ API connectivity contract (for Codex, BG-LAUNCH-016)

4 Nov 2026. Written contract only. No Google identity token is ever placed in browser code, no private API is exposed, no Cloud Run IAM or traffic is changed here, and Codex's branches are not modified. Sources: Codex BG-LAUNCH-014 closure (`bg-launch-014-integration-closure` @ `50a2ef5a`), API #226 code, the Studio at Web #68.

## 1. What the Studio sends (fixed; verified by `customerApiContract.test.js` and the hosted harness)
- One configured API origin, `VITE_BIZGENIE_API_URL`, built into the bundle and written into the CSP `connect-src` (`'self'`, that origin, the staging Supabase origin). Nothing else is reachable from the page.
- Request headers: `authorization: Bearer <Supabase access token>`, `content-type: application/json` on writes, `range` on authenticated media preview. **No other header, and never `x-serverless-authorization`** (the harness fails if one is ever sent).
- Credentials mode `omit` on media; no cookies. Identity is the bearer token; tenant/project/brand come from the server-written session claims and are sent only as resource selectors.
- Errors it handles: 401 → "Your session has ended" and Sign in again; 403/404 → "not available to you"; 409 → stale version, reload; 402/503 quote and billing codes → plain sentences with "nothing was charged"; network failure on a write → "may or may not have been saved, check before retrying".

## 2. The two facts that decide the architecture
1. A browser cannot satisfy Cloud Run IAM: the Google identity token and the Supabase session would both need `Authorization`, and a browser has no Google identity.
2. **The TikTok (and LinkedIn) OAuth callback is an unauthenticated provider redirect** (`GET /customer/social/oauth/callback/:platform`, "no bearer", per the contract). A host that requires an invoker identity cannot receive it. So whichever host is registered as the redirect URI (`staging-api.getbizgenie.com` today) must accept unauthenticated requests on at least that route. A fully private API cannot serve a real social connection from any browser.

## 3. Options (decision is the founder's; Codex builds the backend side of whichever is chosen)
| | A. Staging API reachable publicly, protected by the application | B. Same-origin BFF on the hosted Studio (Pages Function) with a server-held invoker identity | C. Operator rehearsal only |
|---|---|---|---|
| Who can use it | customers' browsers | customers' browsers | one authorised operator, locally |
| IAM/traffic | needs `allUsers` invoker on the staging service (an IAM change; tags and `staging-api` then share it); `00030` is tested through a tag at 0% traffic | no IAM change if an invoker identity already exists; otherwise a service-account credential must be created (a secret) | none |
| Auth on every route | Supabase JWT verified by the app (already true), exact-origin CORS | same, plus the BFF adds `X-Serverless-Authorization` server-side only | `scripts/staging/operator-proxy.mjs` |
| OAuth callback | works (public route) | does **not** work unless the BFF also proxies the callback and TikTok's redirect URI moves to the Studio host, which the Studio's allowlist and the API's `TIKTOK_REDIRECT_URI` check both currently refuse | not applicable |
| Studio change | none (`VITE_BIZGENIE_API_URL` = API origin) | build with `VITE_BIZGENIE_API_URL=https://staging-app.getbizgenie.com/api` and `PAGES_EXPECT_API_ORIGIN` the same; add the Function | none |
| Moving parts | fewest | most | few |
**Recommendation (frontend/hosting view):** A for staging, with the public surface limited by the application's existing auth, exact CORS, rate limits and no provider flags on until acceptance; keep C for rehearsal before any exposure. B only if the founder will not make the staging service public, and then TikTok connection is deferred. Either way the choice is a founder IAM/architecture decision; nothing here acts on it.

## 4. Requirements by option
**All options (Codex):** `BIZGENIE_ENVIRONMENT=staging`; `CORS_ENABLED=true`; `CORS_ALLOWED_ORIGINS=https://staging-app.getbizgenie.com` (exact; no wildcard); `SUPABASE_URL` is `zrczojyxebwjgpymbmgu` (never the production ref); `SUPABASE_SERVICE_ROLE_KEY` present server-side so bootstrap writes the trusted scope; provider flags off until a separate approval. `DELETE /customer/assets/:assetId` CORS only when uploads are enabled.
**A (Codex + founder):** the revision/tag under test serves `staging-api` (or a build with the tag origin and a matching `CORS_ALLOWED_ORIGINS` entry); TikTok redirect `https://staging-api.getbizgenie.com/customer/social/oauth/callback/tiktok`, return `https://staging-app.getbizgenie.com/`.
**B (Codex + founder):** an approved server-only invoker identity; a reviewed Function that allowlists API paths, overwrites any client-sent `x-serverless-authorization`, never follows redirects, bounds size and time, preserves private cache headers and logs no token. Not written here: it needs the identity decision first.

## 5. How the Studio side is proved once a path exists
`node qa/hosted/hosted-acceptance.mjs --target https://staging-app.getbizgenie.com` (read-only). H04 makes a deliberately unauthenticated request from the Studio's own origin and passes only if the application answers 401 (so CORS and the invoker path both work); H05–H08 sign in with the approved synthetic identity, check the session scope against every request, allow only approved origins, and prove session recovery. Everything else is NOT RUN until approved.

## 6. Tenant safety
Selectors in URLs and bodies are resources, never authority (contract). The Studio never takes a tenant from the URL, a form or an environment variable. The harness fails if any customer read names a tenant other than the session's, if any read is refused after sign-in, or if a write occurs.
