import { getSupabaseClient, isSupabaseConfigured } from "./supabaseClient";

/**
 * Tenant/project/brand scope must come only from the authenticated
 * session's app_metadata, which Supabase only allows a service-role
 * (backend) caller to set. It is never sourced from user_metadata
 * (user-editable), form fields, or environment variables — a user
 * cannot alter their own app_metadata from the browser.
 */
function scopeFromAppMetadata(user) {
  const appMetadata = (user && user.app_metadata) || {};
  const tenantId = appMetadata.tenant_id || "";
  const projectId = appMetadata.project_id || "";
  const brandId = appMetadata.brand_id || "";
  if (!tenantId || !projectId || !brandId) return null;
  return { tenantId, projectId, brandId };
}

/**
 * Returns one of:
 *  - { status: "unconfigured" }   Supabase env vars are missing.
 *  - { status: "signed-out" }     No authenticated Supabase session.
 *  - { status: "scope-missing", accessToken }
 *        Signed in, but the backend has not yet assigned tenant/project/
 *        brand scope to this account. Recommendation requests must stay
 *        blocked in this state.
 *  - { status: "ready", accessToken, tenantId, projectId, brandId }
 *        Fully authenticated and scoped; safe to call the API.
 */
export async function getCustomerSession() {
  if (!isSupabaseConfigured()) return { status: "unconfigured" };

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session) return { status: "signed-out" };

  const session = data.session;
  const scope = scopeFromAppMetadata(session.user);
  if (!scope) return { status: "scope-missing", accessToken: session.access_token };

  return {
    status: "ready",
    accessToken: session.access_token,
    tenantId: scope.tenantId,
    projectId: scope.projectId,
    brandId: scope.brandId,
  };
}
