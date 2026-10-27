# BG-STUDIO-023-FE — launch acceptance and integration readiness (frontend)

27 October 2026. Draft only. **Staging RED. Launch NO-GO.** Nothing merged, deployed, migrated, paid for, connected (no OAuth) or published; no secrets changed; no external business data collected; every capability gate remains OFF by default.

## 1. Canonical state verified first

| Item | Value |
|---|---|
| Frontend `main` | `e9e5a1f4f208787248fc9dd18ee8f5df1c60d05a` (unchanged) |
| Frontend draft stack | #53 `ac2c14f`, #54 `7816777`, #55 `1b43ce3`; this work is #56 on branch `bg-studio-023-fe-acceptance` |
| Backend drafts | #217 `23f49038…` and **#218 `9346055a4b0c2057f8ab13274396ecf502296ed6`** (BG-STUDIO-021-BE; new since the last frontend report) |
| Newer work superseding the handover | none found (frontend open PRs #46–#56; backend #211–#218) |
| Tested frontend SHA | `611d115a28dbf3826dd5d53817c583dd4d36b434` |
| Draft PR | [#56](https://github.com/shirrie01/bizgenie-web/pull/56) |
| Hosted CI | [run 41](https://github.com/shirrie01/bizgenie-web/actions/runs/40423781584) at the exact SHA (`ref` = `expected_sha` = `611d115…`; SHA guard passed): **13 of 13 jobs success on attempt 1** (no infrastructure re-run needed) |

## 2. What changed because of backend #218

#218 delivers much of what the earlier handoffs asked for, so the frontend was re-run against it instead of assumed:

* **Compatibility matrix** (exact routes, shapes, default-off behaviour, adoption status): `BG_STUDIO_023_BACKEND_HANDOFF.md` §1. Evidence: `qa/integration/backend218.integration.test.js` (6 tests) plus the earlier harnesses, **41 integration tests pass against #218** with a throwaway PostgreSQL.
* **Two real incompatibilities found and fixed:** (1) persisted snapshot rows carry no row-level `contract_version`, which the 022 validator required (real data would have shown as "no data"); (2) the recommendation hash does not exist: the backend identifies a recommendation by `recommendation_id` and feedback is `{recommendation_id, decision, expected_version, idempotency_key}`. Frontend now builds exactly that body, with one idempotency key per decision, and refuses to accept a recommendation whose `evidence_state` is `unavailable`.
* **R1 adopted:** `current_schedule`, `manual_publication`, `publication` read from the campaign detail; browser-remembered ids remain a labelled fallback.
* **One defect NOT fixed (needs a rewrite):** `socialClient.js` still calls `/customer/social-accounts` and `/customer/publishing-queue`, which do not exist (the real mount is `/customer/social/*`). The social view therefore cannot talk to #218 and stays gated off.
* **Not adopted yet:** creative-jobs list/detail/attach UI, customer media library, campaign discovery, concrete wiring of `/customer/insights/*` into the Growth Centre. All listed in the matrix.

## 3. Five industries × owner/member × 18 stages

**Honest reading: the full 90-cell cross product is not an end-to-end test and is not claimed as one.** Stages are classified once (they are identical for every industry unless noted). Cells for the five industries (vehicle leasing, professional services, aesthetics, fragrance, beverages) and the two roles are covered as follows.

Classes: MOCK-TESTED (browser/unit with mocked API) · BACKEND-ROUTE LOCAL (the frontend or a plain HTTP call against #218's real routers + PostgreSQL + synthetic fixtures) · BLOCKED (named reason). None is STAGING VERIFIED or FOUNDER ACCEPTED.

| # | Stage | Industry-specific? | Owner / member coverage | Class |
|---|---|---|---|---|
| 1 | Offer / landing | no | public page; no role | MOCK-TESTED (preview checks) |
| 2 | Sign-up / sign-in / session end | no | both | MOCK-TESTED (identity mocked) |
| 3 | Payment / checkout | no | owner pays; member cannot manage (tested) | MOCK-TESTED (Stripe-hosted, mocked) |
| 4 | Workspace bootstrap / switching | no | both | MOCK-TESTED |
| 5 | Onboarding | yes | **5 industries × owner and member (browser)**; member is read-only | MOCK-TESTED |
| 6 | Brand Brain | yes | both; identity fields owner-only | MOCK-TESTED |
| 7 | Goal and strategy (Growth centre) | yes | **5 industries × owner and member (browser + 25 model tests)**; wholesale beverage reads as trade acquisition | MOCK-TESTED |
| 8 | Campaign create / manage / reload | partly | owner writes, member reads | BACKEND-ROUTE LOCAL (R1 nested facts, discovery, management) + MOCK-TESTED |
| 9 | Text draft + price preview | yes (copy) | owner | MOCK-TESTED; preview BACKEND-ROUTE LOCAL |
| 10 | Image / video quote → confirm → job | no | owner confirms; member reads | BACKEND-ROUTE LOCAL (16 + 1 tests incl. queued job in list/detail). Worker is the harness's, not a product worker |
| 11 | Preview / approval | no | owner | Backend lifecycle proven in backend tests; **frontend job list/detail/attach UI not built → BLOCKED (frontend adoption + product worker/storage composition)** |
| 12 | Calendar / schedule | no | both read; owner writes | BACKEND-ROUTE LOCAL |
| 13 | Social connection | no | owner | **BLOCKED**: backend route exists (`/customer/social/*`, synthetic connector only); frontend client targets wrong paths; no real app/connector; Meta business verification in review |
| 14 | Publish | no | owner | Manual publication BACKEND-ROUTE LOCAL; autonomous: dispatch enqueue/list/calendar BACKEND-ROUTE LOCAL (never "published" without a platform result), **BLOCKED** for real publishing |
| 15 | Measure | no | owner/member read | Customer-entered: existing route. Platform-measured: persisted snapshot BACKEND-ROUTE LOCAL via backend's trusted ingestion fixture; **no public ingestion; frontend client not wired → BLOCKED** |
| 16 | Learn (recommend → accept → future context) | no | owner decides, member reads | BACKEND-ROUTE LOCAL (full journey over HTTP incl. replay, version conflict, evidence withdrawal). Frontend UI MOCK-TESTED; not wired to the route |
| 17 | Billing management / invoices | no | owner | MOCK-TESTED; draft routers **unmounted** (R8) → BLOCKED for real use |
| 18 | Return sessions / reload / workspace switch | no | both | MOCK-TESTED (resume, switch, stale responses) |

Pricing: the approved commercial catalogue / pricing canon was **not found** in any accessible source (section 6). Stage 3 and 17 therefore cannot show real prices.

## 4. Capability gates and default-off evidence

All `VITE_*` gates default to off (unchanged). Backend optional services are unavailable by default and return 503 with a stable code (`SOCIAL_NOT_CONFIGURED`, `LEARNING_UNAVAILABLE`, `MEDIA_INTAKE_UNAVAILABLE`, `CREATIVE_JOBS_UNAVAILABLE`, `GENERATION_BILLING_UNAVAILABLE`); asserted by `backend218.integration.test.js`.

## 5. Final-head regression results (SHA `611d115`)

| Check | Result |
|---|---|
| `npx vitest run` | **939 passed, 41 skipped** (51 files + 4 skipped); skips are the integration harnesses without a backend |
| Integration vs #218 (`BIZGENIE_API_DIR`, throwaway PostgreSQL) | **41 passed** (quote/confirm 16, draft routes 15, evidence reference 4, #218 routes 6) |
| Gates-off premium browser matrix, 1440/1024/768/390/320 | **57 passed at each of the five widths** (was 52; +5 for member-role industries; includes axe WCAG 2.x A/AA, overflow, five industries × owner/member) |
| Gates-on browser matrix, same widths | **13 passed at each width** |
| Flag-off: build, preview contract (5), app a11y (2), preview browser (33) at 1440 and 390 | all pass |
| Flag-off DOM equivalence | **identical** to the 018 snapshots (7 captures); checked on the 022 head, with no flag-off code changed since |
| Initial JS (gzip) flag off / on | **149,603 B / 149,637 B** (018 baseline 150,151 B) |
| Lazy chunks (gzip) | PremiumStudio 20,098 · GrowthCentre 12,841 · PremiumBilling 6,723 · CreativeStudio 4,257 · PremiumInsights 3,845; CSS 5,254 |
| Not tested | real assistive technology, real devices/networks, first-navigation timing, staging |

Reproduce: `BIZGENIE_API_DIR=<#218 checkout> TEST_DATABASE_URL=<throwaway superuser> npx vitest run qa/integration`; the browser matrices run from `qa/premium*.mjs` via the configs named in `.github/workflows/studio-005-integration-ci.yml`.

## 6. Document and canon search

The six original intelligence documents (`90_INTEL__BizGenie_Market_Intelligence_System_v1.0`, Data Intelligence & Moat Strategy, Content DNA Framework, Content Learning Engine, Creative Capability Framework, Creator Economy Model) and the **pricing canon** remain **MISSING**. Searched again: GitHub code search across `shirrie01`, backend `docs/` (`docs/product/BizGenie_Canon_v2.md` says explicitly it does not approve pricing), backend `src/`, frontend history (`git log -S`), and the local file system. Their status stays MISSING; nothing replaces them. The backend's own contract documents also report that no locked prices/terms were accessible.

## 7. Hosted CI

**Run 41, SHA `611d115a28dbf3826dd5d53817c583dd4d36b434`: 13/13 jobs green, attempt 1** (unit-build; app-a11y, preview and premium-browser at 1440/768/390/320 including the gates-on and the five-industry owner/member specs).

**Follow-up commit after the tested SHA (code, not docs):** `button.link` style added to `src/styles.css`. Found while taking public-site screenshots: the Growth centre's inline text-link buttons had no style and rendered as large black pills inside sentences (a visual defect not caught by the accessibility checks). It is a CSS-only change; it was checked by re-running the five-industry spec locally (57/57 at 1440) and has its own hosted run, recorded below.

## 8. Remaining blockers

Pricing canon and the six documents (founder) · Meta business verification in review (see `BG_STUDIO_023_META_READINESS_CHECKLIST.md`) · real connector, token vault, product worker, storage, inspector (backend, separately authorised) · public ingestion path for platform metrics · R8 mounting · frontend rewrites: social client, creative-jobs/media UI, discovery, insights client wiring · S1 isolation (the proposed £1/30-day ceiling is not approved) · artefact cleanup decision (`BG_STUDIO_023_ARTEFACT_AUDIT.md`).
