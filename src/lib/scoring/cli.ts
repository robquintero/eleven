/**
 * `npm run scoring:backfill [-- --season 2026]` — manually-invoked developer
 * command that (re)calculates every eligible stored performance's canonical
 * fantasy score (see backfill.ts for exactly what "eligible" means) and
 * upserts it into `fantasy_player_scores`. Makes ZERO provider requests —
 * this is a pure DB-to-DB recomputation, safe to run as often as useful,
 * and safe to run twice in a row (see backfill.ts's idempotency guarantee).
 *
 * Never wired into a route, a page, module-import side effects, or app
 * boot — same spirit as football:sync/football:check.
 */
import "server-only";
import { createAdminClient, isSupabaseAdminConfigured } from "../supabase/admin.ts";
import { backfillScores } from "./backfill.ts";

function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
      flags[key] = value;
    }
  }
  return flags;
}

async function main() {
  if (!isSupabaseAdminConfigured()) {
    console.error("Supabase admin client is not configured — see src/lib/supabase/admin.ts.");
    process.exitCode = 1;
    return;
  }
  const admin = createAdminClient();
  const flags = parseFlags(process.argv.slice(2));
  const season = flags.season ? Number(flags.season) : undefined;

  const result = await backfillScores(admin, { season });
  console.log(JSON.stringify(result, null, 2));

  if (result.failed > 0) process.exitCode = 1;
}

main();
