// LOCAL REAL-BACKEND HARNESS (BG-STUDIO-028-FE). Boots the actual bizgenie-api routers (#220 e653ed3) on a DISPOSABLE local PostgreSQL database and serves them over real HTTP
// with real CORS, so a real browser can drive the built app against them. NOT staging: the identity layer is the backend's test fixture (bearer "ok"), the platform connector,
// image provider, inspector and storage are the backend's synthetic/in-memory ones, a small dev loop plays the (not yet existing) product worker, and nothing leaves this machine.
// usage: BIZGENIE_API_DIR=... TEST_DATABASE_URL=postgres://postgres@127.0.0.1:PORT/postgres RB_PORT=4300 RB_ORIGIN=http://127.0.0.1:4182 node qa/real-backend/server.mjs
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createSpendGuard, DEFAULT_WORST_CASE } from "./spendGuard.mjs";
const DIR = process.env.BIZGENIE_API_DIR, URL_ = process.env.TEST_DATABASE_URL, PORT = Number(process.env.RB_PORT || 4300), ORIGIN = process.env.RB_ORIGIN || "http://127.0.0.1:4182";
if (!DIR || !URL_) { console.error("BIZGENIE_API_DIR and TEST_DATABASE_URL are required"); process.exit(2); }
const req = createRequire(path.join(DIR, "index.js"));
const { Pool } = req("pg"); const { createApp } = req("./index");
const { PostgresBillingRepository, BillingService } = req("./src/billing");
const { PostgresGenerationQuoteService } = req("./src/generation-quotes/service"); const { FencedGenerationWorker } = req("./src/generation-quotes/worker");
const { PostgresCampaignRepository, PostgresPreviewRegistry } = req("./src/campaigns");
const { scenario, previewReceipt, context } = req("./test/helpers/campaign-regressions"); const { socialFixture } = req("./test/helpers/social-local"); const { localMediaKit } = req("./test/helpers/customer-media-local");
const { DurableLearningService } = req("./src/learning-persistence/service"); const { AuthenticationRequiredError } = req("./src/authorization");
const { ImageGenerationService, InMemoryImageGenerationRepository } = req("./src/image-generation"); const { PostgresMediaAssetRepository, DurableMediaAssetStore } = req("./src/media");
const { PostgresBrandBrainRepository } = req("./src/brand-brain"); const { PostgresGenerationJobRepository } = req("./src/generation-jobs"); const { ExistingCreativeServicesAdapter } = req("./src/generation-quotes/creativeAdapter");
const actor = context.actor; let offsetMs = 0; const realNow = () => new Date(); const skewed = () => new Date(Date.now() + offsetMs); // only the social/learning seeding uses the skewed clock (to publish a seeded post and age its observations); everything the browser touches runs on real time
// A REAL 1080x1080 PNG (ffmpeg, no network): the platform-fit check rightly refuses a 1x1 placeholder, and the stand-in must not claim dimensions its bytes do not have.
const squareFile = path.join(process.env.TMPDIR || "/tmp", "rb-standin-1080.png");
if (!fs.existsSync(squareFile) && spawnSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "testsrc2=size=1080x1080:rate=1", "-frames:v", "1", squareFile]).status !== 0) { console.error("ffmpeg needed for the image stand-in"); process.exit(5); }
const squarePng = fs.readFileSync(squareFile);
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5XkAAAAASUVORK5CYII=", "base64");

