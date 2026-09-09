# BizGenie Web

Frontend home for the BizGenie launch surfaces.

## Current slice

The initial surface implements the I-E goal-entry and recommendation handoff against:

`POST /customer/campaign-recommendations`

It intentionally does not implement account creation, campaign persistence, calendar, publishing, billing, or external platform connectors. The “Create campaign” action remains an explicit handoff placeholder until authenticated account creation is available.

## Authentication

Sign-in uses Supabase Auth with **email/password** for this slice (see `docs/SUPABASE_AUTH_CONTRACT.md` and `docs/SUPABASE_AUTH_SIGNIN_SLICE.md`). OAuth, magic links, and password reset are explicitly out of scope for now.

## Run locally

```bash
npm install
cp .env.example .env
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev
```

Required env vars are documented in `.env.example`. The API must provide the authenticated customer boundary and approved Brand Brain scope; tenant/project/brand scope comes only from the authenticated Supabase session (`app_metadata`), never from env vars or form fields. Production redirect/origin URLs are an operator/provider configuration step in the Supabase dashboard, not something this repository configures.

## Tests

```bash
npm run test
```
