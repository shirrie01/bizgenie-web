> **HISTORICAL SNAPSHOT (written 27 Oct 2026; not current status).** Pull-request numbers, head SHAs, open/merged counts, gate states, "17 tabs" and the proposed sequences below were true when written and are **superseded**: WEB #56–#73 are now merged or closed, and Mission Control now has 18 tabs. Authority for current status is the Google Sheets Mission Control, GitHub #128 (frozen launch contract) and #191 (checkpoints). Nothing here is an approval of any price, launch date, provider capability or customer acceptance.

# BG-PROGRAMME-001 — end-to-end acceptance matrix

27 Oct 2026. Industries: wholesale beverages, vehicle leasing, aesthetics/professional services, hospitality, ecommerce/consumer products. Roles: owner, member. Marks: **PR** Passed with real local integration · **PM** Passed with mock · **UI** UI-only · **BLK** Blocked · **NT** Not tested. Evidence: 023 `premium-industries` browser matrix (5 industries × owner/member + Growth centre, Chromium, 5 widths) and `backend218` integration tests. **No staging or real-provider run exists.**

| # | Stage | Mark (all 5 industries, both roles unless noted) |
|---|---|---|
| 1 | Sign-up | UI |
| 2 | Onboarding | UI (owner PR for persistence in backend tests) |
| 3 | Brand Brain read/edit | UI; owner-only write PR |
| 4 | Goal/strategy | PM (fixtures) |
| 5 | Campaign proposal | PM |
| 6 | Cost quote | **PR** |
| 7 | Confirm/spend | **PR** (mock provider) |
| 8 | Text creative | PM |
| 9 | Image creative | PM |
| 10 | Video creative | BLK (not built) |
| 11 | Media upload / UGC | NT (FE unwired) |
| 12 | Edit (captions/music/voice) | BLK (not built) |
| 13 | Review/approve | UI + PR (idempotent writes) |
| 14 | Schedule | UI |
| 15 | Publish | PM (manual attestation); real BLK |
| 16 | Performance observation | PM (fixture) / **PR** for persistence |
| 17 | Learning recommendation + feedback | **PR** (persistence), PM (data) |
| 18 | Renewal/billing | BLK |
Member role: write actions blocked on identity/brand; verified in browser matrix. Real-device, assistive-tech, slow-network: NT.
