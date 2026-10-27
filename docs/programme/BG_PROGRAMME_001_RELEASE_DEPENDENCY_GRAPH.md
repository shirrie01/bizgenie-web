# BG-PROGRAMME-001 — release dependency graph

27 Oct 2026. Nothing below is executed.

```
R0 founder decisions D1–D3, connect Drive (MC read)
R1 Backend: migration rehearsal on throwaway DB ──▶ merge #218 chain tip ──▶ staging (S1 isolation approved)
R2 Frontend: fix socialClient + media UI ──▶ merge #56 ──▶ staging with gates OFF
R3 Codex: lead route (WEB-002) ──▶ website strict build ──▶ preview deploy ──▶ DNS (separate approval)
R4 Codex: media lineage reconcile ──▶ #189 ──▶ #204
R5 Staging e2e (five industries × owner/member) ──▶ founder acceptance
R6 Stripe test-mode ──▶ billing mounted ──▶ (live billing, separate approval)
R7 Meta: access verification (≤25 Dec) ──▶ App Review ──▶ real publish ──▶ ingestion ──▶ Learning on real data
```
R3 is independent of R1/R2 and is the fastest path to a visible public presence. R7 is on the external critical path.
Rollback per step: revert merge commits (flags default OFF), DNS TTL lowered before cutover, migrations additive with rehearsed down-path.
