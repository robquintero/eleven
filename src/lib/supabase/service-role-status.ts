/**
 * Whether the privileged admin Supabase client (`./admin.ts`) is
 * configured — split into its own module (Pass 10.5C.2) so pages/
 * components can check it WITHOUT importing the admin client itself,
 * which the architecture guard (`no-provider-imports-in-app.test.ts`)
 * deliberately restricts to a narrow, explicitly-justified allowlist.
 * This function only reads env vars; it never performs a privileged
 * write, so it's safe to import broadly. (Deliberately NOT named
 * `admin-*` — the guard matches the specifier `@/lib/supabase/admin` as a
 * plain substring, so an `admin-something.ts` filename in this same
 * directory would falsely trip it even though it never actually imports
 * the admin client.)
 *
 * A wide swath of Eleven's core gameplay now depends on this being
 * configured — Team lineup editing (swap/fill/formation-change) and the
 * draft's own round-1 auto-open self-heal both silently fail/no-op
 * without it. A Team/Draft page checks this so it can show a truthful
 * "lineup editing unavailable" state instead of exposing a lineup editor
 * that will fail at the very last step (see `.env.example`'s own note on
 * this being the most common cause of "Lineup editing isn't configured").
 */
export function isSupabaseAdminConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
  );
}
