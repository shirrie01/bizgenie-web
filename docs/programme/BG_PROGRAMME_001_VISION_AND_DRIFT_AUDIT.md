# BG-PROGRAMME-001 — original vision, pricing history and drift audit

27 Oct 2026. Evidence limits: Mission Control, Source Pack v1.2 and the Intelligence Pack were not readable (see source index §0). The vision is reconstructed from Canon v2 (read in full), issues #128, #129, #190, #191, #197, and repository history. Nothing below is a founder decision.

## 1. Vision as recoverable (cited)
| Element | Authority | Statement |
|---|---|---|
| Identity | Canon v2 | BizGenie is an **AI Marketing Operating System**, outcome-first: a business owner states a goal and BizGenie plans, creates, launches and learns |
| Tagline | `DEC-011 / LOCK-017` | "Make. Launch. Learn what converts." (locked 20 Oct) |
| Ring 1 launch boundary | Canon v2 | Sign-up/auth/subscription, Brand Brain, campaigns, scripts/text/AI image/AI video, upload of human UGC, AI/Human/Hybrid modes, essential editing, review/approval, scheduling and publishing to supported platforms, lightweight analytics, completion in-product with the floating Genie |
| Method | Canon v2 | 80/20 Integration Rule; Creative Director; Three-Ring roadmap; No-Drift rules |
| First-revenue contract | #128 (24 Sep, with later comments) | L1–L5 frozen; Hybrid, social publishing and learning *deferred* |
| Founder re-scope | #191 (cites 21 Oct decision) | Core Learning, Hybrid UGC and social plugins are **pre-launch**; no silent deferral |
| Closed loop | #129 | G1–G8 post-launch; no duplicate stores |

## 2. Pricing decision history
| Price point | Where evidenced | Status |
|---|---|---|
| Starter £79/month, 30 credits; Growth £199/month, 120 credits | #190 quoting the Intelligence Pack monetisation model | **Historical proposal. Not a lock** (#190 and #56 say so) |
| First 100 Starter £59/month for 12 months, then standard | #190 / Founding-100 material | **Proposed**; no approval record found |
| Credit add-ons 50/£49, 100/£89, 250/£199 | #190 | Proposed, historical |
| Later illustrative credit models (Starter ~40, Professional ~120) | #190 | Illustrative |
| Runtime Standard test = 60 credits | #190 founder demonstration | Operational test setting, not a price |
| **£99, £149** and "higher tiers" | **Nowhere accessible** | Cannot be classified: not found. If they exist they are in the unread Source Pack / Mission Control |
| `DEC-023` pricing item | Quoted in repo docs | **Blocked on canon**; no approved price exists in any accessible source |

Conclusion: **no price is approved and recoverable**. Anything on the site, in the app or in the financial model must stay "provisional" (#56 rule). The backend/plan implementation of pricing should read from one configuration, never from copy.

## 3. Divergence classification
| # | Divergence | Class | Evidence |
|---|---|---|---|
| 1 | Premium Studio (design-led UX, five-industry neutral onboarding) replaced a minimal MVP | Approved evolution | #197 and the numbered BG-STUDIO work orders from the founder; but `#25 "remove Fonzo defaults"` remains open and is not in the stack — the neutral-onboarding goal was re-done in #42 |
| 2 | Durable quote/confirm, outbox, tenant isolation, optional-service 503s | Necessary technical adaptation | Required by financial-safety and idempotency rules (backend `docs/studio/*`) |
| 3 | Learning persistence, objectives, experiments, performance evidence (022/023) | Approved evolution (after 21 Oct decision) but **ahead of data**: no real ingestion exists | #191, #129; Growth centre runs on fixtures |
| 4 | Competitor action matrix (022) as a parallel register | **Unapproved drift (process)** — #141 already defines the single register | #141 |
| 5 | Two backend media-delivery lineages (#205–#212 vs #213–#218) | **Abandoned or duplicated** | git cherry analysis (PR register) |
| 6 | Dozens of record-only docs PRs (e.g. #49, #50, #52, #53 are "record CI result") | Abandoned/duplicated overhead — evidence belongs in Mission Control, not PRs | PR titles |
| 7 | Artefacts (`dist-*`, `test-results`, 72 MB) committed in the stack | Unapproved drift (hygiene); fixed in #56 by untracking, not by history rewrite | 023 artefact audit |
| 8 | Public website built in-repo (BG-WEB-001) | Approved (explicit order) | #57 |
| 9 | Voice-over, music, captions/subtitles, trimming, sequencing, Genie, Creative Director analysis | **Missing original capability** (Canon Ring 1) | grep of both repos: none |
| 10 | Real video generation / real hybrid composition | Missing original capability (backend has profiles and a fixture compositor only) | backend source |
| 11 | Real social OAuth/publishing and analytics ingestion | Blocked (external approvals) and contract-only | #192; #218 |
| 12 | Hybrid UGC (#188/#189) and engagement intelligence (#204) | Pre-launch work not yet integrated (drafts outside the #218 chain) | PR register |
| 13 | Referral credits (#155), Y1 quotas (#43) | Unresolved/provisional | issues |
| 14 | Pricing | Unresolved decision | §2 |
| 15 | Canon Ring 1 vs #128 launch bar | **Resolved** by `DEC-014` (founder-verified): Learning, Hybrid UGC, social connection pre-launch | founder 27 Oct |

## 4. Where drift actually occurred
Drift was not wild feature invention. It was **depth-first on one slice**: premium UX, persistence and learning contracts were built to a high standard while the Ring-1 *creation and editing* capabilities (video, voice, music, captions, Genie) and the *external* capabilities (OAuth, publishing, ingestion, real billing) never started or are blocked. The product the founder can demo is the planning-and-review half; the product a customer pays for is the produce-and-publish half. A second, quieter drift is **process**: many parallel registers (this programme, #191, #141, 022 matrix, record-only PRs) instead of one.
