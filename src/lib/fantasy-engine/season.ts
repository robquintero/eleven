import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { openNextRound, finalizeRoundIfReady } from "./rounds.ts";
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
