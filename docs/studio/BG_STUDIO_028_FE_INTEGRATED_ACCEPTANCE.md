# BG-STUDIO-028-FE — integrated acceptance branch (F1 + F2 + F3 + F5) against the real local backend

27 Oct 2026. Draft integration branch: #56 + #59 (F1, updated) + #61 (F3) + #60 (F2) + #62 (F5) merged, with the fixes below. Backend: bizgenie-api #220 (application `e653ed346c41887261ff6861342e3861995edcc0`, head `b289a738e703d323d947020ec5af69a7d5029fc9`) → #219 → #218; none merged. **Local acceptance, not staging.** No merge, deployment, shared migration, paid generation, OAuth activation or publishing; nothing left this machine.

## What "real backend" means here (and what it does not)
`qa/real-backend/server.mjs` boots the actual #220 routers on a disposable PostgreSQL database with all migrations applied, over real HTTP with real CORS. A real Chromium drives the built app (all gates ON) against it. **Real:** media intake and inspection, quote/confirm, creative jobs and attach, campaign review/preview/acknowledge/approval, authenticated media delivery, social OAuth intent/complete/disconnect, the workspace and publishing calendars, performance snapshots/recommendations/feedback, tenant checks inside those services, CORS. **Stubbed (and labelled):** the sign-in provider (token `ok`), the customer-workspace bootstrap endpoints and billing (the harness does not compose them), the platform sign-in page (a redirect stub; the authorize URL itself is built by the real server), the platform connector, image provider, content inspector and object storage (the backend's own synthetic ones), and a small dev loop that plays the product worker that does not exist yet. The OAuth configuration is the backend's own synthetic test configuration (vTEST path, example.test redirect); **it is not a Meta setting and implies no approval**. Reproduce: `BIZGENIE_API_DIR=… TEST_DATABASE_URL=… qa/real-backend/run.sh 1440x900`.

## Results at the integrated head (code SHA in the PR)
| Check | Result |
|---|---|
| Unit/component | 1055 passed, 51 skipped (need a backend) |
| Integration vs real #220 (8 files, throwaway PostgreSQL) | 51/51: social OAuth round trip + fail-closed, creative jobs/media intake, strategy-plan output, workspace calendar, learning incl. revoked-source fail-closed, quote/confirm, performance evidence, backend draft routes |
| **Real-backend browser acceptance**, 1440/1024/768/390/320, fresh harness each | **6/6 at every width**, axe WCAG 2.x A/AA clean on every checkpoint, no horizontal overflow, zero 4xx/5xx from the backend in the journeys |
| Mocked-network browser, gates ON | 15/15 at each width |
| Mocked-network browser, gates OFF (default build) | 57/57 at each width |
| Build | OK |
The six journeys: **media** (add a PNG with the rights confirmation → server inspection → authenticated preview → withdraw); **isolation** (another user cannot read the list); **creative** (price → confirm → worker → server result → attach → image shown → **send for review → render preview → acknowledge → approve** → approved image shown, current version); **calendar** (one entry per post; still-scheduled post shows delivery status; platform-published post "Confirmed by the platform", not shown twice; no per-campaign fan-out); **learning** (nothing read until the owner asks → snapshot → compare → accept with server version → decision survives a reload → a member reads suggestions only); **accounts** (shows what the server reports; an unconfigured platform fails closed and opens nothing; disconnect is local; connect follows the server-built URL, completes only against this browser's attempt, removes the one-use code from the address bar and deletes the verifier).

## Defects this acceptance found in the app, now fixed
1. **An attached creative could not be sent for review.** No client called `POST …/variants/:id/review`; the legacy generate route used to move the post to review, the new attach does not. Added `submitForReview` and a "Send for review" action (owner, only while the post is a draft carrying this asset, current revision only; it approves and publishes nothing).
2. **An approved creative was never shown.** Only the review step loaded the saved creative; the approved card said "The image itself can't be shown here yet". `ApprovedCreative` now loads the current revision's creative and its media through the existing authenticated delivery. Scope: approved posts with attached media. Scheduled/published posts still show the text form only (not changed).
3. Copy: "Finished. Finished. 2 credits used." and a stale statement that nothing needed for Hybrid existed (it now says you can add your own media, but combining it with AI is not finished).

## Not proven / remaining
* Everything above is local and synthetic. No deployed environment, real provider, real platform data, Meta approval, or real billing was involved (class D evidence still absent).
* `GET /customer/calendar` tenant isolation is not exercised by the harness (its authorization service admits every authenticated user); the social, media, jobs and insights services check membership themselves and are asserted.
* Hybrid (F4): newer media-intake lineage is used; the combining step is not complete and is not claimed.
* Scheduled/published posts do not display their media (item 2 scope). A flaky existing unit test (`QuotedGeneration` "a session that ends is reported upward") can fail under full-suite load; it passes in isolation.
* Hosted CI runs unit/mocked-browser/build only; this real-backend acceptance needs a backend checkout and PostgreSQL and is run locally.
