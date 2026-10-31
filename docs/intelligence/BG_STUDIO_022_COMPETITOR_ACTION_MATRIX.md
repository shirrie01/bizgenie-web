# BG-STUDIO-022 — competitor action matrix

Observed 26 October 2026 by the frontend agent. **Read this first: the evidence base is thin and the limits are stated, not hidden.**

## 0. Evidence limits (what could not be done)

| Required by the work order | Status |
|---|---|
| Canonical sources `90_INTEL__BizGenie_Market_Intelligence_System_v1.0`, Data Intelligence & Moat Strategy, Content DNA Framework, Content Learning Engine, Creative Capability Framework, Creator Economy Model | **NOT ACCESSIBLE.** Searched both GitHub repos (code and issues) and the local file system: no hit. Not reviewed. Nothing below claims their content |
| The previous competitor report / action matrix | **NOT RECOVERED** (no repo or issue hit). This document is therefore a new baseline, not a refresh |
| Vendor pricing pages (hootsuite.com, sprout, buffer, later, metricool, socialbee, predis, ocoya, jasper, canva, hubspot) | **Not reachable**: the sandbox cannot resolve those hosts. No first-party page was read |
| Mission Control | not accessible |
| Recovered and read | bizgenie-api issues #128, #129, #77, #191, #197 (read in full); web issue #6 (unrelated Founding-100 PR); backend `docs/mission-control/INTELLIGENCE_SCHEMAS.md`; backend `docs/studio/BG_STUDIO_020_SOCIAL_LEARNING_CONTRACTS.md`; `src/performance-evidence/contract.js` @ `23f4903` |
| Not found | issue numbers #128/#129 are in `bizgenie-api`, not `bizgenie-web` (web returns 404) |

Consequence: every price below is a **secondary-source observation** from web search snippets, which disagree with each other. Capability descriptions marked *(unverified)* come from general product knowledge, not from evidence gathered here. None may be used as a pricing decision. Pricing canon stays founder-controlled.

## 1. Canon constraints this work must respect (recovered)

* **#129 BG-GROWTH-001** (adopted 24 Sep, ARCHITECTURE/ROADMAP): the loop *Research → Brand/Audience Intelligence → Commercial Objective → Offer → Campaign → Controlled Creative Variants → Distribution → Measurement → Experiment Learning → Next Strategy*. G1 experiment+variant intelligence and G2 offer intelligence were "immediately post-launch"; G3–G6 growth phase; **G7 competitor pattern intelligence and G8 Growth Control Centre "later"**. Explicit rules: no second experiment store, analytics spine, Brand Brain, asset authority or campaign engine; extend the smallest existing records; no inferred causality from weak samples; learning cannot silently overwrite approved Brand Brain truth; competitor evidence is inspiration, not copying authority.
* **#128** froze launch scope in September; **#191** records the founder's 21 Oct decision that core Learning and Hybrid are PRE-LAUNCH and must not be quietly deferred.
* **This work order (22) explicitly pulls G1, G7, G8-style capability forward.** That is a founder instruction that supersedes the #129 sequencing for these items, but the #129 *prohibitions* (no duplicate stores, no causality claims) remain binding and are applied below. Recorded here so the sequencing change is visible, not silent.
* Backend `INTELLIGENCE_SCHEMAS.md` already holds *Competitor Review* and *Benchmark Review* (evidence-ref required, strict, status draft→completed). The Market Intelligence tables (COMPETITORS, FEATURE_TRACKER…) have **no backend model**; admin UI must reuse these governance schemas, not invent a database.

## 2. Competitor profiles

Confidence: V = verified first-party (none obtained), S = secondary source, conflicting, K = general knowledge, unverified.

| Competitor | Target customer | Positioning *(K)* | Price observed (secondary, Oct 2026) | Conf. | Notes |
|---|---|---|---|---|---|
| Hootsuite | SMB to enterprise teams | Scheduling + listening suite | Sources disagree: "Professional $99/mo, 1 user, 10 accounts"; "from $99/user/mo annual only"; one lists $19 entry with free plan removed | S | Reviews (Capterra): "quite high" for small business, advanced tools in dearer plans |
| Sprout Social | Mid-market teams | Engagement, reporting | per seat; sources say $79–$399, or $199/$299/$399 | S | Per-seat cost grows with team |
| Buffer | Solo / small | Simple scheduling | per channel ~$5–$10/mo; free tier 3 channels | S | Cheapest in set; per channel not per seat |
| Later | Creators, brands | Visual/Instagram planning | $25/mo ($18.75 annual), 1 social set/8 profiles, 5 AI credits; Growth $37.50–$50 | S | Credit-limited AI |
| Metricool | SMB, agencies | Analytics + planning | Free (1 brand, 20 posts); Starter €16–$25; Advanced €43–$67; X +$5/account | S | Strong analytics reputation *(K)* |
| SocialBee | SMB, agencies | Category-based evergreen scheduling | $24–$29/mo (5 profiles); $49 (10); $99 (25) | S | |
| Predis.ai | SMB, e-commerce | AI-generated posts/ads | Core $19–$32, Rise $40–$79, Ent+ $212–$249; credits 1,300/3,200/10,000; image 15 credits, faceless video 5 credits/10 s, UGC video 200 credits/8 s; 7-day trial; extra credits $29/mo | S | Closest model to BizGenie's credit system; its Core tier is reported as **no auto-posting** |
| Ocoya | SMB, creators | AI content + scheduling | **no 2026 price found** | — | Unknown |
| Jasper | Marketing teams | Brand-voice AI + campaigns | Pro $59 annual / $69 monthly per seat; 7-day trial; (another source: Creator $39–49) | S | Per seat; campaign generation from one brief |
| Canva | Everyone | Design suite + AI + scheduling | Pro $15/mo or $120/yr per person | S | Design-first, weak closed-loop learning *(K)* |
| HubSpot Marketing Hub | SMB to enterprise | CRM-centred marketing | Starter "from $7" (offer) or $20 per seat | S | Price confusion shows promo vs list |

