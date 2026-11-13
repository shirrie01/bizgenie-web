# BG-WEB-LAUNCH-CLOSURE-16 — final commercial decision pack and consolidated legal checklist

13 Nov 2026. **Nothing here approves a price, locks a term, publishes a page or sets `legalReviewed`.** Already approved and not reopened: Standard **£99/month** and **60 monthly credits** (launch target); **£100 per calendar month aggregate provider-spend ceiling** for the first ten customers (a provider limit, separate from customer credits; the Studio never shows it). DEC-013 continues to bar public price display, Stripe Price/catalogue creation and checkout until the activation gates pass.

## 1. WEB presentation check (source, tests)
The plan screen renders only server catalogue data (`commercial-catalog.v1`). Verified by test (`PlanCatalogue.target.test.jsx`, 4) and grep: no price, allowance, “unlimited”, trial, expiry/rollover, refund or pro-rata text and no spend-ceiling or per-day figure in `src/`; “Using more” and “Trial” show “Not published yet”; tax wording is whatever the server states; refund and cancellation are links to the catalogue’s own URLs. Plan feature entitlements are not stated anywhere in the UI beyond the monthly credits, so no feature promise can exceed what is implemented.

## 2. Outstanding commercial decisions (only items not yet approved)
| # | Item | Current authority | Suggested decision | Risk if left open | Exact founder input required |
|---|---|---|---|---|---|
| 1 | VAT registration and price presentation | DEC-013; £99 target only | If VAT-registered: show **£99 + VAT** (customer pays £118.80); if not: flat £99, no VAT line | wrong price shown, invoicing error; margin −1.8 pp if £99 is VAT-inclusive | VAT registered yes/no; number; “excluding” or “including” VAT; business vs consumer customers |
| 2 | Catalogue approval record and provenance | none for the live catalogue | One catalogue entry: plan `standard`, `amount_minor 9900`, GBP, month, 60 credits, tax block, three terms URLs, `approval {decision id, source URL, approved_at}`, effective date | the server refuses an entry without it, so no plan is shown | the decision identifier (e.g. Issue #191 comment URL recording the approval), effective date |
| 3 | Video classes: duration, resolution, model, provider cost | conditional on verification; code requests **4 s, 720p, silent**: `video.normal` = Veo 3.1 Fast, `video.premium` = Veo 3.1 | Lock 4 s, 720p, silent; keep 5 and 12 credits; price any 6 s/8 s or audio variant as a separate class | credits could under- or over-recover provider cost | one approved bounded job’s Google billing report (the price page’s “count” unit is unconfirmed) and the OpenAI official image price |
| 4 | Credit usage and disclosure | schedule 1/2/5/12 conditional | disclose “you see the credit price before every generation; nothing is charged until you confirm” (already how the Studio behaves) | — | confirm wording |
| 5 | Unused credits: carry over or expire | **deferred**; behaviour today is unlimited carry-over | expire at renewal and say so; if not implemented before the first customer, the terms must say credits carry over | stockpiled credits; false “per month” promise | choice and disclosure sentence |
| 6 | Trial or introductory offer | none approved | **no trial or offer at launch** | accidental discount via Stripe coupon | confirm “none” in writing |
| 7 | Cancellation at period end; statutory refund rights | conditional | cancel any time; access to period end; no routine pro-rata refund; legal rights unaffected; failed generations not charged | consumer-law non-compliance if customers are consumers | adviser confirmation; whether customers are consumers, sole traders or businesses |
| 8 | Subscription description and entitlements | none | “Standard: 60 credits each month” only; no feature list | over-promising | confirm no further feature claims |

## 3. Consolidated website / legal checklist
`npm run site:check` (verified today): **10 items outstanding**. Each row gives the exact field, its location, owner, evidence and whether it blocks.
| # | Field or action | Location | Owner | Evidence required | Blocks |
|---|---|---|---|---|---|
| 1 | `company.companyNumber` | `site/config.mjs` | Founder | Companies House record for the actual legal entity | public site, terms, catalogue terms |
| 2 | `company.registeredOffice` | same | Founder | same record | same |
| 3 | `company.contactEmail` (support) | same; also Studio `VITE_SUPPORT_URL` | Founder | monitored mailbox | support path (L5), public site |
| 4 | `company.privacyContactEmail` | same | Founder | monitored mailbox (may equal #3) | privacy, data deletion |
| 5 | `company.retentionDecision` | same | Founder | decision sentence | privacy notice |
| 6 | `company.processors` (`{name, purpose}` each) | same | Founder; adviser confirms | processor list (Supabase, Google Cloud, OpenAI, Stripe, Cloudflare, plus TikTok/LinkedIn only if connected) | privacy notice |
| 7 | `company.internationalTransfers` | same | Adviser | approved sentence and safeguard | privacy notice |
| 8 | `company.governingLaw` | same | Adviser | approved sentence | website terms |
| 9 | `company.legalReviewed = true` | same | Adviser | written approval; **never set without it** | removes the draft banners |
| 10 | `SITE_API_URL` (build-time) | build environment | Founder/Codex | approved lead route | registration form |
| 11 | VAT registration and number; ICO status | outside the repo | Founder | certificate / ICO reference or “not required” | price presentation; privacy |
| 12 | Subscription terms, cancellation page, refund page, product privacy notice | three HTTPS URLs for the catalogue and `VITE_TERMS_URL`/`VITE_PRIVACY_URL` | Adviser | approved texts, hosted | catalogue approval; checkout |
| 13 | Founder approval to publish the website | — | Founder | explicit approval | publication |
| 14 | `STAGING_SUPPORT_URL`, `STAGING_TERMS_URL`, `STAGING_PRIVACY_URL` | GitHub repository variables | Founder | the approved URLs | staging footer shows “not set up yet” until set |
| 15 | Production Cloudflare Pages `VITE_SUPPORT_URL`, `VITE_TERMS_URL`, `VITE_PRIVACY_URL` | Pages project settings (not inspected) | Founder | settings screenshot or confirmation | production footer |

## 4. Company identity: not verified, not filled
The site and Studio call the entity “BizGenie Technologies Limited”, a name recorded in the repository as “given in the work order”. One general web search did **not surface** a company with that exact name (a search engine is not the register, so this proves nothing either way); the only close hit, “BIZGENIE LTD (07869927)”, is a different name and is **not** assumed to be the entity. The Companies House register itself was **not queried**: it was not reachable from this session (the host is outside its network allowlist). **Founder action:** confirm the legal entity name exactly as on the certificate of incorporation, with its number and registered office. Until then rows 1, 2 and the legal-name text on every page are unverified, and the legal name must not be treated as confirmed or as wrong.
