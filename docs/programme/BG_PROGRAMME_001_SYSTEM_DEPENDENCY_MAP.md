# BG-PROGRAMME-001 — system dependency map and customer journey

27 Oct 2026.

## Dependency map
```
Website (#57) ──lead POST──▶ [BE lead route: NOT BUILT; extend src/paid-beta]
App FE (#56 stack) ──▶ BE #213–#218 chain ──▶ PostgreSQL
   quote/confirm ─▶ creative jobs ─▶ [provider adapters: mock] ─▶ media (two lineages!)
   campaigns/facts ─▶ calendar ─▶ social outbox ─▶ [platform adapter: none] ─▶ Meta/IG/FB
   insights ◀── [analytics ingestion: none] ◀── platform data
   billing ─▶ Stripe [inactive]
External gates: Meta business verification (done 26 Oct) ▸ Tech Provider access verification (by 25 Dec 2026) ▸ App Review/permissions ▸ real publishing ▸ real analytics ▸ Learning Brain on real data
```
Critical dependency: **everything after publishing depends on an external Meta approval path the agent cannot shorten.** Everything before it is buildable now.

## Customer journey (target vs current)
| Step | Target | Current |
|---|---|---|
| 1 Discover | website, early-access form | site built, backend route missing, company facts missing |
| 2 Sign up / pay | account + subscription | account yes; payment inactive; pricing unapproved |
| 3 Onboard / Brand Brain | industry-neutral onboarding | built (#42, #45, #48) |
| 4 Strategy → campaign | goal → proposal | built, fixture-driven |
| 5 Create | text/image/video/UGC/hybrid | text yes; image mock; video none; UGC backend only |
| 6 Edit | captions, music, voice-over, trim | none |
| 7 Review / approve | yes | built |
| 8 Schedule | yes | built; workspace calendar endpoint pending (`DEC-025`) |
| 9 Publish | to connected accounts | manual attestation only |
| 10 Measure | ingestion | none |
| 11 Learn | recommendation on real results | mechanism built, no real data |
| 12 Renew | billing | none live |
**Shortest honest journey available today:** onboard → proposal → text creative → approve → schedule → *manual* publication attestation. That is what a founding customer can be walked through by the founder, not self-served.
