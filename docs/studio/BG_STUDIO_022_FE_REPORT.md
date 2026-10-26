# BG-STUDIO-022-FE — competitor intelligence, Growth Control Centre, experimentation (frontend)

26 October 2026. Frontend draft only. **Staging RED. Launch NO-GO.** Nothing was merged, deployed, migrated, activated, paid for, connected or published; no backend source was changed; no external data was collected beyond a handful of public web searches for pricing. Status words: NOT STARTED / DESIGN COMPLETE / IMPLEMENTED LOCAL / MOCK-TESTED / BACKEND INTEGRATED LOCAL / STAGING VERIFIED / FOUNDER ACCEPTED. **Nothing below is STAGING VERIFIED or FOUNDER ACCEPTED.**

## 1. Executive summary

* The competitor audit is a **new baseline, not a refresh**: the six canonical intelligence documents and the previous action matrix could not be found in either repository, in issues, or on disk, and vendor pricing pages could not be reached. The matrix says this on its first page, labels every price as secondary-source and conflicting, and invents no revenue, user count or sentiment.
* Recovered canon: bizgenie-api **#129** (closed-loop architecture; G1 experiments, G2 offers, G7 competitor patterns, G8 Growth Control Centre; prohibitions on duplicate stores and causal claims), **#128**, **#77**, **#191**, **#197**. #129 had placed G1/G7/G8 "post-launch/later"; this work order pulls them forward, which the matrix records openly. The #129 prohibitions are applied.
* Built (frontend, device-local where no backend exists): Growth Control Centre (one new lazy-loaded nav item), goal-first strategy, experiment planner, product-details intake, reference-based creative ideas, and a rebuilt Results and insights view on the backend's **canonical** performance models, proven against the backend's own reference registry.
* Housekeeping found and fixed: earlier commits in this stack had committed build output (`dist-*`) and ~776 Playwright artefacts; they are untracked and ignored now. They remain in earlier commits' history (PR #54/#53 diffs); not rewritten.
* Not done: any backend persistence (CI-01..CI-05), a competitor-admin UI, the customer-facing market-signal view, and the full 5 industries × owner/member × 18 stages cross product.

## 2. Branch, SHA, PR, CI

