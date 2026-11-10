# BG-STUDIO-017-FE addendum — DEC-023 implementation (draft, frontend only)

25 October 2026. Implements the four items the founder approved as DEC-023 in the canonical Mission Control (the Google Sheet, which this session cannot read: the decision text was relayed in the work order and is quoted here only as the four items). **Staging remains RED; launch is not authorised.** This is engineering evidence for Mission Control, not a second register. Everything below was tested against a **mocked** API and Supabase.

## 1. Canonical state verified before work

| Item | Exact head | State |
|---|---|---|
| Frontend #48 / #49 | `7fe2bcc15f489b32fc7e80ffd2e0fc9ab24b7645` / `6c8e7b6bb68aee83843f567b5ba4dea84f3a0a1b` | draft, unchanged |
| Frontend #50 (this work, base #49) | code `5dab6cc9ee1dc1c855eec25f59410d5e08adfd59` (this addendum is a documentation-only commit above it; earlier head `0e13e22230d497762e91eb99443e77a736a75e25`) | draft |
| Backend #213 / #214 / #215 | `120a874d…` / `51e8ca49…` / `e84c6d0e…` | draft, unchanged |

## 2. What was done, per DEC-023 item

### 2.1 Professional-services sector

* **UI and guidance:** a `professional` sector ("Professional services") with three general guidance angles (no claims, no numbers), an accent colour, and inference keywords (accountants, solicitors, consultancy, advisory, architects, surveyors, recruitment, and similar). It is last in the resolution order, so a more specific sector (for example fleet) keeps priority. A business such as Ashdown & Pryce Chartered Accountants, or Harbour Partners ("Business consulting"), now shows **Professional services** guidance, labelled "Inferred from what you typed". Window cleaning and similar local trades remain "Not specified".
* **Backend contract (not assumed):** the backend accepts only `leasing, perfume, aesthetics, beverage, charity, takeaway, neutral` in three places, so `professional` **cannot be saved yet**: (a) the zod enum `SECTOR_KEYS` in `src/workspace-onboarding/schema.js`; (b) the database CHECK `workspace_onboarding_profiles_sector_key_check` created by migration `20261023100000`; (c) the same constraint text pinned in `src/workspace-onboarding/schemaContract.json`, which the schema preflight compares exactly (a mismatch makes onboarding answer 503). All three, plus a new forward migration that drops and re-creates that constraint, must ship together (see the BG-STUDIO-016 finding: constraint text is re-rendered by `pg_dump`/`pg_restore`, so a new constraint must be re-checked against the preflight after any restore).
* **Frontend gate:** `VITE_PROFESSIONAL_SECTOR_PERSISTED` (build time, strictly the string `true`, default off). While off: Professional services is **not offered as a choice** and is **never sent** to the API. A professional sector worked out from the customer's words guides the workspace, and is stored as the API's own `neutral` with source `inferred`, so setup can still be completed. The workspace labels it as worked out and not saved. When on: it is offered, and saved as `professional` (customer or inferred).
* **Activation sequence (founder approval at each step; none performed):** backend enum and migration reviewed and merged → migration applied to staging → preflight contract updated and verified → backend deployed → set the flag and rebuild the frontend. Rolling back is unsetting the flag.
* **Preview:** the isolated V3 preview has no professional profile; its resolver maps it to neutral (drift guard updated and documented).

### 2.2 Billing from the API, with no invented pricing

* **Canon search (required before using any price):** no pricing or terms canon exists in either repository. Searched: `bizgenie-web` (all 30+ remote branches, `£` literals; the only hit is the unrelated revenue-band list in the Founding 100 form); `bizgenie-api` at `e84c6d0` (docs: `BizGenie_Canon_v2.md` states it "does not itself approve … pricing, legal terms"; `README.md`: "No commercial prices are hard-coded"; `docs/billing/*`: the Stripe Price and credit mapping are configured outside source control; `STAGING_ACTIVATION.md`: no Stripe Price in source), and the Markdown files of every remote backend branch for `£`. GitHub issue search for pricing and DEC-023 returned nothing (the Mission Control sheet is not reachable from this environment). **Therefore no price is shown and none is cited.** If the sheet holds a locked price or terms, they must be supplied (with their canon reference) and they should be served by the API or by Stripe Checkout, not typed into the frontend.
* **Removed:** the hard-coded "Standard includes 60 credits each month". The figure (60, policy `paid-beta-standard-v1`) is still what the backend currently grants, but it now appears only if the API returns it.
* **Shown, from `GET /customer/billing/subscription` only:** plan name (from `plan_code`), access status, credits included each month, credits available now, current period, and, where the API gives them, the grace end and the cancellation date. Each backend status has its own wording: `active`, `grace`, `cancel_pending`, `cancelled`, `inactive`. A checkout button is offered only when no access remains (never a second checkout while entitled).
* **Not subscribed:** "Checkout is hosted securely by Stripe, which shows the price and billing terms before you pay." This is a statement of how Stripe-hosted Checkout works, not a price.
* **Terms:** "BizGenie has not yet published customer support, cancellation and refund terms in the app, so none are shown here." (Replaces the internal "Launch policy notice".)

