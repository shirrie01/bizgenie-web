// Premium Studio feature flag (BG-STUDIO-008-FE). Disabled unless explicitly set to the string "true".
// Anything else (unset, "false", "1", "yes", "TRUE " with surrounding noise) keeps the current customer experience.
// The flag is a build-time value: it is never read from a URL, local storage or the backend, and this code
// never changes any environment variable.
export function isPremiumStudioEnabled(env = import.meta.env) {
  const raw = env && env.VITE_PREMIUM_STUDIO_ENABLED;
  return typeof raw === "string" && raw.trim().toLowerCase() === "true";
}

// BG-STUDIO-017-FE (DEC-023): the "Professional services" sector exists in the UI, but the backend validates sector_key
// against a fixed list (workspace-onboarding schema enum AND a database CHECK constraint that the schema preflight pins).
// It may be SAVED only once that backend change is deployed. Build-time, default off, strictly the string "true".
// While off, the sector still gives guidance when it is worked out from the customer's own words, but it is never
// offered as a choice and never sent to the API (which would refuse it).
export function isProfessionalSectorPersisted(env = import.meta.env) {
  const raw = env && env.VITE_PROFESSIONAL_SECTOR_PERSISTED;
  return typeof raw === "string" && raw.trim().toLowerCase() === "true";
}
