# Supabase Auth integration contract

## Authority

The web client must use Supabase Auth for customer sign-in and session refresh. The API remains the authority for tenant, project and approved Brand Brain authorization.

## Client rules

- The browser may receive only the Supabase project URL and publishable key.
- Never expose a service-role key, database URL, admin key, or provider secret in this repository or any Vite client bundle.
- The client obtains the current session through the Supabase Auth client and sends its access token as the API Bearer token.
- The client must not make authorization decisions from user-editable metadata. Tenant, project and brand scope must come from the authenticated application session/context and be revalidated by the API.
- Sign-out must clear the local session and stop recommendation requests.

## Deferred account flow

A visitor may type a goal before signing in. The goal remains local to the page. No recommendation request is made until an authenticated session exists. The account handoff then returns to the same goal without silently creating a campaign.

## Required API behavior

The API must reject missing, expired, malformed or cross-tenant Bearer tokens and continue to require an approved Brand Brain. The web client must render a generic error and never display token, JWT, provider or database diagnostics.

## Resolved by this slice

- Sign-in method for the first release: **email/password** (see `docs/SUPABASE_AUTH_SIGNIN_SLICE.md`). OAuth and magic links are deferred.
- Tenant/project/brand scope is read only from the authenticated session's `app_metadata` (backend/service-role controlled), never from `user_metadata`, env vars, or form fields. If `app_metadata` is incomplete, the client shows an account-setup message and keeps the recommendation request blocked.

## Still-open founder/provider decisions

- Confirm the real Supabase project URL and publishable key for local/staging/production environments (values remain blank in `.env.example`).
- Confirm allowed redirect/origin URLs for local, staging and production — this is a Supabase dashboard / provider configuration step, not something this repository configures.
- Confirm account deletion and session-revocation UX (out of scope for this slice).
- Confirm the backend process for populating `app_metadata.tenant_id` / `project_id` / `brand_id` on a Supabase user (a service-role-only operation; not implemented in this repository, which does not touch the backend).

This contract does not add auth UI, token issuance, billing, publishing or deployment.
