# BG-WEB-001 — public website, early access and founding-customer funnel (report)

27 October 2026. Draft only. Nothing was merged, deployed, pointed at DNS, activated or paid for; no production secret, Meta setting, email campaign or shared migration was touched. S1 staging stays RED and full-product launch stays NO-GO.

## 1. Canonical state checked first
| Item | Value |
|---|---|
| Frontend `main` | `e9e5a1f4f208787248fc9dd18ee8f5df1c60d05a` |
| This branch | `bg-web-001-public-site`, created from `origin/main`; **independent of the Studio stack** (#47–#56) |
| Studio stack (not touched) | #53 `ac2c14f`, #54 `7816777`, #55 `1b43ce3`, #56 branch `bg-studio-023-fe-acceptance` |
| Backend context read | bizgenie-api #128, #129, #77; draft #218 `9346055`; **existing public lead domain** `src/paid-beta/*` and `docs/launch/PAID_BETA_CAPTURE_AND_CHECKOUT_RETURN.md` |
| Existing brand assets found | brand colour `#0b4943`, ink `#16211d`, off-white, serif display + sans body (as in the app). **No logo file exists.** Real product UI screenshots exist only from the pre-release app (sample data) |
| Existing public surface | none: `origin/main` is the application shell; an in-app `Founding100Panel` posts to `/public/paid-beta-interest` (a different, narrower contract) |

## 2. Architecture decision
The site is a **separate static build in `site/`** (no framework, no bundler, no runtime dependency; output `site-dist/`). It shares no code, build or bundle with the Premium app, which is unchanged (`src/`, `index.html`, `vite.config.js` untouched; repository `npm test` 125/125 and `npm run build` pass). Deployable on any static host. CSS 3.4 KB, JS 6.9 KB, home HTML 5.6 KB (gzip), hero preview 87 KB; no web fonts, no third-party request.

## 3. What was built
* **Home:** hero (approved headline and promise, tagline, two calls to action), product overview with six capabilities each labelled **Pre-release build** or **In development** (nothing is "available"), how it works (seven steps), who it is for (agencies, ecommerce, professional services, hospitality, product brands), three real pre-release screenshots labelled as sample data, founding-customer section (no guaranteed acceptance, no date, no price, no discount, nothing to pay), FAQ (availability, channels, privacy, early access, invitations, deletion), company information.
* **Pages:** privacy notice, website terms, data-deletion instructions, 404. Legal text is a **draft for legal review** with a visible notice until `legalReviewed` is set; unresolved company facts show "to be confirmed before publication" in the draft build, and the **strict publication build refuses to run** while any remain.
* **Registration:** two clearly distinct intentions; name, business email, company, industry, optional priorities and notes; required contact consent and a **separate, unticked, optional marketing consent**; versioned consent wording stored with SHA-256 hashes; attribution from UTM/referrer **host only**, kept in memory; accessible validation (summary, inline errors, focus management), keyboard completion, honeypot, elapsed-time signal, retry that reuses one submission id, plain failure wording that keeps the visitor's answers.
* **Measurement:** first-party aggregate events only (page view, form view, start, field error, attempt, success, failure, abandon), no cookies/storage/fingerprinting, off for Global Privacy Control/Do Not Track, off without an events URL, never carries a value. Conversion rates are computed only from real counters and are `null` when there is no denominator.
* **Contract and reference stub:** `BG_WEB_001_LEAD_CAPTURE_CONTRACT.md`, `site/dev/lead-stub.mjs` (in memory, dev only), `site/contract` tests that can be pointed at a real implementation.

## 4. Test results (local, SHA in section 7)
| Check | Result |
|---|---|
| Website unit, contract, build and content tests (`npx vitest run site`) | **78 passed** (form model 18, measurement 6, contract 28 against the stub, build/content/form/company 26) |
| Whole repository `npm test` / `npm run build` | **125 passed** / build OK (app untouched) |
| Browser, 10 tests × 5 widths (1440, 1024, 768, 390, 320) | **50 passed**: pages render and have no horizontal overflow; axe WCAG 2.x A/AA clean on home, privacy, terms, deletion, success, validation and the closed form; keyboard-only registration; early-access and founding journeys recorded once with consent evidence and attribution; duplicate email stays one canonical record; failures (429, 503, network loss) keep answers and a retry reuses the same submission id; honeypot sends nothing; Global Privacy Control sends nothing; measurement counters real and PII-free; a build without an endpoint is closed and sends nothing; **no request to any host other than the local site and stub** |
| Strict CSP | the site was served and tested under `script-src 'self'; style-src 'self'` (no inline script or style) |
| Conditional skips | none in the website suites. Real-device, assistive-technology and slow-network testing: **not done** |

Real defects found and fixed by testing: `sendBeacon` always sends credentials and fails against a cross-origin API (replaced by `fetch` keepalive with credentials omitted); an in-page link from a tracked URL (`/?utm_source=…`) reloaded the page and lost the visitor's choice and attribution; the privacy table needed a 320 px reflow (scrollable region failed accessibility); lazy images were mis-detected as missing in a test.

## 5. Screenshot evidence
`docs/website/evidence/<width>-{home,privacy,terms,data-deletion,early-access-success,validation}.jpg` for 1440, 1024, 768, 390 and 320 (30 images, 4.3 MB). Product previews used on the page: `site/previews/{overview,growth,calendar}.jpg`.

## 6. Deliverables map
1 Draft PR and exact SHA: section 7. 2 Screenshots: section 5. 3 Test results: section 4. 4 Backend contract and unresolved dependencies: `BG_WEB_001_LEAD_CAPTURE_CONTRACT.md` §5. 5 Hosting and DNS plan: `BG_WEB_001_HOSTING_AND_CUTOVER.md`. 6 Rollback: same document §6. 7 Launch checklist (website vs full product): `BG_WEB_001_LAUNCH_CHECKLIST.md`. 8 Mission Control handoff: section 8. Continuation: `BG_WEB_001_CONTINUATION.md`.

## 7. Branch, SHA, PR, CI
Filled in below when the hosted run completes.

## 8. Mission Control evidence and task handoff (no write made; not accessible)
Evidence for BG-WEB-001: branch, PR, CI run, this report, the contract, the hosting plan, the checklist. Suggested rows (by identifier): **WEB-001** public site built (frontend, draft, locally tested, hosted CI recorded); **WEB-002** lead-capture backend (extend paid-beta domain; owner Codex; blocked on founder retention/legal/consent decisions); **WEB-003** company facts and legal review (founder); **WEB-004** brand assets (logo) (founder/design); **WEB-005** host choice, preview, DNS capture and cutover (founder; separate approval); **WEB-006** edge bot/rate protection and alerts (infra); **WEB-007** real-device/AT testing. Link to #191 social pre-launch gate: the website makes **no** claim that a social integration exists.

## 9. Decisions needed from the founder
Company number, registered office and contact addresses; legal review and the retention period; the list of processors; hosting choice; whether to extend the paid-beta lead domain (recommended) or build a separate route; approval of the status wording, the screenshots and the FAQ's mention of Instagram and Facebook; brand assets; who receives alerts; when to authorise a preview deployment and, later, the DNS cutover.
