# Release 08 website publication packet

The static BizGenie site and its waiting-list form can be built and tested locally. Publication and real intake remain on hold pending verified company information, legal approval and an approved live intake service. The founder Studio demonstration and paid commercial launch have separate gates.

## Original ten strict-build blockers

`site/build.mjs --strict` calls `unresolved()` in `site/config.mjs` before writing output. `node site/check.mjs --json` reports the same requirements. With no operator inputs, the original failure is reproduced verbatim below. Times estimate verification and configuration work after receiving authoritative inputs. Adviser reviews and infrastructure delivery have no confirmed schedule.

| Original output | Configuration and existing behaviour | Minimum correction and owner | Dependency and acceptance | Estimate |
| --- | --- | --- | --- | --- |
| companyNumber | `site/config.mjs` → `company.companyNumber`, unset. Company disclosure renders approved text. | Founder supplies exact registered number. | Verify against the official register and company disclosure. | 10 min |
| registeredOffice | `company.registeredOffice`, unset. Company disclosure renders approved text. | Founder confirms the registered office. | Verify against the official register and rendered address. | 10 min |
| contactEmail | `company.contactEmail`, unset. Support renders a mail link. | Founder designates and verifies a monitored support mailbox. | Confirm mailbox ownership and rendered support link. | 15 min |
| privacyContactEmail | `company.privacyContactEmail`, unset. Privacy and deletion pages render the contact. | Founder designates a monitored privacy mailbox and owner. | Verify the mail link and a synthetic request-handling walkthrough. | 15–30 min |
| retentionDecision (how long registration records are kept) | `company.retentionDecision`, unset. The privacy notice has a retention section. | Founder and adviser approve period and disposal wording. Intake operator implements retention and deletion. | Match notice to records, receipts and backups. Prove expiry/deletion on synthetic data. | 30–60 min to verify after service work |
| processors (list of providers that process registration data, each with a purpose) | `company.processors`, unset. Privacy template renders a provider list. | Founder and adviser approve the actual list of names and purposes. | Reconcile hosting, intake, support and measurement data flows with vendor terms. | 30–60 min |
| internationalTransfers (statement on transfers outside the UK) | `company.internationalTransfers`, unset. Privacy template renders approved wording. | Adviser confirms locations, transfers and safeguards. | Verify against provider terms, regions and support access. | 30–60 min to verify |
| governingLaw (governing law and courts for the website terms) | `company.governingLaw`, unset. Terms render supplied wording. | Adviser supplies the jurisdiction and courts sentence. | Confirm the published clause matches the approved text. | 10–15 min to verify |
| legalReviewed (privacy notice, terms and consent wording need legal review) | `company.legalReviewed` defaults to false. Strict build requires boolean true. | Record the founder/adviser decision against the final notice, terms, deletion, support and rendered consent copy. | Review against actual service behaviour and versioned wording. | 15–30 min to capture and verify approval |
| SITE_API_URL (no lead endpoint configured; the form will not submit) | `runtime.apiBaseUrl` defaults empty. Existing form has a closed state. The local stub implements the proposed `early-access-interest.v1` contract. | Supply the approved HTTPS origin after the intake service passes acceptance. | Exact-origin CORS and the lead acceptance procedure below. | 30–60 min to verify after service work |

## Source closure

The strict build accepts a public JSON file via `SITE_PUBLICATION_CONFIG` with only the ten allowed company fields above, counting optional `dataProtectionRegistration` and excluding `SITE_API_URL`. It validates nonempty strings, usable email format, processor name/purpose entries, a boolean legal-review decision, and a canonical non-loopback HTTPS lead origin. A loopback HTTP origin remains supported for draft QA. The browser confirms registration only on the expected HTTP 202 receipt with `status: "received"` and a valid `reference_id`. Unexpected responses preserve answers and allow a retry using the same submission ID. Tests use temporary synthetic files and an in-memory service.

Production build names are `SITE_PUBLICATION_CONFIG`, `SITE_API_URL` and optional `SITE_MEASUREMENT` (default off). `SITE_OUT` selects an artifact directory. Use a clean output directory and `npm run site:build:strict`. Put only approved public facts and wording in the JSON. Keep service credentials in the separate intake service's approved settings. The domain, legal name, and positioning are defined in `site/config.mjs`.

WEB PR #90 head `b17e4b5b74e4e874e08518b523e8de77579a3a19` proposes reusing `/public/paid-beta-interest`. It removes industry, campaign/referrer attribution, and other fields, and substitutes paid-beta contact consent. It therefore needs a product and legal decision before it could replace this waiting-list contract. WEB PR #95 changes the Studio compatibility profile and has no public-site publication corrections. Neither branch supplies the ten actual operator inputs.

## Waiting-list acceptance and rollback

