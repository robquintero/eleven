import "server-only";
// Relative imports (not the usual `@/...` aliases) -- same reasoning as
// src/data-access/players.ts's own import-block comment: keeps
// `queryMatchupSquads` importable from a plain Node integration test.
// `../lib/supabase/server.ts` itself is NOT statically imported (see
// `resolveClient` below) since it pulls in `next/headers`.
import { isSupabaseConfigured } from "../lib/supabase/config.ts";
import type { createClient } from "../lib/supabase/server.ts";
import { getEligibleFixtureIds } from "../lib/fantasy-engine/round-eligibility.ts";
import { bigFiveLeagueFromCompetitionCode } from "../lib/leagues.ts";
import { buildStandingsTable, rankStandings } from "../domain/fantasy/standings.ts";
import { computeFixtureIntelligence } from "../domain/fantasy/fixture-intelligence.ts";
import { deriveFormationLabel } from "../domain/fantasy/constants.ts";
import { isLocked } from "../domain/fantasy/lineup-lock.ts";
import { SCORING_RULE_VERSION } from "../domain/fantasy/scoring.ts";
import { layoutStartingXi } from "../lib/selectors/pitch-layout.ts";
import type { MatchupOutcome } from "../domain/fantasy/standings.ts";
import type { FixtureRow } from "../domain/fantasy/fixture-intelligence.ts";
import type { RoundWindow } from "../domain/fantasy/round-calendar.ts";
import type { Player, PlayerMatchState, PlayerPosition, Squad } from "../lib/types/fantasy.ts";

/** Dynamically imported so this module -- specifically `queryMatchupSquads`/`queryMatchupStandings`-style helpers -- stays importable from a plain Node integration test; see this file's own import-block comment. */
async function resolveClient() {
  const { createClient } = await import("../lib/supabase/server.ts");
  return createClient();
}

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

  const supabase = await resolveClient();

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

  const supabase = await resolveClient();

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

const FIXTURE_STATUS_TO_MATCH_STATE: Record<string, PlayerMatchState> = {
  scheduled: "upcoming",
  live: "live",
  ht: "live",
  final: "final",
  postponed: "upcoming",
};

interface MatchupSlotRow {
  roster_entry_id: string;
  starter: boolean;
  locked_at: string | null;
  roster_entries: {
    id: string;
    player_id: string;
    players: {
      id: string;
      name: string;
      short_name: string;
      position: string;
      shirt_number: number | null;
      nationality: string | null;
      availability_status: string | null;
      club_id: string;
      clubs: {
        id: string;
        name: string;
        short_name: string;
        competition_id: string;
        competitions: { code: string };
      };
    };
  };
}

type SupabaseClientType = Awaited<ReturnType<typeof createClient>>;

/**
 * Builds ONE team's `Squad` for a specific (already-played-or-playing)
 * fantasy round. The two enrichment maps (`pointsByPlayerId`,
 * `fixtureByClubId`) are computed ONCE by the caller and passed in so
 * fetching them is never duplicated per team (see `getMatchupSquads`).
 *
 * Historical-correctness note (the reason this does NOT start from
 * `roster_entries` the way `getUserSquad`, src/data-access/roster.ts,
 * does for "my CURRENT squad"): the query here starts from `lineup_slots`
 * itself, filtered only by `fantasy_round_id` + the roster entry's team —
 * never `roster_entries.status = 'active'`. A player who was traded or
 * dropped after this round locked has their `roster_entries.status`
 * flipped to `'dropped'`, but their `roster_entries` ROW (and this
 * round's `lineup_slots` row referencing it) is never deleted — filtering
 * by current status would silently exclude them from their own historical
 * scoring lineup, which is exactly the bug this query shape avoids (see
 * matchups.integration.test.ts's dedicated regression test for this).
 */
