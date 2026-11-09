// The customer's role in the SELECTED workspace (BG-STUDIO-011-FE contract alignment).
//
// bizgenie-api PR #213 (hardened at 120a874) lets only the workspace OWNER write onboarding. A refused write is a
// plain 403 `WORKSPACE_NOT_AUTHORIZED`, the same answer as "not a member", so the browser cannot tell the two apart from
// that response. The role is therefore read from the existing GET /customer/workspace list (which carries
// `membership_role` for each workspace) and matched to the signed-in scope. Nothing is inferred: if the workspace is not
// in the list, or the list cannot be read, the role is unknown (null) and the server stays the only authority.

export async function fetchMembershipRole({ apiBaseUrl, accessToken, scope, fetchImpl = (...a) => fetch(...a) }) {
  let response;
  try {
    response = await fetchImpl(`${apiBaseUrl}/customer/workspace`, { method: "GET", headers: { authorization: `Bearer ${accessToken}` } });
  } catch { return { role: null, listed: false }; }
  if (!response.ok) return { role: null, listed: false };
  let json = null;
  try { json = await response.json(); } catch { return { role: null, listed: false }; }
  const candidates = json && json.status === "ready" && json.workspace ? [json.workspace] : json && json.status === "selection_required" && Array.isArray(json.workspaces) ? json.workspaces : [];
  const match = candidates.find((w) => w && w.tenant_id === scope.tenantId && w.project_id === scope.projectId && w.brand_id === scope.brandId);
  if (!match) return { role: null, listed: false };
  return { role: typeof match.membership_role === "string" && match.membership_role ? match.membership_role : null, listed: true };
}

export const OWNER_ROLE = "owner";
export const roleLabel = (role) => (role ? role.charAt(0).toUpperCase() + role.slice(1) : "");
// Known and not owner. An unknown role is not read-only: the server decides.
export const isReadOnlyRole = (role) => Boolean(role) && role !== OWNER_ROLE;
