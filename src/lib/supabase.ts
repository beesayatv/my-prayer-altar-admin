import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ysbzmblentjmvgqsyuop.supabase.co";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_13rd-H-Uxhj-dUz_dVpUOg_lsjopLXg";
export const hasSupabaseConfig = Boolean(url && key);
export const supabase = hasSupabaseConfig ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }) : null;
export function requireSupabase() { if (!supabase) throw new Error("Supabase configuration is missing. Add the public URL and publishable key to .env.local."); return supabase; }

/** Returns the current Studio session token for protected Next.js admin routes. */
export async function adminAuthorizationHeader(): Promise<Record<string, string>> {
  const client = requireSupabase();
  let { data: { session } } = await client.auth.getSession();
  if (!session || (session.expires_at ?? 0) * 1000 <= Date.now() + 60_000) {
    const refreshed = await client.auth.refreshSession();
    session = refreshed.data.session;
  }
  if (!session?.access_token) throw new Error("Your Studio session has expired. Please sign in again.");
  return { Authorization: `Bearer ${session.access_token}` };
}
