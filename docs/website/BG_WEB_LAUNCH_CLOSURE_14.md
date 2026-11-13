# BG-WEB-LAUNCH-CLOSURE-14 — website strict-build readiness and consolidated founder checklist

13 Nov 2026. Source-level only. Nothing here is legal approval, hosted acceptance or a price decision. Founder direction recorded on 12 Nov: Standard £99/month and 60 monthly credits are the **target**; the £100/month aggregate provider-spend ceiling is approved; video-credit classes, VAT presentation, cancellation/refund terms and unused-credit expiry keep their existing (conditional/open/deferred) status. The Studio source contains none of those figures: it shows only what the server catalogue says (`PlanCatalogue.target.test.jsx` proves this, including that nothing mentions expiry, refunds, pro-rata or a per-day ceiling).

## 1. Defect found and fixed
With every fact the old `unresolved()` list tracked supplied, `node site/build.mjs --strict` still **published blank or dangling legal text**: “Transfers outside the UK” and “Governing law” were empty, and the privacy notice said “the full list of providers: see below” with no list. Fixed: three new required fields (`processors`, `internationalTransfers`, `governingLaw`), rendered and HTML-escaped; strict refuses until all are set. `npm run site:check` (referenced in `site/config.mjs` but missing until now) lists what is outstanding by owner and exits 2 until nothing is.

## 2. The one consolidated checklist (all fields are in `site/config.mjs`; nothing is defaulted or invented)
| # | Field / action | Owner | Appears on | Status |
|---|---|---|---|---|
| 1 | `companyNumber` | Founder | Home “Company information” | MISSING |
| 2 | `registeredOffice` | Founder | Home “Company information” | MISSING |
| 3 | `contactEmail` (one monitored support address) | Founder | Support, Terms, footer, home | MISSING |
| 4 | `privacyContactEmail` (may equal #3) | Founder | Privacy, Data deletion, home | MISSING |
| 5 | `retentionDecision` (sentence, e.g. period for registrations) | Founder | Privacy | MISSING |
| 6 | `processors` — every provider that processes registration data, each `{name, purpose}` | Founder, adviser confirms | Privacy | MISSING |
| 7 | `internationalTransfers` (statement and safeguard, or that there are none) | Adviser | Privacy | MISSING |
| 8 | `governingLaw` (governing law and courts sentence) | Adviser | Website terms | MISSING |
| 9 | `legalReviewed: true` (only after the adviser approves the draft wording) | Adviser | removes the “Draft for legal review” banners | MISSING |
| 10 | `SITE_API_URL` at build time (lead endpoint) | Founder/Codex, with the approved lead route | Registration form | MISSING (route not built/approved) |
| 11 | Approval to publish the website | Founder | — | NOT GIVEN |
Also outside the site: VAT registration/number (decides price presentation), ICO status, and the **subscription terms, cancellation page, refund page and product privacy notice** the plan catalogue needs as three HTTPS URLs (none exist yet; adviser).

## 3. Procedure once #1–#9 are supplied (nothing here is run until the founder approves)
`npm run site:check` → expect “nothing outstanding” (the `SITE_API_URL` item is supplied at build time) → `SITE_API_URL=<approved origin> npm run site:build:strict` → review the built pages → publish (separate approval) → then set the repository variables **`STAGING_SUPPORT_URL`** (a verified `mailto:` or https page, e.g. `https://getbizgenie.com/support/`), **`STAGING_TERMS_URL`**, **`STAGING_PRIVACY_URL`** to the approved pages. The staging workflow maps exactly these three (pinned by test) and treats them as optional, so an unset variable gives the honest “not set up yet” footer rather than a failed build. Production is not wired: the production Pages build has no mapping for these variables and auto-deploy is disabled, so a production release must add the same three settings under a separate approval.

## 4. Verified consistent (no change needed)
Billing/plan screens: price, interval, tax presentation/wording, monthly credits, term links all come from `commercial-catalog.v1`; “Using more” and “Trial” say “Not published yet”; no expiry, refund or pro-rata statement appears. WEB creative-preview clients match the API main (`445cf247`) routes `…/creative-preview` and `…/assets/:assetId/preview` (query scope and `expected_campaign_version`).
