# BG-LAUNCH-010 — Customer journey walkthrough, UX assessment and draft fixes (4 Nov 2026)

Staging RED. Launch NO-GO. Frontend-only draft stacked on Web #65 (`5c0da994`); #65 is not modified. No merge, deployment, DNS, traffic change, production edit, real social connection, paid generation, Stripe charge or shared staging write was made. Evidence classes: **H** hosted (a deployed environment), **L** local browser against the real backend code on a disposable PostgreSQL with labelled stand-ins, **M** mocked-API browser (CI), **U** unit.

## 1. Provenance (Phase A)
| Item | Verified state |
|---|---|
| Web #65 | `5c0da994260502bacfba2579dbffb37465f4fbc2`, hosted CI run 61 green. This work: branch `bg-launch-010-fe-customer-journey` (base = #65's branch). |
| API #226 | `f1fc2f51502793d9fb03617f30fd72b5a61c1e2e`, CI run 400 green. Deployed to staging as revision `bizgenie-api-staging-00030-pob`, 0% traffic, authenticated `GET /` 200 (Issue #191, 3 Nov); `00029-wtc` serves 100%. |
| API #227 (Codex, LinkedIn) | `b400d27f`, draft, stacked on #224; not part of #226 or of the staging revision. Hosted CI for that head not verified by Claude. |
| Hosted frontend | **None exists.** No Cloudflare Pages project, no `staging-app` host, no deploy pipeline in the repo. Nothing in this document is hosted-proven for the Studio. |
| API base URL | build-time `VITE_BIZGENIE_API_URL`; the Studio never reads scope from the URL; tenant/project/brand come from the Supabase session's `app_metadata`. |
| Safe route to test the isolated backend | None from this session (no Google Cloud credential, no identity token, tag URL not reachable). The Studio cannot be pointed at the tag URL without (a) an authenticated tag URL, (b) its origin in `CORS_ALLOWED_ORIGINS`, (c) a real staging Supabase sign-in. Hosted proof needs the Pages project plus the owner login (founder approvals, Issue #191 Phase B). Codex owns the backend read-only acceptance of the tag URL. |

## 2. Customer journey matrix
Local (L) means the built Studio in real Chromium at 1440 and 390 wide against the real backend routes of #226 on a throwaway database, with stand-ins for sign-in, workspace bootstrap, billing endpoints, image/video providers (H.264 stand-in), inspector, storage and the TikTok HTTP. M and U are in CI/Vitest.

| Step | What the customer does | Evidence | Result |
|---|---|---|---|
| Sign-in and session | email/password, session-scoped workspace | M, U | works against mocks; **no hosted sign-in proven** |
| Onboarding | five-industry flow, owner and member | M (CI, five widths) | works against mocks |
| Brand Brain | read, correct, save without changing the business name | M, U | works against mocks |
| Campaign goal to recommendation to saved campaign | goal, recommended items, save | M, L | works |
| Campaign items | add an image/video item, choose the connected account | L, U | works |
| Creative job | price, confirm (credits set aside), worker, result, "Earlier results" | L (8/8 at 1440 and 390) | works; no real provider |
| Existing image attach and authenticated preview | attach the stored image, preview through authenticated delivery | L | works (the harness's real 1080x1080 PNG) |
| Review, preview, acknowledge, approve | send for review, platform-fit line, approve | L | works; unsuitable media blocks review |
| Schedule and calendar | plan a time; month/week/day; filters; "not yet scheduled" | L, M | works; status text matches the server |
| Your media | add a PNG with rights confirmation, inspect, withdraw | L | works; uploads are OFF in production (no scanner) |
| Credits, plan and billing | balance shown with each price; plan and billing screens | M, U | works against mocks; **no real Stripe proven** |
| Results and insights | owner asks for a snapshot, compares, decides | L | works; no real platform data |
| Accounts: TikTok | connect, sign-in URL checked against TikTok's contract, return, connected, send as a draft, disconnect | L (TikTok HTTP stand-in, 1440 and 390) | **rehearsal only, not TikTok acceptance** |
| Accounts: LinkedIn | connect, typed capabilities | U (new) | client ready for Codex's reviewed protocol; **backend #227 not deployed**; no live OAuth |
| Accounts: Facebook/Instagram/YouTube | Connect button | U | no connector exists; the button answers "not set up yet" (see D4) |
| Error handling | failed job, rejected video, 401 session end, 409 conflicts, 5xx on a write | L, U | wording checked below |

## 3. Real user-visible distinctions (Phase C)
| Distinction | What the screen says | Checked |
|---|---|---|
| Generated vs draft vs published | "Finished is not approved and not published"; "Draft" badge; approved: "Manual publication required. BizGenie will not claim this was published until you tell it so"; Published only with platform evidence, otherwise "Not confirmed by the platform" | L, U |
| TikTok draft vs publishing | "Draft sent to TikTok ... in your TikTok inbox ... BizGenie has not published it"; no cancel; never Published, even if the server sent publication evidence; Direct Post does not exist | L, U |
| Pending vs failed video | pending: "Being created ... can no longer be cancelled"; unknown outcome: "BizGenie is checking the result with the provider. Do not start it again"; failed: "Not made. ... You were not charged." with the reason | L (rejected-video journey) |
| Charged vs not charged | credits are "set aside", used only on success, "released if it fails"; a failure says "You were not charged". There is no refund concept for generation (nothing is debited); invoice refunds are not shown or claimed | L, U |
| Unconfirmed delivery | "Outcome being checked ... cannot yet tell whether this reached the platform, so it will not send it again" (new test) | U |

## 4. Visual and UX assessment
Strong: consistent card language, plain honest wording, clear status pills, calendar and the review flow, 24 px touch targets, axe-clean in CI at five widths, no horizontal scroll at 320 in CI. Findings (D = fixed here, O = open):
- **D1** Accounts and publishing: buttons ("Disconnect", "Cancel") ran into the text and the "Publishing" heading touched the Connect buttons. Fixed: row cards with consistent spacing; links use the focus-safe blue.
- **D2** Campaign items sat in a fixed three-column grid, so one or two items were squeezed into a third of the width with a long price panel. Fixed: the grid fits the content (one card fills the width, two or three share it).
- **D3** Duplicate wording "Not made. It could not be made." Fixed: "Not made. You were not charged." / the reason.
- **D4** "The platform refused it." stated a cause the server does not report. Fixed: "It could not be delivered. Nothing was published."
- **D5** Connect buttons are offered for every platform this client knows, including YouTube, Facebook and Instagram, for which no connector exists. Added an optional build-time list `VITE_SOCIAL_PROVIDERS` so a staging or launch build offers only what is set up. **Unset keeps today's behaviour**; the founder decides the list per build (see section 6).
- **D6** LinkedIn: the sign-in URL check demanded PKCE parameters LinkedIn's web flow does not carry; connected accounts could not show what BizGenie cannot do yet. Fixed per Codex's reviewed proposal (section 5).
- **O1** Brand: the Studio uses charcoal (`#16211d`) on a warm grey with a brown eyebrow; **no coral and no tagline appear in the app**. The approved coral hex is not in either repository (palette hex sign-off is still listed as open in Issue #51), so no colour was invented. The locked tagline "Make. Launch. Learn what converts." (Canon, DEC-011 / LOCK-017) can be added to the header once its placement is approved.
- **O2** Video playback cannot be seen in open-source Chromium (no H.264); the app shows "couldn't be displayed in your browser". Real Chrome is needed to see the Veo result (`BG_BROWSER_CHANNEL=chrome`).
- **O3** "Waiting its turn" for a queued dispatch is vague; "Waiting to be sent at the planned time" would be clearer (wording decision).
- **O4** The Studio nav has 13 items in two wrapped rows at 1440 and a stacked block on mobile; a grouped menu would help (design decision, not a defect).
- **O5** The first customer sees empty states and "Hybrid is not available yet" in several places; Hybrid UGC is outside the approved scope and is not claimed.

## 5. Integration with Codex (Phase D)
**TikTok (API #224/#226).** Studio ready: connect with the checked TikTok URL (now also the reviewed staging callback host), draft handoff with confirmation, uploaded-draft states, disconnect. Missing before a real sandbox connection (all outside this PR): deploy of `f1fc2f51` traffic or a reachable authenticated route, the Pages host `staging-app` with the owner sign-in, `TIKTOK_REDIRECT_URI` and `TIKTOK_BROWSER_RETURN_URI` set, the redirect URI registered in the TikTok portal, secrets, upload placeholders. User-facing errors exist for: not set up yet (config), expired attempt, state mismatch, access denied, unconfirmed outcome (5xx), conflict (409/422), session ended (401).
**LinkedIn (API #227, Codex).** Applied the reviewed web-client proposal on this head: LinkedIn is checked against its own contract (exact host/path, `client_id`, no PKCE parameters, exactly one of each security parameter, the reviewed callback) **only when the server states `oauth_protocol=linkedin_oidc_web` and `provider_pkce_required=false`**; otherwise the generic S256 requirement stays. Typed capabilities from `GET /connections` are parsed (known keys only) and the Studio lists what is **not** available with the server's reason. Not changed: no LinkedIn publish UI exists or is claimed (text posting is disabled in the backend and unverified). Dependencies on Codex: hosted CI of #227, the exact response fields (`oauth_protocol`, `provider_pkce_required`, `capabilities`) emitted by the deployed API, and the verified Posts API contract. Dependency on the founder: LinkedIn portal callback registration and the staging callback host for LinkedIn (`TIKTOK_REDIRECT_URI` allows only the TikTok path today; LinkedIn needs the same decision).
**Meta and Hybrid UGC.** Unchanged and not claimed.

## 6. Draft fixes: exact-head evidence
Local, same head code: Vitest 60 files / 1091 passed (52 skipped), build OK; real-backend browser 8/8 at 1440 and 390; TikTok stand-in draft journey passes at 1440 and 390; mocked premium browser (flag on) 57/57 at 1440; mocked premium browser with every capability gate ON 15/15 at 1440, 768, 390 and 320. Screenshots (before/after) are kept in the session folder `evidence-bg-launch-010/` (not committed).
**Hosted CI.** Per-run results are recorded on the pull request. History: runs 62-64 were red on one test (`qa/premium-session.browser.qa.mjs:20`); the untouched #65 head failed identically (run 63) although it was green on 1 Nov. **Root cause (BG-LAUNCH-011, reproduced in a clean clone):** CI ran `npm install --no-save --package-lock=false ...` after `npm ci`, which re-resolved every floating range and ignored `package-lock.json`, so supabase-js 2.119.0 (published 4 Nov 2026, 13:11 UTC) replaced the locked 2.116.0; in 2.119.0 a default sign-out whose server revoke request is refused keeps the session, so "Sign in again" did nothing. Fixed by making sign-out local-first and by making the workflows honour the lockfile (see the BG-LAUNCH-011 commit). Note: that failure had also made the gates-ON suite skip in hosted CI; it now runs independently.
One genuine regression of this branch was caught only by the local gates-ON run and is fixed in this head: a browser test asserted the old wording "The platform refused it" (changed deliberately in D4).

## 7. Shortest route to the first paying customer
Verified blockers, in order (owner): (1) Studio hosting: Pages project + `staging-app` + owner login (founder, then Claude); (2) acceptance of the 0% revision's authenticated routes and database-backed operations, then the traffic decision (Codex, founder); (3) real TikTok sandbox connection and draft (founder at the keyboard); (4) real image and Veo proof with spend approval (founder); (5) checkout with a real Stripe test payment and entitlement; (6) legal pages and public callbacks; (7) production security items in Issue #191 (key management, media isolation, uploads off); (8) release and rollback plan. LinkedIn, Meta and Hybrid are separate gates.

## 8. Mission Control rows to synchronise (nothing was written)
| ID | Domain | Item | Class | State | Evidence | Next |
|---|---|---|---|---|---|---|
| M12-CJ | Customer experience | Journey matrix and UX review, local stand-in | PRE | TECHNICAL_PASS (local), not hosted | this document, PR (draft) | host Studio on staging-app |
| M07-LI-FE | Social | LinkedIn web client and capability display | PRE | BUILT_UNVERIFIED | unit tests; backend #227 not deployed | deploy path + live approval |
| M07-TT-FE | Social | TikTok handoff UI | PRE | BUILT_UNVERIFIED (stand-in rehearsal) | L 1440/390 | real sandbox connection |
| M12-BR | Brand | Coral palette and tagline in the app | PRE | BLOCKED (hex not approved in repo) | section 4 O1 | founder supplies hex and placement |
