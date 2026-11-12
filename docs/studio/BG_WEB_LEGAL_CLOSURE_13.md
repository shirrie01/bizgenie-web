# BG-WEB-LEGAL-CLOSURE-13 — Studio footer, support and legal source work

12 Nov 2026. Source-level only: **not** hosted acceptance, **not** legal approval, **no** price or term is approved or shown. Staging and launch remain NO-GO.

## What exists (recovered, not rebuilt)
Public site (`site/`): home, privacy notice, website terms, data-deletion page, 404, all drafts (`legalReviewed:false`, banner in the draft build; `--strict` refuses while any fact is unset). Studio (`src/premium/SiteLinks.jsx`): footer driven by `VITE_SUPPORT_URL` (https or mailto), `VITE_TERMS_URL`, `VITE_PRIVACY_URL`; staging workflow maps `STAGING_SUPPORT_URL`, `STAGING_TERMS_URL`, `STAGING_PRIVACY_URL` (unset means “not set up yet”). **No approved destination URL exists anywhere**, so none is configured.

## Defects found and fixed here
| Defect | Reproduction (on main `5c1ecdee`) | Fix | Test |
|---|---|---|---|
| The original (premium-flag-off) Studio view had **no** support/legal footer | render `<App />` with the flag off: no `contentinfo` | render `SiteLinks` in that view | `App.footer.test.jsx` (red on main, green here) |
| Billing screens said “support contact has not been published” even when `VITE_SUPPORT_URL` is configured | configure support, open plans/billing | `SupportNote`: link when valid, honest sentence when not | `PremiumBilling.test.jsx`, `SiteLinks.test.jsx` |
| New-tab links not announced; small tap targets; no explicit focus style | review | “(opens in a new tab)” hidden text, 12px vertical padding, focus outline | `SiteLinks.test.jsx`; browser check at 320/390 px |
| An IP-address host (`https://127.0.0.1/x`, `[::1]`) was accepted as a legal/support link | `resolveLink` | refused; also refuse `,`/`;` in mailto | `SiteLinks.test.jsx` |
| No public support page | none in `site/` | static `/support/` page (no form/backend/third party), footer link, sitemap; contact shown only from `company.contactEmail` (unset → “to be confirmed”); strict build still refuses until set | `site-build.test.js` |
| No AI-content notice anywhere persistent | grep | one factual line in the footer (“BizGenie uses AI to draft … Nothing is published without your approval.”). **Draft wording: adviser to confirm.** | `SiteLinks.test.jsx` |

## Configuration to publish (founder)
Set `company.companyNumber`, `registeredOffice`, `contactEmail`, `privacyContactEmail`, `retentionDecision`, `legalReviewed:true` in `site/config.mjs`; run `npm run site:build:strict`; publish; then set repository variables `STAGING_SUPPORT_URL` (e.g. the support page or a verified `mailto:`), `STAGING_TERMS_URL`, `STAGING_PRIVACY_URL` to the approved https pages.
