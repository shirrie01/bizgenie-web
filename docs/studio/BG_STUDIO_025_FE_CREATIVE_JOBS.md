# BG-STUDIO-025-FE — Creative Jobs and Media Intake UI (F2)

27 Oct 2026. Draft, stacked on PR #56 (`bg-studio-023-fe-acceptance`, head 205a983). Frontend only. Built against the actual backend routes of bizgenie-api #218 (`9346055`) and, for staged strategy output, draft #219 (application SHA `44f849c54827036ceb84c98bb40ba3925644bc25`, head `653482f09d27df40e0cb79813ddcad79b7ebd134`). #219 is not assumed merged or operational. No merge, deployment, shared migration, paid generation, real OAuth or publishing; every run used the backend's own synthetic providers on a throwaway local PostgreSQL.

## What was built
* `src/premium/creativeJobsClient.js`: `GET /customer/creative-jobs` (list), `GET /:jobId`, `POST /:jobId/attach`, `POST /:jobId/cancel`. Outputs are classified by what they are: **text** and **asset-backed media (image/video)** are attachable; **strategy_plan** is a plan, never attachable, never media (also refused by the server with `STAGE_NOT_ATTACHABLE`, mapped to a plain message). `canAttach` is true only when the job succeeded, is not yet attached and has at least one attachable output.
* `src/premium/mediaIntakeClient.js`: `/customer/assets` list, `uploads` (initiate), raw-byte `PUT`, `complete` (server-side inspection), `revoke`, `DELETE`, authenticated `preview`. Client-side checks (type, size, name) run before any request; the server re-checks signature and size.
* `CreativeJobResult` / `CreativeJobsList` wired into the existing Studio (`CreativeStudio`): after a confirmed job finishes, the server's result is loaded (loading, failure with retry, running polled, failed/recovery guidance), the owner can **Attach to this post**, the campaign is reloaded, and the picture/video is then shown only through the **existing authenticated, revision-scoped delivery** (`MediaPreview`) for the **current** version; approval/publication are shown only as the server reports them for the current version, and a replaced attachment is labelled as replaced. "Earlier results for this post" lists jobs with empty/error/retry states.
* `PremiumMedia` ("Your media" section, owner-only add/withdraw/delete, members read): loading, empty, failure + retry, upload progress steps, rejected files stated plainly, a rights confirmation that is labelled as the customer's own and recorded as entered by them.
* Gate: `VITE_CUSTOMER_MEDIA_INTAKE_API` (new, default OFF, strictly "true"); creative jobs stay behind the existing `VITE_CUSTOMER_MEDIA_API`+`VITE_GENERATION_QUOTE_API`.
* The old `ATTACH_BLOCKER` ("attaching is not built") is no longer used; attach exists in #218.

## Verification (code SHA in the PR description)
| Check | Result |
|---|---|
| Unit/component tests | 1007 passed, 46 skipped (the skipped are integration tests needing a backend) |
| Integration vs real #218 on a throwaway local PostgreSQL (`qa/integration/creativeJobs`) | media add → inspect → list → authenticated preview → withdraw → delete; wrong-type bytes refused by the server; idempotent initiate; quote → confirm → worker → job read → attach → campaign carries the asset; idempotent re-attach; another tenant's token sees nothing; queued job cancel |
| Integration vs real draft #219 (`creativeJobs219`) | a finished strategy stage reads as `strategy_plan`, `canAttach=false`, attach refused with `STAGE_NOT_ATTACHABLE`; the final draft is text and attaches |
| All integration files together | 46/46 |
| Browser, gates ON, 1440/1024/768/390/320 | 14/14 at each width, axe WCAG 2.x A/AA clean on every checkpoint, no horizontal overflow |
| Browser, gates OFF (default build) | 57/57 at each width |
| Build | OK |
Exact-SHA hosted CI: see the PR. Hosted CI does not run the cross-repo integration (local only).

## Open contract gaps (for Codex; no frontend substitutes)
| # | Gap | Consequence |
|---|---|---|
| M1 | The browser cannot read the rights statement/policy version the backend will record (`rightsPolicy.statement` is server config). | The screen shows its own plain confirmation and the server's policy version only after upload; wording needs legal review and a read endpoint |
| M2 | `/customer/assets` lists only `ready` files, so a quarantined or rejected upload disappears on reload. | Rejection is reported in the session that uploaded; a list of the owner's own failed uploads would help |
| M3 | A job's output has no preview until it is attached (`preview` only when `association.current`). | The screen says it is stored privately and must be attached to be reviewed; this is by design |
| M4 | `GET /customer/creative-jobs` cannot filter by variant and the client does not follow `next_cursor`. | The list filters client-side over the first page |
| M5 | `#219` routes `/customer/strategy-workflows` (create, quote per stage, stop) have no frontend flow. | Only the *output* is handled correctly here; the staged-strategy UI (priced stages, stop) is a separate task after #219 is reconciled |
| M6 | Hybrid (supplied assets with `execution_mode: hybrid`) is still blocked on backend lineage (#189). | Hybrid stays named unavailable (F4) |
