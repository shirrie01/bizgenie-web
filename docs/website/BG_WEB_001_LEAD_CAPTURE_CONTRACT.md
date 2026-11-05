# BG-WEB-001 — lead-capture and site-measurement contract (PROPOSED, for Codex)

27 October 2026. **Proposal only. No backend source, migration, secret or service was changed or activated.** Reference implementation for local testing: `site/dev/lead-stub.mjs` (in-memory). Contract tests that any implementation can run: `CONTRACT_BASE_URL=<url> CONTRACT_ORIGIN=https://getbizgenie.com npx vitest run site/contract` (28 tests; 28 pass against the stub).

## 0. Start from what already exists

`bizgenie-api` already has a **write-only public lead domain** (BG-LAUNCH-002F, `src/paid-beta/*`, `docs/launch/PAID_BETA_CAPTURE_AND_CHECKOUT_RETURN.md`, route `POST /public/paid-beta-interest`, mounted only when `PAID_BETA_CAPTURE_ENABLED=true`): dedicated `paid_beta_interests` + `paid_beta_interest_receipts` tables, one canonical record per normalised email, immutable consent evidence per submission, HMAC request fingerprint, PostgreSQL atomic rate bucket (5 / 15 min per HMAC-pseudonymised socket identity), RLS with no customer policies, no `service_role` grant, no public list/lookup/update/delete.

It does **not** cover this website's needs: two registration intentions, industry, optional marketing priorities, **separate optional marketing consent**, optional website (it requires one), an optional free-text challenge (it requires one), source attribution, an admin export, retention, deletion handling, or aggregate measurement. **Recommendation: extend that domain (same tables, same security model), do not create a second lead database.** Its own document lists the open items: retention, export/deletion workflow, upstream WAF/bot protection.

## 1. `POST /public/early-access-interest` (new route beside the existing one, or a v2 of it)

Request `Content-Type: application/json`, ≤ 16 KiB, strict (unknown keys rejected):

```json
{
  "contract_version": "early-access-interest.v1",
  "submission_id": "ws-<uuid>",
  "name": "Ada Lovelace",
  "work_email": "ada@example.com",
  "business_name": "Analytical Engines Ltd",
  "industry": "agency | ecommerce | professional_services | hospitality | product_brand | other",
  "intention": "early_access | founding_customer",
  "marketing_priorities": ["brand_consistency","faster_content","campaign_planning","publishing","performance","image_video"],
  "notes": "optional, ≤ 500 chars",
  "privacy_contact_consent": true,
  "marketing_consent": false,
  "consent": { "version": "early-access-contact-v1", "contact_text_sha256": "<64 hex>", "marketing_text_sha256": "<64 hex>", "shown_at": "ISO-8601" },
  "source": { "utm_source": "…", "utm_medium": "…", "utm_campaign": "…", "referrer_host": "…", "landing_path": "/" },
  "client": { "elapsed_ms": 12345 }
}
```

| Field | Rule |
|---|---|
| `name` | 1–120 chars after trim |
| `work_email` | trimmed, lower-cased, valid, ≤ 254. Free-mail domains are **not** rejected (sole traders) |
| `business_name` | 1–160 |
| `industry`, `intention`, `marketing_priorities` | exact enums above; priorities unique, ≤ 6 |
| `privacy_contact_consent` | must be `true` (purpose: respond about early access) |
| `marketing_consent` | boolean, default false; **independent** of the above |
| `consent.version` | must be a version the server knows (`early-access-contact-v1`); the server stores the **version, both hashes and its own receipt time**; `shown_at` is client evidence only |
| `source.*` | allow-listed keys only, ≤ 100 chars, no whitespace/quotes/angle brackets; no URL paths or query strings from referrers |
| `client.elapsed_ms` | integer 0–86 400 000; a **signal for abuse scoring**, never a hard reject (password managers fill instantly) |
| `submission_id` | `[A-Za-z0-9._:-]{1,128}`; generated once per attempt and **reused on retry** |

Responses (always `Cache-Control: no-store`):

* **202** `{ "status": "received", "reference_id": "ea_…" }` — also for a same-identity replay (same reference) and for a repeat email under a new identity (a **different** reference, identical shape: prior capture is never disclosed).
* **400** `VALIDATION_ERROR` with `details:[{path,code}]` — never echoes submitted values.
* **409** `IDEMPOTENCY_KEY_CONFLICT` (same `submission_id`, different content).
* **413/415** oversize / not JSON. **429** `RATE_LIMITED` + `Retry-After`. **503** unavailable.
* Any method other than POST/OPTIONS on the path → 404/405. **There is no public list, lookup, update or delete route.**

