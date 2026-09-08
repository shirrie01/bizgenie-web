const session = Object.freeze({
  accessToken: import.meta.env.VITE_BIZGENIE_ACCESS_TOKEN || "",
  tenantId: import.meta.env.VITE_BIZGENIE_TENANT_ID || "",
  projectId: import.meta.env.VITE_BIZGENIE_PROJECT_ID || "",
  brandId: import.meta.env.VITE_BIZGENIE_BRAND_ID || "",
});

export function getCustomerSession() {
  if (!session.accessToken || !session.tenantId || !session.projectId || !session.brandId) return null;
  return session;
}
