# BG-STUDIO-029 — first real product demonstration: route, evidence and blockers

31 Oct 2026. Draft. No merge, deployment, shared-database change, paid provider call, real OAuth, publishing or billing occurred. **The real-provider demonstration has NOT been performed**, because this session has no approved isolated environment: no provider credentials, and its network policy denies four of the required hosts (evidence below). Nothing in this document substitutes a mock for that acceptance. What follows is the candidate, what already runs on the real backend code, the exact blockers, and the shortest route.

## 1. The integrated candidate (dependencies preserved)
| Part | PR | Exact head | Notes |
|---|---|---|---|
| API | [bizgenie-api #221](https://github.com/shirrie01/bizgenie-api/pull/221) (media safety + PostgreSQL role proof) | `8864f003a4b8f23259ffbf2c817fe9beb3d91a62` | stacked on #220 |
| API (consolidated) | #220 | `e22cbcaf981973cd2c642654a49054fd57bffce2` | now based on `main` ddcc26c, 75 commits; contains the #213→#219 chain, Hybrid UGC reference primitive (#189 lineage), social OAuth contract, Stripe route regression, disposable-PostgreSQL CI |
| Web (integrated) | [bizgenie-web #63](https://github.com/shirrie01/bizgenie-web/pull/63), based on `main` | `19c8f72…` + this branch's follow-up | = Studio (#56 stack) + F1 social + F2 creative/media + F3 calendar + F5 learning |
| Public site | [#57](https://github.com/shirrie01/bizgenie-web/pull/57) | `0077c7b` | independent; publication blocked on founder facts |
Re-verified this session on #221's head: integration against the real routers **51/51** and the real-backend browser acceptance below. Merge order and gates are unchanged (backend first, gates OFF).

## 2. What runs today on the real backend code (local, disposable PostgreSQL; `qa/real-backend/run.sh`)
Real Chromium, real HTTP/CORS, the actual #220/#221 routers. **7/7 at 1440/1024/768/390/320**, axe clean: media intake; isolation; image creative end to end (quote → confirm → worker → attach → send for review → preview → acknowledge → approve → approved image shown); calendar; learning; social connect round trip; and a **video rehearsal** (below). Stubbed and labelled: sign-in provider, workspace/billing bootstrap, platform sign-in page, connectors, image provider, inspector and storage; the OpenAI/Google/GCS network calls.

### Video rehearsal (NOT acceptance)
TikTok feed video: add item → price (6 credits, `video.normal`, 9:16, 4 s) → confirm → the **real `GoogleVertexVeoProvider`, `VideoGenerationService`, asset store and worker reconciliation** run, with only the HTTPS transport to Vertex AI and the GCS copy replaced by a local stand-in that completes the operation with a genuine 720×1280 MP4 → pending operation polled to completion → asset saved → job result → attach → send for review → render preview (TikTok profile) → acknowledge → approve → **approved video decoded by the browser and playing** (screenshots in `evidence-029/`). It proves the product wiring and the player; it proves nothing about Veo. The stand-in serves VP9-in-MP4 because **Playwright's Chromium cannot decode H.264** (`canPlayType` is empty); real Veo returns H.264, so the real run must use Chrome (`BG_BROWSER_CHANNEL=chrome`) or the founder's own browser.

## 3. Preflight evidence for this session's environment (`qa/real-backend/preflight.mjs`, read-only)
**2/23 ready.** Missing: every provider/credential variable (`GOOGLE_CLOUD_PROJECT`, `MEDIA_STORAGE_BUCKET`, `VIDEO_PROVIDER_OUTPUT_STORAGE_URI`, ADC, `OPENAI_API_KEY`, Supabase, Stripe test key, Meta/TikTok/LinkedIn app ids, activation flags, `BIZGENIE_ENVIRONMENT=staging`). Reachable: Google APIs only. **Denied by the network policy: `api.openai.com`, `graph.facebook.com`, `open.tiktokapis.com`, `api.linkedin.com`, `api.stripe.com`.** Full output: `evidence-029/preflight-this-environment.txt`.

## 4. Step-by-step status of the mandatory journey
| Step | Real today? | Precise blocker (code / provider) | Owner |
|---|---|---|---|
| Multi-industry onboarding, Brand Brain | Code real (persistence, 5-industry UI); real sign-in not exercised | harness stubs `/customer/workspace*`; needs an isolated Supabase project | founder (project) |
| Campaign strategy | Code real (`/customer/strategy-workflows` in #219 chain); no frontend flow | staged-strategy UI not built (F-task M5) | Claude |
| Text generation | Code real (quoted `text.standard`) via provider adapter | needs the production text provider configured; no run | founder (env) |
| Image generation | Real OpenAI provider class exists (`src/image-generation/openaiProvider.js`) | no `OPENAI_API_KEY`; host denied here; **no production composition mounts the quoted flow** (below) | founder + Codex |
| **Short-form video** | Real Veo adapter exists (Veo 3.1 fast/standard, 9:16 or 16:9, 4/6/8 s, 720p, no native audio) and the whole path runs with a stand-in transport | needs a Google project with Veo access, GCS bucket + output prefix, service account; **Veo output is copied by path prefix and is not inspected (no codec/duration/aspect check) before use** | founder (project) + Codex |
| **No runnable composition / worker** | — | `createProductionApp` (`index.js` ~L784–815) composes media/image/video providers and billing but **not** `generationQuoteService`, `mediaIntakeService`, `socialPublishingService`, `learningService` or strategy workflows, and **no process claims queued jobs, reconciles pending video operations, runs due social dispatches or resumes unsent ones** (`FencedGenerationWorker`, `runDue`, `resumeUnsent` are used only by tests). The harness `qa/real-backend/server.mjs` composes them for a demo; it is not production. | Codex |
| Preview/approval for each platform × format | Partly | measured matrix (§5): only 5 of 12 mandatory pairs have an active preview profile | Codex |
| Instagram / Facebook / TikTok / LinkedIn connection | OAuth contract + UI real; **no real connector exists for any platform** (no reference to any platform API host in `src/`); config shows `provider_configuration_required` | per platform: token exchange, token vault, publish, reconcile, analytics read; app/developer registrations and approvals; current docs unverified (Meta pages 403; the other hosts unreachable from here) | Codex + founder (apps) |
| Supported publishing | Outbox, fencing, evidence rules real; **no platform publisher** | same as above | Codex |
| Content calendar | Real | `GET /customer/calendar` tenant isolation needs the real authorization composition | Codex |
| Billing and credits | Credit ledger, quote/confirm, Stripe checkout code real; Stripe host denied here | Stripe **test-mode** key + network allowance; billing management routes unmounted | founder + Codex |
| Customer upload (Hybrid UGC) | Intake service real with a synthetic inspector | real scanner/decoder adapters not built (#221 says so); combining step not built | Codex |

## 5. Measured previewable destinations (backend `qa/integration/launchDestinations`)
A pair can be priced, reviewed, approved, scheduled and published only if an active preview profile exists. Today (feed placement):

| | text | image | video |
|---|---|---|---|
| Instagram | yes | yes | **no** (Reels/feed video) |
| Facebook | yes | **no** | **no** |
| LinkedIn | yes | **no** | **no** |
| TikTok | no | no | yes |
The "no" cells that are launch-mandatory (Instagram video, Facebook image/video, LinkedIn image/video) need new preview profiles and renderer support (new migration rows with profile hashes, per-platform media limits). They are refused with `PREVIEW_VERSION_UNAVAILABLE` before any credit is reserved, which is the safe failure.

## 6. Shortest safe route to the real demonstration
1. **Founder provisions an isolated environment** (one list): a separate Google project with Vertex AI Veo 3.1 access, a private GCS bucket with public access prevented and an output prefix, a service account (Vertex AI User; object admin on that bucket only); an OpenAI project key with a hard spend limit; a throwaway PostgreSQL; an isolated Supabase project; a Stripe **test** key; developer apps for Meta (development mode), TikTok (sandbox) and LinkedIn; the session's network policy allowing the five denied hosts. Set `BIZGENIE_ENVIRONMENT=staging` and the three provider flags. No shared database, no production credentials.
2. **Run `qa/real-backend/preflight.mjs`** there. It is read-only and free. All rows must be PASS.
3. **Founder approves one bounded paid run**, e.g. 1 image + 1 video (fast model, 4 s) with the provider-side limits set. Then `RB_PROVIDERS=real qa/real-backend/run.sh` (use `BG_BROWSER_CHANNEL=chrome`) drives the same journey as §2 but with the real providers; screenshots and the served MP4 are the evidence. Until then the harness refuses to start in real mode without the flags.
4. Parallel, Codex: production composition + worker process (the single largest code gap), TikTok and LinkedIn then Instagram/Facebook connectors, the missing preview profiles, Veo output inspection, real upload inspection.

## 7. Decisions needed
(a) Approve the isolated environment and the one-image/one-video paid run and its cap. (b) Confirm who owns the platform developer apps. (c) Confirm Veo output validation (codec/aspect/duration check before use) is required before launch. (d) Confirm the missing preview profiles are launch scope (they follow from the mandatory platforms × formats).
