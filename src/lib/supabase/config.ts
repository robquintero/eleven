/**
 * Whether Supabase env vars are present. The existing mock/demo Dashboard,
 * Team, and Players screens must keep working with zero configuration —
 * see the "Real vs mock data" section of the Pass 6 report — so every
 * data-access function checks this before ever constructing a Supabase
 * client, rather than letting `createClient()` throw on a missing URL.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
