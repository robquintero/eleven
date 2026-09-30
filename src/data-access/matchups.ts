import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { buildStandingsTable, rankStandings } from "@/domain/fantasy/standings";
import { computeFixtureIntelligence } from "@/domain/fantasy/fixture-intelligence";
import type { MatchupOutcome } from "@/domain/fantasy/standings";
import type { FixtureRow } from "@/domain/fantasy/fixture-intelligence";
import type { RoundWindow } from "@/domain/fantasy/round-calendar";

export interface CurrentMatchup {
  id: string;
  roundId: string;
  roundNumber: number;
  /** The fantasy round's own Tue→Mon window (docs/game-rules.md "Fantasy round boundary") — what "round-aware" fixture lookups (Pass 10.5B) must stay inside, never crossing into a future round just to find something to show. */
  roundStartsAt: string;
  roundEndsAt: string;
  status: "scheduled" | "live" | "final";
  homeFantasyTeamId: string;
  awayFantasyTeamId: string;
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
    .select("id, number, status, starts_at, ends_at")
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
    roundId: round.id,
    roundNumber: round.number,
    roundStartsAt: round.starts_at,
    roundEndsAt: round.ends_at,
    status: matchup.status as CurrentMatchup["status"],
    homeFantasyTeamId: matchup.home_fantasy_team_id,
    awayFantasyTeamId: matchup.away_fantasy_team_id,
    homeTeamName: nameById.get(matchup.home_fantasy_team_id) ?? "—",
    awayTeamName: nameById.get(matchup.away_fantasy_team_id) ?? "—",
    homeLivePoints: homeScore?.live_points ?? 0,
    awayLivePoints: awayScore?.live_points ?? 0,
    homeFinalPoints: homeScore?.final_points ?? null,
    awayFinalPoints: awayScore?.final_points ?? null,
    isUserHome,
  };
}

export interface MatchupFixtureIntelligence {
  liveFixtureCount: number;
  /** `false` only when there is genuinely no stored fixture data at all for the clubs involved in this matchup — never merely because nothing is live/upcoming right now (Pass 10.5B: "NO FIXTURE DATA" must not be used just because nothing is live). */
  hasAnyFixtureData: boolean;
  nextFixture: {
    kickoffAt: string;
    homeClubShortName: string;
    awayClubShortName: string;
  } | null;
}

/**
 * Real fixture context for the CURRENT H2H matchup (Pass 10.5B) — scoped to
 * every ACTIVE roster entry (starter AND bench) on BOTH fantasy teams, since
 * an upcoming fixture can affect lineup/lock decisions even for a player not
 * currently starting. Strictly round-aware: `nextFixture` only ever looks
 * inside `matchup`'s own [roundStartsAt, roundEndsAt) window — it never
 * reaches into a future fantasy round merely to have something to show (see
 * docs/game-rules.md "Fantasy round boundary"). Uses only stored Eleven
 * fixture data — no live provider calls here.
 */
export async function getMatchupFixtureIntelligence(
  matchup: CurrentMatchup,
  now: Date
): Promise<MatchupFixtureIntelligence> {
  const empty: MatchupFixtureIntelligence = { liveFixtureCount: 0, hasAnyFixtureData: false, nextFixture: null };
  if (!isSupabaseConfigured()) return empty;

  const supabase = await createClient();

  const { data: rosterEntries } = await supabase
    .from("roster_entries")
    .select("players(club_id)")
    .in("fantasy_team_id", [matchup.homeFantasyTeamId, matchup.awayFantasyTeamId])
    .eq("status", "active");

  const clubIds = Array.from(
    new Set(
      (rosterEntries ?? [])
        .map((r) => (r.players as { club_id: string } | null)?.club_id)
        .filter((id): id is string => Boolean(id))
    )
  );
  if (clubIds.length === 0) return empty;

  const { data: fixtures } = await supabase
    .from("fixtures")
    .select("kickoff_at, status, home_club_id, away_club_id")
    .or(`home_club_id.in.(${clubIds.join(",")}),away_club_id.in.(${clubIds.join(",")})`)
    .order("kickoff_at", { ascending: true });

  const window: RoundWindow = { startsAt: new Date(matchup.roundStartsAt), endsAt: new Date(matchup.roundEndsAt) };
  const fixtureRows: FixtureRow[] = (fixtures ?? []).map((f) => ({
    kickoffAt: f.kickoff_at,
    status: f.status as FixtureRow["status"],
    homeClubId: f.home_club_id,
    awayClubId: f.away_club_id,
  }));

  const { liveFixtureCount, hasAnyFixtureData, nextFixture: nextWithinRound } = computeFixtureIntelligence(
    fixtureRows,
    window,
    now
  );

  let nextFixture: MatchupFixtureIntelligence["nextFixture"] = null;
  if (nextWithinRound) {
    const { data: clubs } = await supabase
      .from("clubs")
      .select("id, short_name")
      .in("id", [nextWithinRound.homeClubId, nextWithinRound.awayClubId]);
    const shortNameById = new Map((clubs ?? []).map((c) => [c.id, c.short_name]));
    nextFixture = {
      kickoffAt: nextWithinRound.kickoffAt,
      homeClubShortName: shortNameById.get(nextWithinRound.homeClubId) ?? "—",
      awayClubShortName: shortNameById.get(nextWithinRound.awayClubId) ?? "—",
    };
  }

  return { liveFixtureCount, hasAnyFixtureData, nextFixture };
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
