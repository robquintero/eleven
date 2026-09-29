/**
 * `npm run football:sync -- <operation> [flags]` — the ONLY place ingestion
 * actually runs. Never wired into a route, a page, module-import side
 * effects, or app boot (brief §8) — this is a manually-invoked developer
 * command, same spirit as `football:check`.
 *
 * Operations:
 *   competitions [--code ENG] [--season 2023]   sync one (or, with no --code, all enabled Big Five) competition's metadata + season; --season pins the season clubs/players/fixtures syncs will use, overriding whatever /leagues reports as current (needed when the account's plan restricts which seasons OTHER endpoints serve — see docs/football-data-system.md)
 *   clubs --code ENG                    sync one competition's clubs
 *   players --code ENG --club MCI [--page 1]   sync one page of one club's players
 *   fixtures --code ENG [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--page 1]   sync one page of one competition's fixtures
 *   fixture-stats --fixture <providerFixtureId>   sync one fixture's player stats
 *
 * Every operation makes exactly ONE provider request (or, for
 * "competitions" with no --code, one request PER enabled competition,
 * stopping early if quota runs low) — see brief §8/§31. Nothing here loops
 * pages automatically; pass --page explicitly to continue one.
 */
import "server-only";
import { BIG_FIVE_COMPETITIONS, getBigFiveCompetition } from "../football-providers/api-football/big-five-competitions.ts";
import type { BigFiveCompetitionCode } from "../../domain/football/constants.ts";
import { ApiFootballConfigError, ApiFootballRateLimitError } from "../football-providers/api-football/errors.ts";
import { getApiKey } from "../football-providers/api-football/config.ts";
import { createAdminClient, isSupabaseAdminConfigured } from "../supabase/admin.ts";
import { syncCompetition } from "./sync-competitions.ts";
import { syncClubs } from "./sync-clubs.ts";
import { syncPlayersForClub } from "./sync-players.ts";
import { syncFixtures } from "./sync-fixtures.ts";
import { syncFixtureStats } from "./sync-fixture-stats.ts";
import { recordSyncEvent } from "./record-sync-event.ts";
import { shouldStopForQuota } from "./quota.ts";
import type { SyncResult } from "./types.ts";

function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : "true";
      flags[key] = value;
      if (value !== "true") i += 1;
    }
  }
  return flags;
}

function printResult(result: SyncResult) {
  console.log(`\n[${result.operation}] scope=${JSON.stringify(result.scope)}`);
  console.log(
    `  created=${result.counts.created} updated=${result.counts.updated} skipped=${result.counts.skipped} failed=${result.counts.failed}`
  );
  if (result.pagination) {
    console.log(`  page ${result.pagination.currentPage} / ${result.pagination.totalPages}`);
  }
  if (result.quota.dailyRemaining !== undefined) {
    console.log(
      `  quota remaining: ${result.quota.dailyRemaining}${result.quota.dailyLimit !== undefined ? ` / ${result.quota.dailyLimit}` : ""}`
    );
  }
  if (result.errors.length > 0) {
    console.log(`  errors:`);
    for (const err of result.errors) console.log(`    - ${err}`);
  }
}

async function main() {
  const [operation, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);

  if (!operation) {
    console.log("Usage: npm run football:sync -- <competitions|clubs|players|fixtures|fixture-stats> [flags]");
    process.exitCode = 1;
    return;
  }

  try {
    getApiKey();
  } catch (err) {
    console.error(err instanceof ApiFootballConfigError ? err.message : "API_FOOTBALL_KEY is missing.");
    process.exitCode = 1;
    return;
  }

  if (!isSupabaseAdminConfigured()) {
    console.error(
      "Supabase admin client is not configured. Add SUPABASE_SECRET_KEY (Project Settings -> API in the " +
        "Supabase dashboard) to .env.local — every football table's write path requires service-role access. " +
        "Never commit this value."
    );
    process.exitCode = 1;
    return;
  }

  const admin = createAdminClient();
  let requestsUsedThisRun = 0;
  const results: SyncResult[] = [];

  async function run(result: Promise<SyncResult>) {
    const r = await result;
    requestsUsedThisRun += r.requestsUsed;
    results.push(r);
    printResult(r);
    await recordSyncEvent(admin, r);
    return r;
  }

  try {
    switch (operation) {
      case "competitions": {
        const configs = flags.code ? [getBigFiveCompetition(flags.code as BigFiveCompetitionCode)] : BIG_FIVE_COMPETITIONS.filter((c) => c.enabled);
        const seasonOverride = flags.season ? Number(flags.season) : undefined;
        for (const config of configs) {
          const result = await run(syncCompetition(admin, config, seasonOverride));
          if (shouldStopForQuota(result.quota)) {
            console.log("\nStopping: provider quota is nearly exhausted.");
            break;
          }
        }
        break;
      }

      case "clubs": {
        if (!flags.code) throw new Error('clubs requires --code, e.g. "clubs --code ENG"');
        await run(syncClubs(admin, getBigFiveCompetition(flags.code as BigFiveCompetitionCode)));
        break;
      }

      case "players": {
        if (!flags.code || !flags.club) {
          throw new Error('players requires --code and --club, e.g. "players --code ENG --club MCI"');
        }
        const page = flags.page ? Number(flags.page) : 1;
        await run(syncPlayersForClub(admin, getBigFiveCompetition(flags.code as BigFiveCompetitionCode), flags.club, page));
        break;
      }

      case "fixtures": {
        if (!flags.code) throw new Error('fixtures requires --code, e.g. "fixtures --code ENG"');
        await run(
          syncFixtures(admin, getBigFiveCompetition(flags.code as BigFiveCompetitionCode), {
            from: flags.from,
            to: flags.to,
            page: flags.page ? Number(flags.page) : undefined,
          })
        );
        break;
      }

      case "fixture-stats": {
        if (!flags.fixture) throw new Error('fixture-stats requires --fixture <providerFixtureId>');
        await run(syncFixtureStats(admin, flags.fixture));
        break;
      }

      default:
        console.log(`Unknown operation "${operation}".`);
        console.log("Usage: npm run football:sync -- <competitions|clubs|players|fixtures|fixture-stats> [flags]");
        process.exitCode = 1;
        return;
    }
  } catch (err) {
    if (err instanceof ApiFootballRateLimitError) {
      console.error(`\nStopped: provider rate limit hit. ${err.message}`);
      process.exitCode = 1;
      return;
    }
    console.error(`\n${operation} failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nrequests used this run: ${requestsUsedThisRun}`);
  if (results.some((r) => r.counts.failed > 0)) {
    process.exitCode = 1;
  }
}

main();