const admin = new Pool({ connectionString: URL_ }); const c = await admin.connect();
try { await c.query("select pg_advisory_lock(734921)"); await c.query("do $$ begin if not exists(select 1 from pg_roles where rolname='anon')then create role anon nologin;end if;if not exists(select 1 from pg_roles where rolname='authenticated')then create role authenticated nologin;end if;if not exists(select 1 from pg_roles where rolname='service_role')then create role service_role nologin;end if;end $$"); } finally { await c.query("select pg_advisory_unlock(734921)"); c.release(); }
const db = "rb_" + randomUUID().replaceAll("-", ""); await admin.query(`create database ${db}`);
const local = new URL(URL_); local.pathname = "/" + db; const pool = new Pool({ connectionString: local.toString(), max: 12 });
await pool.query("create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable set search_path='' as 'select null::uuid'");
const mig = path.join(DIR, "supabase/migrations"); for (const f of fs.readdirSync(mig).filter((x) => x.endsWith(".sql")).sort()) await pool.query(fs.readFileSync(path.join(mig, f), "utf8"));
await pool.query("insert into auth.users values($1)", [actor.auth_user_id]); await pool.query("insert into customer_profiles(auth_user_id) values($1)", [actor.auth_user_id]);
await pool.query("insert into tenants(tenant_id,name,created_by) values('tenant_a','Northgate',$1)", [actor.auth_user_id]); await pool.query("insert into tenant_memberships(tenant_id,auth_user_id,role) values('tenant_a',$1,'owner')", [actor.auth_user_id]);
await pool.query("insert into projects(project_id,tenant_id,name) values('project_a','tenant_a','Northgate campaigns')"); await pool.query("insert into brand_brains(brand_id,project_id,name,version,status,created_at,updated_at) values('brand_a','project_a','Northgate',1,'approved',now(),now())");
await pool.query("insert into commercial_policies(policy_id,plan_code,policy_version,status,included_monthly_credits,bolt_on_eligible,effective_from)values('synthetic_policy','standard',999,'draft',100,true,'2026-01-01')");
await pool.query("insert into commercial_execution_prices(policy_id,execution_class,credit_cost)values('synthetic_policy','text.standard',2),('synthetic_policy','image.normal',2),('synthetic_policy','video.normal',6),('synthetic_policy','video.premium',9)");
await pool.query("update commercial_policies set status='active' where policy_id='synthetic_policy'");
await pool.query("insert into tenant_entitlements(entitlement_id,tenant_id,policy_id,plan_code,status,starts_at,reference_period_start,reference_period_end,included_monthly_credit_grant)values('synthetic_entitlement','tenant_a','synthetic_policy','standard','active','2026-01-01','2026-10-01','2027-12-01',100)");
await pool.query("insert into credit_accounts(account_id,tenant_id)values('synthetic_account','tenant_a')");
const billing = new PostgresBillingRepository({ pool, now: realNow }); const billingService = new BillingService({ repository: billing, now: realNow });
// In REAL mode the tenant is seeded with exactly the credits the approved run needs (default 8 = one 2-credit image + one 6-credit video in this harness's synthetic tariff). Credit
// reservation happens BEFORE any provider call, so a third generation is refused by the product itself (insufficient credits): a spend ceiling that does not depend on any provider setting.
const DEMO_CREDITS = Number(process.env.RB_DEMO_CREDITS || 8);
await billingService.adjustCredits({ tenantId: "tenant_a", amount: process.env.RB_PROVIDERS === "real" ? DEMO_CREDITS : 100, direction: "credit", transactionCorrelationId: "seed", idempotencyKey: "seed" });
const campaigns = new PostgresCampaignRepository({ pool, now: realNow, resolvePreviewReceipt: previewReceipt, validatePreview: async () => true });
const registry = new PostgresPreviewRegistry({ pool, now: realNow }); campaigns.resolvePreviewReceipt = registry.resolvePreviewReceipt.bind(registry); campaigns.validatePreview = registry.validatePreview.bind(registry);
// REAL PROVIDER MODE (RB_PROVIDERS=real): the backend's own production media composition (src/activation/productionComposition.js) gives the real OpenAI image provider, the real
// Google Vertex Veo provider and Google Cloud Storage from the environment (BIZGENIE_ENVIRONMENT=staging, MEDIA_STORAGE_ENABLED, IMAGE_GENERATION_ENABLED, VIDEO_GENERATION_ENABLED, GOOGLE_CLOUD_PROJECT,
// MEDIA_STORAGE_BUCKET, VIDEO_PROVIDER_OUTPUT_STORAGE_URI, OPENAI_API_KEY, Application Default Credentials). Run qa/real-backend/preflight.mjs first. EVERY generation is a PAID provider call:
// it needs the founder's explicit approval and the spend limits set on the provider accounts. Customer-upload inspection and the social connectors remain the backend's synthetic ones (no real adapters exist).
const REAL = process.env.RB_PROVIDERS === "real";
// A real run spends money. It starts only with an explicit, numeric spend acknowledgement from whoever holds the approval, and never more than the paid-job cap (default 2: one image, one video).
if (REAL && !(Number(process.env.RB_APPROVED_SPEND_USD) > 0)) { console.error("RB_PROVIDERS=real needs RB_APPROVED_SPEND_USD=<founder-approved cap in USD>; nothing was started"); process.exit(7); }
const real = REAL ? await (await import("node:module")).createRequire(path.join(DIR, "index.js"))("./src/activation/productionComposition.js").createMediaProductionComposition({ pool, env: process.env }) : null;
if (REAL && !(real.mediaEnabled && real.imageEnabled && real.videoEnabled)) { console.error("RB_PROVIDERS=real needs MEDIA_STORAGE_ENABLED, IMAGE_GENERATION_ENABLED and VIDEO_GENERATION_ENABLED = true"); process.exit(6); }
console.log(REAL ? "PROVIDERS: REAL (OpenAI image, Google Veo video, Google Cloud Storage) - generation is PAID" : "PROVIDERS: synthetic image provider; video through the stand-in Vertex transport");
const profiles = { "image.normal": { id: REAL ? "openai.image" : "synthetic.image", version: 1, provider_model: REAL ? real.imageProvider.model : "mock-only", aspect_ratio: "1:1" }, "text.standard": { id: "synthetic.text", version: 1, provider_model: "mock-only" }, "video.normal": { id: "veo.normal", version: 1, provider_model: "veo-3.1-fast-generate-001", aspect_ratio: "9:16", duration_seconds: 4 }, "video.premium": { id: "veo.premium", version: 1, provider_model: "veo-3.1-generate-001", aspect_ratio: "9:16", duration_seconds: 4 } };
const quotes = new PostgresGenerationQuoteService({ billingRepository: billing, profiles, now: realNow });
const kit = localMediaKit({ pool, billing, now: realNow });
const social = await socialFixture({ billing, pool, campaigns, now: skewed });
// SYNTHETIC reviewed OAuth configuration (the backend's own test shape; vTEST path and example.test redirect; NOT Meta settings and no approval is implied)
social.platforms.instagram.oauth = { authorization_endpoint: "https://www.facebook.com/vTEST/dialog/oauth", redirect_uri: "https://app.example.test/connections", approved_redirect_uris: ["https://app.example.test/connections"], client_id: "synthetic_app", scopes: ["synthetic.publish", "synthetic.read"], pkce_method: "S256", pkce_support_verified: true, app_review_status: "approved", review_ref: "synthetic_review_only", documentation_ref: "https://example.test/docs" };
const learning = new DurableLearningService({ billingRepository: billing, socialService: social.service, enabled: true, maxAgeMs: 3 * 86400000, now: skewed, connectors: { instagram: { requiredScopes: ["synthetic.read"], verifyObservation: async ({ connection, observation }) => connection.account_id === observation.source.account_id && observation.source.source_id === "synthetic.connector" } } });
// ---- TikTok mode (BG-LAUNCH-006): the real composition's social service (real connector, encrypted vault, journal, approved-video media source) replaces the synthetic social stack ----
// RB_SOCIAL=tiktok. With RB_TIKTOK_STANDIN=1 TikTok's HTTP is the labelled stand-in in fakeTikTok.mjs (a rehearsal); without it the connector talks to the real TikTok sandbox with the
// credentials in the environment (the founder-approved acceptance run).
const TIKTOK = process.env.RB_SOCIAL === "tiktok";
let tiktok = null, tiktokStandIn = null; const TT_LOG = process.env.RB_STANDIN_LOG || "/tmp/rb-tiktok-calls.jsonl";
if (TIKTOK) {
  const { createFakeTikTok, STANDIN_ENV } = await import("./fakeTikTok.mjs");
  const { createPremiumComposition } = req("./src/activation"); const { createVideoInspector } = req("./src/media/videoInspection");
  if (process.env.RB_TIKTOK_STANDIN === "1") { fs.writeFileSync(TT_LOG, ""); tiktokStandIn = createFakeTikTok({ logFile: TT_LOG }); }
  const env = { ...process.env, BIZGENIE_ENVIRONMENT: "staging", SOCIAL_PUBLISHING_ENABLED: "true", SOCIAL_PLATFORMS: "tiktok", VIDEO_INSPECTION_ISOLATION: process.env.VIDEO_INSPECTION_ISOLATION || "local",
    ...(tiktokStandIn ? { ...STANDIN_ENV, SOCIAL_TOKEN_ENCRYPTION_KEY_BASE64: (await import("node:crypto")).randomBytes(32).toString("base64") } : {}) };
  for (const k of ["QUOTED_GENERATION_ENABLED", "MEDIA_INTAKE_ENABLED", "LEARNING_ENABLED", "STRATEGY_WORKFLOWS_ENABLED"]) delete env[k]; // only the social service is wanted here
  const mediaForSocial = REAL ? real : { videoEnabled: true, mediaPreviewStorage: kit.storage, videoAssetStore: { videoInspector: createVideoInspector({ isolation: "local" }) } };
  tiktok = await createPremiumComposition({ pool, billing: { billingRepository: billing }, media: mediaForSocial, brandBrainRepository: new PostgresBrandBrainRepository({ pool }), branding: req("./src/config/branding").brandingConfig,
    env, logger: { log() {}, warn: console.error, error: console.error }, now: realNow, socialFetch: tiktokStandIn?.fetch });
  console.log(tiktokStandIn ? "TIKTOK MODE: connector is REAL, TikTok HTTP is the STAND-IN (rehearsal, not acceptance)" : "TIKTOK MODE: connector is REAL and talks to the REAL TikTok sandbox");
}
const tokens = { verifyAccessToken: async (t) => { if (t === "ok") return actor; if (t === "other") return { kind: "customer", auth_user_id: "99999999-9999-4999-8999-999999999999" }; throw new AuthenticationRequiredError(); } };
const app = createApp({ campaignRepository: campaigns, previewRegistry: registry, socialPublishingService: TIKTOK ? tiktok.socialPublishingService : social.service, learningService: learning, generationQuoteService: quotes, mediaIntakeService: kit.intake, mediaPreviewStorage: REAL ? real.mediaPreviewStorage : kit.storage, customerTokenVerifier: tokens, authorizationService: { authorizeProject: async () => context }, corsConfig: { enabled: true, allowedOrigins: [ORIGIN] }, logger: { warn() {}, error() {}, info() {} } });

