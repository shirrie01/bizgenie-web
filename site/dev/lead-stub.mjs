// LOCAL DEVELOPMENT REFERENCE of the PROPOSED lead-capture contract (docs/website/BG_WEB_001_LEAD_CAPTURE_CONTRACT.md). NOT a production service:
// in-memory storage, no real HMAC secret, no database, no auth. It exists so the website's registration journey can be tested end to end locally and so
// the contract tests (site/contract/*.contract.test.mjs) have something to run against. The real implementation belongs in bizgenie-api (Codex).
import http from "node:http";
import crypto from "node:crypto";

export const LEAD_PATH = "/public/early-access-interest";
export const EVENTS_PATH = "/public/site-events";
const INTENTIONS = ["early_access", "founding_customer"];
const INDUSTRIES = ["agency", "ecommerce", "professional_services", "hospitality", "product_brand", "other"];
const PRIORITIES = ["brand_consistency", "faster_content", "campaign_planning", "publishing", "performance", "image_video"];
const EVENT_TYPES = ["page_view", "form_view", "form_start", "field_error", "submit_attempt", "submit_success", "submit_failure", "form_abandon"];
const SOURCE_KEYS = ["utm_source", "utm_medium", "utm_campaign", "referrer_host", "landing_path"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const HEX64 = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const bad = (path, code) => ({ path, code });
function exactKeys(obj, allowed, path, errs) { for (const k of Object.keys(obj)) if (!allowed.includes(k)) errs.push(bad(path ? `${path}.${k}` : k, "unrecognized_key")); }

// Strict validation. Returns { value } or { errors }.
export function validateLead(b) {
  const errs = [];
  if (!b || typeof b !== "object" || Array.isArray(b)) return { errors: [bad("", "invalid_type")] };
  exactKeys(b, ["contract_version", "submission_id", "name", "work_email", "business_name", "industry", "intention", "marketing_priorities", "notes", "privacy_contact_consent", "marketing_consent", "consent", "source", "client"], "", errs);
  if (b.contract_version !== "early-access-interest.v1") errs.push(bad("contract_version", "invalid_value"));
  if (typeof b.submission_id !== "string" || !ID.test(b.submission_id)) errs.push(bad("submission_id", "invalid"));
  const text = (k, max) => { const v = typeof b[k] === "string" ? b[k].trim() : ""; if (!v || v.length > max) errs.push(bad(k, v ? "too_long" : "required")); return v; };
  const name = text("name", 120); const business = text("business_name", 160);
  const email = (typeof b.work_email === "string" ? b.work_email.trim().toLowerCase() : "");
  if (!email || email.length > 254 || !EMAIL.test(email)) errs.push(bad("work_email", "invalid"));
  if (!INDUSTRIES.includes(b.industry)) errs.push(bad("industry", "invalid_enum"));
  if (!INTENTIONS.includes(b.intention)) errs.push(bad("intention", "invalid_enum"));
  const pri = Array.isArray(b.marketing_priorities) ? b.marketing_priorities : [];
  if (!Array.isArray(b.marketing_priorities) || pri.length > 6 || pri.some((p) => !PRIORITIES.includes(p)) || new Set(pri).size !== pri.length) errs.push(bad("marketing_priorities", "invalid"));
  if (b.notes !== undefined && (typeof b.notes !== "string" || b.notes.length > 500)) errs.push(bad("notes", "invalid"));
  if (b.privacy_contact_consent !== true) errs.push(bad("privacy_contact_consent", "must_be_true"));
  if (typeof b.marketing_consent !== "boolean") errs.push(bad("marketing_consent", "invalid_type"));
  const c = b.consent;
  if (!c || typeof c !== "object") errs.push(bad("consent", "required"));
  else { exactKeys(c, ["version", "contact_text_sha256", "marketing_text_sha256", "shown_at"], "consent", errs); if (c.version !== "early-access-contact-v1") errs.push(bad("consent.version", "unknown_version")); if (!HEX64.test(c.contact_text_sha256 || "")) errs.push(bad("consent.contact_text_sha256", "invalid")); if (!HEX64.test(c.marketing_text_sha256 || "")) errs.push(bad("consent.marketing_text_sha256", "invalid")); if (!Number.isFinite(Date.parse(c.shown_at))) errs.push(bad("consent.shown_at", "invalid")); }
  const s = b.source || {};
  if (typeof s !== "object" || Array.isArray(s)) errs.push(bad("source", "invalid_type")); else { exactKeys(s, SOURCE_KEYS, "source", errs); for (const k of SOURCE_KEYS) if (s[k] !== undefined && (typeof s[k] !== "string" || s[k].length > 100 || /[\s<>"']/.test(s[k]))) errs.push(bad(`source.${k}`, "invalid")); }
  const cl = b.client;
  if (!cl || typeof cl !== "object") errs.push(bad("client", "required")); else { exactKeys(cl, ["elapsed_ms"], "client", errs); if (!Number.isInteger(cl.elapsed_ms) || cl.elapsed_ms < 0 || cl.elapsed_ms > 86400000) errs.push(bad("client.elapsed_ms", "invalid")); }
  if (errs.length) return { errors: errs };
  return { value: { ...b, name, business_name: business, work_email: email, notes: (b.notes || "").trim(), source: s } };
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
  const cols = ["reference_id", "received_at", "intention", "name", "work_email", "business_name", "industry", "marketing_priorities", "marketing_consent", "consent_version", "utm_source", "utm_medium", "utm_campaign", "referrer_host"];
  const cell = (v) => { let s = Array.isArray(v) ? v.join(";") : v === undefined || v === null ? "" : String(v); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
  return [cols.join(","), ...records.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n") + "\n";
}

export function createLeadStub({ allowedOrigin = "*", rateLimit = { max: 5, windowMs: 15 * 60 * 1000 }, now = () => Date.now(), dev = true, file = null } = {}) {
  const secret = crypto.randomBytes(32);
  const pseudo = (ip) => crypto.createHmac("sha256", secret).update(String(ip)).digest("hex").slice(0, 16);
  const byEmail = new Map(); const bySubmission = new Map(); const buckets = new Map(); const counters = {}; const records = [];
  const cors = { "access-control-allow-origin": allowedOrigin, "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type", "access-control-max-age": "600", vary: "Origin" };
  const send = (res, status, body, extra = {}) => { res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", ...cors, ...extra }); res.end(body === null ? "" : JSON.stringify(body)); };
  const err = (res, status, code, extra = {}) => send(res, status, { error: { code, message: code.toLowerCase().replace(/_/g, " ") } }, extra);
  const readBody = (req, limit = 16384) => new Promise((resolve, reject) => { let n = 0; const chunks = []; req.on("data", (c) => { n += c.length; if (n > limit) { reject(Object.assign(new Error("too large"), { status: 413 })); req.destroy(); } else chunks.push(c); }); req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8"))); req.on("error", reject); });
  const fingerprint = (v) => crypto.createHash("sha256").update(JSON.stringify([v.work_email, v.name, v.business_name, v.industry, v.intention, v.marketing_priorities, v.notes, v.marketing_consent, v.consent.version])).digest("hex");
  const limited = (ip) => { const k = pseudo(ip); const t = now(); const b = (buckets.get(k) || []).filter((x) => t - x < rateLimit.windowMs); b.push(t); buckets.set(k, b); return b.length > rateLimit.max; };

  async function handle(req, res) {
    const url = new URL(req.url, "http://x"); const ip = req.socket.remoteAddress || "0";
    if (req.method === "OPTIONS") return send(res, 204, null);
    if (url.pathname === LEAD_PATH) {
      if (req.method !== "POST") return err(res, 405, "METHOD_NOT_ALLOWED", { allow: "POST, OPTIONS" }); // write-only: no public list/lookup/update/delete
      if (limited(ip)) return err(res, 429, "RATE_LIMITED", { "retry-after": String(Math.ceil(rateLimit.windowMs / 1000)) });
      if (!(req.headers["content-type"] || "").startsWith("application/json")) return err(res, 415, "UNSUPPORTED_MEDIA_TYPE");
      let raw; try { raw = await readBody(req); } catch (e) { return err(res, e.status || 400, "PAYLOAD_TOO_LARGE"); }
      let body; try { body = JSON.parse(raw); } catch { return err(res, 400, "VALIDATION_ERROR"); }
      const r = validateLead(body); if (r.errors) return send(res, 400, { error: { code: "VALIDATION_ERROR", message: "validation error", details: r.errors } });
      const v = r.value; const fp = fingerprint(v);
      const prior = bySubmission.get(v.submission_id);
      if (prior) { if (prior.fingerprint !== fp) return err(res, 409, "IDEMPOTENCY_KEY_CONFLICT"); return send(res, 202, { status: "received", reference_id: prior.reference }); }
      const reference = `ea_${crypto.randomBytes(9).toString("base64url")}`; const receivedAt = new Date(now()).toISOString();
      bySubmission.set(v.submission_id, { fingerprint: fp, reference });
      const existing = byEmail.get(v.work_email);
      // One canonical record per normalised email; a repeat adds a receipt and can only raise intention (early_access -> founding_customer). The response never discloses a prior record.
      if (existing) { if (v.intention === "founding_customer") existing.intention = "founding_customer"; existing.receipts.push({ reference_id: reference, received_at: receivedAt, intention: v.intention, marketing_consent: v.marketing_consent, consent_version: v.consent.version }); if (v.marketing_consent) existing.marketing_consent = true; }
      else { const rec = { reference_id: reference, received_at: receivedAt, intention: v.intention, name: v.name, work_email: v.work_email, business_name: v.business_name, industry: v.industry, marketing_priorities: v.marketing_priorities, marketing_consent: v.marketing_consent, consent_version: v.consent.version, utm_source: v.source.utm_source, utm_medium: v.source.utm_medium, utm_campaign: v.source.utm_campaign, referrer_host: v.source.referrer_host, receipts: [{ reference_id: reference, received_at: receivedAt, intention: v.intention, marketing_consent: v.marketing_consent, consent_version: v.consent.version }] }; byEmail.set(v.work_email, rec); records.push(rec); }
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
