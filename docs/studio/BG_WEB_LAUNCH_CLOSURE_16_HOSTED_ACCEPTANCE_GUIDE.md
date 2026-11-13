# BG-WEB-LAUNCH-CLOSURE-16 — hosted customer acceptance execution guide (prepared, NOT RUN)

13 Nov 2026. A repeatable guide for the controlled ten-customer pilot. **Every stage below is NOT RUN or BLOCKED**; nothing was executed, deployed or created while preparing it. Statuses may change only when an approved run supplies evidence (screenshots and logs named below). Local tests, mocks and generic CI never turn a stage into PASS. Companion documents: `BG_WEB_LAUNCH_CLOSURE_15_ACCEPTANCE_PACK.md` (15-scenario matrix), `BG_WEB_LAUNCH_CLOSURE_16_CONTRACT_MATRIX.md` (what the revision must contain), `BG_WEB_LAUNCH_CLOSURE_16_STRIPE_TEST_MODE.md`.

## 1. Before any run (gates; all must be recorded in #191)
| Gate | Evidence | State |
|---|---|---|
| Staging API revision built from `d3ec6c37` or later, image digest and source commit recorded (metadata collector) | collector output | NOT RUN (collector inaccessible from this session) |
| 15 migrations applied (including professional-services) | founder-approved migration record | NOT APPLIED |
| Quote path, catalogue and policy composed (Codex handover items 1, 6) | startup log line, no 503 | NOT DONE |
| Studio staging build with flags matching the revision (`VITE_*` per matrix) | release workflow summary (commit SHA, dist hash) | NOT DONE |
| Studio host and DNS `staging-app.getbizgenie.com` (Pages project `bizgenie-studio-staging`) | HTTPS 200, headers smoke | NOT CONFIRMED |
| Spend controls: £100/month aggregate ceiling enforced and tested; OpenAI prepaid balance; Google budget alert | Codex test run; console screenshots | NOT DONE |
| Founder approval naming paid-call ceiling, accounts, and each real-provider/social/Stripe step | #191 comment | NOT GIVEN |

## 2. Test accounts and fixtures (founder-owned; never real customers)
`owner-A` (a new email on the staging Auth project; creates workspace A), `member-A` (invited, non-owner), `owner-B` (a second tenant, for foreign-tenant denial), `revoked-X` (an **existing** revoked-membership fixture; never revoke an account for the test), one founder-owned TikTok sandbox account and one LinkedIn test account (only when approved), one Stripe test-mode customer (only when approved). Credentials stay in the founder’s password store; capture tokens only silently (the R2 script reads them without echo).

## 3. Execution guide (15 scenarios + R2 media access)
Capture for every stage: UTC time, revision name, Studio build SHA, a full-page screenshot, the browser network log filtered to the stage (no tokens; strip identifiers to a 6-character hash), and the API log line (request path, status). Save under `evidence/<date>/<stage>/`.
| # | Scenario | Steps | Expected evidence | Pass criteria | Status |
|---|---|---|---|---|---|
| 1 | New customer registers | open the staging Studio signed out; sign up `owner-A`; confirm email | sign-in screen, confirmation notice, session | no data visible before sign-in; neutral message for existing emails | NOT RUN |
| 2 | Creates a workspace | complete bootstrap | `GET /customer/workspace` 200 ready | workspace and brand appear; reload keeps them | BLOCKED (migrations, revision) |
| 3 | Selects an unrelated industry | choose professional services (then takeaway) | sector chip, guidance wording | no leasing/beverage/other-industry wording | BLOCKED (professional-services migration) |
| 4 | Completes onboarding | answer all steps; reload | `workspace-onboarding.v1` persisted | answers survive reload and a second device | NOT RUN |
| 5 | Brand Brain persistence | edit and save the brand; reload; sign in elsewhere | version increments | saved values returned exactly | NOT RUN |
| 6 | Strategy and text | request a strategy and a text item | priced quote, confirm, result | credits shown before confirm; one debit of 1 credit per text job | BLOCKED (quote path not composed) |
| 7 | Image and video (when authorised) | one image, one 4 s video | quote, confirm, job progress, asset | credits 2 / 5; asset persisted and playable; spend within ceiling | BLOCKED (creative-job route absent; spend not composed) |
| 8 | Creative review | open preview, play video, approve | creative-preview 200, playable video | playback works after reload; approval recorded | NOT RUN |
| 9 | Calendar and scheduling | schedule, reschedule, remove planned time | workspace calendar entries | entries correct; removal works (flag on) | BLOCKED (revision not verified) |
| 10 | Social connection (when authorised) | connect TikTok or LinkedIn with the founder-owned account | OAuth, callback, “connected” | address bar cleaned; no token visible; status correct | BLOCKED (social routes absent; DNS and provider registration) |
| 11 | Publishing workflow (when authorised) | send a draft to TikTok; creator posts it | dispatch status “uploaded” (a draft) | never shown as published until the creator confirms | BLOCKED |
| 12 | Plan and credits display | open Plans | catalogue, balance | £99 / 60 credits only from the approved catalogue; no undecided claim | BLOCKED (catalogue not approved) |
| 13 | Stripe test-mode checkout and cancellation | follow the nine-stage procedure | stage records | all nine stage criteria | BLOCKED (approval, keys, composition) |
| 14 | Foreign-tenant denial | `owner-A` token against `owner-B` scope; R2 case | `404 RESOURCE_NOT_AVAILABLE` | no data from B | NOT RUN |
| 15 | Revoked-user denial | `revoked-X` against its former workspace; R2 case | refusal and session-ended notice | no access regained | NOT RUN (needs the existing fixture) |
| R2 | Protected media access | request a persisted asset’s preview unauthenticated, as `member-A`, as `owner-B` | 401 / allowed / 404 | only authorised users receive bytes; no signed URL leaks | BLOCKED (needs persisted asset) |

## 4. Rollback and reset (after any approved run)
Disable the staging build’s feature flags and redeploy the previous Studio build (kept as a Pages deployment); cancel Stripe test subscriptions and remove the test webhook destination; disconnect any social account in the product and revoke the app in the platform settings; do not delete ledger or audit rows; record the end state in #191. No production system is touched by any step.
