// BG-017C-05B: truthful behaviour for features whose API routes the trusted staging bridge does not carry (Codex API PR #229, src/studio-bridge/service.js).
// The release workflow sets VITE_API_ROUTE_LIMITS=bridge-v1 only when the API origin chosen for the build is a listed bridge origin (BRIDGE_API_ORIGINS in
// studio-staging-release.yml). Then these features do not call the API (it would answer 404 "not available", which a customer would read as their account's fault):
// they say plainly that they are not available in this test environment yet, and that nothing was charged or changed. Off (empty) for every other build.
export const NOT_CARRIED = Object.freeze({
  checkout: "Subscribing isn't available in this test environment yet, so nothing can be charged. You can still set up your workspace and campaign.",
  manualPublication: "Recording a post you published yourself isn't available in this test environment yet. Nothing was changed.",
});
export const routeLimited = (feature, env = import.meta.env) => Boolean(env) && env.VITE_API_ROUTE_LIMITS === "bridge-v1" && Object.hasOwn(NOT_CARRIED, feature);
export const limitedNotice = (feature) => (Object.hasOwn(NOT_CARRIED, feature) ? NOT_CARRIED[feature] : "");
