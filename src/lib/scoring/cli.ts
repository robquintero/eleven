/**
 * `npm run scoring:backfill -- --version ELEVEN_STANDARD_V3 --season 2026` — manually-invoked developer
 * command that (re)calculates every eligible stored performance's canonical
 * fantasy score (see backfill.ts for exactly what "eligible" means) and
 * upserts it into `fantasy_player_scores`. Makes ZERO provider requests —
 * this is an explicit DB-to-DB mutation, idempotent on unchanged inputs
 * (see backfill.ts). Production recomputation requires scoped approval.
 *
 * `npm run scoring:replay -- --version ELEVEN_STANDARD_V3 --fixture <fixtureId>` — read-only: recomputes
 * one stored fixture's scores from its current `player_match_stats` and
 * diffs against whatever's currently stored, proving deterministic replay
 * against real historical data (brief §Phase 5). Never writes.
 *
 * Never wired into a route, a page, module-import side effects, or app
 * boot — same spirit as football:sync/football:check.
 */
import "server-only";
import { createAdminClient, isSupabaseAdminConfigured } from "../supabase/admin.ts";
import { backfillScores } from "./backfill.ts";
import { replayFixture } from "./replay.ts";
import { scoringVersion } from "./versions.ts";

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

  const args = process.argv.slice(2);
  // Operation selection is backward compatible: the backfill script has no
  // positional operation token at all, so an absent/flag-shaped first token
  // still means "backfill" (the original, only behavior this CLI had).
  const operation = args[0] && !args[0].startsWith("--") ? args[0] : "backfill";
  const flags = parseFlags(operation === args[0] ? args.slice(1) : args);

  // Require an explicit model before any score write or replay.
  const version = scoringVersion(flags.version);

  if (operation === "replay") {
    if (!flags.fixture) {
      console.error('replay requires --fixture <fixtureId>, e.g. "replay --fixture <uuid>"');
      process.exitCode = 1;
      return;
    }
    const result = await replayFixture(admin, flags.fixture, version);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const season = flags.season ? Number(flags.season) : undefined;
  const result = await backfillScores(admin, { season, scoringRuleVersion: version });
  console.log(JSON.stringify(result, null, 2));

  if (result.failed > 0) process.exitCode = 1;
}

main();