// ---- seed: a draft image post to create creative for (most recent campaign), a scheduled+queued post, and a published post with two learning observations ----
const published = await social.service.enqueue(actor, social.scope, social.input); // scheduled post queued for delivery; stays queued (not run)
const s2 = await socialFixture({ billing, pool, campaigns, now: skewed }); const q2 = await s2.service.enqueue(actor, s2.scope, s2.input); offsetMs += 180000; const pub2 = await s2.service.run(await s2.service.claim(q2.dispatch_id));
const start = Date.now() + offsetMs; offsetMs += 180000; const OB = (n, value) => ({ observation_id: randomUUID(), tenant_id: "tenant_a", project_id: "project_a", brand_id: "brand_a", campaign_id: s2.s.id, variant_id: s2.target.variant_id, publication_id: pub2.dispatch_id, objective: "traffic", platform: "instagram", attribution: "organic", metric: "clicks", unit: "count", value, period: { from: new Date(start + (n - 1) * 60000).toISOString(), to: new Date(start + n * 60000).toISOString() }, observed_at: new Date(start + n * 60000).toISOString(), source: { kind: "platform_api", source_id: "synthetic.connector", account_id: s2.connection.account_id, record_id: randomUUID() } });
await learning.configureObjective(actor, s2.scope, { campaign_id: s2.s.id, objective: "traffic", metric: "clicks", expected_version: 0, idempotency_key: "obj-" + randomUUID() });
await learning.ingest(s2.connection.connection_id, OB(1, 10)); await learning.ingest(s2.connection.connection_id, OB(2, 20));
const draft = await scenario(campaigns); const t = await draft.add("image");

