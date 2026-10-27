# BG-PROGRAMME-001 — canonical source index

27 October 2026. Read-only reconciliation. Nothing was merged, deployed, migrated, activated or written to Mission Control.

## 0A. Founder-verified governance corrections (27 Oct 2026, from review of PR #58)
Authority: founder, against live Mission Control. Not independently read by me.
* Mission Control = canonical governance register, 17 tabs. `DEC-015`: GitHub #191 is an engineering cross-reference, not a second Mission Control.
* `DEC-014` supersedes `DEC-009`: core Learning Brain, Hybrid UGC and social connection are **PRE-LAUNCH**. #128 remains the launch contract, read with #191 and Mission Control.
* `LOCK-015`: preserve previously verified PASS evidence. `DEC-020`: Architecture A onboarding approved, implementation gated. `DEC-025`: workspace calendar required before full launch.
* No final public pricing or credit tariff approved.
* Source Pack v1.2, Intelligence Pack v1.0 and the operational ledger **are available to programme control**. They are inaccessible **only within this session**; earlier wording calling them "missing" is withdrawn.

## 0. What this session could and could not read

| Required first read | Result |
|---|---|
| Mission Control (canonical Google Sheets register, **17 live tabs** per founder) | **Exists and is canonical; NOT READ BY THIS SESSION** (docs.google.com unreachable; Drive connector not connected). Governance findings in §0A are founder-verified |
| `SRC-002` Operating Constitution | **NOT READ** (Drive) |
| Source Pack v1.2 (`SRC-009`/`VER-002`), its Operational Ledger `.xlsx`, Intelligence Pack v1.0 (`SRC-010`) | **NOT ACCESSIBLE.** No attachment is present in this session, in either repository, or on the local file system. Their content below is known **only** through quotations in GitHub issue #190 and other repository documents, and is labelled as such |

Consequence: every "Mission Control" column in this programme's documents is **unverified by me**. Where a statement depends on the register, it cites the repository document that quotes it (for example Canon v2 quoting `DEC-011 / LOCK-017`). The `LOCK-002`/`LOCK-004` duplicate, stale `CURRENT_STATUS` rows and shifted `LAUNCH_BLOCKERS`/`DASHBOARD` cells described in the founder's note could not be inspected, so no correction is proposed against specific cells (see `BG_PROGRAMME_001_REGISTER_CORRECTIONS.md`). **Fastest remedy: connect the Google Drive connector (one founder action in claude.ai connector settings) or export the workbook tabs as CSV/XLSX into a private location; a re-run of Phase 9 then takes minutes.**

## 1. Repository state at the time of reading (verified from GitHub and native git)

| Item | Value |
|---|---|
| `bizgenie-api` default branch `main` | `ddcc26cb4111303f0c8fbf9745db5fed1e40ca6f` (20 Oct; "record founder-locked public campaign tagline (#187)") |
| `bizgenie-web` default branch `main` | `e9e5a1f4f208787248fc9dd18ee8f5df1c60d05a` |
| Open PRs | web **27** (all draft): #25, #27, #34–#57; api **20** (all draft): #167, #175, #189, #204–#218. **No PR in either repository is ready or merged beyond `main`** |
| Newer work than the previous checkpoint | web #56 (BG-STUDIO-023) head `205a983`, #57 (BG-WEB-001) head `0077c7b`; api #218 (BG-STUDIO-021-BE) head `9346055a4b0c2057f8ab13274396ecf502296ed6`. Nothing newer than these |
| Hosted CI (verified from GitHub, not from reports) | api #217 `23f4903`: *Node 22 tests and syntax* success, *Docker and Buildpack artifact checks* success. api #218 `9346055`: both success. web #56: 13/13 on `611d115` and `cf5fec9`; web #57: Website CI 6/6 and Frontend CI success on `a21184a` (`0077c7b` is docs-only after it) |

## 2. Source reconciliation table (required output)

Columns: Source ID | Current authority | Version/SHA | Status | Supersedes | Evidence | Conflicts | Recommended action. "MC" = the field would come from Mission Control and is unread.

