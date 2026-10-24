# Frontend / backend contract for BG-STUDIO-008 (for Codex, BG-STUDIO-008-BE)

Status: **frontend requirements and dependency findings, not an agreement.** Nothing here changes a backend endpoint; the frontend added no endpoint and no new request shape. Authority: the Google Sheets Mission Control Register v1.0 (DEC-015) is canonical; this file is a frontend-owned input to it. Verified against `bizgenie-api` PR #210 head `e26b79d273fe2a906245b1ce52fd6d7e67df4250` (docs, tests and a proposed contract only; no endpoint change) which sits on #209 `6911ffc` and #208 `bf12050939817ae6da3f696808fc5a7f054d74ab`.

## 1. Endpoints the production Premium Studio uses (all existing)
| Purpose | Endpoint | Frontend behaviour |
|---|---|---|
| Check workspace | `GET /customer/workspace` | Only when the session has no scope. `selection_required` is reported, never guessed. |
| Create workspace | `POST /customer/workspace/bootstrap` `{business_name, website_or_social_profile?, primary_marketing_challenge?}` | Sends exactly what the customer typed; empty optional fields are omitted because the schema rejects empty strings. Idempotent per the backend; an existing workspace is kept. |
| Read Brand Brain | `GET /customer/workspace/brand-brain` | On entry. A failure is shown as unavailable, never as empty. |
| Save Brand Brain | `PUT /customer/workspace/brand-brain` | Only on an explicit Save. Sends the existing brain plus `name`, `identity.description`, `audience.summary`, `commercial.primary_cta`; `brand_id`, `project_id` and `metadata` are stripped as before. **Note (DEC-021 / LOCK-019, 24 Oct 2026):** only owners may write `name` and `identity.description`; members keep the other fields. The backend enforcement and its response contract are pending; this client sends the full editable Brain and reports every refusal with one generic sentence. See `BG_STUDIO_013_FE_FOUNDER_ACCEPTANCE.md`, section 12. |
| Recommendation | `POST /customer/campaign-recommendations` | Typed goal text only, with the session's own scope. |
| List campaigns (**newly used**) | `GET /customer/campaigns?tenant_id&project_id` | Read only. Archived campaigns are excluded; the newest is restored with `GET /customer/campaigns/:id`. |
| Campaign, review, media, calendar, measurements, manual publication | unchanged | Reused as-is through the existing UI. |

## 2. Contract gaps (frontend cannot do these without backend work)
| # | Gap | Effect today | Needed from backend |
|---|---|---|---|
| G1 | **No sector/industry field** anywhere (Brand Brain has name, identity, voice, audience, commercial, competitors, visual only) | Sector is inferred from the customer's own text or chosen, kept in the session, labelled "inferred" or "you entered this · not saved yet". It is lost on refresh. | A Brand Brain (or workspace) field for sector, with a documented enumeration or free text. |
| G2 | **No channel-preference field** | Channels the customer plans for are session-only and labelled "planning only, not connected". The recommendation request has no channels parameter, so they do not influence it. | A saved channel-preference field, and optionally a `channels` input on the recommendation request. |
| G3 | **No onboarding draft or progress persistence** (Save and exit) | A refresh loses unsaved answers (goal, sector, channels, typed-but-unsaved text). Completion is derived from saved data (real name and description in the Brand Brain), never a local flag. | A draft store, or accept that only Brand Brain fields persist. |
| G4 | **Placeholder brand name** | The existing flow names a workspace `Customer Campaign Workspace` when the goal text does not match its heuristic. Premium treats that exact name as missing. | Confirm that string is the only placeholder, and stop generating it (the legacy `businessNameFromGoal` heuristic in `App.jsx` also contains a customer-specific literal). |
| G5 | **Multiple workspaces** (`selection_required`) | Premium says selection is not available in this view yet. | Confirm intended flow, then the frontend can add a chooser using `POST /customer/workspace/select`. |
| G6 | Campaign list ordering and shape | Frontend sorts by `updated_at` descending and uses only `campaign_id`, `name`, `status`, `archived_at`, `updated_at`. | Confirm those fields are stable; document the ordering guarantee if there is one. |

## 3. Video and media metadata the frontend needs (BG-STUDIO-008-BE input)
The creative-preview media reference today carries `mime_type` and a status/reason. For video review the frontend needs the following **per media reference**, so it can decide before any download and say something truthful:

| Field | Why |
|---|---|
| `byte_size` | Refuse above the client ceiling (32 MiB, per your #209 register) before any transfer, and show size honestly. Today it only learns this from `HEAD` on the delivery route. |
| `width`, `height`, `duration_ms` | Accessible description, layout reservation, and the Instagram-feed candidate profile (9:16 at 720×1280 or 16:9 at 1280×720, 4, 6 or 8 s). |
| `video_codec` (for example `h264`) and `container` | **MIME does not prove decodability.** The frontend cannot play H.264 in the CI Chromium and has not been verified in real Chrome; a codec field lets it show a truthful "may not play in this browser" state instead of a blank player. |
| `has_audio` | The Instagram candidate is silent-only; audio-bearing assets need a separately reviewed captions/transcript policy. |
| `captions_available` / `transcript_available` (booleans, with a delivery route if true) | Media accessibility is **not started**; without it audio-bearing video cannot be reviewed accessibly. |
| `preview_profile` status for the exact `platform/placement/format` tuple, ideally on the creative-preview read | Lets the UI show "no trusted preview profile" **before** the customer presses Render, instead of after the 409. Today the first signal is `409 PREVIEW_VERSION_UNAVAILABLE` on render. |
| Typical and maximum generated-video sizes | To decide whether the 32 MiB client ceiling is adequate. Not yet measured by anyone. |

Behaviours the frontend already implements and will keep: HEAD to authorise and size; ranges of at most 8 MiB assembled up to 32 MiB with exact `Content-Range`; bearer header only, never in a URL; refusal above 32 MiB with no download; version-only media reuse only after a fresh HEAD under the new version succeeds with the same type and length; revocation drops the blob immediately and approval is refused by the backend (generic 404 `RESOURCE_NOT_AVAILABLE`, with a conditional, non-accusatory hint in the UI); `PREVIEW_VERSION_UNAVAILABLE` is rendered as "no preview profile for this destination", with every review step blocked and no retry or reload loop.

## 4. Questions for Codex
1. Is the approval refusal for revoked media (`404 RESOURCE_NOT_AVAILABLE`) intended, and what is the customer's recovery path (replace the asset, or create a new revision)?
2. Will the Instagram-feed video contract (#210 proposal) be accepted? Until a profile exists, those variants are correctly blocked.
3. Which of G1 to G3 will be built first? G1 and G2 are small and would remove the "not saved yet" labels for sector and channels.
4. Is the deployed API expected to match #208 at `/customer/campaigns` (list) and the review routes before any staging run? The frontend must degrade safely if not; it does (an unavailable list is shown as unavailable, never as empty).
