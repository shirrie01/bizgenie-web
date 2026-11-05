// PREFLIGHT for the first real-provider demonstration (BG-STUDIO-029). Read-only and free: it names what is missing and what is unreachable BEFORE anything is run or spent.
// It never calls a generation, publishing, billing or write endpoint. Secrets are checked for presence only and never printed.
//   BIZGENIE_API_DIR=/path/to/bizgenie-api node qa/real-backend/preflight.mjs
import { createRequire } from "node:module";
import path from "node:path";
const DIR = process.env.BIZGENIE_API_DIR; const env = process.env; const rows = [];
const add = (area, check, ok, detail = "") => rows.push({ area, check, ok, detail });
const need = (area, name, hint = "") => add(area, `env ${name}`, typeof env[name] === "string" && env[name].length > 0, hint);
// 1. isolated environment settings the backend's own composition requires (src/activation/*, src/activation/productionComposition.js)
need("environment", "BIZGENIE_ENVIRONMENT", "must be staging (production needs PRODUCTION_ACTIVATION_ENABLED, not for this demo)");
add("environment", "BIZGENIE_ENVIRONMENT is staging", env.BIZGENIE_ENVIRONMENT === "staging", `value: ${env.BIZGENIE_ENVIRONMENT || "unset"}`);
for (const f of ["MEDIA_STORAGE_ENABLED", "IMAGE_GENERATION_ENABLED", "VIDEO_GENERATION_ENABLED"]) add("flags", `${f}=true`, env[f] === "true", `value: ${env[f] || "unset"}`);
need("google", "GOOGLE_CLOUD_PROJECT", "an ISOLATED project with Vertex AI enabled and Veo 3.1 access"); need("google", "MEDIA_STORAGE_BUCKET", "private bucket for media, no public access");
need("google", "VIDEO_PROVIDER_OUTPUT_STORAGE_URI", "gs://<bucket>/<prefix>/ where Veo writes; the service account needs write on it and read for BizGenie");
add("google", "Application Default Credentials / service account", Boolean(env.GOOGLE_APPLICATION_CREDENTIALS || env.GOOGLE_CLOUD_PROJECT && env.CLOUDSDK_AUTH_ACCESS_TOKEN), "GOOGLE_APPLICATION_CREDENTIALS (file) or workload identity; the account's roles: Vertex AI User, Storage Object Admin on the bucket");
need("openai", "OPENAI_API_KEY", "image generation provider (src/image-generation/openaiProvider.js); a project key with a spend limit");
need("database", "TEST_DATABASE_URL", "a DISPOSABLE PostgreSQL superuser URL (never a shared or production database)");
need("auth", "SUPABASE_URL", "an ISOLATED Supabase project for customer sign-in (or the demo runs with the local test identity, which is NOT real sign-in)");
need("billing", "STRIPE_SECRET_KEY", "TEST-mode key only (sk_test_...); live keys are not allowed in this demonstration");
for (const [n, hint] of [["META_APP_ID", "Meta app in development mode for Instagram/Facebook; no App Review yet"], ["TIKTOK_CLIENT_KEY", "TikTok for Developers app (sandbox)"], ["LINKEDIN_CLIENT_ID", "LinkedIn developer app"]]) need("social", n, hint);
// 2. reachability from THIS machine's network policy (HEAD/GET to the host root; any HTTP status means the host answered)
for (const [area, host] of [["google", "us-central1-aiplatform.googleapis.com"], ["google", "storage.googleapis.com"], ["openai", "api.openai.com"], ["social", "graph.facebook.com"], ["social", "open.tiktokapis.com"], ["social", "api.linkedin.com"], ["billing", "api.stripe.com"]]) {
  let ok = false, detail = "";
  try { const r = await fetch(`https://${host}/`, { method: "GET", signal: AbortSignal.timeout(8000) }); ok = true; detail = `HTTP ${r.status}`; } catch (e) { detail = "unreachable (" + (e.cause?.code || e.cause?.message || e.message) + ") - network policy: add this host to the environment's allowed domains"; }
  add(area, `network ${host}`, ok, detail);
}
// 3. free authenticated reads, only when credentials exist
if (DIR && env.GOOGLE_CLOUD_PROJECT) {
  try {
    const req = createRequire(path.join(DIR, "index.js")); const { GoogleAuth } = req("google-auth-library"); const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
    const token = await auth.getAccessToken(); add("google", "access token obtainable", Boolean(token));
    if (token && env.MEDIA_STORAGE_BUCKET) { const r = await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(env.MEDIA_STORAGE_BUCKET)}?fields=name,location,iamConfiguration`, { headers: { authorization: `Bearer ${token}` } }); const j = r.ok ? await r.json() : {}; add("google", "bucket readable", r.ok, `HTTP ${r.status}`); if (r.ok) add("google", "bucket public access prevented", j.iamConfiguration?.publicAccessPrevention === "enforced", `publicAccessPrevention: ${j.iamConfiguration?.publicAccessPrevention || "not enforced"}`); }
    if (token) for (const m of ["veo-3.1-fast-generate-001", "veo-3.1-generate-001"]) { const r = await fetch(`https://us-central1-aiplatform.googleapis.com/v1/publishers/google/models/${m}`, { headers: { authorization: `Bearer ${token}` } }); add("google", `Veo model visible: ${m}`, r.ok, `HTTP ${r.status}`); }
  } catch (e) { add("google", "access token obtainable", false, e.message); }
}
if (env.OPENAI_API_KEY) { try { const r = await fetch("https://api.openai.com/v1/models", { headers: { authorization: `Bearer ${env.OPENAI_API_KEY}` }, signal: AbortSignal.timeout(8000) }); add("openai", "key accepted (free model list read)", r.ok, `HTTP ${r.status}`); } catch (e) { add("openai", "key accepted (free model list read)", false, e.message); } }
const width = Math.max(...rows.map((r) => `${r.area}: ${r.check}`.length));
for (const r of rows) console.log(`${r.ok ? "PASS" : "FAIL"}  ${`${r.area}: ${r.check}`.padEnd(width)}  ${r.detail}`);
const failed = rows.filter((r) => !r.ok); console.log(`\n${rows.length - failed.length}/${rows.length} ready. ${failed.length ? "NOT READY: nothing was generated, published or charged." : "Ready for the founder-approved run."}`);
process.exit(failed.length ? 1 : 0);