| Source ID | Current authority | Version / SHA | Status | Supersedes | Evidence | Conflicts | Recommended action |
|---|---|---|---|---|---|---|---|
| `SRC-001` Mission Control | Primary programme authority (founder, 27 Oct) | MC revision **unread** | ACTIVE — **unreadable here** | — | Founder instruction; `DEC-015` ("Google Sheets Mission Control Register v1.0 canonical") is quoted in api `docs/studio/*` and web docs | Cannot test the founder's noted duplicate `LOCK-002`/`LOCK-004`, stale `CURRENT_STATUS`, shifted cells | Connect Drive or export tabs; re-run Phase 9; apply nothing blind |
| `SRC-002` Operating Constitution | Governance and sync rules | unread | ACTIVE — unread | — | Founder instruction | — | Read before any register write |
| `SRC-019` / `VER-009` BizGenie Canon v2 (`BG-DOC-001`) | Product identity, philosophy, launch boundary (Ring 1/2/3), no-drift rules | api `docs/product/BizGenie_Canon_v2.md` at `ddcc26c` (tagline lock 20 Oct) | ACTIVE — **read in full** | Older positioning documents | File read; quotes `DEC-011 / LOCK-017` (tagline); "Locked Launch Capability Boundary" | Ring 1 boundary (image/video/UGC/hybrid, editing, scheduling and publishing, analytics) is wider than the frozen #128 first-revenue contract; see §3 | Treat Canon as **product** authority and #128 as **launch-sequencing** authority; no action: resolved by `DEC-014` |
| `SRC-018` GitHub issue #128 BG-LAUNCH-FINAL | Frozen first-paying-customer contract L1–L5 | issue updated 21 Oct; 32 comments; **comment 6318191195** (21 Oct) records the founder decision that core Learning and Hybrid are PRE-LAUNCH (cited by #191) | ACTIVE — read; comments partly read | Rolling pre-launch scope | Issue body read; #190 and #191 quote it | Body (24 Sep) defers Hybrid/social/learning; #191 says the 21 Oct decision supersedes that deferral; body not edited | Confirm which version the founder holds as current (D1); keep both visible |
| `SRC-004` / `SRC-016` GitHub repositories | Code, branches, PRs, CI | api `main ddcc26c`; web `main e9e5a1f` | ACTIVE — read | — | Native git and GitHub API | Which ID is api vs web is MC-only | Use as technical authority |
| Backend PostgreSQL ledger | Financial transaction state | n/a (no runtime access here) | ACTIVE — **not inspected** | — | Design documents (`BG_STUDIO_020_FINANCIAL_SAFETY` etc.) | — | Verify against a restored backup in an approved environment only |
| `SRC-009` / `VER-002` Source Pack v1.2 | Historical evidence | v1.2 — **not accessible** | HISTORICAL — unread | Earlier packs | #190 quotes its monetisation section | #190: legacy prices are "not a current public-price lock" | Obtain; keep as legacy evidence |
| `SRC-010` Intelligence Pack v1.0 | Reference framework | v1.0 — **not accessible** | REFERENCE — unread | — | #190 cites its "Phase-1 Product Architecture, Execution Flow & Monetisation Model" | Not proof of delivery (#190, #129) | Obtain |
| Six original intelligence documents (see §4) | Reference | not located | Not available to this session | — | Named in BG-STUDIO-022 work order; no hit in either repo or on disk | — | Founder to supply path |
| Historical competitor reports/watchlists | Reference | not located; **issue #141** describes them and a register to consolidate them | Not available to this session (register exists as issue #141) | — | #141 states findings "live across reports/watchlists/issues" | My BG-STUDIO-022 matrix is a *parallel* baseline, not the #141 register | Route 022 findings into #141 format; do not maintain two registers |
| Issue #129 BG-GROWTH-001 | Post-launch closed-loop growth architecture (G1–G8) | open; updated 10 Oct | ACTIVE — read | — | Read in full | BG-STUDIO-022 built G1/G7/G8-like items before launch (founder-directed in that work order) | Record as approved evolution only if D1 confirms; otherwise gate off |
| Issue #191 BG-MASTER-REGISTER-001 | Cross-system index; PRE/POST classes; evidence states | open; 39 comments | ACTIVE — body read | Never a second checklist | Read | Says "no second independent launch checklist" while many docs exist | Collapse to MC + this programme |
| Issue #190 founder audit (20 Oct) | Evidence inventory incl. **historical pricing** | closed as evidence only | ACTIVE as evidence | — | Read in full | Pricing layers conflict by design (£79/£199, 40/60/120 credits) | See commercial plan |
| Issue #77 / #197 / #192 / #141 / #43 / #56 / #20 / #21 / #51 / #155 / #84 / #126 / #188 | Product proof, UX, social, intelligence governance, Y1, financial model, Brand Brain, quality, launch programme, referral, hybrid | various | ACTIVE — read (bodies) | — | Read | #56: model must keep prices "PROVISIONAL — REQUIRES COMMERCIAL LOCK" | Use as stated |
| api `docs/mission-control/*` | Intelligence schemas (Competitor/Benchmark Review etc.) and RED team engine | api `23f4903`/`9346055` | REFERENCE | — | Read | `RED_TEAM_ENGINE.md` says it approves no pricing/code | Reuse for competitor admin |
| Founder decision identifiers seen in repositories | `DEC-011/LOCK-017` tagline; `DEC-015` MC canonical; `DEC-020/LOCK-018` Architecture A (supersedes B); `DEC-021/LOCK-019`, `DEC-022/LOCK-020` owner-only identity; `DEC-023` four items incl. professional services sector and pricing; `DEC-025` workspace calendar required before full launch; `DEC-014` text unavailable | quoted only | ACTIVE per quotations — **unverified** | `DEC-020` supersedes Architecture B | Quoted in api/web docs | `DEC-023` item 2 (pricing) blocked on canon | Verify each against `DECISION_LOG` |
| BG-STUDIO-0xx reports (web `docs/studio/*`, api `docs/studio/*`) | Agent-authored evidence | per PR | AGENT-REPORTED | — | In repositories | Reports quote test counts that only GitHub CI/native runs can verify | Treat as evidence, not authority |
| Meta business verification | External fact (founder-reported 26 Oct) | n/a | ACTIVE — **not evidenced in any repository** | — | Work order | Not equal to Tech Provider access verification, App Review or permissions | Record separately; deadline 25 Dec 2026 for access verification (founder-stated) |

