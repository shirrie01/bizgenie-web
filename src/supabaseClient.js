import { createClient } from "@supabase/supabase-js";

// This module must never read anything other than the two public,
// browser-safe Supabase values below. Do not add service-role keys,
// database URLs, or any other provider secret here or anywhere else
// in this client bundle.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

let cachedClient = null;

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}

/**
 * Returns a singleton Supabase browser client, or null if the required
 * public environment variables are not present. Callers must handle the
 * null case rather than assuming configuration is always present.
 */
export function getSupabaseClient() {
  if (!isSupabaseConfigured()) return null;
  if (cachedClient) return cachedClient;
  cachedClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return cachedClient;
}
