import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { buildStandingsTable, rankStandings } from "@/domain/fantasy/standings";
import type { MatchupOutcome } from "@/domain/fantasy/standings";

export interface CurrentMatchup {
  id: string;
  roundNumber: number;
  status: "scheduled" | "live" | "final";
  homeTeamName: string;
  awayTeamName: string;
  homeLivePoints: number;
  awayLivePoints: number;
  homeFinalPoints: number | null;
  awayFinalPoints: number | null;
  isUserHome: boolean;
}

/**
 * The signed-in user's fantasy team's matchup for the league's current
 * (in-progress, else soonest upcoming) round. `null` whenever no
 * `fantasy_rounds`/`matchups` rows exist for the league yet — true for
 * every league today, since round scheduling isn't built (Pass 8+).
 */
export async function getCurrentMatchup(
  leagueId: string,
  fantasyTeamId: string
): Promise<CurrentMatchup | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();

  const { data: round } = await supabase
    .from("fantasy_rounds")
    .select("id, number, status")
    .eq("league_id", leagueId)
    .in("status", ["in_progress", "upcoming"])
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!round) return null;

  const { data: matchup } = await supabase
    .from("matchups")
    .select(
      "id, status, home_fantasy_team_id, away_fantasy_team_id, matchup_scores(fantasy_team_id, live_points, final_points)"
    )
    .eq("fantasy_round_id", round.id)
    .or(`home_fantasy_team_id.eq.${fantasyTeamId},away_fantasy_team_id.eq.${fantasyTeamId}`)
    .maybeSingle();

  if (!matchup) return null;

  const isUserHome = matchup.home_fantasy_team_id === fantasyTeamId;
  const scores = matchup.matchup_scores ?? [];
  const homeScore = scores.find((s) => s.fantasy_team_id === matchup.home_fantasy_team_id);
  const awayScore = scores.find((s) => s.fantasy_team_id === matchup.away_fantasy_team_id);

  const { data: teams } = await supabase
    .from("fantasy_teams")
    .select("id, name")
    .in("id", [matchup.home_fantasy_team_id, matchup.away_fantasy_team_id]);

  const nameById = new Map((teams ?? []).map((t) => [t.id, t.name]));

  return {
    id: matchup.id,
    roundNumber: round.number,
    status: matchup.status as CurrentMatchup["status"],
    homeTeamName: nameById.get(matchup.home_fantasy_team_id) ?? "—",
    awayTeamName: nameById.get(matchup.away_fantasy_team_id) ?? "—",
    homeLivePoints: homeScore?.live_points ?? 0,
    awayLivePoints: awayScore?.live_points ?? 0,
    homeFinalPoints: homeScore?.final_points ?? null,
    awayFinalPoints: awayScore?.final_points ?? null,
    isUserHome,
  };
}

export interface StandingsRow {
  fantasyTeamId: string;
  teamName: string;
  wins: number;
  losses: number;
  draws: number;
  pointsFor: number;
  pointsAgainst: number;
}

/**
 * League standings derived from completed (`status = 'final'`) matchups'
 * `matchup_scores` — never a stored win/loss column (the schema
 * deliberately has none; see supabase/migrations/…fantasy_leagues.sql).
 * Ranking/tiebreak logic lives in `@/domain/fantasy/standings`
 * (wins, then points-for, then head-to-head, then points-against
 * ascending — docs/game-rules.md "Standings") so it's pure and
 * independently tested rather than duplicated here. `[]` until at least
 * one matchup has been played.
 */
export async function getStandings(leagueId: string): Promise<StandingsRow[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();

  const { data: matchups } = await supabase
    .from("matchups")
    .select(
      "id, home_fantasy_team_id, away_fantasy_team_id, matchup_scores(fantasy_team_id, final_points)"
    )
    .eq("league_id", leagueId)
    .eq("status", "final");

  if (!matchups || matchups.length === 0) return [];

  const outcomes: MatchupOutcome[] = matchups.map((m) => {
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

  const table = rankStandings(buildStandingsTable(outcomes), outcomes);

  const { data: teams } = await supabase
    .from("fantasy_teams")
    .select("id, name")
    .in(
      "id",
      table.map((r) => r.fantasyTeamId)
    );
  const nameById = new Map((teams ?? []).map((t) => [t.id, t.name]));

  return table.map((row) => ({
    fantasyTeamId: row.fantasyTeamId,
    teamName: nameById.get(row.fantasyTeamId) ?? "—",
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
    pointsFor: row.pointsFor,
    pointsAgainst: row.pointsAgainst,
  }));
}
