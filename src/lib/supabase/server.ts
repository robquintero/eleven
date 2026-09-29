import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Supabase client for Server Components, Server Actions, and Route
 * Handlers. Create a new one per request — never share/cache one across
 * requests (see @supabase/ssr's own createServerClient docs).
 *
 * `setAll` is wrapped in try/catch because Server *Components* can't write
 * cookies (only Server Actions and Route Handlers can) — calling `cookies().set()`
 * from a Server Component throws. That's fine here: `proxy.ts` is what
 * actually keeps the session cookie refreshed on every request; this
 * catch just no-ops the write when called from a context that can't
 * perform it, matching Supabase's documented Next.js App Router pattern.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component — proxy.ts refreshes the
            // session instead. Safe to ignore.
          }
        },
      },
    }
  );
}