## 3. Authority conflicts (corrected: items 1 and 5 resolved by founder)

1. **Canon Ring 1 vs #128 first revenue.** Canon v2 (`BG-DOC-001`) locks a Ring 1 that includes AI image and video, UGC upload, AI/Human/Hybrid modes, editing and enhancement (aspect ratios, captions/subtitles, music, voice-over, trimming, sequencing), scheduling **and publishing to supported platforms**, lightweight analytics and the floating Genie. #128 (24 Sep) defers hybrid and autonomous posting; #191 records a 21 Oct founder decision pulling core Learning, Hybrid and social plugins **pre-launch**. These three layers describe different launch bars; **Resolved:** `DEC-014` supersedes `DEC-009`; Learning, Hybrid UGC and social connection are pre-launch, and #128 is read with #191 and Mission Control. No decision is needed from the founder.
2. **Pricing.** Four non-agreeing layers (see commercial plan): legacy Intelligence Pack prices, a later illustrative credit model, a founder runtime test, and `DEC-023` item 2 blocked on a canon nobody has supplied. **No price is approved in any accessible source.**
3. **Two backend media lineages** (see PR register): #205–#212 versus the #213–#218 chain.
4. **Two competitor baselines**: the older reports/watchlists (not found) and the BG-STUDIO-022 matrix; #141 prescribes the single register.
5. **Mission Control freshness**: founder-reported stale rows and duplicate lock ids; not verifiable in this session.

## 4. Sources not available to this session (they exist; names, expected place, owner, consequence for my analysis)

| Source | Last known reference | Expected location | Owner | Consequence of absence |
|---|---|---|---|---|
| `BizGenie_Intelligence_Pack_v1.0.zip.zip` | #190 (monetisation section); founder message | Project sources / Drive | founder | Original monetisation, architecture and execution-flow detail cannot be audited; only #190's quotation exists |
| `BizGenie_Source_Pack_v1.2.zip.zip` | founder message | Project sources / Drive | founder | Original vision, historical feature maps and the £99/£149 proposals the founder mentions cannot be traced |
| `BizGenie_Source_Pack_v1.2_OPERATIONAL_LEDGER.xlsx.xlsx` | founder message | Project sources / Drive | founder | Operational ledger cross-check unavailable |
| `90_INTEL__BizGenie_Market_Intelligence_System_v1.0` | BG-STUDIO-022 work order | Intelligence source archive | founder | COMPETITORS/FEATURE_TRACKER/MARKET_SIGNALS/PRICING_HISTORY/AD_LIBRARY/STRATEGIC_DECISIONS structure unseen |
| `BizGenie Data Intelligence & Moat Strategy v1.0` | same | same | founder | Original moat definition unseen; moat scorecard rebuilt from Canon + code |
| `BizGenie Content DNA Framework`, `Content Learning Engine`, `Creative Capability Framework`, `Creator Economy Model` | same | same | founder | Content DNA, learning loop and creator reintegration trigger unseen; trigger stated only second-hand in a work order |
| Historical competitor matrix / weekly intelligence | #141, BG-STUDIO-022 work order | reports/watchlists | founder | Competitor history unreconciled |
| Mission Control (canonical Google Sheets register, **17 live tabs** per founder) | **Exists and is canonical; NOT READ BY THIS SESSION** (docs.google.com unreachable; Drive connector not connected). Governance findings in §0A are founder-verified |
| £99 and £149 price proposals | founder message | Source Pack / Drive | founder | Not present in any source **I** could open; only £79, £199, £59 and add-ons are evidenced in #190. Treated as historical, not approved |

## 5. What was searched (so the absence is evidence, not assumption)
GitHub code and issue search across `shirrie01` (terms: Market Intelligence System, Content DNA, Creator Economy, Moat Strategy, competitor, pricing tiers); all open issues of `bizgenie-api` (50 read as bodies); backend `docs/` tree; web history (`git log -S`); the local file system (`find` for the file names); Google Drive connector state; Mission Control URL fetch.
