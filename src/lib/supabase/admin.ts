import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * The one privileged (RLS-bypassing) Supabase client in the codebase.
 * Every football table's RLS policy is read-only for `authenticated`
 * (see supabase/migrations/20260929141143_rls.sql) — writing
 * competitions/clubs/players/fixtures/player_match_stats/provider_mappings
 * requires `service_role`, by design, so a leaked anon/authenticated
 * session can never be used to corrupt the football universe.
 *
 * This client is used EXCLUSIVELY by `src/lib/football-ingestion/*` (the
 * CLI sync commands) — never by `src/data-access/*`, never by anything a
 * request from the browser can reach. If you're tempted to import this
 * from application/UI code, you want `src/lib/supabase/server.ts` instead.
 *
 * Reads `SUPABASE_SECRET_KEY` (this project's newer Supabase API key
 * naming, matching `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`), falling back
 * to `SUPABASE_SERVICE_ROLE_KEY` for compatibility with the legacy
 * key naming Supabase used before it. Neither has a `NEXT_PUBLIC_` prefix
 * — Next.js never inlines either into a client bundle. Get the value from
 * the Supabase dashboard (Project Settings → API) and add it to
 * `.env.local`; it is never committed and never printed by any script in
 * this codebase.
 */
export function isSupabaseAdminConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
  );
}

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY " +
        "(or SUPABASE_SERVICE_ROLE_KEY) in .env.local. Get the secret key from the Supabase " +
        "dashboard: Project Settings -> API. Never commit it."
    );
  }

  return createSupabaseClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
