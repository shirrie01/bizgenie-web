# BG-PROGRAMME-001 — capability matrix (25 capabilities) — corrected

Corrected 27 Oct 2026: every Learning Brain, Hybrid UGC and social-connection row is **PRE-LAUNCH** (`DEC-014`), i.e. launch-blocking, not deferrable. Evidence classes: **H** historical staging PASS (in Mission Control, preserved by `LOCK-015`, not visible to me), **L** local draft integration, **D** current deployed operational acceptance. The statuses below are class L/code inspection only; they neither erase nor restate class H.

27 Oct 2026. Basis: Canon v2 Ring 1, #128/#191, native code inspection of web `e9e5a1f`/#56/#57 and api `ddcc26c`/#218. The 25-item list below follows the order and scope of the programme order; items the order grouped together were split where Canon lists them separately — **if the founder's own numbering differs, the percentages below must be recomputed** (the method is in §3).

Status vocabulary: **OP** operationally proven · **INT** integrated in draft (frontend + real local backend + Postgres, tested) · **BE** backend only · **FE** frontend only · **MOCK** mock/harness only · **CON** contract only · **NIM** not implemented · **BLK** blocked · **SUP** superseded.

| # | Capability | Status | Evidence / gap |
|---|---|---|---|
| 1 | Sign-up, auth, onboarding | BE+FE (main) | Onboarding persistence Architecture A (`DEC-020`); no independent run |
| 2 | Workspace, owner/member roles | BE+FE | owner-only identity writes (`DEC-021/022`); 023 owner/member browser matrix |
| 3 | Brand Brain | BE+FE | Founder-reported demo (#190), not independently verified |
| 4 | Campaign planning / strategy | **INT** | #218 campaign discovery + nested facts, 023 backend218 test |
| 5 | Text / script generation | **INT** (quote/confirm path) | `quoted_v1`; real LLM provider not exercised by me |
| 6 | AI image generation | MOCK | creative-job pipeline with provider adapter; no paid generation run |
| 7 | AI video generation | NIM | aspect/duration profiles only |
| 8 | Customer media intake (upload/UGC) | BE | #205–#212 / #218 lineages; frontend not wired |
| 9 | Hybrid creative / Hybrid UGC (**PRE-LAUNCH**) | MOCK | fixture compositor; #189 rebase onto #218 pending (task B6/F4) |
| 10 | Essential editing (captions, music, voice-over, trim, sequence) | NIM | none found |
| 11 | Review / approval | BE+FE | review panel, idempotent writes; founder-reported demo |
| 12 | Calendar / scheduling | BE+FE | manual publication attestation; `DEC-025` workspace calendar endpoint required |
| 13 | Social account connection (OAuth) (**PRE-LAUNCH**) | CON / BLK | `/customer/social/*` in #218; frontend `socialClient.js` still on old routes; Meta approvals pending |
| 14 | Publishing / dispatch | MOCK / BLK | outbox with no platform adapter in use |
| 15 | Analytics ingestion | CON / BLK | no public ingestion path |
| 16 | Learning Brain / recommendations (**PRE-LAUNCH**) | **INT** | `/customer/insights/*`, feedback by `recommendation_id`; on fixtures only |
| 17 | Experiments / goals | **INT** (objectives) / FE (experiment model) | 022/023 |
| 18 | Billing / subscription | BE (partial) | Stripe not activated; management routes not mounted |
| 19 | Credits, quotes, cost control | **INT** | durable quote/confirm, 023 `quoteConfirm` integration test |
| 20 | Competitor / market intelligence | FE + docs | 022 matrix; #141 register not populated |
| 21 | Floating Genie assistant | NIM | none |
| 22 | Creative Director (take analysis) | NIM | none |
| 23 | Public website + lead capture | FE (+stub) | #57; backend lead route not built |
| 24 | Admin / support / audit | BE (partial) | audit events present; no admin console |
| 25 | Observability / cost management | partial | logs/ledger; no dashboards/alerts; proposed staging ceiling unapproved |

## Calculation (denominator **25**)
| Measure | Rule | Count | % |
|---|---|---|---|
| Implemented anywhere (code path exists on a branch, mocks count if the pipeline is real) | statuses BE, FE, BE+FE, INT, MOCK, partial | 1,2,3,4,5,6,8,9,11,12,13*,14*,16,17,18,19,20,23,24,25 = **20** | **80 %** |
| of which genuinely real beyond mocks/contracts (exclude 6, 9, 13, 14, 25) | | **15** | 60 % |
| Integrated locally in draft (FE tested against real local backend+Postgres) | INT | 4,5,16,17,19 = **5** | **20 %** |
| Class D — current deployed operational acceptance evidenced to me | OP | **0** | **0 %** (class H historical PASS exists in Mission Control; not counted, not disputed) |
| Founder-reported demonstrations (not verified) | #190 | 3,4,5,11,12 = 5 | 20 % (unverified) |
| Not implemented at all | NIM | 7,10,21,22 = **4** | 16 % |

*13 and 14 count as "implemented anywhere" only as contract/outbox code; they are excluded from the stricter 15.

**Headline (class L/code only):** ~60 % of the capabilities exist as real code, 20 % are integrated end-to-end locally, none are evidenced to me as deployed-accepted (class D), and the 4 Canon capabilities with no code (video, editing, Genie, Creative Director) are all customer-visible.
