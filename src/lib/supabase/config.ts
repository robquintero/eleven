/**
 * Whether Supabase env vars are present. Every data-access function checks
 * this before ever constructing a Supabase client, rather than letting
 * `createClient()` throw on a missing URL — an unconfigured environment
 * (e.g. a build/CI run with no secrets) should degrade to truthful empty
 * states everywhere, not crash.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}
