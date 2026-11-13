// BG-WEB-LAUNCH-CLOSURE-18: the ONLY place that says which deployed API revisions are known to support which customer-facing capabilities.
//
// A build may switch a feature on with a VITE_* flag, but the Studio shows the control only if ALL of these hold (see featureGate.js):
//   1. the flag is "true";
//   2. the build declares the API it targets: VITE_API_SOURCE_SHA (the 40-character source commit the serving revision was built from) and VITE_API_SERVING_REVISION;
//   3. this manifest lists that exact pair, with an evidence URL, and marks the feature's capability as verified.
// An empty list (today) therefore keeps every gated control off in every release build. The API has no capability endpoint, so a route being mounted in source
// proves nothing about the serving revision's configuration (QUOTED_GENERATION_ENABLED, MEDIA_INTAKE_ENABLED, SOCIAL_PUBLISHING_ENABLED, LEARNING_ENABLED,
// storage, token vault, policy, spend admission). Add an entry only in a reviewed PR, after a hosted check of that revision, with a link to the evidence.
//
// Entry shape (all fields required except socialProviders):
//   { sourceSha: "<40 hex>", servingRevision: "<Cloud Run revision name>", verifiedAt: "<ISO date>", evidence: "https://…",
//     capabilities: { quotedGeneration: true, workspaceCalendar: true, mediaIntake: true, social: true, learning: true, commercialCatalogue: true, creditPreview: true, billingManagement: true },
//     socialProviders: ["tiktok", "linkedin"] }
// Only capabilities that were actually verified are listed; an absent capability is unverified.
export const API_COMPATIBILITY = Object.freeze({ schema: 1, revisions: Object.freeze([]) });
