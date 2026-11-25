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
