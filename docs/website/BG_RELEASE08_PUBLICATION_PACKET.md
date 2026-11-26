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
