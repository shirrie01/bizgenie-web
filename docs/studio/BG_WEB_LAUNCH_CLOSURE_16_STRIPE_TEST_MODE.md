# BG-WEB-LAUNCH-CLOSURE-16 — Stripe test-mode acceptance procedure (prepared, NOT RUN)

13 Nov 2026. **Status vocabulary:** LOCAL TEST PASS · HOSTED CI PASS · STRIPE TEST-MODE NOT RUN · LIVE NOT AUTHORISED. No credential was accessed, no Stripe object created, no transaction run. The drill below needs the founder's separate approval.

## A. Approval request (to be answered in Issue #191 before anything runs)
- **Scope:** one Stripe **test-mode** subscription for one founder-owned staging tenant; nothing live.
- **Account:** the BizGenie Stripe account in **test mode**, owned by the founder; test secret key, test webhook signing secret and test Price created by the founder.
- **Cost ceiling:** £0 (test mode). No provider (OpenAI/Google) call is part of this drill.
- **Effect:** staging entitlement and +60 credits for the test tenant; test customer, subscription and invoices in Stripe test mode.
- **Rollback/reset:** cancel the test subscription and delete the test customer in the Stripe dashboard; mark the staging tenant’s entitlement `cancelled` through the webhook (do not edit rows by hand); keep the ledger as evidence; remove the test webhook destination afterwards.
- **Evidence capture:** the nine stage records below (date, revision, status, no secrets/IDs beyond a short hash), Stripe event ids truncated, screenshots of Studio billing before/after.
- **Preconditions:** an API revision built from `d3ec6c37` or later with Stripe composed (`STRIPE_BILLING_ENABLED`, `STRIPE_MODE=test`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STANDARD`, `STRIPE_POLICY_STANDARD`, success/cancel URLs `https://staging-app.getbizgenie.com/billing/checkout/{success,cancel}`), the approved catalogue and policy injected (item 2 of the decision pack), migrations applied with approval, and the WEB checkout gate switched on for that build only.

## B. The nine stages
| # | Stage | Local source evidence now | Hosted CI | Test-mode run | Pass criteria | Failure condition |
|---|---|---|---|---|---|---|
| 1 | Server catalogue / Stripe Price match | API `commercial-contracts.test` (catalogue ↔ policy ↔ price mode); WEB plan tests | PASS (generic CI) | NOT RUN | catalogue `amount_minor`, currency, cadence equal the Stripe test Price; policy credits 60 | any mismatch, or `price_id` exposed to the browser |
| 2 | Checkout initiation | `stripe-billing.test`: owner-only, server-chosen price/URLs, idempotent; WEB `BillingPanel.test` | PASS | NOT RUN | HTTPS Stripe test-mode URL returned to the owner only; non-owner refused | arbitrary price/URL accepted; checkout offered while already entitled |
| 3 | Stripe-hosted test checkout | n/a (Stripe-hosted) | n/a | NOT RUN | test card succeeds; hosted page shows the approved price and VAT | wrong price shown |
| 4 | Return to Studio and server refresh | WEB: never trusts the return URL; re-reads status; truthful wording | PASS | NOT RUN | “active” shown only after the server reports it | “active” or credits shown from the URL alone |
| 5 | Signed webhook receipt | `stripe-webhook-ingress.test`; raw-body verification; API-version pin | PASS | NOT RUN | one `2xx`; invalid signature refused with no diagnostics | unsigned event accepted |
| 6 | Idempotent subscription and credit allocation | lifecycle tests; simulation PASS: **exactly one +60 per period**, redelivery and duplicate event ids harmless | PASS | NOT RUN | ledger shows one +60; replay returns the first result | second grant |
| 7 | Payment failure / grace | `invoice.payment_failed` → `grace` 7 days, no grant | PASS | NOT RUN (use the test-mode failing card) | grace wording, access continues, no grant | credits granted on failure |
| 8 | Cancellation and renewal | scheduled cancel → `cancel_pending`; deletion → `cancelled`; renewal grants once; generation refused when cancelled | PASS | NOT RUN | access to period end, then refused; one grant at renewal (advance the test clock) | access after end; double grant |
| 9 | Invoice, refund/dispute, customer messaging | refund link only; invoices route **not mounted**; refund/dispute handlers absent (R1–R4 `todo`) | PASS (todo tests stay red by design) | NOT RUN | cancel-and-refund in the dashboard ends access; Studio says “not active”; no automatic reversal expected | claims an automatic refund that does not exist |
**Local test evidence today (API main `d3ec6c37`):** billing, Stripe, generation-billing, paid-beta, management/invoice drafts, catalogue, provider-spend, quoted-adapter, calendar and social-contract suites **119/119 pass**; first-customer simulation passes; refund/credit acceptance: 5 existing pass, 6 required remain `todo` (red). **LOCAL TEST PASS · HOSTED CI PASS (generic) · STRIPE TEST-MODE NOT RUN · LIVE NOT AUTHORISED.**
