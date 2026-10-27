# BG-STUDIO-024-FE — social connection adapter on the real #218 contract

27 Oct 2026. Draft, stacked on PR #56 (`bg-studio-023-fe-acceptance`). Pre-launch scope (`DEC-014`): social connection is a launch requirement, not a deferral. Frontend only; backend work belongs to Codex. No OAuth, provider call, publishing, migration or deployment was performed; every check used the backend's own synthetic connector on a throwaway local PostgreSQL.

## What changed
* `src/premium/socialClient.js` rewritten from the never-existing `/customer/social-accounts` and `/customer/publishing-queue` routes to the real `/customer/social/*` routes of bizgenie-api #218 (`9346055`): connections, oauth-intents, oauth-complete, disconnect, dispatches (list, enqueue, cancel), publishing calendar. PKCE (S256) is generated in the browser; the verifier is sent only to `oauth-complete`.
* `src/premium/PremiumConnections.jsx` shows connections and the dispatch list from the server only, handles the return from the platform (`?code&state` accepted only against the attempt this browser started; verifier kept in `sessionStorage` for the round trip then deleted; the query string is stripped), owner-only connect/disconnect/cancel, "Confirmed by the platform" only for `state=published` + `evidence_kind=platform_api` + https link.
* `qa/integration/backend218.integration.test.js` now also runs the real adapter over HTTP against the real routes (connections, dispatch list, calendar, 404 for another tenant, cancel) and proves the open gap below.
* Gates-on browser fixtures moved to the real routes.

## Open contract gaps (for Codex; not worked around in the frontend)
| # | Consumer expects | Backend #218 provides | Needed |
|---|---|---|---|
| S1 | A provider **authorize URL** to send the browser to | `POST /oauth-intents` returns only `{intent_id, state, expires_at}` | Return an https `authorize_url` (built server-side from platform config, redirect URI and the stored challenge) or publish the provider config; the adapter already accepts an optional `authorize_url` and otherwise refuses with `AUTHORIZE_URL_MISSING` |
| S2 | A **display name** for a connected account | `{connection_id, platform, account_id, status, expires_at, version}` only | Optional `display_name`; until then the UI shows the platform account id |
| S3 | A registered **redirect URI** the app can receive on | not specified | Decide and document (the panel reads `?code&state` on the page that hosts Connections) |
| S4 | Enqueue UI context | `enqueue` needs `connection_id, campaign_id, variant_id, schedule_id, expected_campaign_version` | The adapter `enqueueDispatch` is tested but **not wired to a screen**: it belongs in the campaign scheduling flow with the workspace calendar (`DEC-025`) |
| S5 | `platform` set | schema allows instagram, facebook, linkedin, tiktok, youtube; service reads `platforms` config | Operator config decides which are live; the UI lists all five, so the list should come from the server when available |

## Not done / not claimed
No real platform was contacted. "Connected" in this build means the backend's synthetic connector returned it. Meta Tech Provider access verification is separate and outstanding.
