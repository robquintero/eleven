/**
 * Pass 14.7 Phase 8: a hard, fail-closed guard against the exact incident
 * that leaked 5 synthetic fixtures into real production data (Pass
 * 14.6/14.6.1) — a mutation-capable integration test ran, by ordinary
 * default, against the only Supabase project this repo has, which IS the
 * production project (`oknhqdiinaxofrzxphxf`). There is currently no
 * separate staging/test Supabase project; `.env.local` is the one
 * credential set every local dev script, cron-equivalent script, AND every
 * `*.integration.test.ts` file all share (confirmed via Pass 14.7's own
 * audit — see docs/scoring-model-v3.md's sibling release-notes doc if one
 * exists, else this module's own comment is the record of that audit).
 *
 * Deliberately NOT placed inside `createAdminClient()`/
 * `isSupabaseAdminConfigured()` (src/lib/supabase/admin.ts) — those are
 * also the exact functions real production runtime code calls (e.g.
 * `ensureFirstRoundOpenedAction`, the live-sync cron's own server-side
 * work), so gating them here would take down the live application, not
 * just tests. This is called ONLY from test-only entry points:
 * `createTestLeague` (src/lib/fantasy-engine/integration-test-helpers.ts,
 * imported exclusively by `*.integration.test.ts` files, never by
 * application code) and, for the two integration tests that don't go
 * through that helper, directly at each of their own module scopes.
 *
 * "Strongest available identity" (brief's own phrasing): the literal
 * Supabase project ref parsed out of `NEXT_PUBLIC_SUPABASE_URL` itself —
 * never NODE_ENV, never a naming convention, never a vars-present-only
 * check (which is all `isSupabaseAdminConfigured()` already does). If the
 * ref can't even be determined, that is ALSO treated as "cannot confidently
 * distinguish production" and refused, per the brief's own instruction.
 *
 * Deliberately only enforces once admin credentials are actually
 * configured (`isSupabaseAdminConfigured()` is true) — an environment with
 * no Supabase admin credentials at all (e.g. plain `npm test`, which never
 * touches Supabase) has nothing to guard and must not hard-crash just
 * because a public, non-secret `NEXT_PUBLIC_SUPABASE_URL` happens to be
 * set.
 */
import { isSupabaseAdminConfigured } from "./service-role-status.ts";

/** The project ref Pass 14.7's own audit confirmed is production — see this module's doc comment. */
export const PRODUCTION_SUPABASE_PROJECT_REF = "oknhqdiinaxofrzxphxf";

/** Explicit, conscious, per-run opt-in — never a default, never inferred. */
const OVERRIDE_ENV_VAR = "ALLOW_INTEGRATION_TESTS_AGAINST_PRODUCTION";

function extractProjectRef(supabaseUrl: string): string | null {
  const match = /^https:\/\/([a-z0-9-]+)\.supabase\.co\/?$/i.exec(supabaseUrl.trim());
  return match?.[1]?.toLowerCase() ?? null;
}

/**
 * Throws (never returns a boolean to check-and-ignore) unless either:
 *   (a) no Supabase admin credentials are configured at all -- nothing to
 *       guard, the calling test will naturally skip elsewhere, or
 *   (b) the configured project is confidently NOT the production ref, or
 *   (c) the production ref is targeted AND the operator has explicitly
 *       set `ALLOW_INTEGRATION_TESTS_AGAINST_PRODUCTION=true` for this run.
 * Every other case -- including a malformed/unparseable URL, which this
 * treats as "cannot confidently distinguish production" -- fails closed.
 */
export function assertMutationTestsAllowedAgainstThisProject(): void {
  if (!isSupabaseAdminConfigured()) return;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const ref = extractProjectRef(url);
  const overridden = process.env[OVERRIDE_ENV_VAR] === "true";

  if (overridden) return;

  if (ref === null) {
    throw new Error(
      "Refusing to run mutation-capable integration tests: could not determine the Supabase " +
        "project ref from NEXT_PUBLIC_SUPABASE_URL -- production identity cannot be confidently " +
        `distinguished, so this fails closed. Set ${OVERRIDE_ENV_VAR}=true only after you have ` +
        "manually confirmed which project this targets and that it is safe to mutate."
    );
  }

  if (ref === PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error(
      `Refusing to run mutation-capable integration tests: NEXT_PUBLIC_SUPABASE_URL points at the ` +
        `PRODUCTION Supabase project (${PRODUCTION_SUPABASE_PROJECT_REF}) and there is currently no ` +
        "separate test/staging project configured for this repo. This exact situation previously " +
        "leaked 5 synthetic fixtures into real production data. If you have verified by hand that " +
        "what you're about to run is correctly isolated (synthetic ids/time windows, guaranteed " +
        `cleanup) and you accept the risk, set ${OVERRIDE_ENV_VAR}=true explicitly for this one run.`
    );
  }
}