Unknown for every competitor from evidence: usage restrictions beyond what is above, full integration lists, user counts, revenue. **None asserted.**

Customer-complaint signal (one search, directional, competitor-authored/aggregator sources): price; thin analytics; generic AI output needing manual edits; TikTok scheduling gaps; slowness. Single-source claims are marked as such.

## 3. Findings and classification

| # | Finding | Evidence | Class | Benefit | Commercial | Effort | Security / cost | Launch relevance | Owner | Acceptance |
|---|---|---|---|---|---|---|---|---|---|---|
| F1 | Closed loop (objective→creative→measure→learn) is BizGenie's stated differentiator; competitors above are scheduling- or generation-centric *(K, partly)* | #129; reviews note thin analytics | **DIFFERENTIATE NOW** | Customer sees why a result happened | High | M | no new store; read models only | PRE per #191 | FE + Codex CI-05 | Growth Control Centre shows objective→result→recommendation with provenance |
| F2 | Variants with structured attributes + honest evidence states, not volume | #129 G1 "not maximum output volume" | **DIFFERENTIATE NOW** | Learns what converts | High | M | persistence needs CI-01 | Mandatory (Learning pre-launch) | FE + Codex CI-01 | Experiment model, state machine, no winner without evidence |
| F3 | Goal-first strategy by commercial objective and industry | Work order; #77 real campaigns (wholesale ≠ consumer launch) | **DIFFERENTIATE NOW** | Relevance | High | S–M | none | High | FE | Five-industry fixtures classify objective correctly |
| F4 | Credit-metered AI media is common (Predis, Later) | S | **ADOPT NOW** (already built: binding quote) | Predictable cost | High | done | — | PRE | FE | Existing |
| F5 | Seat/account-based pricing is a recurring complaint | S (reviews) | **RESEARCH** | Price narrative | Med | S | Pricing canon is founder-controlled | L4 | Founder | Evidence pack only; no prices set |
| F6 | Generic AI output needing edits | S (one source) | **DIFFERENTIATE NOW** via Brand Brain + approved product context | Quality | High | M | extraction needs SSRF-safe server ingest | PRE | FE + Codex CI-02 | Product-intake journey with fact provenance |
| F7 | Competitor ad-pattern analysis | #129 G7 later; AD_LIBRARY undefined | **ARCHITECTURE NOW / IMPLEMENT LATER**; reference workflow from customer-described patterns now | Inspiration | Med | M | no scraping; rights; never copy | Not launch-blocking | FE (text-only reference) | UI states what was and was not analysed |
| F8 | Analytics depth and honesty | complaints + #191 "customer-entered ≠ native analytics" | **ADOPT NOW** (align to `performance-*` models) | Trust | High | M | no new endpoints | PRE | FE + Codex R12 | Adapter validates canonical models; `causal_claim:false` honoured |
| F9 | Autonomous publishing / social breadth | #191 PRE gate; Codex R11 | **ARCHITECTURE NOW** (blocked) | Core promise | High | L (backend) | OAuth review | PRE | Codex | unchanged |
| F10 | Creator/affiliate marketplace | Trigger: live product + 100 customers, not met | **ARCHITECTURE NOW / IMPLEMENT LATER** | Future | Med | L | rights | No | Founder/Codex | Interface points only |
| F11 | Internal competitor admin | Backend has Competitor/Benchmark Review schemas | **ARCHITECTURE NOW**; local prototype only | Governance | Low-Med | S | internal only | No | FE prototype / Codex | Not a customer feature |

## 4. Top five winning patterns *(K + S; unverified where stated)*

1. Credit-metered AI generation with visible allowances (S: Predis, Later). 2. Brand-voice libraries (K: Jasper, Canva Brand Kit). 3. One-brief-to-many-assets campaign generation (S: Jasper). 4. Calendar-centred planning with auto-publish (K, all schedulers). 5. Free or cheap entry tier / short trial (S: Buffer free, Predis 7-day, Jasper 7-day).

## 5. Top five customer pain gaps *(S, directional)*

1. Price versus value for small businesses. 2. Thin analytics. 3. Generic AI content. 4. Platform gaps (TikTok scheduling). 5. Complexity/slowness.

## 6. Top five revenue or demand signals

**Cannot be established from evidence gathered.** Only pricing-structure signals exist (credit allowances, per-seat vs per-channel). No revenue or user counts were found and none are invented. Treat as RESEARCH.

## 7. Feature-gap assessment (BizGenie vs the loop)

Strong/built: Brand Brain, campaigns, binding quote→job, calendar API, manual publication, private media. Gaps (all backend-dependent): experiment persistence (CI-01), product intelligence ingest (CI-02), market-signal store (CI-03), recommendations (CI-04), control-centre read model (CI-05), R1, R3, R4/R5, R8, R11, R12.

## 8. Differentiation recommendations

Lead with evidence-labelled learning (observed change only, customer-accepted), goal-first strategy by industry, and honest states ("accepted ≠ completed ≠ approved ≠ published", "directional ≠ supported"). Do not out-feature schedulers on breadth; do not mimic their per-seat pricing without founder canon.
