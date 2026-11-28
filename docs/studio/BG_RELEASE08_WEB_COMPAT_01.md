# BG-RELEASE08-WEB-COMPAT-01 — founder release profile for the Studio build (source candidate)

26 Nov 2026. **Source only: nothing is deployed, no workflow was run with the new input, no API revision is invented.** Base: accepted WEB main `18119b3fd9eec2283ab4f8910848dfda81c49dc0`. Authority: API issue #191 (BG-RELEASE08-BUILD-01 finding: the release workflow could not produce the founder profile, and the shipped manifest is empty).

## What changes (and what does not)
| Area | Change |
|---|---|
| `.github/workflows/studio-staging-release.yml` | three **optional** inputs, empty by default: `route_profile`, `api_source_sha`, `api_serving_revision`. Empty `route_profile` = today's release, same build step, same settings (a golden test asserts the default step's full environment). New steps are skipped unless the profile is set |
| Profile validation step | bash, runs before any build: empty profile must come with empty identity; `route_profile` must be exactly `bridge-founder-release04`; `api_origin` must be a listed trusted-bridge origin; `api_source_sha` = 40 lowercase hex; `api_serving_revision` = exact `bizgenie-api-staging-NNNNN-xxx` (no wildcard, no `latest`) |
| Manifest gate step | `scripts/check-release-profile.mjs` (vite-node) after `npm test`, before the build: the **reviewed manifest in the built commit** must list exactly that API source SHA + serving revision with **exactly** this stage's capabilities. Otherwise the build fails (exit 1, codes only, no values printed) |
| Profile build step | separate, mutually exclusive with the default build: `VITE_API_ROUTE_LIMITS=bridge-founder-release04`, `VITE_API_SOURCE_SHA`, `VITE_API_SERVING_REVISION` from the validated inputs, and only `VITE_PREMIUM_STUDIO_ENABLED`, `VITE_FOUNDER_CAMPAIGN_ROOT_API`, `VITE_CONTENT_PLAN_API`, `VITE_COPY_EDIT_API`, `VITE_WORKSPACE_CALENDAR_API`. **Not set:** generation quote, customer media, media intake/delete, social accounts and providers (LinkedIn deferred), unschedule, analytics, billing, catalogue, credit preview |
| `src/premium/releaseProfile.js` | the stage as a pure contract (`checkReleaseProfile`), reusing the existing `featureAvailability` gate in production mode; no change to `featureGate.js` or the manifest schema |
| `src/bridgeLimits.js` | `routeLimited` now also applies to `bridge-founder-release04` (checkout and manual publication are not carried by that bridge either; without this the profile would show controls whose writes the bridge denies, the W1 class of defect). Every other build is unchanged |
| `src/premium/apiCompatibility.js` | **unchanged and still empty** — see "Binding" |
Tests changed: the three guard tests that encode the default release were updated to the two-step workflow without being weakened (each legal URL maps from its repository variable once per build step; the default step still declares no API identity; a literal SHA would still have to be in the manifest).

## Fail-closed behaviour (all tested)
- Unknown or mismatched API source SHA or revision, missing/empty/whitespace/short/uppercase SHA, wildcard/`latest`/malformed revision → refused before the build; at runtime the gate also keeps every feature off (`revision_not_in_manifest`, `api_revision_undeclared`).
- A manifest entry that lists more than this stage (e.g. `mediaIntake`, `social` + providers, `quotedGeneration`) or less (a required capability missing) → refused. **Media intake stays unavailable** until a later reviewed change adds both the capability and the flag after A2 scanner acceptance.
- Features flipped on by mistake (`VITE_*` flags for intake, social, generation, billing, analytics) stay off: capability not verified, or not carried by the bridge.
- The shipped manifest is empty, so a profile build is refused today. This is intentional.

## Binding the real API revision (the only remaining step; needs the verified tagged revision)
Add exactly one entry in a reviewed commit on this PR, only after the tagged API revision is deployed and read back, with the evidence comment URL:
```js
{ sourceSha: "dfd49116a0fe6bde11dbc25ca4599a03b8046999", servingRevision: "<the exact revision name read back from Cloud Run>", verifiedAt: "<ISO time of the readback>",
  evidence: "https://github.com/shirrie01/bizgenie-api/issues/191#issuecomment-<id>",
  capabilities: { contentPlan: true, copyRevisions: true, founderCampaignRoot: true, workspaceCalendar: true } }
```
No `socialProviders`, no `mediaIntake`. Then dispatch the workflow with `sha` = the merged WEB commit, `api_origin` = the listed bridge origin, `route_profile=bridge-founder-release04`, `api_source_sha` and `api_serving_revision` identical to the entry, `deploy=false` first. The WEB SHA to deploy is therefore the merge of this change plus the binding, not `18119b3f…`.

