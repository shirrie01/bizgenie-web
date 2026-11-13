// BG-WEB-LAUNCH-CLOSURE-18: tell "this service is not deployed in this version" apart from "you do not have access".
// The API answers its own authorisation refusals with a JSON error that carries a code (for example RESOURCE_NOT_AVAILABLE). A 404 with NO error code
// (the framework's default for a route that is not mounted, or a proxy's) means the feature is not deployed here. A customer must never be told their access
// was removed because a feature has not been released yet.
export const NOT_DEPLOYED_CODE = "ROUTE_NOT_DEPLOYED";
export const NOT_DEPLOYED_TEXT = "This part of BizGenie isn't available in this version yet. Your access has not changed.";
export const looksNotDeployed = (status, json) => status === 404 && !(json && json.error && typeof json.error.code === "string" && json.error.code !== "");
export async function readJsonSafe(res) { try { return await res.json(); } catch { return null; } }