1. Provide an approved non-production origin with `POST /public/early-access-interest` implementing `early-access-interest.v1`. Keep customer uploads disabled pending E4. The separate Studio bridge does not carry the public routes.
2. Run the existing contract suite against the approved test service using `CONTRACT_BASE_URL` and `CONTRACT_ORIGIN` with synthetic leads. Verify 202 receipt and persistence, same-ID replay, same-ID/different-payload conflict, duplicate-email confidentiality, validation, exact-origin CORS, 429, size limits and no secret or personal data in diagnostics or analytics. Verify production-appropriate storage, rate limiting, deletion and operator access separately. Local stub results cover contract behaviour only.
3. Verify desktop and phone intake, consent, industry, business information, UTM/referrer persistence, failure/retry, no paid checkout and no upload controls. Enable `SITE_MEASUREMENT=1` only once the optional aggregate route is approved and verified. The local stub persists synthetic data only for its own process.
4. Before any separately authorised publication, capture the last known-good static artifact or host release ID, current DNS and headers. Publish only after strict build and synthetic preview acceptance. Use the host's release rollback to restore the previous artifact. If intake must stop, use the approved prior closed-site artifact and the operator's intake disable procedure. DNS restoration, if needed, follows the recorded values and separate authorisation.

## Milestones

- **Website and waiting list** — Source and local evidence support draft QA. A public intake implementation, operator and privacy procedures, all ten inputs, and hosted preview acceptance remain required. The earliest safe publication path is the approved static site plus a dedicated compatible waiting-list endpoint. No dependency on paid application activation.
- **Founder application demonstration** — Separate Release 08 A0 runner acceptance and hosted readback. The richer WEB #95 profile needs exact tagged API identity and independent evidence of the A1/A2 bridge permissions. A0 workspace permissions are insufficient for that profile.
- **Paid commercial launch** — NO-GO under the current programme. Sprint10C HOLD; E3/D5 deferred. E1 and P2/P3 remain under the existing programme. E4 is still a prerequisite for customer file uploads.

The public site currently uses labelled fixture screenshots. The available Studio preview client is for authenticated tenant campaigns and existing campaign revisions. No approved seven-slide template or public lead-to-preview binding was found in the reviewed heads. The questionnaire already captures industry, company information and optional notes. The next approved integration needs a defined preview template and a controlled lead-to-preview handoff. No provider generation or prospect messaging is needed to test such a handoff with fixtures.

## Acquisition continuation

The companion acquisition API is on `bg-release08-acquisition` against API `main`. The site implementation is on `bg-release08-acquisition-web` against WEB `main`, retaining safeguards commit `0985f8643c2a49b3ec27c18316d289bec6ce5607` from `bg-release08-website`. The ten original entries above remain the exact operator inputs and decisions.

- **Source correction completed:** typed public facts and strict origin validation, durable early-access API source and migration, exact receipt validation, byte-equivalent replay of the browser payload, honeypot without a false confirmation, and a private fixture preview draft. Keep intake disabled by default. The site build does not include the draft.
- **Production configuration required:** the final nine fact/approval keys in `SITE_PUBLICATION_CONFIG` and the approved `SITE_API_URL`. The API requires the separately documented feature flag, exact site origin, approved retention days and distinct runtime-managed HMAC secrets.
- **Founder approval required:** company and contact facts, legal and privacy decisions, operator ownership and draft preview concept.
- **External dependency:** approved intake origin and private database access, release/hosting approval, verified edge rate limits and monitoring, maintenance and deletion operations, and hosted acceptance. E4 remains a prerequisite for customer uploads.

The production events endpoint is outside this delivery. Keep optional site measurement disabled until the aggregate events service is available. The local reference still runs the original measurement regression checks. Durable submissions store campaign and referrer attribution with the receipt.

## Founder configuration questionnaire

1. What are the verified company registration number and registered office?
2. Which monitored addresses should be used for support and privacy requests, and who owns the response and deletion workflow?
3. What retention period and deletion/backup handling should be implemented for leads, receipts and internal draft content?
4. Which providers process registration data, for which purposes, and what international-transfer wording and safeguards has the adviser approved?
5. What governing-law and courts wording should the terms use? Who approved the final version of the privacy notice, terms and both consent statements?
6. Which HTTPS origin, intake operator and hosting owner are approved for the waiting list? Who owns production monitoring, abuse controls and maintenance?
7. Is the attached seven-slide internal draft approved for further design review, and what must change before any prospect-facing use?

## Synthetic demonstration

The regular five-width browser matrix still covers the reference journeys. `site/browser/durable.browser.mjs` adds a loopback-only Playwright check. Start the static draft with `SITE_API_URL` pointing at the local PostgreSQL-backed API, then run `npx playwright test --config site/browser/playwright.durable.config.mjs` with `BG_DURABLE_SITE_ORIGIN` and `BG_DURABLE_LEAD_URL`. The test first injects an incomplete HTTP 202 response, verifies that the browser keeps the form open, retries the same complete payload, then verifies the real receipt. The internal repository prepares the fixture from the committed lead. `node site/dev/render-preview-draft.mjs draft.json output.html` renders it with the existing website layout outside the public build. No emails or provider calls are used.