// dev loop standing in for the product worker that does not exist yet: processes queued image jobs with the backend's mock provider
const media = REAL ? real.mediaAssetRepository : new PostgresMediaAssetRepository({ pool }), store = new DurableMediaAssetStore({ mediaKind: "image", repository: media, storage: kit.storage, now: realNow });
const imageService = new ImageGenerationService({ repository: new InMemoryImageGenerationRepository(), brandBrainRepository: new PostgresBrandBrainRepository({ pool }), now: realNow, provider: REAL ? real.imageProvider : { model: "mock-only", generate: async ({ metadata }) => { const saved = await store.save({ data: squarePng, mime_type: "image/png", width: 1080, height: 1080, lineage: metadata }); const { byte_size, ...asset } = saved; return { provider: "synthetic", provider_job_id: "mock_image_operation", asset }; } } });

// ---- VIDEO REHEARSAL (stand-in transport, NOT a provider and NOT acceptance) -------------------------------------------------------------------------------------------
// The REAL GoogleVertexVeoProvider, VideoGenerationService, DurableMediaAssetStore and worker reconciliation run; only the HTTPS transport to Vertex AI and the GCS copy are
// replaced by a local stand-in that "finishes" an operation after a few seconds with a genuine H.264 9:16 MP4 made by ffmpeg. It proves the product wiring and the player,
// and finds code blockers before any paid provider call. It proves nothing about Veo itself.
const { GoogleVertexVeoProvider, VideoGenerationService, PostgresVideoGenerationRepository, UnconfiguredVideoReferenceAssetLoader } = req("./src/video-generation");
// Codec: real Veo returns H.264 MP4, and since BG-LAUNCH-002 the backend REJECTS anything else (real ffprobe inspection before an asset exists), so the stand-in always serves H.264.
// Playwright's open-source Chromium cannot decode H.264: the spec then verifies the delivered bytes instead of playback and says so (use BG_BROWSER_CHANNEL=chrome for playback).
const codec = "h264";
const mp4File = path.join(process.env.TMPDIR || "/tmp", `rb-standin-9x16-${codec}.mp4`);
if (!fs.existsSync(mp4File)) { const r = spawnSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "testsrc2=size=720x1280:rate=30", "-t", "4", "-pix_fmt", "yuv420p", ...(codec === "h264" ? ["-c:v", "libx264", "-movflags", "+faststart"] : ["-c:v", "libvpx-vp9", "-b:v", "1M"]), "-an", mp4File]); if (r.status !== 0) { console.error("ffmpeg needed for the video rehearsal"); process.exit(5); } }
// A second stand-in file the product must REFUSE: H.264 but with an audio track. A brief containing BG-REJECT makes the stand-in provider return it (the failure path, end to end).
const badFile = path.join(process.env.TMPDIR || "/tmp", "rb-standin-9x16-audio.mp4");
if (!fs.existsSync(badFile)) { const r = spawnSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "testsrc2=size=720x1280:rate=30", "-f", "lavfi", "-i", "sine=d=4", "-t", "4", "-pix_fmt", "yuv420p", "-c:v", "libx264", "-c:a", "aac", badFile]); if (r.status !== 0) { console.error("ffmpeg needed"); process.exit(5); } }
const badBytes = fs.readFileSync(badFile);
const mp4Bytes = fs.readFileSync(mp4File); const OUT = "gs://standin-bucket/veo-out/"; const providerOut = new Map(); const operations = new Map();
const transport = { post: async (url, body) => {
  const m = /\/(projects\/[^/]+\/locations\/[^/]+\/publishers\/google\/models\/[^:]+):(predictLongRunning|fetchPredictOperation)$/.exec(url); if (!m) throw new Error("stand-in transport: unexpected URL " + url);
  if (m[2] === "predictLongRunning") { const id = randomUUID(); const name = `${m[1]}/operations/${id}`; operations.set(name, { readyAt: Date.now() + 3000, uri: `${OUT}${id}/sample_0.mp4`, body, bad: JSON.stringify(body).includes('BG-REJECT') }); return { name }; }
  const op = operations.get(body.operationName); if (!op) throw new Error("unknown operation");
  if (Date.now() < op.readyAt) return { name: body.operationName, done: false };
  providerOut.set(op.uri, op.bad ? badBytes : mp4Bytes); return { name: body.operationName, done: true, response: { videos: [{ gcsUri: op.uri, mimeType: "video/mp4" }] } };
} };
if (!REAL) { kit.storage.download = async ({ key, maximumBytes }) => { const o = kit.objects.get(key); if (!o || o.data.length > maximumBytes) throw new Error("stand-in download refused"); return Buffer.from(o.data); }; kit.storage.delete = async ({ key }) => { kit.objects.delete(key); }; }
if (!REAL) kit.storage.copyObject = async ({ source, destinationKey, allowedSourcePrefix }) => { if (!source.startsWith(allowedSourcePrefix) || !providerOut.has(source)) throw new Error("stand-in copy refused"); return kit.storage.putObject({ key: destinationKey, data: providerOut.get(source), mimeType: "video/mp4" }); };
const videoService = new VideoGenerationService({ repository: new PostgresVideoGenerationRepository({ pool }), provider: REAL ? real.videoProvider : new GoogleVertexVeoProvider({ projectId: "standin-project", outputStorageUri: OUT, transport }), assetStore: REAL ? real.videoAssetStore : new DurableMediaAssetStore({ mediaKind: "video", repository: media, storage: kit.storage, videoSourcePrefix: OUT, now: realNow, requireVideoValidation: true, videoInspector: req("./src/media/videoInspection").createVideoInspector({ isolation: "local" }) }), referenceAssetLoader: REAL ? real.videoReferenceAssetLoader : new UnconfiguredVideoReferenceAssetLoader(), brandBrainRepository: new PostgresBrandBrainRepository({ pool }), now: realNow });
const worker = new FencedGenerationWorker({ quoteService: quotes, provider: new ExistingCreativeServicesAdapter({ jobs: new PostgresGenerationJobRepository({ pool }), mediaAssets: media, imageService, videoService }) });
// The PRODUCT's worker loop (bizgenie-api src/worker/loops.js, the same one `node worker.js` runs): claim + run queued jobs, resume stale claims with a new fence, reconcile pending
// provider operations with backoff. In real-provider mode every claim is a PAID call, so this harness refuses to start one beyond the approved count.
const { GenerationLoop } = req("./src/worker/loops");
const PAID_CAP = Number(process.env.RB_MAX_PAID_JOBS || 2); let paidStarted = 0;
const spend = REAL ? createSpendGuard({ approvedUsd: process.env.RB_APPROVED_SPEND_USD, videoSeconds: Number(process.env.VIDEO_DURATION_SECONDS || 4), worstCase: { videoPerSecondUsd: Number(process.env.RB_WORST_CASE_VIDEO_USD_PER_SECOND || DEFAULT_WORST_CASE.videoPerSecondUsd), imageUsd: Number(process.env.RB_WORST_CASE_IMAGE_USD || DEFAULT_WORST_CASE.imageUsd) } }) : null;
if (spend) console.log(`USD guard armed: approved ${spend.approved}; worst case per video ${spend.price("video.normal")}, per image ${spend.price("image.normal")}`);
class HarnessLoop extends GenerationLoop { async execute(jobId, result, o) { if (REAL) {
  if (paidStarted >= PAID_CAP) { result.skipped += 1; console.error(`paid-job cap ${PAID_CAP} reached: job ${jobId} NOT started`); return; }
  // Monetary stop (qa/real-backend/spendGuard.mjs): the job's WORST-CASE dollars must fit under the founder-approved USD figure, otherwise it is not started.
  const kind = (await pool.query("select request->>'execution_class' c from generation_quotes where job_id=$1", [jobId])).rows[0]?.c;
  const verdict = spend.admit(kind);
  if (!verdict.allow) { result.skipped += 1; console.error(`USD guard: job ${jobId} (${kind}) NOT started: ${verdict.reason} (committed ${verdict.committed}, would be ${verdict.projected}, approved ${spend.approved})`); return; }
  console.log(`USD guard: job ${jobId} (${kind}) admitted; worst-case committed ${verdict.committed} of approved ${spend.approved}`);
  paidStarted += 1; } return super.execute(jobId, result, o); } }
