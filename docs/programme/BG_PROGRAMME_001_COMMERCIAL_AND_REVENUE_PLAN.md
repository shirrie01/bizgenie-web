# BG-PROGRAMME-001 — commercial viability and revenue plan

27 Oct 2026. **No financials are invented.** No approved price exists in any accessible source (vision audit §2). Figures below are labelled as historical or as arithmetic on stated inputs.

## Three pricing views
| View | Content | Status |
|---|---|---|
| A. Original approved canon | **Not recoverable.** Source Pack v1.2 / Mission Control unread; £99/£149 not found | Gap |
| B. Current proposed launch packaging | Historical: Starter £79 (30 credits), Growth £199 (120 credits); first 100 Starter £59/month for 12 months; add-ons 50/£49, 100/£89, 250/£199 (#190). All provisional | Proposed, unapproved |
| C. Long-term premium architecture | Credit-based tiers plus seats/brands; illustrative only; to be designed after 10 paying customers | Not designed |

Arithmetic on view B, stated inputs only: the Y1 target in #43 is £1.08m (M1 £10k … M12 £190k). At the *historical* £79 Starter, £10k/month is ≈127 subscribers and £190k/month ≈2,400; at £59 founding price the M1 figure is ≈170. These show the **scale of acquisition the quota implies**, not a forecast. No conversion, churn or CAC assumption exists in any accessible source.

## Shortest route to the first founding customer (no new features required for steps 1–4)
1. **Founder decision**: provisional founding price and terms in one sentence (D2). 
2. Publish the website (A2 founder facts, legal review) — buys lead capture; backend `early-access-interest.v1` route by Codex (small, extends paid-beta).
3. Founder-led onboarding of 3–5 hand-picked businesses in different industries (wholesale beverages, vehicle leasing, aesthetics, hospitality, ecommerce).
4. Manual-assisted loop: onboarding → Brand Brain → campaign proposal → text creative → approval → calendar → **manual publication attestation** → customer enters results.
5. First paid subscription: Stripe live is not authorised; until it is, an **invoiced/manual founding fee** is a founder choice (D3) — not something the agent enables.
6. First Learning Brain recommendation from the entered results; recorded accept/decline.
7. Renewal conversation at day 30, evidence = the recommendation and outcome.

## Milestones (verifiable)
| Milestone | Evidence |
|---|---|
| M1 first lead via real endpoint | labelled record in Postgres |
| M2 first founding customer onboarded | workspace + Brand Brain version |
| M3 first paid subscription | payment record in ledger |
| M4 first campaign | campaign facts |
| M5 first published asset | manual attestation or real publish |
| M6 first performance observation | insights row |
| M7 first Learning Brain recommendation with decision | `recommendation_id` + feedback |
| M8 first renewal | second payment |

## Risks to revenue
Claim without capability (video, editing, Genie not built); dependence on Meta approvals for self-serve publishing; unapproved pricing; Stripe inactive; legal/consent facts. Mitigation: sell a **founder-assisted founding programme**, not self-serve SaaS.
