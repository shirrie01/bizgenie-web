# BG-STUDIO-026-FE — workspace calendar against #220 (F3, DEC-025)

27 Oct 2026. Draft, stacked on PR #59 (F1; it needs F1's `fetchPublishingCalendar`). Frontend only. Backend reference: bizgenie-api #220 (application `e653ed346c41887261ff6861342e3861995edcc0`, head `b289a738e703d323d947020ec5af69a7d5029fc9`), `docs/studio/BG_STUDIO_025_BACKEND_HANDOFF.md` F3. #220 depends on #219 on #218; none is merged. No publishing, OAuth activation, deployment or migration.

## What changed
* `GET /customer/calendar` (already adopted from #216) is now read against the real route: the client reads `schedule_id`, `publication_id` and, new in #220, `evidence_kind` + `provider_publication_id`. **A published entry is "Confirmed by the platform" only with `evidence_kind: platform_api` AND a provider publication id**; a manual (customer-attested) one is labelled "Recorded by you; not checked with the platform".
* `src/premium/calendarOverlay.js`: delivery status from `GET /customer/social/calendar` (queued / publishing / uncertain / failed / cancelled) is joined by campaign + variant + the exact planned instant, **only onto items still scheduled**. A published item never receives a second entry or claim (the backend already replaces the schedule with the publication); unmatched overlay rows are counted and reported, not drawn; an overlay failure or truncation never hides the calendar and is stated in words.
* No new gate: the overlay runs only when the existing social gate and a brand scope are present. Scheduling stays as it was (`/schedule`, `/reschedule`, `/unschedule`); nothing here publishes.

## Verification (local; code SHA in the PR)
* Real #220 backend, throwaway PostgreSQL, real HTTP (`qa/integration/workspaceCalendar`): scheduled → dispatch queued → overlay joins `queued` → published by the backend's synthetic connector → exactly one entry, now `published`, `platformVerified`, schedule gone, no overlay; windows over 93 days split into consecutive requests with cursors; bad session refused; social overlay refuses a >93-day window, a bad session and another user.
* Unit/component: new overlay tests, provenance tests, wording tests.
* Browser, gates ON, 1440/1024/768/390/320: 13/13 each with axe clean, including the delivery overlay on the calendar.

## Not proven here
Tenant isolation of `GET /customer/calendar`: the local harness injects an authorization service that admits every authenticated user, so the route's membership check is **not** exercised (the social overlay checks membership inside its own service and is). It needs the real authorization composition in an approved environment. Real-time delivery state, real platform publication and Meta approval are out of scope and unverified.
