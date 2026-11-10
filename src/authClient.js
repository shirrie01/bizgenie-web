import { getSupabaseClient } from "./supabaseClient";
import { toSafeAuthMessage } from "./authErrors";

const NOT_CONFIGURED_MESSAGE = "Sign-in is not configured for this environment yet.";

export async function signUpWithPassword(email, password) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error(NOT_CONFIGURED_MESSAGE);
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(toSafeAuthMessage(error));
  return data;
}

export async function signInWithPassword(email, password) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error(NOT_CONFIGURED_MESSAGE);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(toSafeAuthMessage(error));
  return data;
}

// "Sign out" and "Sign in again" must always lead to the sign-in screen (BG-LAUNCH-011). Scope "local" removes THIS device's session before any network call, so it never depends on the
// server: supabase-js 2.119.0 keeps the session when a default (global) sign-out's revoke request is refused with anything other than 401/403/404 (a 400, a 5xx or a network failure),
// which left the customer on a page whose "Sign in again" did nothing. Revoking the refresh token at the server is best effort; a failure there is not shown as a failure to sign out.
export async function signOut() {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  try { await supabase.auth.signOut({ scope: "local" }); } catch { /* the local session is already gone; do not trap the customer on an error */ }
}

/**
 * Subscribes to Supabase auth state changes (sign-in, sign-out, token
 * refresh). Returns an unsubscribe function. Callback receives no
 * arguments by design — callers should re-derive session state from
 * getCustomerSession() rather than trusting event payloads directly.
 */
export function onAuthStateChange(callback) {
  const supabase = getSupabaseClient();
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange(() => callback());
  return () => data.subscription.unsubscribe();
}
