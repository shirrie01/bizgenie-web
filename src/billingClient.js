const API_BASE_URL = import.meta.env.VITE_BIZGENIE_API_URL || "http://localhost:8080";

function authHeaders(accessToken, json = false) {
  return {
    authorization: `Bearer ${accessToken}`,
    ...(json ? { "content-type": "application/json" } : {}),
  };
}

function requestId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `checkout_${uuid ? uuid.replaceAll("-", "") : Date.now().toString(36)}`;
}

function safeCheckoutUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Checkout could not be opened safely.");
  }
  if (url.protocol !== "https:") throw new Error("Checkout could not be opened safely.");
  return url.toString();
}

export async function startStandardCheckout({ accessToken, tenantId }) {
  if (!accessToken || !tenantId) throw new Error("Sign in to start checkout.");

  const response = await fetch(`${API_BASE_URL}/billing/stripe/checkout`, {
    method: "POST",
    headers: authHeaders(accessToken, true),
    body: JSON.stringify({
      // This selector is derived only from trusted Supabase app_metadata.
      // The backend remains authority and re-authorizes owner membership.
      tenant_id: tenantId,
      plan_code: "standard",
      request_id: requestId(),
    }),
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error("Sign in again to start checkout.");
    if (response.status === 404) throw new Error("Checkout is not available for this account.");
    throw new Error("Checkout could not be started. Please try again.");
  }

  const result = await response.json();
  return { url: safeCheckoutUrl(result?.url), checkoutSessionId: result?.checkout_session_id || "" };
}

export async function readCustomerBillingState({ accessToken }) {
  if (!accessToken) throw new Error("Sign in to check your billing status.");

  const response = await fetch(`${API_BASE_URL}/customer/billing/subscription`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error("Sign in again to check your billing status.");
    if (response.status === 404) return { status: "not_subscribed", subscription: null };
    throw new Error("Billing status could not be checked yet.");
  }

  return response.json();
}
