import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../supabase/admin.ts";
import { openNextRound, finalizeRoundIfReady, refreshMatchupScores } from "./rounds.ts";
import { buildStandingsTable, rankStandings } from "../../domain/fantasy/standings.ts";
import type { Database } from "../supabase/database.types.ts";

/**
 * Computes the league's final table for a specific (fully-final) season
 * and returns the champion's fantasy_team_id — reuses `buildStandingsTable`/
 * `rankStandings` (src/domain/fantasy/standings.ts) exactly as the League
 * page's own standings do, so "first place" is never a second, slightly
 * different ranking implementation. Returns `null` only if the season has
 * no finalized matchups at all (shouldn't happen for a season that just
 * reached its final round, but never silently invents a champion).
 */
async function computeChampion(admin: SupabaseClient<Database>, seasonId: string): Promise<string | null> {
  const { data: rounds } = await admin.from("fantasy_rounds").select("id").eq("season_id", seasonId);
  const roundIds = (rounds ?? []).map((r) => r.id);
  if (roundIds.length === 0) return null;

  const { data: matchups } = await admin
    .from("matchups")
    .select("home_fantasy_team_id, away_fantasy_team_id, matchup_scores(fantasy_team_id, final_points)")
    .in("fantasy_round_id", roundIds)
    .eq("status", "final");
  if (!matchups || matchups.length === 0) return null;

  const outcomes = matchups.map((m) => {
    const scores = m.matchup_scores ?? [];
    const home = scores.find((s) => s.fantasy_team_id === m.home_fantasy_team_id);
    const away = scores.find((s) => s.fantasy_team_id === m.away_fantasy_team_id);
    return {
      homeTeamId: m.home_fantasy_team_id,
      awayTeamId: m.away_fantasy_team_id,
      homePoints: home?.final_points ?? 0,
      awayPoints: away?.final_points ?? 0,
    };
  });

  const ranked = rankStandings(buildStandingsTable(outcomes), outcomes);
  return ranked[0]?.fantasyTeamId ?? null;
}

export type ProgressSeasonResult =
  | { action: "no_active_season" }
  | { action: "waiting_on_fixtures"; roundId: string }
  | { action: "round_opened"; roundId: string; roundNumber: number }
  | { action: "open_failed"; error: string }
  | { action: "season_completed"; championFantasyTeamId: string | null };

/**
 * The one authoritative, idempotent season-progression operation (brief
 * §6): finalize the current round if its fixtures are all settled, then
 * either open the next scheduled round or — if that was the season's
 * final round — complete the season and crown a champion. Reuses
 * `finalizeRoundIfReady`/`openNextRound` exactly as they already exist;
 * no second scoring/finalization path.
 *
 * Idempotency: calling this twice in immediate succession never
 * duplicates a round or re-completes a season. `finalizeRoundIfReady`
 * already no-ops on an already-completed round (its own existing
 * guarantee). `openNextRound` itself now refuses to open a round past the
 * season's `total_rounds` (returns `SEASON_COMPLETE` instead), so once a
 * season's status flips to COMPLETED here, the very first query in this
 * function (`eq("status", "ACTIVE")`) no longer matches it on a second
 * call, which short-circuits to `no_active_season` instead of
 * re-computing a champion or re-stamping `completed_at`.
 */
