import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

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
}

/**
 * League standings derived from completed (`status = 'final'`) matchups'
 * `matchup_scores` — never a stored win/loss column (the schema
 * deliberately has none; see supabase/migrations/…fantasy_leagues.sql).
 * `[]` until at least one matchup has been played, which is every league
 * today.
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

  const teamIds = new Set<string>();
  for (const m of matchups) {
    teamIds.add(m.home_fantasy_team_id);
    teamIds.add(m.away_fantasy_team_id);
  }

  const { data: teams } = await supabase
    .from("fantasy_teams")
    .select("id, name")
    .in("id", Array.from(teamIds));
  const nameById = new Map((teams ?? []).map((t) => [t.id, t.name]));

  const rows = new Map<string, StandingsRow>();
  for (const id of teamIds) {
    rows.set(id, {
      fantasyTeamId: id,
      teamName: nameById.get(id) ?? "—",
      wins: 0,
      losses: 0,
      draws: 0,
      pointsFor: 0,
    });
  }

  for (const m of matchups) {
    const scores = m.matchup_scores ?? [];
    const home = scores.find((s) => s.fantasy_team_id === m.home_fantasy_team_id);
    const away = scores.find((s) => s.fantasy_team_id === m.away_fantasy_team_id);
    const homePts = home?.final_points ?? 0;
    const awayPts = away?.final_points ?? 0;

    const homeRow = rows.get(m.home_fantasy_team_id)!;
    const awayRow = rows.get(m.away_fantasy_team_id)!;
    homeRow.pointsFor += homePts;
    awayRow.pointsFor += awayPts;

    if (homePts > awayPts) {
      homeRow.wins += 1;
      awayRow.losses += 1;
    } else if (awayPts > homePts) {
      awayRow.wins += 1;
      homeRow.losses += 1;
    } else {
      homeRow.draws += 1;
      awayRow.draws += 1;
    }
  }

  return Array.from(rows.values()).sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor);
}
