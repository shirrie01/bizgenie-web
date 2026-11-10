# BG-STUDIO-021-FE — Premium integration, quote/confirm, creative studio (frontend)

26 October 2026. Frontend draft only. **Staging RED. Launch NO-GO.** Nothing was merged, deployed, migrated, activated, paid for, connected or published. Mission Control was unreachable; section 12 is an evidence handoff. Contract detail is in `BG_STUDIO_021_FRONTEND_BACKEND_HANDOFF.md`.

## 1. Executive summary

Done: the frontend now speaks the backend's real durable `generation-quote.v1` contract (quote → confirm → queued job → status → cancel), verified locally against bizgenie-api PR #217 with its own routers and a throwaway PostgreSQL. Image and video use binding quotes; text keeps a non-binding price preview. Real-route execution corrected several assumptions (the quote key must derive from the whole request; confirm means "queued", not "done"; finished ≠ approved ≠ published). Also added: add-content-item, owner invoice list, gates-on browser matrix, harness for the new routes.

Not done, stated plainly: hybrid UGC+AI (no backend routes), social connection/publishing (no backend routes), analytics/Learning Brain (frontend adapter still targets an earlier proposed shape; to be re-aligned to the backend reference models once routes exist), media library, campaign-detail persistence (R1, backend), product-level worker dispatch and output attach (R3), the 5-industry × owner/member × 18-stage journey matrix, and a full re-run of the 52×5 gates-off and flag-off/bundle regressions in this session. The journey is therefore **not** claimed end to end.

## 2. Branch, SHA, PR, CI

| Item | Value |
|---|---|
| Branch | `bg-studio-021-fe-integration`, stacked on `bg-studio-020-fe-integration` (PR #53) |
| Tested code SHA | `0ec0aca6870d15d06820bd5353477c3e170b712b` |
| Backend verified against | bizgenie-api PR #217 `23f49038f36acf8414a079e27a8d5ffc8d302f2b` (hosted CI there not verified by me) |
| Draft PR | [#54](https://github.com/shirrie01/bizgenie-web/pull/54) |
| Hosted CI | [run 38](https://github.com/shirrie01/bizgenie-web/actions/runs/40395128502), exact SHA, `ref` and `expected_sha` both the tested SHA. **13 of 13 jobs success on attempt 2** (attempt 1: 12 of 13; app-a11y 320x568 failed in the Chromium apt install step after ~12 min, before any test ran = infrastructure; only that job re-run, once) |

## 3. Five directions

| # | Direction | Status |
|---|---|---|
| A | Pricing/terms | TESTED — MOCK + real route; BACKEND BLOCKED (no approved catalogue); canon not supplied |
| B | Calendar + billing management | Calendar INTEGRATED LOCALLY; management/invoices local against unmounted draft router (R8) |
| C | Image/video/hybrid | Image/video quote→confirm→job INTEGRATED LOCALLY; viewing/approval blocked on R3 in the product; hybrid BACKEND BLOCKED |
| D | Authoritative quote + confirm | **INTEGRATED LOCALLY** (16 harness tests); staging unverified |
| E | Campaign management + manual publication | INTEGRATED LOCALLY; persistence across devices needs R1 |

## 4. Image / video / hybrid

Quote shows price, availability and expiry; confirm sends a stored idempotency key reused on every retry (never re-keyed after an uncertain outcome); double-click, refresh/resume, expiry, changed brief (price discarded) and cancel-before-start are covered by unit and browser tests. States shown: loading, available, insufficient, expired, changed, confirmation pending, accepted/queued, running, completed, failed, cancelled, uncertain. "Finished is not approved and not published." No raw storage addresses are shown. Video offers only the normal/premium quality the backend prices; destinations without a preview profile are refused with a clear message. Hybrid is a disabled blocker message (R4/R5).

## 5. Social, analytics, learning

Unchanged from 020: gated, off, honest "nothing connected / nothing measured" views and fixture-only validated adapters. **BLOCKED** (R11, R12). The backend now has reference performance models (`performance-observation.v1`, `performance-snapshot.v1`, `evidence-recommendation.v1` with `causal_claim:false`) but no routes; re-alignment of the frontend adapter is the next frontend step.

## 6. Pricing and billing

Server-authoritative; owner-only management; Stripe-hosted confirmation is never shown as an entitlement change. Invoice list: status from Stripe, missing numbers/links shown as missing, only `invoice.stripe.com` links. No price or term exists in source.

## 7. Tests

| Check | Result |
|---|---|
| `npx vitest run` (default) | 871 passed, 31 skipped (harness skips without backend), 48 files + 2 skipped |
| Quote/confirm harness vs #217 (`BIZGENIE_API_DIR`, `TEST_DATABASE_URL`) | 16 passed |
| Draft-route harness vs #217 | 15 passed |
| Gates-on browser matrix, 1440/1024/768/390/320 | 10 per width at last local run; axe clean |
| Gates-off 52×5, flag-off DOM equivalence, bundle size | **Not re-run in this session** (last verified on 020: initial JS 150,151 B gz). Treat as unverified for this head |
| Hosted CI run 38 at `0ec0aca` | 13/13 green on attempt 2 (see section 2); premium gates-on matrix ran in CI at 1440/768/390/320 |

## 8. Backend dependencies

R1, R3 (worker dispatch, output attach), R4/R5, R7, R8, R11, R12 — see handoff.

## 9. Founder decisions

Pricing/terms canon; approve R1/R3 next; paid image/video spend cap; media rights wording with Legal; provider-specific social review before any OAuth; S1 staging isolation (the proposed £1/30-day ceiling is not approved).

## 10. Mock versus real

Real: backend routers and PostgreSQL schema locally. Mock: identity, Stripe, providers, browser journeys. Not real anywhere: staging, deployed services, Stripe test mode, providers, OAuth.

## 11. Implemented / Mock-tested / Integrated locally / Staging-verified / Founder-accepted

| Capability | Implemented | Mock-tested | Integrated locally | Staging | Founder |
|---|---|---|---|---|---|
| Quote/confirm (image, video) | yes | yes | yes | no | no |
| Text price preview | yes | yes | yes | no | no |
| Calendar, campaign mgmt, manual publication | yes | yes | yes | no | no |
| Invoices, subscription management | yes | yes | yes (unmounted router) | no | no |
| Plan catalogue | yes | yes | 503 path only | no | no |
| Hybrid UGC+AI | blocker only | — | — | no | no |
| Social connect/publish | gated adapter | fixtures | no | no | no |
| Analytics / Learning Brain | gated adapter | fixtures | no | no | no |

## 12. Mission Control handoff (no write made)

Evidence: branch/SHA/CI above; compatibility matrix and R-list; finding that quote idempotency must be request-derived; the product lacks worker dispatch/attach (R3). Debt candidates: R1 persistence, R8 mount, analytics adapter re-alignment, journey matrix. Write by identifier.

## 13. Next sequence

1. Codex: R1, R3, R8, then R4/R5, R11, R12. 2. Frontend: re-align analytics to reference models; social to `contract.js`; re-run full regressions and bundle measurement; journey matrix. 3. Founder: canon, spend cap, S1 approval. 4. Only then isolated staging.
