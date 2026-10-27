# BG-WEB-001 — launch checklist: website readiness vs full-product readiness

27 October 2026. Two separate gates. **Passing the website gate does not make BizGenie launch-ready.** Staging is RED and full-product launch is NO-GO; neither changes here. Status words: DONE (evidence cited) · OPEN (named owner) · BLOCKED.

## A. Website readiness (what must be true before `getbizgenie.com` points at the new site)

### A1. Built and tested (frontend, this branch)
| Item | Status | Evidence |
|---|---|---|
| Hero, product overview with honest status labels, how it works, who it is for, previews, founding section, FAQ, company information | DONE | `site/`, section tests in `site/tests/site-build.test.js` |
| Two distinct registrations (early access, founding customer), optional priorities, separate optional marketing consent, consent evidence, attribution | DONE | `site/assets/form-model.js`, browser journeys |
| Accessible validation, keyboard completion, reduced motion, 320–1440 px reflow, axe WCAG 2.x A/AA clean | DONE | `site/browser/` 10 tests × 5 widths |
| Anti-spam: honeypot, elapsed-time signal, server-side rate limit in contract | DONE client / OPEN server | contract §2 |
| No third-party request, no cookies, no storage, strict CSP honoured | DONE | browser test "no third-party request"; headers reference |
| Privacy-conscious measurement, GPC/DNT respected, no values collected | DONE client / OPEN server | `site/assets/measure.js`, tests |
| No invented numbers, prices, dates, testimonials, availability | DONE | content lint tests |
| Existing Premium app untouched | DONE | no change under `src/`, `index.html`, `vite.config.js`; root tests 125/125 and app build pass |
| Draft build not indexable; publication build refuses while facts are unresolved | DONE | tests |

### A2. Founder input required (blocks publication; the strict build refuses to run until filled)
| Item | Owner |
|---|---|
| Company number, registered office, contact email, privacy-contact email (nothing was invented) | founder |
| Legal review and approval of the privacy notice, website terms, consent wording `early-access-contact-v1`, governing law, liability wording | founder / legal |
| Retention period and deletion SLA for registrations | founder |
| List of processors/hosting providers and any transfers outside the UK for the privacy notice | founder / infra |
| Approved brand assets: **no logo file exists in the repository**; the site uses a text wordmark and a plain "B" favicon as placeholders | founder / design |
| Approval of the product screenshots (real pre-release UI, sample data, sample business name) or replacement with approved imagery | founder |
| Confirm the status wording for each capability (Pre-release build / In development) is acceptable | founder |
| Confirm which social channels may be named in the FAQ (currently "Instagram and Facebook are being worked on first; others may follow", subject to platform approval) | founder |

### A3. Backend and infrastructure (separate approvals; nothing activated)
| Item | Owner |
|---|---|
| Extend the existing paid-beta lead domain for the new contract, add admin export/deletion, retention job, tests; run `site/contract` against it | Codex |
| Enable the route only in an approved environment (secrets, HMAC keys, CORS origin list) | founder / infra |
| Edge rate limiting / bot rules; monitoring and alerts for the lead endpoint | founder / infra |
| Choose host; create project; preview deployment; headers; TLS | founder / infra |
| DNS capture, TTL change, cutover, rollback rehearsal (see hosting plan) | founder |
| First end-to-end test on the real endpoint with a labelled test record, then deletion of it | Codex / founder |

### A4. Final pre-publication checks (run on the exact release commit)
`npm run site:build:strict` succeeds · `npm run site:test` · `npm run site:browser` at 1440/1024/768/390/320 · repository `npm test` and `npm run build` · header and TLS check on the preview · manual phone check · privacy notice re-read against the live system · robots.txt allows indexing only in the strict build · rollback record captured.

### A5. Meta-reviewer suitability (website side)
Visible company name and (once supplied) number, address and contact; public privacy notice, website terms and a data-deletion instructions page, each linked from every page; honest description of the product and its availability; no claim that any Meta integration exists today; the form collects no social credentials or tokens and says so. **Open:** the founder-supplied company facts, legal approval, and that the privacy notice names the processors. Business verification with Meta is separate and "in review" (see `docs/studio/BG_STUDIO_023_META_READINESS_CHECKLIST.md` on the Studio stack).

## B. Full-product readiness (NOT satisfied; the website must not imply it is)

| Gate | State |
|---|---|
| S1 staging isolation approved and proven | RED; the proposed £1/30-day ceiling is not approved |
| Pricing and terms canon supplied and approved | MISSING |
| Real social OAuth, platform approvals, publishing | NOT STARTED / BLOCKED (Meta business verification in review) |
| Analytics ingestion and Learning Brain on real platform data | BLOCKED (no public ingestion path) |
| Product worker, storage, media inspection, hybrid composition in a reviewed environment | NOT DONE |
| Billing management routes mounted; live Stripe | NOT DONE / not authorised |
| Owner/member, five-industry journey on staging | NOT DONE |
| Founder acceptance | NOT GIVEN |

**Wording rule until section B is green:** the site keeps saying "not yet open to the public", labels capabilities "Pre-release build" or "In development", and promises no date, price, discount or place.
