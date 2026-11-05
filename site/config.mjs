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
};

// Where the browser sends registrations and aggregate measurements. EMPTY by default: with no URL the form says registration is not open on this
// build and the page makes no network request. Set at build time: SITE_API_URL=https://api.example (the approved CORS origin must include the site).
export const runtime = {
  apiBaseUrl: process.env.SITE_API_URL || "",
  leadPath: "/public/early-access-interest",           // PROPOSED route (see docs/website/BG_WEB_001_LEAD_CAPTURE_CONTRACT.md)
  eventsPath: "/public/site-events",                   // PROPOSED route
  measurement: process.env.SITE_MEASUREMENT === "1",   // off unless explicitly enabled AND an API URL is set
};

export function unresolved() {
  const out = [];
  for (const k of ["companyNumber", "registeredOffice", "contactEmail", "privacyContactEmail"]) if (!company[k]) out.push(k);
  if (!company.legalReviewed) out.push("legalReviewed (privacy notice, terms and consent wording need legal review)");
  if (!company.retentionDecision) out.push("retentionDecision (how long registration records are kept)");
  if (!runtime.apiBaseUrl) out.push("SITE_API_URL (no lead endpoint configured; the form will not submit)");
  return out;
}
