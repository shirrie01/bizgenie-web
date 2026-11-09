// LOCAL REAL-BACKEND HARNESS (BG-STUDIO-028-FE). Boots the actual bizgenie-api routers (#220 e653ed3) on a DISPOSABLE local PostgreSQL database and serves them over real HTTP
// with real CORS, so a real browser can drive the built app against them. NOT staging: the identity layer is the backend's test fixture (bearer "ok"), the platform connector,
// image provider, inspector and storage are the backend's synthetic/in-memory ones, a small dev loop plays the (not yet existing) product worker, and nothing leaves this machine.
// usage: BIZGENIE_API_DIR=... TEST_DATABASE_URL=postgres://postgres@127.0.0.1:PORT/postgres RB_PORT=4300 RB_ORIGIN=http://127.0.0.1:4182 node qa/real-backend/server.mjs
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
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
await billingService.adjustCredits({ tenantId: "tenant_a", amount: 100, direction: "credit", transactionCorrelationId: "seed", idempotencyKey: "seed" });
const campaigns = new PostgresCampaignRepository({ pool, now: realNow, resolvePreviewReceipt: previewReceipt, validatePreview: async () => true });
const registry = new PostgresPreviewRegistry({ pool, now: realNow }); campaigns.resolvePreviewReceipt = registry.resolvePreviewReceipt.bind(registry); campaigns.validatePreview = registry.validatePreview.bind(registry);
// REAL PROVIDER MODE (RB_PROVIDERS=real): the backend's own production media composition (src/activation/productionComposition.js) gives the real OpenAI image provider, the real
// Google Vertex Veo provider and Google Cloud Storage from the environment (BIZGENIE_ENVIRONMENT=staging, MEDIA_STORAGE_ENABLED, IMAGE_GENERATION_ENABLED, VIDEO_GENERATION_ENABLED, GOOGLE_CLOUD_PROJECT,
// MEDIA_STORAGE_BUCKET, VIDEO_PROVIDER_OUTPUT_STORAGE_URI, OPENAI_API_KEY, Application Default Credentials). Run qa/real-backend/preflight.mjs first. EVERY generation is a PAID provider call:
// it needs the founder's explicit approval and the spend limits set on the provider accounts. Customer-upload inspection and the social connectors remain the backend's synthetic ones (no real adapters exist).
const REAL = process.env.RB_PROVIDERS === "real";
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
const tokens = { verifyAccessToken: async (t) => { if (t === "ok") return actor; if (t === "other") return { kind: "customer", auth_user_id: "99999999-9999-4999-8999-999999999999" }; throw new AuthenticationRequiredError(); } };
const app = createApp({ campaignRepository: campaigns, previewRegistry: registry, socialPublishingService: social.service, learningService: learning, generationQuoteService: quotes, mediaIntakeService: kit.intake, mediaPreviewStorage: REAL ? real.mediaPreviewStorage : kit.storage, customerTokenVerifier: tokens, authorizationService: { authorizeProject: async () => context }, corsConfig: { enabled: true, allowedOrigins: [ORIGIN] }, logger: { warn() {}, error() {}, info() {} } });

// ---- seed: a draft image post to create creative for (most recent campaign), a scheduled+queued post, and a published post with two learning observations ----
const published = await social.service.enqueue(actor, social.scope, social.input); // scheduled post queued for delivery; stays queued (not run)
const s2 = await socialFixture({ billing, pool, campaigns, now: skewed }); const q2 = await s2.service.enqueue(actor, s2.scope, s2.input); offsetMs += 180000; const pub2 = await s2.service.run(await s2.service.claim(q2.dispatch_id));
const start = Date.now() + offsetMs; offsetMs += 180000; const OB = (n, value) => ({ observation_id: randomUUID(), tenant_id: "tenant_a", project_id: "project_a", brand_id: "brand_a", campaign_id: s2.s.id, variant_id: s2.target.variant_id, publication_id: pub2.dispatch_id, objective: "traffic", platform: "instagram", attribution: "organic", metric: "clicks", unit: "count", value, period: { from: new Date(start + (n - 1) * 60000).toISOString(), to: new Date(start + n * 60000).toISOString() }, observed_at: new Date(start + n * 60000).toISOString(), source: { kind: "platform_api", source_id: "synthetic.connector", account_id: s2.connection.account_id, record_id: randomUUID() } });
await learning.configureObjective(actor, s2.scope, { campaign_id: s2.s.id, objective: "traffic", metric: "clicks", expected_version: 0, idempotency_key: "obj-" + randomUUID() });
await learning.ingest(s2.connection.connection_id, OB(1, 10)); await learning.ingest(s2.connection.connection_id, OB(2, 20));
const draft = await scenario(campaigns); const t = await draft.add("image");

// dev loop standing in for the product worker that does not exist yet: processes queued image jobs with the backend's mock provider
const media = REAL ? real.mediaAssetRepository : new PostgresMediaAssetRepository({ pool }), store = new DurableMediaAssetStore({ mediaKind: "image", repository: media, storage: kit.storage, now: realNow });
const imageService = new ImageGenerationService({ repository: new InMemoryImageGenerationRepository(), brandBrainRepository: new PostgresBrandBrainRepository({ pool }), now: realNow, provider: REAL ? real.imageProvider : { model: "mock-only", generate: async ({ metadata }) => { const saved = await store.save({ data: png, mime_type: "image/png", width: 1, height: 1, lineage: metadata }); const { byte_size, ...asset } = saved; return { provider: "synthetic", provider_job_id: "mock_image_operation", asset }; } } });

