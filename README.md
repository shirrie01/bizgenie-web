# BizGenie Web

Frontend home for the BizGenie launch surfaces.

## Current slice

The initial surface implements the I-E goal-entry and recommendation handoff against:

`POST /customer/campaign-recommendations`

It intentionally does not implement account creation, campaign persistence, calendar, publishing, billing, or external platform connectors. The “Create campaign” action remains an explicit handoff placeholder until authenticated account creation is available.

## Run locally

```bash
npm install
VITE_BIZGENIE_API_URL=http://localhost:8080 npm run dev
```

The API must provide the authenticated customer boundary and approved Brand Brain scope. Demo IDs are placeholders only and must not be used for production.
