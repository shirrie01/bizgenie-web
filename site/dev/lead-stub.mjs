// LOCAL DEVELOPMENT REFERENCE of the EXISTING bizgenie-api paid-beta capture contract (POST /public/paid-beta-interest, src/paid-beta). NOT a production service:
// in-memory storage, no real HMAC secret, no database, no auth. It exists so the website's registration journey can be tested end to end locally and so
// the contract tests (site/contract/*.contract.test.mjs) have something to run against. The real implementation already exists in bizgenie-api; this stub must not add behaviour it lacks.
// The site-events route below is still only PROPOSED (measurement stays off).
import http from "node:http";
import crypto from "node:crypto";

export const LEAD_PATH = "/public/paid-beta-interest";
export const EVENTS_PATH = "/public/site-events";
const INTENTIONS = ["early_access", "founding_customer"];
const STAGES = ["pre-revenue", "under-250k", "250k-1m", "1m-5m", "5m-plus"];
const CONSENT_VERSION = "paid-beta-contact-v1";
const CONSENT_WORDING = "I agree that BizGenie may use these details to contact me about the paid beta.";
const EVENT_TYPES = ["page_view", "form_view", "form_start", "field_error", "submit_attempt", "submit_success", "submit_failure", "form_abandon"];
const SOURCE_KEYS = ["utm_source", "utm_medium", "utm_campaign", "referrer_host", "landing_path"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SOURCE = /^[a-z0-9][a-z0-9._:-]*$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const bad = (path, code) => ({ path, code });
function exactKeys(obj, allowed, path, errs) { for (const k of Object.keys(obj)) if (!allowed.includes(k)) errs.push(bad(path ? `${path}.${k}` : k, "unrecognized_key")); }

// Strict validation mirroring src/paid-beta/schema.js. Returns { value } or { errors }.
export function validateLead(b) {
  const errs = [];
  if (!b || typeof b !== "object" || Array.isArray(b)) return { errors: [bad("", "invalid_type")] };
  exactKeys(b, ["name", "work_email", "business_name", "website_or_social_profile", "business_stage", "primary_marketing_challenge", "privacy_contact_consent", "source", "submission_id"], "", errs);
  const text = (k, max) => { const v = typeof b[k] === "string" ? b[k].trim() : ""; if (!v || v.length > max) errs.push(bad(k, v ? "too_long" : "required")); return v; };
  const name = text("name", 120), business = text("business_name", 160), challenge = text("primary_marketing_challenge", 1000);
  const email = typeof b.work_email === "string" ? b.work_email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !EMAIL.test(email)) errs.push(bad("work_email", "invalid"));
  const site = typeof b.website_or_social_profile === "string" ? b.website_or_social_profile.trim() : "";
  let siteOk = false; try { const u = new URL(site); siteOk = site.length <= 2048 && ["http:", "https:"].includes(u.protocol) && !u.username && !u.password; } catch { /* invalid */ }
  if (!siteOk) errs.push(bad("website_or_social_profile", "invalid"));
  if (!STAGES.includes(b.business_stage)) errs.push(bad("business_stage", "invalid_enum"));
  if (b.privacy_contact_consent !== true) errs.push(bad("privacy_contact_consent", "must_be_true"));
  const source = typeof b.source === "string" ? b.source.trim().toLowerCase() : "";
  if (!source || source.length > 64 || !SOURCE.test(source)) errs.push(bad("source", "invalid"));
  if (typeof b.submission_id !== "string" || !ID.test(b.submission_id.trim())) errs.push(bad("submission_id", "invalid"));
  if (errs.length) return { errors: errs };
  return { value: { name, work_email: email, business_name: business, website_or_social_profile: site, business_stage: b.business_stage, primary_marketing_challenge: challenge, source, submission_id: b.submission_id.trim() } };
}

