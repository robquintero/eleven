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
 * As of Pass 10.5C.2A, ordinary lineup editing (swap/fill) no longer
 * depends on this at all — those writes go
 * through the authenticated request-scoped client to update_team_lineup,
 * which independently authorizes and validates the transaction. Direct
 * manager lineup DML is revoked by the Performance 1 migration.
 * The one remaining consumer is the draft's round-1 auto-open self-heal
 * (`ensureFirstRoundOpenedAction`), a genuine multi-team lifecycle
 * operation that legitimately needs service-role. Without it, a
 * completed draft simply won't self-heal into an open round — which
 * surfaces as the existing, truthful "No fantasy round is open yet."
 * lineup error, not a separate configuration message.
 */
export function isSupabaseAdminConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
  );
}