export async function progressSeason(admin: SupabaseClient<Database>, leagueId: string, now: Date): Promise<ProgressSeasonResult> {
  const { data: season } = await admin
    .from("seasons")
    .select("id, total_rounds")
    .eq("league_id", leagueId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (!season) return { action: "no_active_season" };

  const { data: currentRound } = await admin
    .from("fantasy_rounds")
    .select("id, number, status")
    .eq("season_id", season.id)
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (currentRound && currentRound.status !== "completed") {
    // Pass 12D: refresh live_points EVERY call, not only once the round is
    // actually ready to finalize — this is what keeps Live Matchday
    // truthful during the match itself, not just at the final whistle.
    // `finalizeRoundIfReady` already refreshes scores internally right
    // before finalizing, but only once `allSettled` is true; while a round
    // is still genuinely live, nothing else in the engine ever recomputes
    // `matchup_scores`. Reuses the exact same `refreshMatchupScores` the
    // finalize path already uses — never a second scoring/aggregation
    // implementation.
    await refreshMatchupScores(admin, currentRound.id);
    await finalizeRoundIfReady(admin, currentRound.id, now);
  }

  if (currentRound && season.total_rounds !== null && currentRound.number >= season.total_rounds) {
    const { data: confirmedRound } = await admin.from("fantasy_rounds").select("status").eq("id", currentRound.id).single();
    if (confirmedRound?.status === "completed") {
      const championFantasyTeamId = await computeChampion(admin, season.id);
      await admin
        .from("seasons")
        .update({ status: "COMPLETED", completed_at: now.toISOString(), champion_fantasy_team_id: championFantasyTeamId })
        .eq("id", season.id);
      return { action: "season_completed", championFantasyTeamId };
    }
    return { action: "waiting_on_fixtures", roundId: currentRound.id };
  }

  const openResult = await openNextRound(admin, leagueId, now);
  if (openResult.ok) return { action: "round_opened", roundId: openResult.roundId, roundNumber: openResult.roundNumber };
  if (openResult.error === "SEASON_COMPLETE" || openResult.error === "PREVIOUS_ROUND_STILL_OPEN") {
    return currentRound ? { action: "waiting_on_fixtures", roundId: currentRound.id } : { action: "open_failed", error: openResult.error };
  }
  return { action: "open_failed", error: openResult.error };
}

/**
 * Pass 12B: activates a freshly-started KEEP_ROSTERS season by opening
 * its first round — the one step `start_next_season` (the SQL RPC) can't
 * itself do, since it has no draft-completion event to hang the trigger
 * on (unlike REDRAFT, whose new draft completing re-enters the existing
 * `maybeOpenFirstRound` -> `ensureFirstRoundOpened` chain unchanged).
 * Reuses `openNextRound` exactly as every other round-open path does — no
 * second activation implementation. Best-effort/self-healing (same
 * swallow-and-log convention as `ensureFirstRoundOpened`): if this
 * particular call fails for any transient reason, the very next visit to
 * any page that calls `ensureFirstRoundOpened` (e.g. the Team page) will
 * pick the SETUP season up and open it then — this is never the only
 * chance the season gets to activate.
 *
 * Called from the Server Action right after `start_next_season` succeeds
 * for a KEEP_ROSTERS choice — never from `src/data-access/*`, which must
 * never import the admin client directly (see
 * `no-provider-imports-in-app.test.ts`).
 */
export async function activateKeptRosterSeason(leagueId: string): Promise<void> {
  const admin = createAdminClient();
  try {
    const result = await openNextRound(admin, leagueId, new Date());
    if (!result.ok) {
      console.error(`activateKeptRosterSeason: openNextRound failed for league ${leagueId}: ${result.error}`);
    }
  } catch (err) {
    console.error(`activateKeptRosterSeason: openNextRound threw for league ${leagueId}`, err);
  }
}

export interface ProgressAllActiveSeasonsResult {
  leaguesProcessed: number;
  results: Array<{ leagueId: string; action: ProgressSeasonResult["action"] }>;
  errors: string[];
}

/**
 * Pass 12D: the round-progression half of "football sync -> stats/scoring
 * reconciliation -> evaluate current round -> finalize if ready ->
 * progress season if appropriate." Called from the production cron
 * (`src/app/api/cron/football-live-tick/route.ts`) immediately after
 * `runLiveSyncTick` has refreshed fixtures/stats/scores, so every league's
 * current round sees the just-synced data before this runs.
 *
 * Deliberately NOT a second round-lifecycle implementation — this is
 * exactly `progressSeason` (the Pass 12A engine, unmodified), just called
 * once per league with an ACTIVE season instead of requiring a human (or
 * a per-league button) to trigger it. One league's failure never blocks
 * another's — each is wrapped individually, matching the same
 * "never let one bad fixture corrupt the whole tick" philosophy
 * `runLiveSyncTick` itself already follows.
 */
export async function progressAllActiveSeasons(admin: SupabaseClient<Database>, now: Date): Promise<ProgressAllActiveSeasonsResult> {
  const { data: activeSeasons } = await admin.from("seasons").select("league_id").eq("status", "ACTIVE");
  const results: Array<{ leagueId: string; action: ProgressSeasonResult["action"] }> = [];
  const errors: string[] = [];

  for (const season of activeSeasons ?? []) {
    try {
      const result = await progressSeason(admin, season.league_id, now);
      results.push({ leagueId: season.league_id, action: result.action });
    } catch (err) {
      errors.push(`progressSeason threw for league ${season.league_id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { leaguesProcessed: results.length, results, errors };
}