| Item | Value |
|---|---|
| Branch | `bg-studio-022-fe-intelligence`, stacked on `bg-studio-021-fe-integration` (PR #54, head `7816777`) |
| Tested code SHA | `62b111130f3074d64d344337c847af2358d26585` (code at `3137ae5` plus one test correction; docs commits after it change only `docs/`) |
| Draft PR | [#55](https://github.com/shirrie01/bizgenie-web/pull/55) |
| Backend read | bizgenie-api #217 `23f49038f36acf8414a079e27a8d5ffc8d302f2b` |
| Hosted CI | [run 40](https://github.com/shirrie01/bizgenie-web/actions/runs/40408312171) at the exact SHA (`ref` and `expected_sha` both `62b1111…`; SHA guard passed): **13 of 13 jobs success on attempt 1**. Run 39 on `3137ae5` had found a real test defect (section 6) and was cancelled |

## 3. Competitor action matrix and findings

See `docs/intelligence/BG_STUDIO_022_COMPETITOR_ACTION_MATRIX.md`: evidence limits, canon constraints, 11 competitor profiles with confidence, 11 classified findings (ADOPT / DIFFERENTIATE / ARCHITECTURE NOW / RESEARCH), top-five patterns, pain gaps, a statement that revenue/demand signals cannot be established from the evidence gathered, feature-gap assessment and differentiation recommendation.

Top competitive opportunities (all inferential, see confidence column): (1) a visible closed loop objective→creative→measure→learn with honest evidence states; (2) structured one-variable experiments instead of volume; (3) goal-first strategy by industry; (4) generic-AI complaint answered by Brand Brain + owner-approved product facts; (5) credit-metered AI with a binding, confirmed price (already built).

## 4. Feature status

| Feature | Status | Notes |
|---|---|---|
| Growth Control Centre | **IMPLEMENTED LOCAL, MOCK-TESTED** | objective → performance → pipeline → experiments → actions; campaign links open Campaign Studio; platform data only through injected, validated snapshot; gates-on browser tests at 5 widths (axe clean) for owner and member. Context kept across navigation within a session; reload persistence only where the backend persists (campaigns, calendar). CI-05 would add a server read model |
| Creative experimentation | **IMPLEMENTED LOCAL, MOCK-TESTED** | 7 types, one controlled variable, hypothesis, metric, window, six honest states with stated thresholds; plans are **device-only** (CI-01). Results/publication linkage NOT connected, so every plan stays "planned" |
| Product / website intelligence | **IMPLEMENTED LOCAL, MOCK-TESTED**; extraction **disabled** | four fact kinds, owner approval, Brand Brain diff proposal only (never written); server ingest contract (SSRF controls) in the handoff (CI-02) |
| Reference creative workflow | **IMPLEMENTED LOCAL, MOCK-TESTED** | original briefs for the existing generation box, brand marks removed, rights confirmed, states exactly what was analysed (description only); no second generation path |
| Goal-first strategy | **IMPLEMENTED LOCAL, MOCK-TESTED** | 8 objectives; five-industry fixtures; wholesale beverage = trade acquisition; assumptions and "not a forecast" shown |
| Analytics / Learning Brain | **BACKEND INTEGRATED LOCAL (validators vs reference registry, in-process); no routes exist** | canonical `performance-observation/snapshot/recommendation.v1`; `causal_claim:false` enforced; customer attestation never shown as measured; decisions device-only (R12-Q1 open) |
| Market-signal / recommendation view (CI-03/04) | **DESIGN COMPLETE** (handoff) | no customer UI |
| Competitor admin (P1) | **NOT STARTED** (design in handoff) | recommends reuse of Mission Control Competitor/Benchmark Review |
| Pricing intelligence (P1) | **DESIGN COMPLETE** | evidence + caveats in the matrix; no BizGenie price set or proposed |
| Creator/affiliate (P1) | **DESIGN COMPLETE** | reintegration trigger (live product + 100 paying customers) not met; no marketplace built; reuse points: rights/provenance, attribution |
| Premium navigation | **IMPLEMENTED LOCAL** | one item added ("Growth centre"); the Premium bar now has 11 entries, which is on the edge of crowded. Recommendation for founder review: fold "Results and insights" and "Accounts and publishing" under the Growth centre |

## 5. Existing blockers (unchanged by this work)

R1, R3, R4/R5, R8, R11 remain open exactly as in the 021 handoff. R12 is now specified precisely (handoff). New asks: CI-01..CI-05 and R12-Q1.

## 6. Tests and measurements

| Check | Result |
|---|---|
| `npx vitest run` (default) | **934 passed, 35 skipped** (50 files + 3 skipped) |
| Local integration vs backend #217 with a throwaway PostgreSQL | **35 passed** (quote/confirm 16, draft routes 15, performance evidence 4) |
| Intelligence unit tests | 38 model tests, 10 component tests, 25 five-industry acceptance tests |
| Gates-on browser matrix, 1440/1024/768/390/320 | **13 passed per width** (axe WCAG 2.x A/AA clean; no horizontal overflow). One 320 px target-size defect (checkbox) found and fixed |
| **Gates-off premium matrix, 1440/1024/768/390/320** (the gap from 021) | **52 passed at each of the five widths** on a build taken before the last styling/analytics edits; the same matrix is part of the hosted run below |
| Flag-off: build, app a11y (2), preview contract (5), preview browser (33) at 1440 and 390 | all pass |
| Flag-off DOM equivalence vs the 018 snapshots | **identical** (7 captures) |
| Initial JS (gzip), flag off | **149,522 B** (021: 150,151 B; 018: 150,151 B) |
| Growth Centre lazy chunk | 12,842 B gz (loads only when the view opens); PremiumStudio 20,098; PremiumInsights 3,340; CSS 5,254 |
| Hosted CI run 40, `62b1111` | 13/13 green, attempt 1, including the gates-on matrix at 5 widths and gates-off premium matrix at 4 CI widths |
| Hosted CI run 39, `3137ae5` (superseded) | **premium-browser 1440 FAILED (real, not infrastructure)**: a 021-era gates-on assertion said there is no invoice list, but the 021 invoice feature added a "Show invoices" button. It passed locally only because it raced the lazily loaded panel. The assertion was corrected (button visible, nothing fetched until pressed); run cancelled while other jobs were still running |
| Not tested | real assistive technology, real devices/networks, first-navigation timing, staging |

## 7. Journey acceptance matrix (honest)

The full cross product (5 industries × owner/member × 18 stages) was **not** run end to end. What exists:

* Browser, flag-on, mocked API: five-industry overview isolation (owner), onboarding/Brand Brain owner and member rules, workspace switching and resume, calendar, billing views, gates-on Growth Centre (owner and member).
* Model-level, five industries × owner/member: recognition of the industry, goal reading, strategy without forecasts, owner-only approval, original reference briefs, one-variable experiments (`acceptance.matrix.test.js`).

Stage classification (identical for every industry unless noted; none is STAGING VERIFIED or FOUNDER ACCEPTED):

| # | Stage | Class |
|---|---|---|
| 1 | Offer / landing | MOCK-TESTED |
| 2 | Sign-up / sign-in | MOCK-TESTED (identity mocked) |
| 3 | Payment / checkout | MOCK-TESTED (Stripe-hosted, mocked; no live Stripe) |
| 4 | Workspace bootstrap | MOCK-TESTED |
| 5 | Onboarding (industry-specific) | MOCK-TESTED, all five industries, owner and member |
| 6 | Brand Brain | MOCK-TESTED, owner/member rules |
| 7 | Goal and strategy (industry-specific) | MOCK-TESTED, five industries × owner/member (model level) |
| 8 | Campaign create / manage | BACKEND INTEGRATED LOCAL (campaign routes) + MOCK-TESTED |
| 9 | Text drafts | MOCK-TESTED; price preview BACKEND INTEGRATED LOCAL |
| 10 | Image / video quote → confirm → job | BACKEND INTEGRATED LOCAL (real routers + PostgreSQL; harness-run worker) |
| 11 | Preview / approval | Backend lifecycle proven in the harness only; **product BLOCKED (R3)** |
| 12 | Calendar / schedule | BACKEND INTEGRATED LOCAL |
| 13 | Social connection | **BLOCKED (R11)** |
| 14 | Publish | Manual publication BACKEND INTEGRATED LOCAL; autonomous **BLOCKED** |
| 15 | Measure | Customer-entered: existing route; platform-measured **BLOCKED (R12)**; validators BACKEND INTEGRATED LOCAL vs reference registry |
| 16 | Learn | **BLOCKED**; recommendation validators only |
| 17 | Billing management | MOCK-TESTED; draft router BACKEND INTEGRATED LOCAL (unmounted, R8) |
| 18 | Return sessions / workspace switching | MOCK-TESTED |

**The journey is not end to end.** Stages 11, 13, 14 (autonomous), 15 (platform), 16 are blocked or harness-only.

## 8. Founder decisions required

1. Confirm the sequencing change: #129 put experiments/competitor patterns/Growth Control Centre after launch; this order pulls them forward. Confirm they should stay inside the pre-launch scope or be gated off.
2. Where governance records (competitors, signals, pricing history) are authoritative (Sheets vs backend), and whether to extend Mission Control Competitor/Benchmark Review.
3. Provide the six canonical intelligence documents and the previous action matrix (or a path to them), so the matrix can be refreshed on real canon.
4. Pricing canon (still unprovided); the competitor price evidence is not a recommendation.
5. Approve R12-Q1 (how a recommendation gets its hash) and CI-01..CI-05 as Codex work.
6. Navigation: fold Results/Accounts under Growth centre?
7. S1 staging isolation (the £1/30-day ceiling is not approved).

## 9. Mission Control reconciliation handoff (no write made; not accessible)

Evidence: this report, the matrix, the 022 handoff, PR #55, CI run. New rows suggested: CI-01..CI-05 (Codex), R12-Q1, "canonical intelligence docs not located", "build artefacts were tracked in PR #53/#54 history", "analytics adapter rebuilt on canonical models (removes the 020 proposed schema)". Corrections: the 020/021 statement that the analytics adapter was aligned to a proposed contract is superseded.

## 10. Next controlled sequence

1. Founder: documents, sequencing, governance location. 2. Codex: R1, R3, R12 routes and hash rule, CI-01, CI-02 (with SSRF design review), R8, R11. 3. Frontend: wire real routes behind existing gates as they appear and flip the harness; customer market-signal view after CI-03/04; competitor admin prototype; full per-industry browser journey; AT/real-device testing. 4. Isolated staging only after separate approval.
