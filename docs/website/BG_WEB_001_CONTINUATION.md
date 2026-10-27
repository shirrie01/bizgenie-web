# BG-WEB-001 — continuation instructions (durable checkpoint)

27 October 2026. Branch `bg-web-001-public-site` (from `origin/main` `e9e5a1f4`), independent of the Studio stack (#47–#56). Everything below is committed and pushed; nothing is held only in a session.

## State
* Site, tests, contract, hosting plan, launch checklist, CI workflow and screenshot evidence are in the branch. See `docs/website/BG_WEB_001_REPORT.md` for results and the exact SHAs.
* **Not done / next:** (1) founder inputs listed in the launch checklist A2; (2) Codex implements the lead contract (section 5 of the contract) and runs `site/contract`; (3) hosting choice, preview deployment, DNS cutover (all need separate approval); (4) replace placeholder wordmark/favicon with approved brand assets; (5) real-device and assistive-technology checks; (6) re-run everything on the release commit with `npm run site:build:strict`.

## How to run locally
```
npm ci
npm run site:test                       # unit + contract (against the reference stub) + build/content tests
SITE_API_URL=http://127.0.0.1:4301 SITE_MEASUREMENT=1 SITE_OUT=site-dist-e2e node site/build.mjs
SITE_OUT=site-dist-e2e SITE_PORT=4300 STUB_PORT=4301 npm run site:serve     # http://127.0.0.1:4300 (strict CSP) + reference lead stub on 4301
BG_VIEWPORT=390x844 npm run site:browser   # needs @playwright/test and axe-core installed (CI installs them)
node site/build.mjs                     # draft build -> site-dist/ ; lists unresolved items
npm run site:build:strict               # publication build; refuses while founder facts are unresolved
```
Hosted CI: `.github/workflows/website-ci.yml` (runs on pushes to this branch touching `site/`; dispatch with `ref` and `expected_sha` for an exact commit).

## Where things are
* Copy: `site/content.mjs` (single place; linted by tests). Company facts and runtime URLs: `site/config.mjs` (NULL = unresolved, never guessed).
* Templates and legal drafts: `site/templates.mjs`. Styles: `site/assets/site.css`. Form logic: `site/assets/form-model.js`, `site.js`. Measurement: `measure.js`.
* Reference lead service (dev only, in memory): `site/dev/lead-stub.mjs`. Contract: `docs/website/BG_WEB_001_LEAD_CAPTURE_CONTRACT.md`.
* Screenshots: `docs/website/evidence/<width>-<page>.jpg`. Product previews: `site/previews/*.jpg` (real pre-release UI with a made-up business; regenerate from the Studio stack's industries spec).

## Rules that must keep holding (tests enforce most)
No claim that anything is available now; no price/date/discount/guarantee/testimonial/statistic; no third-party scripts, fonts or trackers; no cookies or storage; no personal data in events; consent separate and unticked; the Premium app untouched; every real endpoint and activation needs separate founder approval.
