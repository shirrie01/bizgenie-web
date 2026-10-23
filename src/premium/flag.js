// Premium Studio feature flag (BG-STUDIO-008-FE). Disabled unless explicitly set to the string "true".
// Anything else (unset, "false", "1", "yes", "TRUE " with surrounding noise) keeps the current customer experience.
// The flag is a build-time value: it is never read from a URL, local storage or the backend, and this code
// never changes any environment variable.
export function isPremiumStudioEnabled(env = import.meta.env) {
  const raw = env && env.VITE_PREMIUM_STUDIO_ENABLED;
  return typeof raw === "string" && raw.trim().toLowerCase() === "true";
}
