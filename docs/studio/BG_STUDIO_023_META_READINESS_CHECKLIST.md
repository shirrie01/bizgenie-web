# Meta (Instagram / Facebook) integration readiness checklist

26 October 2026. **Planning document only.** No OAuth connection, app registration, App Review submission, token request or publishing was performed, and none is authorised. Staging RED, launch NO-GO.

**Evidence limit:** Meta's current developer documentation could not be read from this environment. Every Meta platform statement below is from general knowledge, is marked **VERIFY**, and must be checked against the current Meta documents before it is relied on. Meta changes permission names, review rules and account requirements often. Nothing here is a claim that BizGenie is, or will be, approved.

Status words: UNKNOWN / NOT_STARTED / BUILT_UNVERIFIED / TECHNICAL_PASS / BLOCKED (#191 vocabulary). Everything external is UNKNOWN or NOT_STARTED.

## A. What BizGenie already has (backend #218 `9346055`, frontend branch)

| Item | State |
|---|---|
| OAuth intent with server-stored hashed state, PKCE S256 challenge, 5-minute expiry, one-time completion (`POST /customer/social/oauth-intents`, `/oauth-complete`) | BUILT_UNVERIFIED — exercised only with a synthetic connector |
| Connection record with **opaque token-vault reference only**; no token in any API response (asserted in the FE harness) | BUILT_UNVERIFIED |
| Per-platform **required scopes are injected configuration**, not hard-coded; the fixture uses placeholder `synthetic.publish`/`synthetic.read` | BUILT_UNVERIFIED — real Meta scopes are not configured |
| Owner-only dispatch with exact destination, approved revision, rights and scopes re-checked; durable outbox; no automatic resend after sending/unknown | BUILT_UNVERIFIED |
| A platform result is the only thing that marks a post published (`evidence_kind:"platform_api"`); accepted/queued is never "published" | BUILT_UNVERIFIED |
| Token refresh claim/finish internal only; failed refresh blocks until reconnect | BUILT_UNVERIFIED |
| Frontend social UI | **NOT aligned**: calls non-existent paths; must be rewritten to `/customer/social/*` (see the compatibility matrix) |
| Real connector, app credentials, token vault, redirect handling, webhook/callback authenticity | **NOT_STARTED / absent** |

## B. Meta-side prerequisites (all VERIFY)

| # | Item | Why it matters | Status / evidence needed |
|---|---|---|---|
| B1 | Meta developer app of the right type, owned by the new company's business portfolio | the app owner is the business that must be verified | UNKNOWN |
| B2 | **Business verification** of the new company — stated to be **in review** | Advanced Access (needed to act for customers other than the app's own team) generally depends on a verified business; while it is pending, only people with a role on the app can test | IN REVIEW (founder-reported). Evidence: Meta verification status screenshot/date. **Blocks any customer-facing launch of this integration** |
| B3 | Which login flow: Instagram API with Instagram Login vs Facebook Login for Business (Pages-linked Instagram professional accounts) | decides the permission names, token type, and which accounts can connect | NOT_STARTED — founder/engineering decision |
| B4 | Account types supported | publishing generally needs an Instagram **professional (Business/Creator)** account; Facebook publishing is to a **Page**, not a personal profile | UNKNOWN. Customer onboarding must say so plainly |
| B5 | Exact permissions/scopes for: connecting, reading page/account basics, publishing a photo/video/reel to Instagram, publishing to a Facebook Page, reading insights | request only what is used; each added scope adds review burden | UNKNOWN — **do not copy scope names from this document**; read current docs. Map each to a BizGenie feature and to the backend `requiredScopes` config |
| B6 | Standard vs Advanced Access per permission; App Review submission per permission | Advanced Access needs review with screencast, test credentials, written use-case per permission | NOT_STARTED. Needs a **working, recorded customer flow**, so this is blocked on the integration existing |
| B7 | App Mode (development vs live) and test users/roles | development mode limits who can authorise | UNKNOWN |
| B8 | Required public URLs: privacy policy, terms, data-deletion instructions/callback, valid OAuth redirect URIs (exact match), app icon, category | submission and live mode need them | UNKNOWN. BizGenie's own privacy/terms wording is the founder's; do not invent |
| B9 | Annual Data Use Checkup / data-handling attestations | ongoing compliance | UNKNOWN |
| B10 | Platform Terms / developer policy review: automated posting rules, content labelling (AI-generated media), spam and rate limits, restrictions on storing/caching Meta data | the product publishes AI-generated media for customers | NOT_STARTED. Needs a policy read-through by the founder/Legal |
| B11 | Publishing technical limits: media formats, sizes, aspect ratios, video length/encoding, container/publish two-step flow, per-account daily post limits, rate limits | the backend preview profiles currently provision TikTok-feed fixture only; **Instagram-feed video is not provisioned** | UNKNOWN. Each limit becomes a validated server preview profile, not a UI hint |
| B12 | Token lifetime and refresh rules (short- vs long-lived, refresh windows), revocation/deauthorise callbacks | the backend models expiry/refresh fence/revoke but with no real provider behaviour | UNKNOWN |
| B13 | Insights/metrics availability and definitions (reach, impressions, views change names over time), latency, retention | feeds the R12 snapshots; must map to the backend metric dictionary and attribution policy | UNKNOWN |
| B14 | Webhooks (if used) and their signature verification | callback authenticity is a stated backend gap | NOT_STARTED |

## C. BizGenie-side work before any real connection (ordered)

1. Founder decisions: B3 (login flow), which accounts/platform surfaces are in scope for first release, and whether publishing is launch-mandatory (issue #191 says social plugins are a **pre-launch gate**; autonomous publishing/automatic analytics are separately classed — keep the distinction).
2. Backend (Codex): a **Meta connector** behind the existing interface (`exchange`, `publish`, `reconcile`, `verifyObservation`), reading app credentials from the secret manager, never from code or the frontend; real token vault; callback verification; per-platform `requiredScopes` from the approved list; preview profiles for each Meta format. Not authorised until a separate approval.
3. Frontend: rewrite `socialClient.js`/`PremiumConnections.jsx` to `/customer/social/*`: connect (PKCE verifier kept in memory/session only), return-state handling (success, denied, expired state, scope shortfall, wrong account type), disconnect, dispatch list/cancel, calendar overlay without double counting, "uncertain — will not be re-sent" wording. Gate remains OFF.
4. Staging-style rehearsal in an isolated environment with **Meta test users only**, owner and member, revocation and expiry cases, before any App Review recording.
5. App Review packs per permission (use case, screencast, test accounts) — founder-owned submission.
6. Only after review outcomes and a separate go decision: capability activation. Not in scope here.

## D. Token protection requirements (all must hold before real tokens exist)

* Tokens exist only in the token vault; the API stores an opaque reference; no token is logged, returned, cached, sent to the browser, or placed in a URL.
* Authorisation codes and PKCE verifiers are single-use; state is hashed server-side, expires, and is bound to actor, workspace and platform.
* Least privilege scopes; scope-shortfall after consent is a visible, non-publishing state.
* Disconnect revokes at the provider where possible and always fences the connection locally; refresh failures stop publishing rather than retry blindly.
* Only the workspace owner connects or publishes; members read.
* Per-tenant isolation tests (foreign actor → 404) already exist for the synthetic fixture and must be repeated against the real connector.

## E. Questions for the founder

1. Is autonomous Instagram/Facebook publishing required for the first paying customer, or is manual publication with attested outcomes acceptable until Meta access is granted?
2. Which login flow and account types should be supported first?
3. Who owns the Meta developer account and business portfolio, and when is the business verification decision expected? Until it lands, nothing customer-facing can be reviewed.
4. Who approves the privacy policy, terms and data-deletion wording that Meta will check?
