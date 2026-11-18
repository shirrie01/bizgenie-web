// Registration form model: validation, payload and submit logic. Pure ES module, no DOM, no storage, no cookies (tested in tests/form-model.test.js).
// Contract: the EXISTING bizgenie-api route POST /public/paid-beta-interest (src/paid-beta/schema.js; docs/launch/PAID_BETA_CAPTURE_AND_CHECKOUT_RETURN.md in
// bizgenie-api). The body is strict: exactly the nine fields below, nothing else. The server re-validates everything and records its own consent version/wording.
export const MIN_FILL_MS = 3000; // a form completed faster than this is treated as automated
export const INTENTIONS = ["early_access", "founding_customer"];
// The existing API has no intention field. The chosen registration is carried only as the short, safe `source` label the API already accepts.
export const SOURCE_BY_INTENTION = { early_access: "website-early-access", founding_customer: "website-founding-customer" };
export const STAGES = ["pre-revenue", "under-250k", "250k-1m", "1m-5m", "5m-plus"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
// A visitor may type "example.com". The API needs an HTTP(S) address, so a missing scheme gets https://. Credentials in the address are refused.
const addressOf = (v) => { const t = clean(v); return !t ? "" : /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`; };
function validAddress(t) {
  if (!t || t.length > 2048) return false;
  try { const u = new URL(t); return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password; } catch { return false; }
}

// Returns { ok, errors: { field: code }, values }. Error CODES (not prose) so the same code can be measured without any value being recorded.
export function validate(input) {
  const v = {
    name: clean(input.name),
    email: clean(input.email).toLowerCase(),
    company: clean(input.company),
    website: addressOf(input.website),
    stage: clean(input.stage),
    challenge: String(input.challenge ?? "").trim(),
    intention: clean(input.intention),
    contactConsent: input.contactConsent === true,
  };
  const errors = {};
  if (!v.name) errors.name = "required"; else if (v.name.length > 120) errors.name = "too_long";
  if (!v.email) errors.email = "required"; else if (v.email.length > 254 || !EMAIL.test(v.email)) errors.email = "invalid";
  if (!v.company) errors.company = "required"; else if (v.company.length > 160) errors.company = "too_long";
  if (!v.website) errors.website = "required"; else if (!validAddress(v.website)) errors.website = "invalid";
  if (!STAGES.includes(v.stage)) errors.stage = "required";
  if (!v.challenge) errors.challenge = "required"; else if (v.challenge.length > 1000) errors.challenge = "too_long";
  if (!INTENTIONS.includes(v.intention)) errors.intention = "required";
  if (!v.contactConsent) errors.contactConsent = "required";
  return { ok: Object.keys(errors).length === 0, errors, values: v };
}

export const MESSAGES = {
  name: { required: "Enter your name.", too_long: "Use 120 characters or fewer." },
  email: { required: "Enter your email address.", invalid: "Enter an email address like name@company.com." },
  company: { required: "Enter your business or company name.", too_long: "Use 160 characters or fewer." },
  website: { required: "Enter your website or social profile address.", invalid: "Enter a web address like https://example.com, without a username or password." },
  stage: { required: "Choose the business stage that fits best." },
  challenge: { required: "Tell us your main marketing challenge.", too_long: "Use 1,000 characters or fewer." },
  intention: { required: "Choose early access or founding customer." },
  contactConsent: { required: "Tick this box so we can contact you about the paid beta." },
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

export const newSubmissionId = () => `ws-${globalThis.crypto.randomUUID()}`;

// The exact request body of the existing contract. Nothing else is ever added (no tokens, no social handles, no device identifiers, no attribution).
export function buildPayload({ values, submissionId }) {
  return {
    name: values.name,
    work_email: values.email,
    business_name: values.company,
    website_or_social_profile: values.website,
    business_stage: values.stage,
    primary_marketing_challenge: values.challenge,
    privacy_contact_consent: true,
    source: SOURCE_BY_INTENTION[values.intention],
    submission_id: submissionId,
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
