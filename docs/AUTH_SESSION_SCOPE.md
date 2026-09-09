# Frontend authentication boundary

> **Superseded:** the env-var placeholder scheme described below (`VITE_BIZGENIE_ACCESS_TOKEN`, `VITE_BIZGENIE_TENANT_ID`, `VITE_BIZGENIE_PROJECT_ID`, `VITE_BIZGENIE_BRAND_ID`) has been replaced by real Supabase Auth. See `docs/SUPABASE_AUTH_CONTRACT.md` and `docs/SUPABASE_AUTH_SIGNIN_SLICE.md` for the current implementation. Those four env vars are no longer read anywhere in this repository and must not be treated as active configuration.

The goal-first screen remains usable before account creation, but recommendation requests are blocked until a complete authenticated customer session is configured.

The frontend sends the Supabase session's access token as a Bearer token and sends scope identifiers only from the authenticated session's `app_metadata`, never from user-editable form fields or env vars.

If no session exists, the goal remains on screen and the user is offered a deferred sign-in/sign-up flow. No campaign is created and no API request is made in that state.

This slice does not implement account deletion, OAuth/magic-link sign-in, persistence of account records beyond what Supabase Auth itself stores, billing, publishing or deployment.
