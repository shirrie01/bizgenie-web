# Public lead capture: reconcile the website with the existing paid-beta API (WEB only, collection OFF)

16 Nov 2026. **Nothing here enables collection.** No deployment, secret, database write, migration, live submission or external communication. No new endpoint: the backend is reused as it is.

## Existing backend (bizgenie-api, merged on `main`)
`POST /public/paid-beta-interest` (`src/paid-beta/`, migration `20260901170000_create_paid_beta_interest_capture.sql`). Mounted only when `PAID_BETA_CAPTURE_ENABLED=true`, which also needs two distinct secrets of at least 32 characters (`PAID_BETA_SUBMISSION_HASH_SECRET`, `PAID_BETA_CLIENT_HASH_SECRET`). Strict body, 16 KiB limit, 202 `{status:"received", reference_id:"pbi_…"}`, 400 `VALIDATION_ERROR`, 409 `IDEMPOTENCY_KEY_CONFLICT`, 413, 429 `PAID_BETA_RATE_LIMITED` (five attempts per 15 minutes per HMAC-pseudonymised client, no `Retry-After` header), 503 `PAID_BETA_CAPTURE_UNAVAILABLE`. No list, lookup, update or delete route.

## Field mapping (website form to API)
| Website field | API field | Rule enforced in both |
|---|---|---|
| Your name | `name` | required, 1 to 120 |
| Business email | `work_email` | required, lower-cased, valid, at most 254 |
| Business or company name | `business_name` | required, 1 to 160 |
| Website or social profile (**new, required**) | `website_or_social_profile` | HTTP(S) address, at most 2,048, no credentials; a missing scheme gets `https://` |
| Business stage (**new, required**) | `business_stage` | `pre-revenue`, `under-250k`, `250k-1m`, `1m-5m`, `5m-plus` |
| Your main marketing challenge (**new, required**) | `primary_marketing_challenge` | required, 1 to 1,000 |
| Consent checkbox | `privacy_contact_consent` | must be `true` |
| Early access or founding customer radio | `source` | `website-early-access` or `website-founding-customer` (safe label, at most 64) |
| generated per attempt, reused on retry | `submission_id` | `ws-<uuid>` |

**Removed because the API has no field for them:** industry, "what matters most", notes, optional marketing consent, UTM and referrer attribution, consent hashes, `contract_version`, `client.elapsed_ms`. The payload is exactly nine keys; the old proposed fields would be rejected by the strict schema.

## Verification checklist
| Item | Result |
|---|---|
| Strict payload equals the API schema | PASS: unit test builds the payload and runs it through a validator mirroring `src/paid-beta/schema.js`; contract tests refuse the old fields |
| **Consent** | The server records **its own** version `paid-beta-contact-v1` and wording "I agree that BizGenie may use these details to contact me about the paid beta." The checkbox now shows that wording word for word (tested). The consent is limited to contact about the paid beta |
| **Marketing consent** | **Not captured.** The API stores none, so the optional marketing checkbox was removed rather than shown and lost. Any newsletter or wider marketing needs a separate consent mechanism (backend work, not done) |
| Privacy notice | Updated to the fields actually collected; the optional-marketing and attribution rows removed; still says retention, controller details, processors and transfers are "to be confirmed" and the strict build still refuses to publish until the founder and adviser supply them |
| **Retention** | **Unresolved** (founder). The API keeps interests, receipts and consent evidence append-only. The notice's "How long we keep it" stays "to be confirmed" |
| **Deletion promise vs backend** | The data-deletion page promises deletion "without undue delay and within one month", but the API states export and deletion tooling needs a separately authorised administrator implementation. Until that exists, deletion would be a manual operator procedure. Founder must accept that or fund the tooling before collection |
| Duplicates | PASS in contract tests: same `submission_id` and content replays the same reference; changed content under that id is a 409; a repeat email under a new id returns the same shape with a new receipt and never overwrites the first record or discloses it |
| Abuse controls | Honeypot (client side), server rate bucket, 16 KiB limit. The server notes an approved edge or WAF limit is still required for public launch |
| Collection OFF | `SITE_API_URL` is unset by default, so the form says registration is not open and the page makes no request (browser test) |

## Decisions required before collection can be enabled
1. **Accept the existing backend's data model** (no industry, priorities, notes, attribution or marketing consent; website, stage and challenge required), or ask for a new backend version. Recommended: accept.
2. **Programme name:** the server-fixed consent says "paid beta"; the pages say "early access" and "founding customer". Choose the wording.
3. **Marketing scope:** confirm that the only permitted contact is about the paid beta, with no newsletter.
4. **Business stage meaning:** confirm the currency and period behind `under-250k` to `5m-plus` (the labels deliberately add none).
5. **Retention period and the manual deletion procedure** (or fund admin tooling).
6. **Privacy and legal inputs:** company number, registered office, privacy contact, processors, transfers, governing law, adviser approval (`legalReviewed`).
7. **Public ingest route:** where `SITE_API_URL` points. The staging API is private and the Studio bridge does not carry `/public/*`; CORS must allow `https://getbizgenie.com`; an edge or WAF limit is needed.
8. **Operator access:** who reads the leads, and the monitoring and alert path.
Operator actions that need separate approval: set `PAID_BETA_CAPTURE_ENABLED` and the two secrets, apply nothing without the existing migration already being present, set `SITE_API_URL` at build time.

## Evidence (local only)
`npx vitest run site`: 123/123; website browser suite 10/10 at 320, 390, 768 and 1440 px (axe WCAG 2.x A/AA and 2.2 AA, keyboard-only completion, retry reuses the same submission id, honeypot sends nothing, closed build sends nothing); full WEB vitest 1,596 passed. No live submission was made.
