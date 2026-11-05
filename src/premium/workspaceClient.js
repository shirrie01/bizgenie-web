// Workspace list and selection client (BG-STUDIO-011-FE) for the existing bizgenie-api routes
//   GET  /customer/workspace          -> missing_workspace | ready | selection_required (+ workspaces[])
//   POST /customer/workspace/select   -> { status: "ready", workspace, requires_session_refresh? }
// Pure network code. Both routes use the customer's IDENTITY token: the workspace is never taken from the request
// scope, and the browser never picks a workspace on the customer's behalf. Every response is validated, and the
// workspace the API confirms must be exactly the one that was requested.

export class WorkspaceError extends Error {
  constructor(message, { code = "WORKSPACE_ERROR", status = 0, unavailable = false } = {}) {
    super(message);
    this.name = "WorkspaceError";
    this.code = code;
    this.status = status;
    // true when the chosen workspace is not (or no longer) available to this account, so the list should be refreshed.
    this.unavailable = unavailable;
  }
}

const FIELDS = ["tenant_id", "project_id", "brand_id"];
const isText = (v) => typeof v === "string" && v.length > 0;
const validWorkspace = (w) => Boolean(w) && typeof w === "object" && FIELDS.every((k) => isText(w[k]));

export function normaliseWorkspace(w) {
  return {
    tenant_id: w.tenant_id, project_id: w.project_id, brand_id: w.brand_id,
    tenant_name: typeof w.tenant_name === "string" ? w.tenant_name : "",
    project_name: typeof w.project_name === "string" ? w.project_name : "",
    brand_name: typeof w.brand_name === "string" ? w.brand_name : "",
    brand_status: typeof w.brand_status === "string" ? w.brand_status : "",
    membership_role: typeof w.membership_role === "string" ? w.membership_role : "",
  };
}

export const sameWorkspace = (a, b) => Boolean(a && b) && FIELDS.every((k) => a[k] === b[k]);

async function send({ apiBaseUrl, accessToken, path, method, body, fetchImpl }) {
  let response;
  try {
    response = await fetchImpl(`${apiBaseUrl}${path}`, {
      method,
      headers: { ...(body ? { "content-type": "application/json" } : {}), authorization: `Bearer ${accessToken}` },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new WorkspaceError("Your workspaces could not be reached. Nothing was changed.", { code: "NETWORK" });
  }
  let json = null;
  try { json = await response.json(); } catch { json = null; }
  return { response, json };
}

export async function fetchWorkspaces({ apiBaseUrl, accessToken, fetchImpl = (...a) => fetch(...a) }) {
  const { response, json } = await send({ apiBaseUrl, accessToken, path: "/customer/workspace", method: "GET", fetchImpl });
  if (response.status === 401) throw new WorkspaceError("Your session has ended. Sign in again to see your workspaces.", { code: "AUTHENTICATION_REQUIRED", status: 401 });
  if (!response.ok) throw new WorkspaceError(`Your workspaces could not be loaded (error ${response.status}). Nothing was changed.`, { status: response.status });
  const status = json && json.status;
  if (status === "missing_workspace") return { status, workspace: null, workspaces: [] };
  if (status === "ready" && validWorkspace(json.workspace)) return { status, workspace: normaliseWorkspace(json.workspace), workspaces: [normaliseWorkspace(json.workspace)] };
  if (status === "selection_required" && Array.isArray(json.workspaces) && json.workspaces.length > 1 && json.workspaces.every(validWorkspace)) {
    return { status, workspace: null, workspaces: json.workspaces.map(normaliseWorkspace) };
  }
  throw new WorkspaceError("The server sent an unexpected answer about your workspaces, so none are shown.", { code: "WORKSPACE_BAD_RESPONSE" });
}

export async function selectWorkspace({ apiBaseUrl, accessToken, workspace, fetchImpl = (...a) => fetch(...a) }) {
  const body = { tenant_id: workspace.tenant_id, project_id: workspace.project_id, brand_id: workspace.brand_id };
  const { response, json } = await send({ apiBaseUrl, accessToken, path: "/customer/workspace/select", method: "POST", body, fetchImpl });
  if (response.status === 401) throw new WorkspaceError("Your session has ended. Sign in again to choose a workspace. Nothing was changed.", { code: "AUTHENTICATION_REQUIRED", status: 401 });
  if (response.status === 400) throw new WorkspaceError("That workspace is not available to your account any more. Your list has been refreshed. Nothing was changed.", { code: "WORKSPACE_UNAVAILABLE", status: 400, unavailable: true });
  if (response.status === 503) throw new WorkspaceError("Switching workspace is not available right now. Nothing was changed. Try again shortly.", { code: "WORKSPACE_PROVISIONING_UNAVAILABLE", status: 503 });
  if (!response.ok) throw new WorkspaceError(`The workspace could not be selected (error ${response.status}). Nothing was changed.`, { status: response.status });
  if (!json || json.status !== "ready" || !validWorkspace(json.workspace) || !sameWorkspace(json.workspace, body)) {
    throw new WorkspaceError("The server did not confirm the workspace you chose, so nothing was switched.", { code: "WORKSPACE_BAD_RESPONSE" });
  }
  return { workspace: normaliseWorkspace(json.workspace), requiresSessionRefresh: json.requires_session_refresh === true };
}