### 2.3 Calendar

* The calendar loads **once, automatically** when opened for a campaign (only from the idle state, so a failure is never retried in a loop). **Refresh** and **Try again** are the customer's choice.
* It states the window: "Showing activity from 25 September 2026 to 23 January 2027 (the last 30 days and the next 90 days)", and that it covers the open campaign **only**: "A calendar across all your campaigns is not available yet." No workspace-wide wording appears. The API returns only `campaign_id, content_item_id, variant_id, workflow, occurrence_at` for one campaign, so no channel or title is shown.
* Not changed: the flag-off app's calendar button (outside the Premium Studio, which this decision targets).

### 2.4 Payment-status wording (never implies an unverified payment succeeded)

| Situation | Wording |
|---|---|
| Entitlement active | "Standard plan · Active — Your plan access is active." followed by "This shows your BizGenie plan access and credits. It is not a payment receipt: payments, receipts and card details are handled by Stripe." |
| Returned from Stripe, no entitlement yet | "Your plan is not active yet. BizGenie has not received confirmation from Stripe for this account, so no plan access or credits are shown. Confirmation can take a minute after you pay. … do not pay again: look for the receipt Stripe emailed you." plus **Check again** |
| Returned from Stripe, any state | "Coming back from Stripe does not by itself confirm a payment, so BizGenie checks your account before showing any plan access or credits." |
| Cancelled return | "You left checkout, so no plan access or credits were added by this visit." |
| Lookup fails | the existing honest errors; checkout stays unavailable until the account can be checked |

The old line "Access entitlement found — payment not verified" was removed: it was technical and, to a customer, implied a payment problem.

## 3. Test evidence (all mocked; not staging proof)

| Check | Result |
|---|---|
| `npx vitest run` | **470 passed** in 28 files (454 before this change) — PASS |
| New and changed unit tests | sector inference and gate (flag off/on), payload gating, four-industry isolation including professional, billing statuses, no hard-coded credits, no currency amounts, no payment-success claims, "Check again", calendar auto-load once, window and scope text, no loop on failure — PASS |
| Premium browser matrix at 1440, 1024, 768, 390 and 320 px (production build, Premium flag on) | **46 passed at each of the five widths**, axe WCAG 2.x A/AA clean on every new view — PASS |
| Flag-off CI jobs reproduced locally: `npm run build`; flag-off app a11y browser check (2 tests) at 1440 and 390 px; preview contract check (5); preview browser checks v1+v3 (33) at 1440 and 390 px | all PASS |
| GitHub-hosted CI on the exact head `5a702f06708ba7d7c2f7ad5cfbe330ff19808217` (workflow `Studio 005 integration CI`, dispatched with `expected_sha`, [run 30](https://github.com/shirrie01/bizgenie-web/actions/runs/40195930323), workflow taken from this branch) | **13 of 13 jobs success**: unit-build (`npm test` + `npm run build`), flag-off app a11y browser at 1440, 768, 390 and 320 px, preview browser v1+v3 at the same four widths, Premium browser at 1440, 768, 390 and 320 px — PASS. (An earlier dispatch, run 29, used the older workflow file from the rehearsal branch, which has no Premium job; it also passed but is not relied on.) A later documentation-only commit on this branch is not itself re-run. |
| Real staging, real Stripe, real Supabase, real backend with `professional` | **NOT TESTED** (not authorised; staging RED) |

## 4. Matrix for the founder's staging acceptance (additions to F-01–F-12 / F-08d/e in the main report)

| ID | Check | Local | Real staging |
|---|---|---|---|
| D23-1 | A professional-services business sees Professional services guidance, labelled as worked out, setup completes | PASS (mock) | NOT TESTED |
| D23-2 | With the flag off, the API never receives `professional`; with the flag on and the backend change deployed, it is saved and reloads as chosen | PASS (mock, both) | NOT TESTED; needs backend enum + CHECK + contract + migration |
| D23-3 | Billing shows plan/credits/period exactly as the API returns them; no price; no 60 unless returned | PASS (mock) | NOT TESTED (real subscription needed) |
| D23-4 | Stripe return without entitlement says "not active yet", never "paid"/"confirmed"; Check again works | PASS (mock) | NOT TESTED (Stripe test mode only, with approval) |
| D23-5 | Calendar loads once, states window and open-campaign-only scope | PASS (mock) | NOT TESTED |

F-01–F-12 and F-08d/e results in `BG_STUDIO_017_FE_REPORT.md` are unchanged and remain NOT TESTED against real staging.

## 5. Outstanding items and founder review

1. **Pricing and terms canon:** supply it (with its source) if one exists in Mission Control; none was found in code or Issues, so no price is shown.
2. **Backend change for the sector** (section 2.1), including the preflight contract and a forward migration; Codex/backend owns it and it needs approval.
3. A **single-campaign** calendar is all the API offers; a workspace-wide calendar would need a backend endpoint.
4. Cancel, change plan, invoices and portal remain unimplemented (no customer API).
5. Review the new customer wording (section 2.4) for tone (F-10).

No merge, deployment, migration, flag activation, paid call, Stripe activity, secret or IAM change was made, and no Mission Control record was created or altered.
