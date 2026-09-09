# Supabase Auth sign-in slice — implementation record

This records the decisions made while implementing the smallest production-safe
Supabase Auth slice on top of `docs/SUPABASE_AUTH_CONTRACT.md`.

## Chosen sign-in method

**Email/password**, via `supabase.auth.signUp` and `supabase.auth.signInWithPassword`.
OAuth, magic links, and password reset are explicitly out of scope for this slice
and are not implemented.

## Required environment variables (local/staging)

```
VITE_BIZGENIE_API_URL=http://localhost:8080
VITE_SUPABASE_URL=<your Supabase project URL>
VITE_SUPABASE_PUBLISHABLE_KEY=<your Supabase publishable/anon key>
```

Only the Supabase project URL and publishable key are ever read by the browser
bundle (`src/supabaseClient.js`). No service-role key, database URL, or other
provider secret is read or referenced anywhere in this repository.

## Legacy token/scope scheme — reconciled

The previous placeholder scheme (`VITE_BIZGENIE_ACCESS_TOKEN`,
`VITE_BIZGENIE_TENANT_ID`, `VITE_BIZGENIE_PROJECT_ID`, `VITE_BIZGENIE_BRAND_ID`)
has been removed from `.env.example` and is no longer read by `src/session.js`.
There is now exactly one active scheme: the Supabase session's access token as
the Bearer token, and `app_metadata` as the sole source of tenant/project/brand
scope. `docs/AUTH_SESSION_SCOPE.md` has been annotated to mark the old scheme as
superseded rather than deleting the historical record outright.

## Tenant/project/brand scope

Scope is read only from the authenticated Supabase session's `app_metadata`
(`src/session.js`). `app_metadata` can only be written by a service-role (backend)
caller — a signed-in user cannot alter it from the browser, unlike `user_metadata`.
If `app_metadata` is missing the required fields, the client reports
`scope-missing` and blocks the recommendation request, showing an account-setup
message instead of guessing or falling back to any other source.

## Production redirect/origin configuration

Allowed redirect/origin URLs for local, staging, and production are configured
in the Supabase project dashboard (Auth → URL Configuration). This is an
operator/provider configuration step outside this repository; nothing in this
PR sets or assumes a specific redirect URL.

## Still open

- The backend process that sets `app_metadata.tenant_id` / `project_id` /
  `brand_id` on a Supabase user is not implemented here (service-role-only,
  backend concern — out of scope per the task boundary).
- Real Supabase project URL/publishable key values for each environment.
- Account deletion, session-revocation UX, OAuth, magic links, password reset.
