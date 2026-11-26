import { readFileSync } from "node:fs";

// Public website configuration (BG-WEB-001). Facts that only the founder can supply are NULL here and are never invented: the build lists every
// unresolved item (`npm run site:check`) and the pages show "to be confirmed" in a draft build. `--strict` (or SITE_STRICT=1) fails the build while any remain.
export const company = {
  legalName: "BizGenie Technologies Limited",          // given in the work order
  tradingName: "BizGenie",
  domain: "getbizgenie.com",
  siteUrl: "https://getbizgenie.com",
  tagline: "Make. Launch. Learn what converts.",       // approved positioning
  // FOUNDER INPUT REQUIRED (null = unresolved; do not guess):
  companyNumber: null,
  registeredOffice: null,
  contactEmail: null,
  privacyContactEmail: null,
  dataProtectionRegistration: null,                    // e.g. ICO registration reference, if applicable
  // Legal text is drafted for review; the pages show a visible notice until this is true.
  legalReviewed: false,
  // Retention of registration records is unresolved in the backend contract; the privacy notice says so until the founder decides.
  retentionDecision: null,
  // Privacy and terms content the strict build must not publish blank (BG-WEB-LAUNCH-CLOSURE-14). All FOUNDER/ADVISER INPUT REQUIRED:
  processors: null,                                    // e.g. [{ name: "…", purpose: "…" }] — every provider that processes registration data
  internationalTransfers: null,                        // plain-language statement of transfers outside the UK and the safeguard, or that there are none
  governingLaw: null,                                  // e.g. the governing law and courts sentence the adviser approves
};

// Load only the public facts and wording approved for publication.
const publicationFields = [
  "companyNumber", "registeredOffice", "contactEmail", "privacyContactEmail",
  "dataProtectionRegistration", "retentionDecision", "processors",
  "internationalTransfers", "governingLaw", "legalReviewed",
];
if (process.env.SITE_PUBLICATION_CONFIG) {
  let supplied;
  try {
    supplied = JSON.parse(readFileSync(process.env.SITE_PUBLICATION_CONFIG, "utf8"));
  } catch {
    throw new Error("SITE_PUBLICATION_CONFIG must point to a readable JSON file.");
  }
  if (!supplied || typeof supplied !== "object" || Array.isArray(supplied) ||
      Object.keys(supplied).some((key) => !publicationFields.includes(key))) {
    throw new Error("SITE_PUBLICATION_CONFIG must contain only public publication fields.");
  }
  Object.assign(company, supplied);
}

const isText = (value) => typeof value === "string" && value.trim().length > 0;
const isEmail = (value) => typeof value === "string" && /^[^\s@,;?&#]+@[^\s@,;?&#]+\.[^\s@,;?&#]+$/.test(value);
const localHost = (host) => ["localhost", "127.0.0.1", "[::1]"].includes(host);
function leadOrigin(value, allowLocal) {
  try {
    const url = new URL(value);
    if (url.origin !== value) return "";
    if (localHost(url.hostname)) return allowLocal && ["http:", "https:"].includes(url.protocol) ? url.origin : "";
    return url.protocol === "https:" ? url.origin : "";
  } catch {
    return "";
  }
}

// Where the browser sends registrations and aggregate measurements. EMPTY by default: with no URL the form says registration is not open on this
// build and the page makes no network request. Set at build time: SITE_API_URL=https://api.example (the approved CORS origin must include the site).
export const runtime = {
  apiBaseUrl: leadOrigin(process.env.SITE_API_URL, true),
  leadPath: "/public/early-access-interest",           // PROPOSED route (see docs/website/BG_WEB_001_LEAD_CAPTURE_CONTRACT.md)
  eventsPath: "/public/site-events",                   // PROPOSED route
  measurement: process.env.SITE_MEASUREMENT === "1",   // off unless explicitly enabled AND an API URL is set
};

// Structured so the checklist groups on an explicit owner, not on message wording.
export function unresolvedItems() {
  const out = [];
  const add = (field, owner, message) => out.push({ field, owner, message });
  for (const k of ["companyNumber", "registeredOffice"]) if (!isText(company[k])) add(k, "company", k);
  for (const k of ["contactEmail", "privacyContactEmail"]) if (!isEmail(company[k])) add(k, "contact", k);
  if (!isText(company.retentionDecision)) add("retentionDecision", "privacy", "retentionDecision (how long registration records are kept)");
  if (!Array.isArray(company.processors) || company.processors.length === 0 || !company.processors.every((p) => p && isText(p.name) && isText(p.purpose))) add("processors", "privacy", "processors (list of providers that process registration data, each with a purpose)");
  if (!isText(company.internationalTransfers)) add("internationalTransfers", "privacy", "internationalTransfers (statement on transfers outside the UK)");
  if (!isText(company.governingLaw)) add("governingLaw", "terms", "governingLaw (governing law and courts for the website terms)");
  if (company.legalReviewed !== true) add("legalReviewed", "approval", "legalReviewed (privacy notice, terms and consent wording need legal review)");
  if (!runtime.apiBaseUrl) add("SITE_API_URL", "build", "SITE_API_URL (no lead endpoint configured; the form will not submit)");
  else if (!leadOrigin(runtime.apiBaseUrl, false)) add("SITE_API_URL", "build", "SITE_API_URL (strict publication requires a non-loopback HTTPS lead origin)");
  return out;
}
export const unresolved = () => unresolvedItems().map((i) => i.message);
