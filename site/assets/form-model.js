// Registration form model: validation, payload and submit logic. Pure ES module, no DOM, no storage, no cookies (tested in tests/form-model.test.js).
// Contract: docs/website/BG_WEB_001_LEAD_CAPTURE_CONTRACT.md (`early-access-interest.v1`, PROPOSED; the server re-validates everything).
export const CONTRACT_VERSION = "early-access-interest.v1";
export const CONSENT_VERSION = "early-access-contact-v1";
export const MIN_FILL_MS = 3000; // a form completed faster than this is treated as automated
export const INTENTIONS = ["early_access", "founding_customer"];
export const INDUSTRIES = ["agency", "ecommerce", "professional_services", "hospitality", "product_brand", "other"];
export const PRIORITIES = ["brand_consistency", "faster_content", "campaign_planning", "publishing", "performance", "image_video"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();

// Returns { ok, errors: { field: code }, values }. Error CODES (not prose) so the same code can be measured without any value being recorded.
export function validate(input) {
  const v = {
    name: clean(input.name),
    email: clean(input.email).toLowerCase(),
    company: clean(input.company),
    industry: clean(input.industry),
    intention: clean(input.intention),
    priorities: (Array.isArray(input.priorities) ? input.priorities : []).filter((p) => PRIORITIES.includes(p)),
    notes: String(input.notes ?? "").trim().slice(0, 500),
    contactConsent: input.contactConsent === true,
    marketingConsent: input.marketingConsent === true,
  };
  const errors = {};
  if (!v.name) errors.name = "required"; else if (v.name.length > 120) errors.name = "too_long";
  if (!v.email) errors.email = "required"; else if (v.email.length > 254 || !EMAIL.test(v.email)) errors.email = "invalid";
  if (!v.company) errors.company = "required"; else if (v.company.length > 160) errors.company = "too_long";
  if (!INDUSTRIES.includes(v.industry)) errors.industry = "required";
  if (!INTENTIONS.includes(v.intention)) errors.intention = "required";
  if (!v.contactConsent) errors.contactConsent = "required";
  return { ok: Object.keys(errors).length === 0, errors, values: v };
}

export const MESSAGES = {
  name: { required: "Enter your name.", too_long: "Use 120 characters or fewer." },
  email: { required: "Enter your email address.", invalid: "Enter an email address like name@company.com." },
  company: { required: "Enter your business or company name.", too_long: "Use 160 characters or fewer." },
  industry: { required: "Choose the industry that fits best." },
  intention: { required: "Choose early access or founding customer." },
  contactConsent: { required: "Tick this box so we can contact you about early access." },
};
export const messageFor = (field, code) => (MESSAGES[field] && MESSAGES[field][code]) || "Check this field.";

// Attribution is read from the landing URL and kept IN MEMORY only (no cookie, no storage). Only a fixed allow-list of keys and short values.
export function readAttribution(search, referrer, pathname = "/") {
  const p = new URLSearchParams(search || "");
  const take = (k) => {
    const x = (p.get(k) || "").toLowerCase().replace(/[^a-z0-9._:-]/g, "").slice(0, 64);
    return x || undefined;
  };
  let referrerHost;
  try { if (referrer) referrerHost = new URL(referrer).hostname.slice(0, 100); } catch { /* none */ }
  const out = { utm_source: take("utm_source"), utm_medium: take("utm_medium"), utm_campaign: take("utm_campaign"), referrer_host: referrerHost, landing_path: String(pathname).slice(0, 100) };
  return Object.fromEntries(Object.entries(out).filter(([, x]) => x !== undefined));
}

export async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export const newSubmissionId = () => `ws-${globalThis.crypto.randomUUID()}`;

// The exact request body. Nothing else is ever added (no tokens, no social handles, no device identifiers).
export async function buildPayload({ values, attribution, submissionId, elapsedMs, consentContactText, consentMarketingText }) {
  return {
    contract_version: CONTRACT_VERSION,
    submission_id: submissionId,
    name: values.name,
    work_email: values.email,
    business_name: values.company,
    industry: values.industry,
    intention: values.intention,
    marketing_priorities: values.priorities,
    ...(values.notes ? { notes: values.notes } : {}),
    privacy_contact_consent: true,
    marketing_consent: values.marketingConsent === true,
    consent: {
      version: CONSENT_VERSION,
      contact_text_sha256: await sha256Hex(consentContactText),
      marketing_text_sha256: await sha256Hex(consentMarketingText),
      shown_at: new Date().toISOString(),
    },
    source: attribution || {},
    client: { elapsed_ms: Math.max(0, Math.round(elapsedMs)) },
  };
}

// Result categories the UI can word. `retryable` means the SAME submission id may be sent again; a conflict or validation failure never is.
export async function submitLead({ url, payload, fetchImpl = globalThis.fetch, timeoutMs = 10000 }) {
  if (!url) return { kind: "closed" };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), credentials: "omit", referrerPolicy: "no-referrer", signal: ctl.signal });
    let body = null;
    try { body = await res.json(); } catch { /* none */ }
    if (res.status === 202 || res.status === 200 || res.status === 201) return { kind: "received", reference: body && typeof body.reference_id === "string" ? body.reference_id : null };
    if (res.status === 429) return { kind: "rate_limited", retryable: true, retryAfter: Number(res.headers && res.headers.get && res.headers.get("retry-after")) || null };
    if (res.status === 400 || res.status === 422) return { kind: "invalid", retryable: false, details: body && body.error && Array.isArray(body.error.details) ? body.error.details : [] };
    if (res.status === 409) return { kind: "conflict", retryable: false };
    return { kind: "unavailable", retryable: true };
  } catch {
    return { kind: "network", retryable: true };
  } finally {
    clearTimeout(timer);
  }
}
