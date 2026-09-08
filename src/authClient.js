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

export async function signOut() {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  await supabase.auth.signOut();
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