export function validateEvents(b) {
  const errs = [];
  if (!b || typeof b !== "object") return { errors: [bad("", "invalid_type")] };
  exactKeys(b, ["contract_version", "visit", "source", "events"], "", errs);
  if (b.contract_version !== "site-events.v1") errs.push(bad("contract_version", "invalid_value"));
  if (b.visit !== null && !(typeof b.visit === "string" && /^[0-9a-f-]{36}$/.test(b.visit))) errs.push(bad("visit", "invalid"));
  const s = b.source || {}; exactKeys(s, SOURCE_KEYS, "source", errs);
  if (!Array.isArray(b.events) || b.events.length < 1 || b.events.length > 20) errs.push(bad("events", "invalid_length"));
  else b.events.forEach((e, i) => {
    exactKeys(e || {}, ["type", "page", "intention", "field", "code", "kind"], `events.${i}`, errs); // any extra key (e.g. a typed value) is refused
    if (!EVENT_TYPES.includes(e && e.type)) errs.push(bad(`events.${i}.type`, "invalid_enum"));
    if (e && e.intention !== undefined && !INTENTIONS.includes(e.intention)) errs.push(bad(`events.${i}.intention`, "invalid_enum"));
    for (const k of ["field", "code", "kind"]) if (e && e[k] !== undefined && !/^[a-zA-Z_]{1,30}$/.test(e[k])) errs.push(bad(`events.${i}.${k}`, "invalid"));
  });
  return errs.length ? { errors: errs } : { value: b };
}

