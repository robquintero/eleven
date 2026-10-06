import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/database.types.ts";
import { isUuid } from "../lib/spectator-navigation.ts";
import { scoringVersion } from "../lib/scoring/versions.ts";
import type { CurrentMatchup } from "./matchups.ts";
import type { Team } from "./teams.ts";

/** Same selected-league resolver as the core routes; no context mutations. */
export const getSpectatorContext = cache(async () => {
  const [{ getCurrentUser, createClient }, { getUserLeagues }, { getActiveLeagueId }] = await Promise.all([
    import("../lib/supabase/server.ts"), import("./leagues.ts"), import("./active-league.ts"),
  ]);
  const [user, leagues] = await Promise.all([getCurrentUser(), getUserLeagues()]);
  if (!user) return null;
  const selected = await getActiveLeagueId(leagues);
  const league = leagues.find(l => l.id === selected);
  return league ? { user, league, supabase: await createClient() } : null;
});

type Client = SupabaseClient<Database>;
export async function querySpectatorTeam(client: Client, leagueId: string, teamId: string): Promise<Team | null> {
  if (!isUuid(teamId)) return null;
  const { data, error } = await client.from("fantasy_teams")
    .select("id, league_id, owner_user_id, name, abbreviation")
    .eq("id", teamId).eq("league_id", leagueId).maybeSingle();
  return !error && data ? {
    id: data.id, leagueId: data.league_id, ownerUserId: data.owner_user_id,
    name: data.name, abbreviation: data.abbreviation,
  } : null;
}

export async function querySpectatorRound(client: Client, leagueId: string, roundId?: string) {
  if (roundId && !isUuid(roundId)) return null;
  let query = client.from("fantasy_rounds")
    .select("id, number, status, starts_at, ends_at, scoring_rule_version").eq("league_id", leagueId);
  if (roundId) query = query.eq("id", roundId);
  else {
    const { data: season } = await client.from("seasons").select("id")
      .eq("league_id", leagueId).order("season_number", { ascending: false }).limit(1).maybeSingle();
    if (!season) return null;
    query = query.eq("season_id", season.id).order("starts_at", { ascending: true });
  }
  const { data, error } = await query;
  if (error) return null;
  const rows = data ?? [];
  // Prefer the opened active week over already-created future weeks. With no
  // active week, show the next stored week or the latest completed lineup.
  const row = roundId ? rows[0] : rows.filter(r => r.status === "in_progress").at(-1)
    ?? rows.find(r => r.status === "upcoming") ?? rows.at(-1);
  return row ? {
    id: row.id, number: row.number, status: row.status as CurrentMatchup["roundStatus"],
    startsAt: row.starts_at, endsAt: row.ends_at, scoringRuleVersion: scoringVersion(row.scoring_rule_version),
  } : null;
}

export async function querySpectatorMatchup(client: Client, leagueId: string, matchupId: string, viewerTeamId: string | null): Promise<CurrentMatchup | null> {
  if (!isUuid(matchupId)) return null;
  const { data: m, error } = await client.from("matchups").select(
    "id, status, home_fantasy_team_id, away_fantasy_team_id, fantasy_rounds!inner(id, league_id, number, status, starts_at, ends_at, scoring_rule_version), home_team:fantasy_teams!matchups_home_fantasy_team_id_fkey(name, league_id), away_team:fantasy_teams!matchups_away_fantasy_team_id_fkey(name, league_id), matchup_scores(fantasy_team_id, live_points, final_points, updated_at)"
  ).eq("id", matchupId).eq("league_id", leagueId).eq("fantasy_rounds.league_id", leagueId).maybeSingle();
  // Also fail closed on an inconsistent pairing instead of opening a team
  // from another selected league even if the viewer belongs to both leagues.
  if (error || !m || m.home_team?.league_id !== leagueId || m.away_team?.league_id !== leagueId) return null;
  const r = m.fantasy_rounds;
  const home = m.matchup_scores.find(s => s.fantasy_team_id === m.home_fantasy_team_id);
  const away = m.matchup_scores.find(s => s.fantasy_team_id === m.away_fantasy_team_id);
  const isSpectator = viewerTeamId !== m.home_fantasy_team_id && viewerTeamId !== m.away_fantasy_team_id;
  return {
    id: m.id, roundId: r.id, roundNumber: r.number, roundStartsAt: r.starts_at, roundEndsAt: r.ends_at,
    roundStatus: r.status as CurrentMatchup["roundStatus"], scoringRuleVersion: scoringVersion(r.scoring_rule_version),
    status: m.status as CurrentMatchup["status"], homeFantasyTeamId: m.home_fantasy_team_id, awayFantasyTeamId: m.away_fantasy_team_id,
    homeTeamName: m.home_team.name, awayTeamName: m.away_team.name,
    homeLivePoints: home?.live_points ?? 0, awayLivePoints: away?.live_points ?? 0,
    homeFinalPoints: home?.final_points ?? null, awayFinalPoints: away?.final_points ?? null,
    homeScoreAvailable: Boolean(home), awayScoreAvailable: Boolean(away),
    isUserHome: isSpectator || viewerTeamId === m.home_fantasy_team_id, isSpectator,
    scoresUpdatedAt: m.matchup_scores.map(s => s.updated_at).sort().at(-1) ?? null,
  };
}
