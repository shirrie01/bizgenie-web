# BG-STUDIO-024-FE — social connection adapter on the real #218 contract

27 Oct 2026. Draft, stacked on PR #56 (`bg-studio-023-fe-acceptance`). Pre-launch scope (`DEC-014`): social connection is a launch requirement, not a deferral. Frontend only; backend work belongs to Codex. No OAuth, provider call, publishing, migration or deployment was performed; every check used the backend's own synthetic connector on a throwaway local PostgreSQL.

## What changed
* `src/premium/socialClient.js` rewritten from the never-existing `/customer/social-accounts` and `/customer/publishing-queue` routes to the real `/customer/social/*` routes of bizgenie-api #218 (`9346055`): connections, oauth-intents, oauth-complete, disconnect, dispatches (list, enqueue, cancel), publishing calendar. PKCE (S256) is generated in the browser; the verifier is sent only to `oauth-complete`.
* `src/premium/PremiumConnections.jsx` shows connections and the dispatch list from the server only, handles the return from the platform (`?code&state` accepted only against the attempt this browser started; verifier kept in `sessionStorage` for the round trip then deleted; the query string is stripped), owner-only connect/disconnect/cancel, "Confirmed by the platform" only for `state=published` + `evidence_kind=platform_api` + https link.
* `qa/integration/backend218.integration.test.js` now also runs the real adapter over HTTP against the real routes (connections, dispatch list, calendar, 404 for another tenant, cancel) and proves the open gap below.
* Gates-on browser fixtures moved to the real routes.

## Updated for bizgenie-api #220 (application `e653ed346c41887261ff6861342e3861995edcc0`, head `b289a738e703d323d947020ec5af69a7d5029fc9`)
The earlier gaps S1–S3 are answered by `docs/studio/BG_STUDIO_025_BACKEND_HANDOFF.md` and are now consumed: the intent response carries `contract_version: social-oauth-intent.v1`, `authorize_url`, `redirect_uri` and `authorization_status` (`ready` | `provider_configuration_required`); connections carry `display_name` and report an expired grant as `expired`.
* The browser navigates **only** when `authorization_status` is `ready` and the URL is https and consistent with *this* attempt (our S256 challenge, the returned state, the pinned `redirect_uri`, `response_type=code`); otherwise it refuses and says the connection is not set up. `ready` means the server's configuration validated, **not** that Meta approved anything. **No live Meta connection is enabled by this code**: provider settings and approvals are unverified and the integration tests use the backend's own synthetic configuration (vTEST path, example.test redirect).
* Error wording follows the handoff table: stale or replayed attempt → "start again"; permission/app-review/consent unresolved → not connected; not configured → nothing opened; **OAUTH_PROVIDER_UNAVAILABLE and any other 5xx on complete → never "nothing was changed"**, the owner is told to check connected accounts first.
* A returned `error=access_denied` without a code clears the local attempt and connects nothing. The verifier is deleted before the code is exchanged and the stored attempt carries its expiry.
* `display_name` is rendered as text only (max 200, control characters rejected), falling back to the account id. Disconnect is **local** access revocation, not proof the platform token was invalidated, and the screen says posts already published stay.

## Still open (backend / external, not worked around)
| # | Item |
|---|---|
| S4 | Enqueue UI context: `enqueueDispatch` is tested but unwired; it belongs with the schedule flow (see F3) |
| S5 | Which platforms are live is operator configuration; the UI lists all five. Real Meta flow/permissions/PKCE verification, app approval and redirect registration are external activation blockers |