Semantics: one canonical record per normalised email; a later submission appends a **receipt** (consent evidence) and can only **raise** intention (`early_access` → `founding_customer`), never lower it or overwrite the first record; marketing consent is recorded per receipt (latest wins for sending, history retained). No account, tenant, billing object, provider call, email or CRM push is created by this route.

CORS: exact allowed origin(s) (`https://getbizgenie.com`, preview origin while testing), **never `*`**, no credentials. The site sends `credentials: "omit"`.

## 2. Bot protection and rate limiting

Layers, in order: (1) edge/WAF rate limit and bot rules at the hosting layer (an approved upstream is still required — the paid-beta contract says so too); (2) the existing atomic PostgreSQL bucket keyed by an HMAC pseudonym of the socket identity (raw IPs never stored; short-lived rows with an expiry job); (3) strict parsing with a small body limit; (4) a client honeypot field that real people never fill (the site drops those submissions silently, so the server never sees them); (5) `client.elapsed_ms` scoring (very fast submissions can be down-ranked in the operator view, not rejected). An interactive challenge (for example a privacy-preserving CAPTCHA) is **not** integrated: it needs a third-party service, a privacy review and a paid/secret decision. The contract reserves an optional `challenge_token` field; add it only if edge metrics show abuse.

## 3. Operator access (no public lead list)

* Records are readable only through **operator tooling** under existing database-owner controls (same boundary as the paid-beta tables): an authorised `export` job/CLI that writes CSV to a controlled location, with **formula-injection neutralisation** (cells starting `= + - @` tab/CR are prefixed with `'`; reference implementation and test: `toCsv`), columns limited to the fields in section 1, and an audit row per export.
* Deletion/withdrawal: an operator procedure keyed by normalised email that deletes the canonical record and receipts (or anonymises where the law requires keeping consent proof), logs who/when, and stops marketing immediately. The public data-deletion page promises "without undue delay and within one month".
* **Retention is undecided** (founder). Proposed default to decide: delete unconverted early-access records N months after the last receipt; keep consent proof only as long as needed. Until decided, the privacy notice shows "to be confirmed" and the strict site build refuses to publish.
* Minimal monitoring (no PII): counters for received / validation errors / 429 / 5xx and bucket saturation; alert on error ratio and on a sudden spike of 429s. No email addresses in logs.

## 4. `POST /public/site-events` (aggregate measurement)

Strict JSON ≤ 8 KiB: `{ "contract_version":"site-events.v1", "visit":"<uuid>|null", "source":{…same allow-list…}, "events":[{ "type", "page", "intention?", "field?", "code?", "kind?" }] }` with 1–20 events.

* `type` ∈ `page_view, form_view, form_start, field_error, submit_attempt, submit_success, submit_failure, form_abandon`.
* `field`, `code`, `kind` match `^[a-zA-Z_]{1,30}$`. **Any other key is a 400**, so a typed value can never be accepted by accident (tested).
* `visit` is a random id held in page memory only (no cookie, no storage); it lets the server group one visit's events and is not linked to a person.
* The site sends nothing when Do Not Track or Global Privacy Control is on, when no events URL is configured, or when `SITE_MEASUREMENT` is not enabled at build time.
* Server stores **counters** (by type, intention, utm_source, referrer_host, day) and per-field error/abandon counters, not a raw event log with request metadata. Response **202**.

Conversion figures are derived only from these real counters: `visit_to_registration = submit_success / page_view`, `start_to_registration = submit_success / form_start`, abandon rate, top error fields. **When a denominator is 0 the value is `null` (unknown), never 0 or an estimate** (`funnel()` + test). Server-side `submit_success` can be reconciled against the stored receipts to detect client under-reporting; report the reconciled number as authoritative.

## 5. What is unresolved (blocks real use)

| # | Item | Owner |
|---|---|---|
| 1 | Approve extending the paid-beta domain (vs a new route) and implement the route, migration, tests, admin export/deletion | Codex + founder |
| 2 | Retention period and deletion SLA | founder |
| 3 | Edge/WAF rate limiting and bot rules at the chosen host | founder / infra |
| 4 | Who receives operational alerts; where exports are stored | founder |
| 5 | Final consent wording (version `early-access-contact-v1` is a draft) and lawful-basis review | founder / legal |
| 6 | Whether registrations feed any email system (none is connected; no email is sent) | founder |
| 7 | CORS origin list for production and for a preview URL | infra |
| 8 | Run `site/contract` against the real implementation | Codex |
