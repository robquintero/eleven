/**
 * `npm run fantasy:simulate [-- --managers 8 --rounds 4 --squadSize 16 --startAt 2026-08-11 --keep]`
 *
 * Drives `runSimulation()` (see simulate.ts) and prints a structured
 * report of Eleven's entire core-game lifecycle running against REAL
 * stored 2026/27 fixtures/scores with a controlled clock — no real
 * wall-clock waiting, no live provider traffic (every fixture/score this
 * reads was already ingested/backfilled by Pass 8/9's own CLIs).
 *
 * Creates real temporary Supabase Auth users + a real league to exercise
 * the actual RLS-gated RPCs a real manager would use — cleaned up
 * automatically after the run unless `--keep` is passed (useful for
 * inspecting the simulated league's real rows in the dashboard/DB
 * afterward; the league and its users are named/tagged with
 * "eleven-sim-"/"Eleven Simulation" so they're easy to find and remove
 * later by hand if left behind).
 *
 * Never wired into a route, a page, module-import side effects, or app
 * boot — same spirit as football:sync/scoring:backfill.
 */
import "server-only";
import { createAdminClient, isSupabaseAdminConfigured } from "../supabase/admin.ts";
import { runSimulation } from "./simulate.ts";

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

function yesNo(value: boolean): string {
  return value ? "yes" : "NO";
}

function printReport(result: Awaited<ReturnType<typeof runSimulation>>["result"]) {
  console.log("ELEVEN FANTASY SIMULATION");
  console.log("────────────────────────────────");
  console.log("");
  console.log(`Managers ............... ${result.managers}`);
  console.log(`Players drafted ........ ${result.playersDrafted}`);
  console.log(`Fantasy rounds ......... ${result.fantasyRoundsSimulated}`);
  console.log(`H2H matchups ........... ${result.h2hMatchups}`);
  console.log(`Fixtures replayed ...... ${result.fixturesReplayed}`);
  console.log(`Player locks ........... ${result.playerLocks}`);
  console.log(`Scores evaluated ....... ${result.scoresEvaluated}`);
  console.log("");
  for (const round of result.rounds) {
    console.log(`ROUND ${String(round.roundNumber).padStart(2, "0")} ${round.finalized ? "✓" : "✗ (not finalized)"} — ${round.matchups} matchups`);
  }
  console.log("");
  console.log(`Ownership violations ... ${result.invariants.ownershipViolations}`);
  console.log(`Roster violations ...... ${result.invariants.rosterViolations}`);
  console.log(`Formation violations ... ${result.invariants.formationViolations}`);
  console.log(`Lock violations ........ ${result.invariants.lockViolations}`);
  console.log(`Scoring mismatches ..... ${result.invariants.scoringMismatches}`);
  console.log(`Standings mismatches ... ${result.invariants.standingsMismatches}`);
  console.log(`Market violations ...... ${result.invariants.marketViolations}`);
  console.log("");
  console.log("MARKET & TRADES (Pass 11)");
  console.log(`  Drop succeeded ................ ${yesNo(result.market.dropped)}`);
  console.log(`  Dropped player became free ..... ${yesNo(result.market.droppedPlayerAvailableAfterwards)}`);
  console.log(`  Replacement signed ............. ${yesNo(result.market.signedReplacement)}`);
  console.log(`  Roster restored to full ........ ${yesNo(result.market.rosterRestoredTo16)}`);
  console.log(`  Race attempted .................. ${yesNo(result.market.raceAttempted)}`);
  console.log(`  Race: exactly one winner ........ ${yesNo(result.market.raceExactlyOneWinner)}`);
  console.log(`  Trade proposed .................. ${yesNo(result.market.tradeProposed)}`);
  console.log(`  Trade accepted ................... ${yesNo(result.market.tradeAccepted)}`);
  console.log(`  Trade ownership transferred ...... ${yesNo(result.market.tradeOwnershipTransferredCorrectly)}`);
  console.log("");
  if (result.standings.length > 0) {
    console.log("STANDINGS");
    for (const row of result.standings) {
      console.log(`  ${row.fantasyTeamId.slice(0, 8)}  W${row.wins} L${row.losses} D${row.draws}  PF ${row.pointsFor.toFixed(2)}  PA ${row.pointsAgainst.toFixed(2)}`);
    }
    console.log("");
  }
  console.log(result.passed ? "SIMULATION PASSED" : "SIMULATION FAILED — see violations above");
}

async function main() {
  if (!isSupabaseAdminConfigured()) {
    console.error("Supabase admin client is not configured — see src/lib/supabase/admin.ts.");
    process.exitCode = 1;
    return;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!anonKey) {
    console.error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required — the simulation signs in as real temporary auth users.");
    process.exitCode = 1;
    return;
  }

  const admin = createAdminClient();
  const flags = parseFlags(process.argv.slice(2));

  const managers = flags.managers ? Number(flags.managers) : 8;
  const rounds = flags.rounds ? Number(flags.rounds) : 4;
  const squadSize = flags.squadSize ? Number(flags.squadSize) : undefined;
  const startAt = flags.startAt;
  const keep = flags.keep === "true";

  console.log(`Starting simulation: ${managers} managers, ${rounds} round(s) requested...`);

  let outcome: Awaited<ReturnType<typeof runSimulation>>;
  try {
    outcome = await runSimulation(admin, url, anonKey, { managers, rounds, squadSize, startAt });
  } catch (err) {
    console.error(`Simulation failed to run: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  printReport(outcome.result);

  if (keep) {
    console.log(`\n--keep passed: league ${outcome.leagueId} and ${outcome.testUserIds.length} test users left in place.`);
  } else {
    await admin.from("fantasy_leagues").delete().eq("id", outcome.leagueId);
    for (const userId of outcome.testUserIds) {
      await admin.auth.admin.deleteUser(userId);
    }
    console.log("\nCleaned up simulated league and test users.");
  }

  if (!outcome.result.passed) process.exitCode = 1;
}

main();
