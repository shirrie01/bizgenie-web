# BG-PROGRAMME-001 — master integration plan

27 Oct 2026. Plan only; nothing executed.

## Sequence and critical path
1. Founder decisions D0–D10 (see register).
2. Backend: migration rehearsal → merge #218 tip → staging with S1 approval. **Critical path to any real-environment evidence.**
3. Frontend: socialClient rewrite, media/creative-job UI adoption → merge #56 (gates OFF) → merge #57.
4. Parallel track A (independent): website — founder facts, lead route (Codex), strict build, preview, DNS.
5. Parallel track B (external): Meta access verification, then App Review.
6. Founder-assisted pilot with 3–5 businesses on staging.
7. Manual-entry learning loop → first recommendation.
8. Only then: real publish, ingestion, then Ring-1 gaps (video/editing/Genie/Creative Director) per D1.

## Stop-doing list
New record-only PRs for CI results; a second competitor register; new Studio feature slices before merge; further fixture-only Growth work; building video/Genie before the pilot proves demand; rewriting history.

## Allocation
| Owner | Work |
|---|---|
| Claude (FE) | socialClient, media UI, campaign discovery adoption, insights wiring, website changes, hosted-CI exact-SHA runs |
| Codex (BE) | media lineage reconcile, lead route + retention/export/deletion, calendar endpoint check, billing mount behind flag, analytics manual-entry route, row-level contract version |
| Founder | decisions, company/legal facts, pricing, Meta path, DNS/host approvals, Stripe/S1 approvals, first customers |

## Plan windows (from 27 Oct 2026)
* **7 days (to 3 Nov):** D0, D1, D4, D8, D10; Codex starts lead route and media reconcile; Claude starts socialClient/media UI.
* **14 days (to 10 Nov):** migration rehearsal, #218 merge decision, lead route green on `site/contract`, pricing/payment decision.
* **30 days (to 26 Nov):** #56 and #57 merged; website on preview; staging with approved ceiling; first pilot business onboarded.
* **60 days (to 26 Dec):** 3–5 founding customers; first manual publication and results; first Learning recommendation; Meta access verification submitted by 25 Dec.
* **90 days (to 25 Jan 2027):** first renewal; App Review submitted/progressing; real publishing only if approved; decide Ring-1 gaps by evidence.

## Release control plan (not executed)
Per release: exact SHA, hosted CI via dispatch with `expected_sha`, gates OFF at merge, flag-by-flag enablement in staging, rollback = revert merge + flag off, DNS TTL lowered before cutover.
