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
 *   fixtures --code ENG [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--page 1] [--exclude-qualifying]   sync one page of one competition's fixtures; --exclude-qualifying drops qualifying-round/play-off fixtures (UEFA competitions only — see rounds.ts)
 *
 * --code accepts either a Big Five domestic code (ENG/ESP/GER/ITA/FRA) or
 * a UEFA competition code (UCL/UEL) — see big-five-competitions.ts and
 * uefa-competitions.ts. Only Big Five membership gates Eleven's draftable
 * player pool; UEFA competitions are ingested for fixture/stat history
 * only (see docs/football-data-system.md).
 *   fixture-stats --fixture <providerFixtureId>   sync one fixture's player stats
 *   audit                                 zero-request DB-integrity report (see audit.ts) — safe to run anytime
 *   audit-squad --code ENG --club ARS     ONE live request: compares a club's real provider squad against Eleven, reporting any missing players by name/id
 *   live-tick                             ONE bounded live-sync pass (see live-sync.ts) — fixture-aware, quota-conscious; request count varies with how many fixtures are actually near kickoff/live/recently final (zero on a quiet day)
 *   sync-health                           zero-request observability snapshot (see sync-health.ts) — safe to run anytime
 *
 * Every operation makes exactly ONE provider request (or, for
 * "competitions" with no --code, one request PER enabled competition,
 * stopping early if quota runs low; "audit"/"sync-health" make none;
 * "live-tick" varies — see live-sync.ts) — see brief §8/§31.
 * Nothing here loops pages automatically; pass --page explicitly to
 * continue one.
 */
import "server-only";
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
import { compareProviderSquadToEleven, getDatabaseIntegrityReport } from "./audit.ts";
import { BIG_FIVE_COMPETITIONS, resolveCompetition } from "./resolve-competition.ts";
import { runLiveSyncTick } from "./live-sync.ts";
import { getSyncHealth } from "./sync-health.ts";
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
    console.log("Usage: npm run football:sync -- <competitions|clubs|players|fixtures|fixture-stats|audit|audit-squad|live-tick|sync-health> [flags]");
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
        const configs = flags.code ? [resolveCompetition(flags.code)] : BIG_FIVE_COMPETITIONS.filter((c) => c.enabled);
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
        await run(syncClubs(admin, resolveCompetition(flags.code)));
        break;
      }

      case "players": {
        if (!flags.code || !flags.club) {
          throw new Error('players requires --code and --club, e.g. "players --code ENG --club MCI"');
        }
        const page = flags.page ? Number(flags.page) : 1;
        await run(syncPlayersForClub(admin, resolveCompetition(flags.code), flags.club, page));
        break;
      }

      case "fixtures": {
        if (!flags.code) throw new Error('fixtures requires --code, e.g. "fixtures --code ENG"');
        await run(
          syncFixtures(admin, resolveCompetition(flags.code), {
            from: flags.from,
            to: flags.to,
            page: flags.page ? Number(flags.page) : undefined,
            excludeQualifying: flags["exclude-qualifying"] === "true",
          })
        );
        break;
      }

      case "fixture-stats": {
        if (!flags.fixture) throw new Error('fixture-stats requires --fixture <providerFixtureId>');
        await run(syncFixtureStats(admin, flags.fixture));
        break;
      }

      case "audit": {
        // No provider request — safe to run anytime, as often as useful.
        const report = await getDatabaseIntegrityReport(admin);
        console.log(JSON.stringify(report, null, 2));
        break;
      }

      case "audit-squad": {
        if (!flags.code || !flags.club) {
          throw new Error('audit-squad requires --code and --club, e.g. "audit-squad --code ENG --club ARS"');
        }
        const result = await compareProviderSquadToEleven(admin, resolveCompetition(flags.code), flags.club);
        requestsUsedThisRun += result.requestsUsed;
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case "live-tick": {
        const result = await runLiveSyncTick(admin);
        requestsUsedThisRun += result.requestsUsed;
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case "sync-health": {
        // No provider request — safe to run anytime.
        const report = await getSyncHealth(admin);
        console.log(JSON.stringify(report, null, 2));
        break;
      }

      default:
        console.log(`Unknown operation "${operation}".`);
        console.log("Usage: npm run football:sync -- <competitions|clubs|players|fixtures|fixture-stats|audit|audit-squad|live-tick|sync-health> [flags]");
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