async function buildMatchupTeamSquad(
  supabase: SupabaseClientType,
  fantasyTeamId: string,
  roundId: string,
  pointsByPlayerId: Map<string, number>,
  fixtureByClubId: Map<string, { opponent: string; isHome: boolean; kickoff: string; state: PlayerMatchState }>
): Promise<Squad> {
  const empty: Squad = { formation: "—", starters: [], bench: [] };

  const { data: slotRows } = await supabase
    .from("lineup_slots")
    .select(
      "roster_entry_id, starter, locked_at, roster_entries!inner(id, player_id, fantasy_team_id, players(id, name, short_name, position, shirt_number, nationality, availability_status, club_id, clubs(id, name, short_name, competition_id, competitions(code))))"
    )
    .eq("fantasy_round_id", roundId)
    .eq("roster_entries.fantasy_team_id", fantasyTeamId);

  if (!slotRows || slotRows.length === 0) return empty;

  function toPlayer(row: MatchupSlotRow): Player {
    const player = row.roster_entries.players;
    const club = player.clubs;
    const fixture = fixtureByClubId.get(player.club_id);
    return {
      id: player.id,
      externalId: "",
      name: player.name,
      club: {
        id: club.id,
        name: club.name,
        shortName: club.short_name,
        league: bigFiveLeagueFromCompetitionCode(club.competitions?.code ?? null),
        crestColor: "#6e6e73",
      },
      position: player.position as PlayerPosition,
      number: player.shirt_number ?? undefined,
      nationality: player.nationality,
      // The actual, authoritative points for THIS round only -- summed
      // from fantasy_player_scores over exactly this round's eligible
      // fixtures (see getMatchupSquads), the same aggregation
      // refreshMatchupScores uses to populate matchup_scores.live_points.
      // Never the season total (that's totalPoints, Players-market-only).
      fantasyPoints: Math.round((pointsByPlayerId.get(player.id) ?? 0) * 100) / 100,
      availability: (player.availability_status as Player["availability"]) ?? "available",
      fixture,
    };
  }

  const now = new Date();
  const starterEntries: Array<{ rosterEntryId: string; player: Player; locked: boolean }> = [];
  const bench: Player[] = [];

  for (const row of slotRows as MatchupSlotRow[]) {
    const player = toPlayer(row);
    if (row.starter) {
      const locked = isLocked(row.locked_at ? new Date(row.locked_at) : null, now);
      // `PlayerNode`/`BenchRow`/`starterBuckets` (src/lib/team-fixture.ts)
      // read "locked" directly off `player.fixture.state`, which the raw
      // fixture-status mapping above never produces on its own (a lock is
      // a LINEUP concept, not a real-world match state). Only overridden
      // when the real fixture is STILL "upcoming" -- i.e. kickoff has
      // technically passed (locked_at <= now) but the stored fixture data
      // hasn't caught up to "live" yet, a brief sync-lag window. Once the
      // real fixture state is already "live" or "final", that is strictly
      // MORE informative than a generic "locked" label on a live-scoring
      // page (unlike the Team page, nothing here is being edited), so it
      // is never suppressed.
      const shouldShowLocked = locked && player.fixture?.state === "upcoming";
      starterEntries.push({
        rosterEntryId: row.roster_entry_id,
        player: shouldShowLocked ? { ...player, fixture: { ...player.fixture!, state: "locked" } } : player,
        locked,
      });
    } else {
      bench.push(player);
    }
  }

  // Same deterministic (not manager-chosen) placement as getUserSquad --
  // see that function's own comment on why `lineup_slots` has no durable
  // per-slot-id column to restore an exact left/right placement.
  starterEntries.sort((a, b) => a.rosterEntryId.localeCompare(b.rosterEntryId));

  const counts: Partial<Record<PlayerPosition, number>> = {};
  for (const s of starterEntries) counts[s.player.position] = (counts[s.player.position] ?? 0) + 1;

  const laidOut = layoutStartingXi(starterEntries.map((s) => ({ position: s.player.position, value: s })));

  const starters = laidOut.map(({ value, x, y }) => ({
    id: value.rosterEntryId,
    position: value.player.position,
    x,
    y,
    player: value.player,
    locked: value.locked,
  }));

  return {
    formation: starterEntries.length > 0 ? deriveFormationLabel(counts) : "—",
    starters,
    bench,
  };
}

export interface MatchupSquads {
  home: Squad;
  away: Squad;
}

/**
 * Both managers' full starting XI + bench for one already-opened fantasy
 * round -- the Matchup page's "show both complete lineups side by side"
 * requirement. A single round-window-scoped query set shared by both
 * teams (never duplicated per team, never per-player): one roster_entries
 * read per team, one shared eligible-fixtures lookup, one shared
 * fantasy_player_scores aggregate, one shared fixtures-by-club lookup.
 */
export async function getMatchupSquads(matchup: CurrentMatchup): Promise<MatchupSquads> {
  if (!isSupabaseConfigured()) {
    return { home: { formation: "—", starters: [], bench: [] }, away: { formation: "—", starters: [], bench: [] } };
  }
  const supabase = await resolveClient();
  return queryMatchupSquads(supabase, matchup);
}

/**
 * Client-injectable core of `getMatchupSquads` -- same reasoning as
 * `queryPlayerDatabase` in src/data-access/players.ts: `getMatchupSquads`
 * needs a live Next.js request's cookies and can't be called from a plain
 * script/test, but this can (with an admin client), which is what lets
 * `matchups.integration.test.ts` prove the historical-lineup-correctness
 * invariant against the real database.
 */
