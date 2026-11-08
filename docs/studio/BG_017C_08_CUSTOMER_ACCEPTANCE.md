# BG-017C-08 — Customer acceptance regression checkpoint

8 November 2026. Test-only successor to WEB71 source ce8694e1c5cc47849d8f2b9f8b7bf7169949248e. Independent branch bg-017c-08-customer-acceptance. Claude owns BG-017C-07; no application, bridge, flags, workflow, deployment or backend files changed. No live account, database, provider or Stripe request made.

Authority: Mission Control primary live18-tab register1N4Yf4hgi5a-ZB_VXZ7WSteLyTVWsX14wxmESvCzMtcc; GitHubAPI128 frozen launch/191 current checkpoint. Live register connector unavailable and issue reads Forbidden; no new authority or scope inferred. Issue1 remains recovery-only and was not used. Founder-supplied deployed baseline: release42529088676 PASS, Pages e312dee7-f3d4-44e8-be5f-e615db91b7e6 at https://bizgenie-studio-staging.pages.dev. Native Git verifies WEB71 source; hosted deployment was not queried or changed.

## Seven-step customer path

| Step | Actual source stage | Data / acceptance boundary |
|---|---|---|
|1|Welcome|Authenticated session or honest sign-in; no guessed workspace |
|2|Your business|Existing GET /customer/workspace, explicit selection when multiple, POST /customer/workspace/bootstrap create/reuse when appropriate; refresh scoped session |
|3|What you do|Preserved business identity; customer description and sector/provenance |
|4|Customers and goal|Customer-written audience/goal; no inferred confirmation |
|5|Channels|Customer preferences, saved through workspace-onboarding.v1 |
|6|Brand Brain|Owner-only identity authority; explicit save/progress/completion |
|7|First recommendation|Actual recommendation/campaign, not generation, entitlement or payment approval |

Subsequent paying journey: choose approved plan/checkout, campaign and quote, explicit generation confirmation/credits, private result/approval, scheduling and supported social lifecycle. These remain separately gated. No claim that Step3 proves complete payment/generation/publishing readiness.

## Two critical tests added

In src/test/App.premium.test.jsx, using existing real App UI with mocked session/API:
1. Authenticated SM Properties bootstrap201 requiring session refresh; Step2→3; original identity bearer used for bootstrap, refreshed scoped bearer used for Brand Brain; full unmount, clear local/session storage, remount loads persisted mock server identity and does not bootstrap a second time. No another-brand copy appears.
2. Server commits bootstrap but first HTTP response is lost: preserve typed SM Properties details, show uncertain result, re-read workspace on retry, reuse existing workspace and reach Step3 with exactly one fake creation. Canonical frontend may replay the idempotent bootstrap to provision scope: two HTTPPOST attempts are not two workspace creations. Mock service models this explicitly; no backend exactly-once guarantee is manufactured.

Initial draft of test2 incorrectly expected zero replayPOSTs; inspection showed existing contract deliberately reuses idempotent bootstrap. Corrected the fixture/assertion to require one workspace, not one HTTPattempt. Initial failing log retained externally; no application fix/weakening or test skip introduced.

## Existing critical coverage reused

- App.premium.workspaces.test.jsx26 tests: explicit selection, refreshed scope, revoked access, rejected different-workspace response, stale async answer fencing, independent progress A→B→A. These are client isolation tests, not proof of server authorisation.
- App.premium.test.jsx and bridgeErrors.test.js: STAGING_WRITES_DISABLED differs from auth401 and ambiguous network failure; fields preserved; no false saved claim. Existing read-only owner/nonowner/BrandBrain tests retained.
- QuotedGeneration, GenerateWithQuote, CreativeJobResult, MediaPreview and CreativeReviewPanel: insufficient/expired credits, duplicate/lost confirmation, same-key resume, truthful queued state, protected image/video result and stale review/approval boundaries. Providers mocked.
- PremiumConnections / SendDraftToTikTok: disconnected/reconnect/revoked/uncertain states and inbox draft distinct from published; no live OAuth.
- PremiumWorkspaceCalendar: date window/timezone, reload/filtering and no automatic publication.
- BillingPanel.checkoutRetry, billingClient.checkout: duplicate-click protection, stable intent key behaviour, ambiguous result/status re-read and active-plan suppression; no Stripe transaction.

No additional missing critical mocked launch test was demonstrated beyond the two additions. Live end-to-end authentication, true persistence, permissions and financial/provider acceptance remain NOT RUN; passing mocks do not close those gates. Existing opt-in integration suites are not enabled against unknown/live resources.

## Verification

Node22.23.3; existing lockfile npm ci, no dependency/source/lockfile change.
- Focused App/workspace/error suites:196/196 PASS,0fail.
- Full Vitest:1280PASS,52 existing opt-in integration tests SKIPPED across9 files;0fail. These require explicit test infrastructure and were not represented as verified. No new skips added.
- Vite production build PASS; diff whitespace PASS. Existing React act/fixture-key and bundle-size warnings do not represent newly demonstrated P0 defects and were not expanded into scope.
- Local logs: /workspace/recovery/bg-017c-08/. Hosted exact-head CI pending access; no result invented. Existing founder-verified release result is preserved, not a result for this test branch.

## Next controlled acceptance step

Wait for Claude's BG-017C-07 write-safety implementation and exact-target deployment approval, with reviewed bridge source/configuration. Then an authorised existing SM Properties session should perform one Step2 create/reuse action, refresh if required, reach Step3, reload and confirm same tenant/project/brand and preserved details; also check another authorised workspace cannot leak prior data. Do not enable gates, create another account, query/write a real database, pay, generate or publish as part of this test-only task. Until hosted evidence exists: actual SM Properties acceptance NOT RUN.

## Governance handoff

Propose a focused dependent draft against WEB71 branch bg-launch-019-hosted-recovery; no source changes to Claude's branch. Post test/source evidence to that PR and API191 if authorised access works; otherwise provide structured NOT WRITTEN checkpoint to connected ChatGPT. Update only existing primary Mission Control TASK_REGISTER/EVIDENCE_REGISTER/CHECKPOINT_INDEX/LAUNCH_BLOCKERS/SESSION_LOG records after reconciliation; no duplicate register/task and no Issue1 operational updates.