## Dependencies and boundaries
Needs: the real tagged API revision (from `a0-deploy.sh api` / the founder's E1 run). Not in scope and not changed: UI design, new features, paid generation, publishing, Stripe, LinkedIn activation, token vault, Sprint10C. No merge or deployment before independent acceptance.

## A0–A2 capability matrix (reconciled against the accepted Release 08 API contract)
Verified by reading the source and the existing tests on this branch; local run: 1638 passed / 52 skipped / 0 failed; hosted run for head `0a270edc…`: test-build, Cloudflare Pages preview and the four browser viewports green. **No hosted verification against a real tagged API revision exists yet; the compatibility manifest is deliberately empty, so the profile build is refused.**

| Area | Wiring | Offline evidence | Disabled / unavailable behaviour | Status |
|---|---|---|---|---|
| Founder sign-in and onboarding | `App.jsx` session + `PremiumOnboarding` (bootstrap only when no workspace exists; the bridge keeps generic bootstrap closed, smoke asserts 403) | `PremiumOnboarding.panels.test.jsx`, `App.premium.workspaces.test.jsx` | Bootstrap not offered when a workspace exists | OFFLINE TESTED |
| Workspace creation | **Not a Studio action in A0**: the founder makes the single pinned `POST /customer/workspace/brands` request from the runbook (curl), as designed in Release 07 | API `founderRelease07` tests | No create-workspace button exists, so nothing can call a closed route | BY DESIGN |
| Workspace selection | `workspaceClient.js` → `POST /customer/workspace/select` | `workspaceClient.test.js`, `App.premium.workspaces.test.jsx` | Single-workspace accounts see no switcher | OFFLINE TESTED |
| Brand Brain | `PremiumBrandStrategy`, `PremiumBrandBrain` over `GET/PUT /customer/workspace/brand-brain` (bridge allows these) | `PremiumBrandStrategy.test.jsx` | Read-only role disables edits | OFFLINE TESTED |
| Content-plan generation | `ContentPlanPanel`, gate `contentPlan` (`VITE_CONTENT_PLAN_API` + capability `contentPlan`) | `ContentPlanPanel.test.jsx`, `releaseProfile.test.js` | Panel not rendered unless flag and verified API pair | OFFLINE TESTED |
| Copy editing and revisions | `CopyRevisionEditor`, gate `copyEditing` (capability `copyRevisions`); `bridge-v1` still blocks it, the founder profile allows it | `CopyRevisionEditor.test.jsx`, `releaseProfile.test.js`, `bridgeLimits.test.jsx` | Editor receives `enabled=false` and says so | OFFLINE TESTED |
| Campaign-root capability | `App.jsx:626`, gate `founderCampaignRoot` | `founderCampaignRootClient.test.js`, `releaseProfile.test.js` | Root-only mode off without flag/pair | OFFLINE TESTED |
| Calendar | `PremiumWorkspaceCalendar`, gate `workspaceCalendar` (and `unschedule`, same capability, route admitted by the bridge) | `PremiumWorkspaceCalendar.test.jsx`, `releaseProfile.test.js` | Calendar absent without flag/pair | OFFLINE TESTED |
| API compatibility manifest | `apiCompatibility.js`, empty; profile gate script refuses unknown SHA/revision | `releaseProfile.test.js`, `stagingReleaseWorkflow.test.js` | Whole profile build refused; default build unchanged | OFFLINE TESTED; **binding awaits the real revision** |
| Media intake, social, quotes, generation, billing, analytics | Flags unset in the profile; `routeLimited` states "not available in this test environment" for checkout and manual publication | `releaseProfile.test.js` (all OFF even if flags are set by mistake), `bridgeLimits.test.jsx` | Plain-language notice, nothing is called | OFFLINE TESTED |
| Mobile and desktop rendering | Existing responsive layout; no layout change in this PR | Hosted browser job at 320, 390, 768 and 1440 wide: green | n/a | HOSTED CI VERIFIED (marketing/site harness); Studio screens against a live API are **not yet hosted-verified** |

Next, once the founder's A0 run has produced the tagged API revision: add the single manifest entry (sourceSha `dfd49116…`, `servingRevision` read back, evidence = the founder's EV_TAG comment, capabilities exactly `contentPlan`, `copyRevisions`, `founderCampaignRoot`, `workspaceCalendar`), run `scripts/check-release-profile.mjs`, then dispatch with `route_profile=bridge-founder-release04` and `deploy=false` only.

## Bridge permission evidence (API identity alone is not enough)
The founder bridge forwards only the routes its own permission flags admit (A0 `workspace` profile: workspace creation/selection and reads; campaign-root, draft/copy and calendar writes need the A1/A2 bridge profiles). An API revision proves nothing about that. Under `VITE_API_ROUTE_LIMITS=bridge-founder-release04` a manifest entry must therefore also carry `bridge: { evidence: <#191 comment URL>, capabilities: { … } }`; a control is shown only when the bridge capabilities list names its capability, and `checkReleaseProfile` (the workflow gate) refuses the build unless the bridge evidence covers exactly the four stage capabilities. A malformed `bridge` block makes the whole entry untrusted. The default release and `bridge-v1` are unchanged. **Consequence:** the A0 bridge alone does not justify this profile; bind it only after the A1/A2 bridge permissions are hosted-evidenced.

## Stage-aware gate (A1 / A2)

The staging workflow takes an optional `stage` input (default `a2`, unchanged behaviour). `a1` accepts a reviewed manifest entry (and bridge evidence) listing exactly `contentPlan` + `founderCampaignRoot`; `a2` lists the full four (`contentPlan`, `copyRevisions`, `founderCampaignRoot`, `workspaceCalendar`). Each stage refuses the other's manifest and any unknown stage, and the build flags are unchanged because `featureGate.js` still hides every control whose capability is not evidenced. Media intake and social need a later `a2b` stage; the manifest stays empty until the founder-approved live evidence is recorded in Mission Control #191.