export async function queryMatchupSquads(supabase: SupabaseClientType, matchup: CurrentMatchup): Promise<MatchupSquads> {
  const teamIds = [matchup.homeFantasyTeamId, matchup.awayFantasyTeamId];

  const { data: entries } = await supabase
    .from("roster_entries")
    .select("player_id, players(club_id)")
    .in("fantasy_team_id", teamIds)
    .eq("status", "active");

  const clubIds = Array.from(
    new Set(
      (entries ?? [])
        .map((e) => (e.players as { club_id: string } | null)?.club_id)
        .filter((id): id is string => Boolean(id))
    )
  );
  const playerIds = Array.from(new Set((entries ?? []).map((e) => e.player_id)));

  const window: RoundWindow = { startsAt: new Date(matchup.roundStartsAt), endsAt: new Date(matchup.roundEndsAt) };

  // Real per-round points -- the exact same fixture-window + scoring-rule
  // scoping refreshMatchupScores uses for matchup_scores.live_points,
  // reused here (not re-derived) so a player's displayed round score can
  // never disagree with the team total it rolls up into.
  const fixtureIds = await getEligibleFixtureIds(supabase, window);
  const pointsByPlayerId = new Map<string, number>();
  if (playerIds.length > 0 && fixtureIds.length > 0) {
    const { data: scores } = await supabase
      .from("fantasy_player_scores")
      .select("player_id, points")
      .eq("scoring_rule_version", SCORING_RULE_VERSION)
      .in("player_id", playerIds)
      .in("fixture_id", fixtureIds);
    for (const row of scores ?? []) {
      pointsByPlayerId.set(row.player_id, (pointsByPlayerId.get(row.player_id) ?? 0) + row.points);
    }
  }

  // Fixture display state per club, scoped strictly to this round's
  // window (never a future round's fixture just to have something to
  // show -- same rule getMatchupFixtureIntelligence follows). A club can
  // have more than one fixture in a round (a real, if rare, multi-match
  // round) -- picks whichever is most relevant to show without changing
  // what it's worth: live first, else the earliest still-upcoming one,
  // else the most recent final one. The POINTS value above already sums
  // every fixture in the window regardless of which one is displayed, so
  // this choice is purely presentational.
  const fixtureByClubId = new Map<string, { opponent: string; isHome: boolean; kickoff: string; state: PlayerMatchState }>();
  if (clubIds.length > 0) {
    const { data: fixtures } = await supabase
      .from("fixtures")
      .select("kickoff_at, status, home_club_id, away_club_id")
      .gte("kickoff_at", window.startsAt.toISOString())
      .lt("kickoff_at", window.endsAt.toISOString())
      .or(`home_club_id.in.(${clubIds.join(",")}),away_club_id.in.(${clubIds.join(",")})`)
      .order("kickoff_at", { ascending: true });

    const opponentClubIds = Array.from(
      new Set((fixtures ?? []).flatMap((f) => [f.home_club_id, f.away_club_id]))
    );
    const { data: clubs } = opponentClubIds.length
      ? await supabase.from("clubs").select("id, short_name").in("id", opponentClubIds)
      : { data: [] as { id: string; short_name: string }[] };
    const shortNameById = new Map((clubs ?? []).map((c) => [c.id, c.short_name]));

    const byClub = new Map<string, NonNullable<typeof fixtures>>();
    for (const fixture of fixtures ?? []) {
      for (const clubId of [fixture.home_club_id, fixture.away_club_id]) {
        if (!clubIds.includes(clubId)) continue;
        const list = byClub.get(clubId) ?? [];
        list.push(fixture);
        byClub.set(clubId, list);
      }
    }

    for (const [clubId, clubFixtures] of byClub) {
      const live = clubFixtures.find((f) => f.status === "live" || f.status === "ht");
      const upcoming = clubFixtures.find((f) => f.status === "scheduled" || f.status === "postponed");
      const chosen = live ?? upcoming ?? clubFixtures[clubFixtures.length - 1];
      const isHome = chosen.home_club_id === clubId;
      const opponentId = isHome ? chosen.away_club_id : chosen.home_club_id;
      fixtureByClubId.set(clubId, {
        opponent: shortNameById.get(opponentId) ?? "—",
        isHome,
        kickoff: chosen.kickoff_at,
        state: FIXTURE_STATUS_TO_MATCH_STATE[chosen.status] ?? "upcoming",
      });
    }
  }

  const [home, away] = await Promise.all([
    buildMatchupTeamSquad(supabase, matchup.homeFantasyTeamId, matchup.roundId, pointsByPlayerId, fixtureByClubId),
    buildMatchupTeamSquad(supabase, matchup.awayFantasyTeamId, matchup.roundId, pointsByPlayerId, fixtureByClubId),
  ]);

  return { home, away };
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

  const supabase = await resolveClient();

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
