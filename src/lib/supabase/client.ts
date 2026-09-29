import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Supabase client for Client Components. Create a new one per component
 * that needs it (it's cheap — the underlying connection is shared) rather
 * than stashing a singleton in a module variable, which is the pattern
 * Supabase's own Next.js guides recommend to avoid stale-auth-state bugs
 * across navigations.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