const loop = new HarnessLoop({ quoteService: quotes, worker, limit: 3, now: realNow, minBackoffMs: REAL ? 5000 : 700, maxBackoffMs: REAL ? 30000 : 2000, logger: { warn: (...a) => console.error("worker:", ...a), error: console.error, log() {} } });
let busy = false; setInterval(async () => { if (busy) return; busy = true; try { const r = await loop.tick(); if (r.errors.length) console.error("worker errors:", r.errors.join(",")); } catch (e) { console.error("worker loop:", e.message); } finally { busy = false; } }, 700);

if (TIKTOK) { const { SocialLoop } = req("./src/worker/loops"); const socialLoop = new SocialLoop({ socialService: tiktok.socialPublishingService, now: realNow, logger: { warn: (...a) => console.error("social:", ...a), error: console.error, log() {} } }); let sbusy = false; setInterval(async () => { if (sbusy) return; sbusy = true; try { const r = await socialLoop.tick(); if (r.errors?.length) console.error("social errors:", r.errors.join(",")); } catch (e) { console.error("social loop:", e.message); } finally { sbusy = false; } }, 2000); }
const server = await new Promise((resolve) => { const s = app.listen(PORT, "127.0.0.1", () => resolve(s)); });
const ids = { base: `http://127.0.0.1:${PORT}`, db, scope: { tenant_id: "tenant_a", project_id: "project_a", brand_id: "brand_a" }, draftCampaign: draft.id, draftVariant: t.variant_id, scheduledCampaign: social.s.id, scheduledVariant: social.target.variant_id, scheduledDispatch: published.dispatch_id, publishedCampaign: s2.s.id, publishedVariant: s2.target.variant_id, pngSha: createHash("sha256").update(png).digest("hex") };
fs.writeFileSync(process.env.RB_IDS || "/tmp/rb-ids.json", JSON.stringify(ids)); console.log("READY", JSON.stringify(ids));
const stop = async () => { clearInterval; server.close(); await pool.end(); if (process.env.RB_KEEP_DB === '1') console.log(`RB_KEEP_DB=1: database ${db} was KEPT so the ledger and media rows can be inspected; drop it yourself when done (drop database ${db};)`); else await admin.query(`drop database ${db}`).catch(() => {}); await admin.end(); process.exit(0); };
process.on("SIGTERM", stop); process.on("SIGINT", stop);
