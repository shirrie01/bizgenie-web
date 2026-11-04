# BG-LAUNCH-017 — Staging Studio activation request (for the founder)

4 Nov 2026. This is the single decision pack. **Nothing below has been done.** Values come from `qa/hosted/staging-settings.json` (guarded by a test against the release workflow). Staging RED, launch NO-GO; this activates a controlled staging Studio, not a launch.

## 0. Cloudflare inspection (read-only), BG-LAUNCH-017
No Cloudflare connector, token or `wrangler` is available to this session (searched once; not retried). Public lookups from this sandbox returned no DNS answer and no HTTP response for `staging-app.getbizgenie.com` and `bizgenie-studio-staging.pages.dev`; the sandbox's egress is proxied, so this is weak evidence of absence, not proof. Therefore **NOT CHECKED:** whether the project exists, whether the hostname is attached elsewhere, whether any deployment exists, whether any settings match. Nothing in either repository or in Issue #65 records that any of them was created. Whoever has the dashboard should look at three things before approving: Workers & Pages list, the Custom domains tab of any matching project, and `dig CNAME staging-app.getbizgenie.com`. If a project already exists and holds anything other than a prior BizGenie staging Studio, **do not reuse it**; pick another name and tell me, because the workflow, settings file and hosted harness name `bizgenie-studio-staging`.

## 1. Harmless preparation (already possible; changes nothing live)
| Item | How | State |
|---|---|---|
| Exact-SHA build, tests, staging guards, bundle/headers verification, artefact hash | Actions → "Studio staging release (manual)" with `deploy` = false | ready; not yet run (Web PR #69 carries this) |
| Smoke host guard | the workflow refuses any `smoke_url` that is not `staging-app.getbizgenie.com` or the project's `pages.dev` host | done |
| Hosted acceptance harness and its self-test | `qa/hosted/`; self-test runs in CI | done |
**Dispatching note:** GitHub's "Run workflow" button lists a workflow only when its file is on the default branch, and `main` does not have it. Dispatch by command: `gh workflow run studio-staging-release.yml --repo shirrie01/bizgenie-web --ref <branch holding the workflow> -f sha=<approved 40-char SHA> -f deploy=false`. The SHA input, not the ref, decides what is built.

## 2. The live changes this approval would authorise (everything else needs its own approval)
| # | Change | Exact value | Owner | Reversible by |
|---|---|---|---|---|
| 1 | Cloudflare Pages project, **Direct Upload** (no Git integration, no build on Cloudflare, no previews) | name `bizgenie-studio-staging`; production branch label `main`; no Cloudflare build variables or secrets (the build runs in GitHub) | founder | delete the project |
| 2 | Custom domain on that project | `staging-app.getbizgenie.com` | founder | remove the domain |
| 3 | GoDaddy DNS: one new record | `CNAME staging-app → bizgenie-studio-staging.pages.dev` (nothing existing edited) | founder | delete the record |
| 4 | Cloudflare API token (Pages: Edit, restricted to this account) | stored only as GitHub Environment secret `CLOUDFLARE_API_TOKEN`, plus `CLOUDFLARE_ACCOUNT_ID` | founder | revoke the token |
| 5 | GitHub Environment `staging-studio` | required reviewer(s) = the founder; holds the two secrets above | founder | delete the Environment |
| 6 | GitHub repository variables | `STAGING_SUPABASE_PUBLISHABLE_KEY` (the publishable key only; the workflow refuses `sb_secret_…` and JWT-shaped values); `STAGING_SUPPORT_URL`, `STAGING_TERMS_URL`, `STAGING_PRIVACY_URL` **only when real** (unset shows "not set up yet") | founder | edit/delete |
| 7 | Supabase Auth settings on the **staging** project `zrczojyxebwjgpymbmgu` only | Site URL `https://staging-app.getbizgenie.com` and the same in the redirect allow-list; state whether email confirmation is on | founder | restore previous values |
| 8 | Sandbox test account on the staging project | a synthetic address the founder controls; confirmed; credentials held by the founder and given to the harness only through `HOSTED_TEST_EMAIL` / `HOSTED_TEST_PASSWORD` with `HOSTED_IDENTITY_APPROVED=yes` | founder | delete the user |
| 9 | Backend connection method | choose A, B or C in `BG_LAUNCH_017_CONNECTIVITY_CONTRACT.md` §3 (recommended: A for staging after rehearsal under C). **This is an IAM decision and is not included in the approval sentence below unless you choose it** | founder + Codex | revert IAM |

## 3. Codex prerequisites (not Studio changes)
Staging API revision under test serves the chosen host; `CORS_ENABLED=true` and `CORS_ALLOWED_ORIGINS=https://staging-app.getbizgenie.com`; `SUPABASE_SERVICE_ROLE_KEY` set server-side (bootstrap writes the trusted scope); `STRIPE_SUCCESS_URL`/`STRIPE_CANCEL_URL` only after the Studio host exists and Stripe is in test mode; provider flags off; BG-LAUNCH-014's Draft successor against #226 with exact-head CI.

## 4. After approval: the exact sequence
1. Check section 0 (Cloudflare list, DNS). 2. Create 1–6, then 7 (if confirmation is on). 3. Dispatch the release workflow with `deploy=false`; review the summary (commit, dist sha256). 4. Dispatch again with `deploy=true`; approve in the `staging-studio` Environment; the job re-checks the artefact hash, records the previous deployment id, deploys, smoke-tests the live host. 5. Run the hosted acceptance command below, first without an identity (proves headers, load, and browser-to-API connectivity), then with the sandbox identity. 6. Attach `report.json` and the screenshots to Issue #191.

**Hosted acceptance command (read-only; refuses any host that is not the approved staging Studio):**
`HOSTED_TEST_EMAIL=… HOSTED_TEST_PASSWORD=… HOSTED_IDENTITY_APPROVED=yes node qa/hosted/hosted-acceptance.mjs --target https://staging-app.getbizgenie.com --out evidence-hosted-1`
Exit 0 all PASS; 1 any FAIL; 3 no FAIL but something NOT RUN (always the case until the six write journeys W01–W06 have their own approvals); 2 refused to start. The report states `HOSTED REAL` only when the host was allowlisted and nothing was intercepted.

## 5. Rollback
Cloudflare → `bizgenie-studio-staging` → Deployments → the previous deployment id recorded in the job summary → Rollback; or pause the project, or delete the CNAME to take the host offline. Delete the Environment/secrets/token and Supabase test user to undo 4–8. No database, Cloud Run traffic, secret rotation or production setting is touched by a Studio deploy.

## 6. Approval sentence (smallest useful)
"Approve items 1–6 above (and 7 if email confirmation is on, and 8): create Cloudflare Pages project `bizgenie-studio-staging` (Direct Upload), attach `staging-app.getbizgenie.com`, add the GoDaddy CNAME, create the `staging-studio` Environment with me as required reviewer, and set the listed variables, for exact SHA `<SHA of the final Web PR head>`. Backend connection method: `<A | B | C>`."
