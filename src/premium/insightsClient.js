// Analytics gate (BG-STUDIO-022-FE). The earlier proposed contracts (campaign-results.v1, learning-insights.v1) were REMOVED: the backend never built them
// and its reference models are different. The canonical shapes are performance-observation.v1 / performance-snapshot.v1 / evidence-recommendation.v1
// and are validated in src/intel/performanceEvidence.js. There is still no backend route, so this module holds only the build-time gate, which now
// means "the platform-evidence routes exist and a fetcher was supplied". No endpoint is invented here.
export const isAnalyticsApiEnabled = (env = import.meta.env) => {
  const raw = env && env.VITE_ANALYTICS_API;
  return typeof raw === "string" && raw.trim().toLowerCase() === "true";
};