// ---- VIDEO REHEARSAL (stand-in transport, NOT a provider and NOT acceptance) -------------------------------------------------------------------------------------------
// The REAL GoogleVertexVeoProvider, VideoGenerationService, DurableMediaAssetStore and worker reconciliation run; only the HTTPS transport to Vertex AI and the GCS copy are
// replaced by a local stand-in that "finishes" an operation after a few seconds with a genuine H.264 9:16 MP4 made by ffmpeg. It proves the product wiring and the player,
// and finds code blockers before any paid provider call. It proves nothing about Veo itself.
const { GoogleVertexVeoProvider, VideoGenerationService, PostgresVideoGenerationRepository, UnconfiguredVideoReferenceAssetLoader } = req("./src/video-generation");
// Codec: real Veo returns H.264 MP4. The browser used for automated checks (Playwright's open-source Chromium) CANNOT decode H.264, so the stand-in defaults to VP9-in-MP4, which it can play;
// RB_STANDIN_CODEC=h264 serves H.264 (use it with a real Chrome/Safari, or check the delivered bytes with ffprobe). This only changes what the stand-in serves, never the product path.
const codec = process.env.RB_STANDIN_CODEC === "h264" ? "h264" : "vp9";
const mp4File = path.join(process.env.TMPDIR || "/tmp", `rb-standin-9x16-${codec}.mp4`);
if (!fs.existsSync(mp4File)) { const r = spawnSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "testsrc2=size=720x1280:rate=30", "-t", "4", "-pix_fmt", "yuv420p", ...(codec === "h264" ? ["-c:v", "libx264", "-movflags", "+faststart"] : ["-c:v", "libvpx-vp9", "-b:v", "1M"]), "-an", mp4File]); if (r.status !== 0) { console.error("ffmpeg needed for the video rehearsal"); process.exit(5); } }
const mp4Bytes = fs.readFileSync(mp4File); const OUT = "gs://standin-bucket/veo-out/"; const providerOut = new Map(); const operations = new Map();
const transport = { post: async (url, body) => {
  const m = /\/(projects\/[^/]+\/locations\/[^/]+\/publishers\/google\/models\/[^:]+):(predictLongRunning|fetchPredictOperation)$/.exec(url); if (!m) throw new Error("stand-in transport: unexpected URL " + url);
  if (m[2] === "predictLongRunning") { const id = randomUUID(); const name = `${m[1]}/operations/${id}`; operations.set(name, { readyAt: Date.now() + 3000, uri: `${OUT}${id}/sample_0.mp4`, body }); return { name }; }
  const op = operations.get(body.operationName); if (!op) throw new Error("unknown operation");
  if (Date.now() < op.readyAt) return { name: body.operationName, done: false };
  providerOut.set(op.uri, mp4Bytes); return { name: body.operationName, done: true, response: { videos: [{ gcsUri: op.uri, mimeType: "video/mp4" }] } };
} };
if (!REAL) kit.storage.copyObject = async ({ source, destinationKey, allowedSourcePrefix }) => { if (!source.startsWith(allowedSourcePrefix) || !providerOut.has(source)) throw new Error("stand-in copy refused"); return kit.storage.putObject({ key: destinationKey, data: providerOut.get(source), mimeType: "video/mp4" }); };
const videoService = new VideoGenerationService({ repository: new PostgresVideoGenerationRepository({ pool }), provider: REAL ? real.videoProvider : new GoogleVertexVeoProvider({ projectId: "standin-project", outputStorageUri: OUT, transport }), assetStore: REAL ? real.videoAssetStore : new DurableMediaAssetStore({ mediaKind: "video", repository: media, storage: kit.storage, videoSourcePrefix: OUT, now: realNow }), referenceAssetLoader: REAL ? real.videoReferenceAssetLoader : new UnconfiguredVideoReferenceAssetLoader(), brandBrainRepository: new PostgresBrandBrainRepository({ pool }), now: realNow });
const worker = new FencedGenerationWorker({ quoteService: quotes, provider: new ExistingCreativeServicesAdapter({ jobs: new PostgresGenerationJobRepository({ pool }), mediaAssets: media, imageService, videoService }) });
let busy = false; setInterval(async () => { if (busy) return; busy = true; try { for (const r of (await pool.query("select job_id from generation_execution_claims where state='queued' order by updated_at limit 3")).rows) { try { await worker.run(await worker.claim(r.job_id)); } catch (e) { console.error("dev worker:", e.code || e.message); } } for (const r of (await pool.query("select job_id from generation_execution_claims where state='recovery_required' order by updated_at limit 3")).rows) { try { const c = await worker.reconciliationClaim(r.job_id); await worker.reconcile(c); } catch (e) { if (!/RECONCILIATION|NOT_READY|pending/i.test(String(e.code || e.message))) console.error('dev reconcile:', e.code || e.message); } } } catch (e) { console.error('dev worker loop:', e.message); } finally { busy = false; } }, 700);

const server = await new Promise((resolve) => { const s = app.listen(PORT, "127.0.0.1", () => resolve(s)); });
const ids = { base: `http://127.0.0.1:${PORT}`, db, scope: { tenant_id: "tenant_a", project_id: "project_a", brand_id: "brand_a" }, draftCampaign: draft.id, draftVariant: t.variant_id, scheduledCampaign: social.s.id, scheduledVariant: social.target.variant_id, scheduledDispatch: published.dispatch_id, publishedCampaign: s2.s.id, publishedVariant: s2.target.variant_id, pngSha: createHash("sha256").update(png).digest("hex") };
fs.writeFileSync(process.env.RB_IDS || "/tmp/rb-ids.json", JSON.stringify(ids)); console.log("READY", JSON.stringify(ids));
const stop = async () => { clearInterval; server.close(); await pool.end(); await admin.query(`drop database ${db}`).catch(() => {}); await admin.end(); process.exit(0); };
process.on("SIGTERM", stop); process.on("SIGINT", stop);
