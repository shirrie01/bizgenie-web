# Authenticated media preview — founder demonstration and status

Integrates the consolidated backend contract `bizgenie-api` PR #208 (`docs/media/BG-MEDIA-INTEGRATION-003.md`, exact head `bf12050939817ae6da3f696808fc5a7f054d74ab`) into the Studio creative review. #205/#206/#207 are not used directly.

## What a reviewer sees
1. The saved copy loads (`creative-preview`), then each eligible attached image or MP4 is fetched with the customer's session as `Authorization: Bearer` (HEAD to authorise and size it, then GET, or bounded ranges for a larger MP4). Nothing is shown until the transfer is complete.
2. The media appears inside the creative card with its alt text, labelled "Original image/video as saved, not how a platform will render it". Videos have native controls and never autoplay.
3. "You have seen the attached media as saved" appears only after the browser actually rendered it (image `load` / video metadata). Otherwise the panel says it could not be displayed and that acknowledging covers the text and receipt only.
4. Render preview, Acknowledge and Approve are unchanged. Approval records a decision; nothing is scheduled or published.

## Evidence
- Screenshots: `docs/evidence/media-004/` (PNG and VP9 MP4 at 1440/768/390/320; larger MP4, H.264, oversize, revoked, expired session, other tenant, transient error + retry, cancellation).
- Demo video (not committed, delivered separately): `studio-media-demo-1440.webm`.
- Browser runs use a production build with the session and write endpoints mocked in the browser. **The creative-preview and media endpoints are the real #208 handlers** (in-memory repository, stub auth, mocked object storage returning real bytes), reached through a forwarding proxy that pins the campaign version the static harness knows.

## Disconnected or unproven capabilities
| Capability | State |
|---|---|
| Platform-specific rendering | Not available: the API reports `platform_preview: unrendered`. Media is the original asset. |
| Live storage, IAM, real Supabase JWTs, PostgreSQL, deployed API | **Not run.** Storage is mocked; auth is a stub. No real API end-to-end claim. |
| H.264 MP4 playback | Playwright's Chromium cannot decode H.264, so that case shows the honest "couldn't be displayed in your browser". A VP9 MP4 plays. Real Chrome playback of H.264 is not proven here. |
| MP4 larger than 32 MiB | Refused from HEAD ("too large to preview here yet"); no streaming path. |
| Video captions / transcripts / audio description | None exist in the data; a reviewer relying on assistive tech gets only the alt text. |
| Approved card media | After approval the card lists references only; it does not refetch bytes. |
| Cost | A version bump (acknowledge, approve) refetches media, so a review can download the same file two or three times. Backend egress limits are local only (see #208). |
| Revocation latency | In-flight authorised bytes cannot be retracted; downloaded blob URLs live until the component unmounts. |
| Hybrid input-reference vs generated output media | Unresolved in the backend (#206 note). |