// CSV for operator export. Cells that a spreadsheet would treat as a formula are neutralised (CSV injection).
export function toCsv(records) {
  const cols = ["reference_id", "received_at", "name", "work_email", "business_name", "website_or_social_profile", "business_stage", "primary_marketing_challenge", "source", "consent_version"];
  const cell = (v) => { let s = Array.isArray(v) ? v.join(";") : v === undefined || v === null ? "" : String(v); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
  return [cols.join(","), ...records.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n") + "\n";
}

export function createLeadStub({ allowedOrigin = "*", rateLimit = { max: 5, windowMs: 15 * 60 * 1000 }, now = () => Date.now(), dev = true, file = null } = {}) {
  const secret = crypto.randomBytes(32);
  const pseudo = (ip) => crypto.createHmac("sha256", secret).update(String(ip)).digest("hex").slice(0, 16);
  const byEmail = new Map(); const bySubmission = new Map(); const buckets = new Map(); const counters = {}; const records = [];
  const cors = { "access-control-allow-origin": allowedOrigin, "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type", "access-control-max-age": "600", vary: "Origin" };
  const send = (res, status, body, extra = {}) => { res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", ...(status === 413 ? { connection: "close" } : {}), ...cors, ...extra }); res.end(body === null ? "" : JSON.stringify(body)); };
  const err = (res, status, code, extra = {}) => send(res, status, { error: { code, message: code.toLowerCase().replace(/_/g, " ") } }, extra);
  const readBody = (req, limit = 16384) => new Promise((resolve, reject) => { let n = 0; const chunks = []; let over = false; req.on("data", (c) => { n += c.length; if (over) return; if (n > limit) { over = true; chunks.length = 0; reject(Object.assign(new Error("too large"), { status: 413 })); } else chunks.push(c); }); req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8"))); req.on("error", reject); });
  const fingerprint = (v) => crypto.createHash("sha256").update(JSON.stringify([v.work_email, v.name, v.business_name, v.website_or_social_profile, v.business_stage, v.primary_marketing_challenge, v.source, CONSENT_VERSION])).digest("hex");
  const limited = (ip) => { const k = pseudo(ip); const t = now(); const b = (buckets.get(k) || []).filter((x) => t - x < rateLimit.windowMs); b.push(t); buckets.set(k, b); return b.length > rateLimit.max; };

  async function handle(req, res) {
    const url = new URL(req.url, "http://x"); const ip = req.socket.remoteAddress || "0";
    if (req.method === "OPTIONS") return send(res, 204, null);
    if (url.pathname === LEAD_PATH) {
      if (req.method !== "POST") return err(res, 404, "NOT_FOUND"); // write-only: no public list/lookup/update/delete
      if (limited(ip)) return err(res, 429, "PAID_BETA_RATE_LIMITED"); // the real API sends no Retry-After header
      let raw; try { raw = await readBody(req); } catch (e) { return err(res, e.status || 400, "PAYLOAD_TOO_LARGE"); }
      let body; try { body = JSON.parse(raw); } catch { return err(res, 400, "VALIDATION_ERROR"); }
      const r = validateLead(body); if (r.errors) return send(res, 400, { error: { code: "VALIDATION_ERROR", message: "Request validation failed", details: r.errors } });
      const v = r.value; const fp = fingerprint(v);
      const prior = bySubmission.get(v.submission_id);
      if (prior) { if (prior.fingerprint !== fp) return err(res, 409, "IDEMPOTENCY_KEY_CONFLICT"); return send(res, 202, { status: "received", reference_id: prior.reference }); }
      const reference = `pbi_${crypto.randomBytes(18).toString("base64url")}`; const receivedAt = new Date(now()).toISOString();
      bySubmission.set(v.submission_id, { fingerprint: fp, reference });
      const receipt = { reference_id: reference, received_at: receivedAt, consent_version: CONSENT_VERSION, consent_wording: CONSENT_WORDING, source: v.source };
      const existing = byEmail.get(v.work_email);
      // One canonical record per normalised email; a repeat adds a receipt with consent evidence and NEVER overwrites the first record. The response never discloses a prior record.
      if (existing) existing.receipts.push(receipt);
      else { const rec = { ...receipt, name: v.name, work_email: v.work_email, business_name: v.business_name, website_or_social_profile: v.website_or_social_profile, business_stage: v.business_stage, primary_marketing_challenge: v.primary_marketing_challenge, receipts: [receipt] }; byEmail.set(v.work_email, rec); records.push(rec); }
      if (file) { try { (await import("node:fs")).appendFileSync(file, JSON.stringify({ reference, at: receivedAt }) + "\n"); } catch { /* dev only */ } }
      return send(res, 202, { status: "received", reference_id: reference });
    }
    if (url.pathname === EVENTS_PATH) {
      if (req.method !== "POST") return err(res, 405, "METHOD_NOT_ALLOWED");
      let raw; try { raw = await readBody(req, 8192); } catch { return err(res, 413, "PAYLOAD_TOO_LARGE"); }
      let body; try { body = JSON.parse(raw); } catch { return err(res, 400, "VALIDATION_ERROR"); }
      const r = validateEvents(body); if (r.errors) return send(res, 400, { error: { code: "VALIDATION_ERROR", message: "validation error", details: r.errors } });
      for (const e of body.events) { const k = [e.type, e.intention || "-", body.source.utm_source || "-", body.source.referrer_host || "-"].join("|"); counters[k] = (counters[k] || 0) + 1; counters[`all|${e.type}`] = (counters[`all|${e.type}`] || 0) + 1; if (e.type === "field_error") { const f = `error|${e.field}|${e.code}`; counters[f] = (counters[f] || 0) + 1; } if (e.type === "form_abandon") { const f = `abandon|${e.field || "-"}`; counters[f] = (counters[f] || 0) + 1; } }
      return send(res, 202, { status: "accepted" });
    }
    if (dev && url.pathname === "/__dev/state") return send(res, 200, { records, counters });
    return err(res, 404, "NOT_FOUND");
  }
  const server = http.createServer((req, res) => { handle(req, res).catch(() => err(res, 500, "INTERNAL")); });
  return { server, records, counters, listen: (port = 0) => new Promise((r) => server.listen(port, "127.0.0.1", () => r(server.address().port))), close: () => new Promise((r) => server.close(r)) };
}

// Conversion arithmetic from REAL aggregate counters only. Returns null (not 0) when there is no denominator.
export function funnel(counters) {
  const views = counters["all|page_view"] || 0;
  const successes = counters["all|submit_success"] || 0;
  const rate = (a, b) => (b > 0 ? a / b : null);
  return { page_views: views, form_views: counters["all|form_view"] || 0, form_starts: counters["all|form_start"] || 0, submit_attempts: counters["all|submit_attempt"] || 0, submit_successes: successes, abandons: counters["all|form_abandon"] || 0, visit_to_registration: rate(successes, views), start_to_registration: rate(successes, counters["all|form_start"] || 0) };
}
