import "server-only";
// Relative imports (not the usual `@/...` aliases) -- same reasoning as
// src/data-access/players.ts's own import-block comment: keeps
// `queryMatchupSquads` importable from a plain Node integration test.
// `../lib/supabase/server.ts` itself is NOT statically imported (see
// `resolveClient` below) since it pulls in `next/headers`.
import { isSupabaseConfigured } from "../lib/supabase/config.ts";
import type { createClient } from "../lib/supabase/server.ts";
import { getEligibleFixtureIds } from "../lib/fantasy-engine/round-eligibility.ts";
import { getFixturesForTeamIds, getTeamIdsByPlayer } from "../lib/fantasy-engine/player-fixture-participation.ts";
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
  /**
   * Pass 14.5: the round's own authoritative lifecycle state
   * (`fantasy_rounds.status`) — distinct from `status` below
   * (`matchups.status`), which only reflects whether a fixture is
   * CURRENTLY live right now and reverts to "scheduled" the instant
   * nothing is (see rounds.ts `refreshMatchupScores`'s own comment). A
   * round whose fixtures have already locked/finished for the day but
   * aren't live AT THIS SECOND is still correctly "in_progress" here —
   * this is what Phase 2's round-window/intelligence surfaces must read,
   * never `status`, to avoid the "NO ACTIVE ROUND while players are
   * visibly locked" contradiction.
   */
  roundStatus: "upcoming" | "in_progress" | "completed";
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
  /** Pass 12D: when `matchup_scores` was last recomputed (the later of the two teams' rows) — truthful freshness for the "LIVE" badge, never implied by status alone. `null` only if no score row exists yet at all (a round that just opened). */
  scoresUpdatedAt: string | null;
}

/**
 * The signed-in user's fantasy team's matchup for the league's current
 * (in-progress, else soonest upcoming) round, falling back to the most
 * recently FINALIZED round's matchup when no in-progress/upcoming round
 * exists yet (Pass 12D: the window right after a round finalizes and
 * before the next one opens — without this fallback, Home/Matchup would
 * silently go blank exactly when there's a real result most worth
 * showing, the "ROUND FINAL" Club Briefing state). `null` whenever no
 * `fantasy_rounds`/`matchups` rows exist for the league at all yet.
 */
export async function getCurrentMatchup(
  leagueId: string,
  fantasyTeamId: string
): Promise<CurrentMatchup | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await resolveClient();

  const { data: activeRound } = await supabase
    .from("fantasy_rounds")
    .select("id, number, status, starts_at, ends_at")
    .eq("league_id", leagueId)
    .in("status", ["in_progress", "upcoming"])
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let round = activeRound;
  if (!round) {
    // Scoped to the league's CURRENT (latest) season specifically --
    // round numbers reset per season (Pass 12A), so a bare league-wide
    // "highest round number" could otherwise resolve to an OLDER season's
    // final round once a new season has progressed past that number.
    const { data: season } = await supabase
      .from("seasons")
      .select("id")
      .eq("league_id", leagueId)
      .order("season_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (season) {
      const { data: lastFinalRound } = await supabase
        .from("fantasy_rounds")
        .select("id, number, status, starts_at, ends_at")
        .eq("season_id", season.id)
        .eq("status", "completed")
        .order("number", { ascending: false })
        .limit(1)
        .maybeSingle();
      round = lastFinalRound;
    }
  }

  if (!round) return null;

  const { data: matchup } = await supabase
    .from("matchups")
    .select(
      "id, status, home_fantasy_team_id, away_fantasy_team_id, matchup_scores(fantasy_team_id, live_points, final_points, updated_at)"
    )
    .eq("fantasy_round_id", round.id)
    .or(`home_fantasy_team_id.eq.${fantasyTeamId},away_fantasy_team_id.eq.${fantasyTeamId}`)
    .maybeSingle();

  if (!matchup) return null;

  const isUserHome = matchup.home_fantasy_team_id === fantasyTeamId;
  const scores = matchup.matchup_scores ?? [];
  const homeScore = scores.find((s) => s.fantasy_team_id === matchup.home_fantasy_team_id);
  const awayScore = scores.find((s) => s.fantasy_team_id === matchup.away_fantasy_team_id);
  const scoresUpdatedAt = scores.reduce<string | null>((latest, s) => {
    if (!s.updated_at) return latest;
    return !latest || new Date(s.updated_at) > new Date(latest) ? s.updated_at : latest;
  }, null);

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
    roundStatus: round.status as CurrentMatchup["roundStatus"],
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
    scoresUpdatedAt,
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
    /** Pass 14: the fixture's real participant club/national-team ids — `countStartersInFixture` (lib/team-fixture.ts) must compare against these, never against short names (which can collide/aren't a safe identity key). */
    homeClubId: string;
    awayClubId: string;
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
    .select("player_id")
    .in("fantasy_team_id", [matchup.homeFantasyTeamId, matchup.awayFantasyTeamId])
    .eq("status", "active");

  const playerIds = Array.from(new Set((rosterEntries ?? []).map((r) => r.player_id)));
  if (playerIds.length === 0) return empty;

  // Pass 14: every team id (club OR national team) either roster's
  // players could have a fixture through — was club_id only, structurally
  // blind to an international fixture.
  const teamIdsByPlayer = await getTeamIdsByPlayer(supabase, playerIds);
  const allTeamIds = Array.from(new Set(Array.from(teamIdsByPlayer.values()).flat()));
  if (allTeamIds.length === 0) return empty;

  const fixtures = await getFixturesForTeamIds(supabase, allTeamIds);

  const window: RoundWindow = { startsAt: new Date(matchup.roundStartsAt), endsAt: new Date(matchup.roundEndsAt) };
  const fixtureRows: FixtureRow[] = fixtures.map((f) => ({
    kickoffAt: f.kickoffAt.toISOString(),
    status: f.status as FixtureRow["status"],
    homeClubId: f.homeClubId,
    awayClubId: f.awayClubId,
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
      homeClubId: nextWithinRound.homeClubId,
      awayClubId: nextWithinRound.awayClubId,
    };
  }

  return { liveFixtureCount, hasAnyFixtureData, nextFixture };
}

/**
 * Pass 14: thin data-access wrapper around `getTeamIdsByPlayer` (lib/
 * fantasy-engine/player-fixture-participation.ts) — lets a page compute
 * each starter's full team-id set (club + any national teams) to pass
 * into `countStartersInFixture`, without reaching into `lib/fantasy-
 * engine` directly (pages use `data-access`, consistent with every other
 * read here).
 */
export async function getTeamIdsByPlayerIds(playerIds: string[]): Promise<Map<string, string[]>> {
  if (!isSupabaseConfigured() || playerIds.length === 0) return new Map();
  const supabase = await resolveClient();
  return getTeamIdsByPlayer(supabase, playerIds);
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
  fixtureByPlayerId: Map<string, { opponent: string; isHome: boolean; kickoff: string; state: PlayerMatchState; homeLabel: string; awayLabel: string }>,
  preAcquisitionPointsByPlayerId: Map<string, number> = new Map()
): Promise<Squad> {
  const empty: Squad = { formation: "—", starters: [], bench: [] };

  const { data: slotRows, error } = await supabase
    .from("lineup_slots")
    .select(
      "roster_entry_id, starter, locked_at, roster_entries!inner(id, player_id, fantasy_team_id, players(id, name, short_name, position, shirt_number, nationality, availability_status, club_id, clubs!players_club_id_fkey(id, name, short_name, competition_id, competitions(code))))"
    )
    .eq("fantasy_round_id", roundId)
    .eq("roster_entries.fantasy_team_id", fantasyTeamId);

  if (error) console.error(`buildMatchupTeamSquad: lineup_slots fetch failed for team ${fantasyTeamId}, round ${roundId}:`, error);
  if (!slotRows || slotRows.length === 0) return empty;

  function toPlayer(row: MatchupSlotRow): Player {
    const player = row.roster_entries.players;
    const club = player.clubs;
    const fixture = fixtureByPlayerId.get(player.id);
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
      preAcquisitionPoints: preAcquisitionPointsByPlayerId.has(player.id)
        ? Math.round(preAcquisitionPointsByPlayerId.get(player.id)! * 100) / 100
        : undefined,
      availability: (player.availability_status as Player["availability"]) ?? "available",
      fixture,
    };
  }

  const now = new Date();
  const starterEntries: Array<{ rosterEntryId: string; player: Player; locked: boolean }> = [];
  const bench: Player[] = [];

  for (const row of slotRows as MatchupSlotRow[]) {
    const player = toPlayer(row);
    const locked = isLocked(row.locked_at ? new Date(row.locked_at) : null, now);
    // `BenchRow`/`starterBuckets` (src/lib/team-fixture.ts) read "locked"
    // directly off `player.fixture.state`, which the raw fixture-status
    // mapping above never produces on its own (a lock is a LINEUP
    // concept, not a real-world match state). Only overridden when the
    // real fixture is STILL "upcoming" -- i.e. kickoff has technically
    // passed (locked_at <= now) but the stored fixture data hasn't
    // caught up to "live" yet, a brief sync-lag window. Once the real
    // fixture state is already "live" or "final", that is strictly MORE
    // informative than a generic "locked" label on a live-scoring page
    // (unlike the Team page, nothing here is being edited), so it is
    // never suppressed. Pass 14.6: applies to BENCH rows too -- a bench
    // player's OWN lineup slot can lock independently of whether they're
    // starting (brief: "bench rows use the same semantics"), and this is
    // what `lineup_slots.locked_at` already tracks for every slot,
    // starter or not.
    const shouldShowLocked = locked && player.fixture?.state === "upcoming";
    const displayPlayer = shouldShowLocked ? { ...player, fixture: { ...player.fixture!, state: "locked" as const } } : player;
    if (row.starter) {
      starterEntries.push({ rosterEntryId: row.roster_entry_id, player: displayPlayer, locked });
    } else {
      bench.push(displayPlayer);
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
 * teams (never duplicated per team): one roster_entries read per team,
 * one shared eligible-fixtures lookup, one shared fantasy_player_scores
 * aggregate, one shared fixtures-by-PLAYER lookup (Pass 14 -- was
 * fixtures-by-club, which a national-team fixture can never match via a
 * player's permanent club_id).
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
export interface RoundPlayerState {
  pointsByPlayerId: Map<string, number>;
  /** Pass 14.6: the portion of each player's real round performance that was EXCLUDED by the acquisition cutoff (earned before `acquired_at`) -- shown to the manager for context, never silently dropped. Absent/0 means nothing was withheld. */
  preAcquisitionPointsByPlayerId: Map<string, number>;
  fixtureByPlayerId: Map<string, { opponent: string; isHome: boolean; kickoff: string; state: PlayerMatchState; homeLabel: string; awayLabel: string }>;
}

/**
 * Pass 14.5: the shared "real per-round points + real fixture/lock
 * display state for these players, scoped to this round's window" lookup
 * — extracted out of `queryMatchupSquads` (unchanged behavior) so
 * `querySquad` (roster.ts, Home's Starting XI and the Team page) can reuse
 * the EXACT same derivation instead of a second, divergent one. This is
 * what fixes "locked players show 0 points / no lock indicator" outside
 * the Matchup page — those surfaces were never calling this at all.
 *
 * Pass 14.6: `acquiredAtByPlayerId` (the CALLER's own already-scoped
 * `roster_entries.acquired_at`, keyed by player id) is what's compared
 * against each eligible fixture's kickoff to apply "no retroactive point
 * inheritance" -- see `refreshMatchupScores` (rounds.ts), which this
 * mirrors exactly so a displayed per-player round score can never
 * disagree with the stored team total it rolls up into. Deliberately NOT
 * re-derived inside this function from `player_id` alone: the same real
 * player can be rostered on different teams in different leagues
 * simultaneously, so only the caller (who already scoped its own
 * `roster_entries` query to one league/team set) can safely supply it.
 */
export async function getRoundPlayerState(
  supabase: SupabaseClientType,
  playerIds: string[],
  window: RoundWindow,
  acquiredAtByPlayerId: Map<string, string>
): Promise<RoundPlayerState> {
  const pointsByPlayerId = new Map<string, number>();
  const preAcquisitionPointsByPlayerId = new Map<string, number>();
  const fixtureByPlayerId: RoundPlayerState["fixtureByPlayerId"] = new Map();
  if (playerIds.length === 0) return { pointsByPlayerId, preAcquisitionPointsByPlayerId, fixtureByPlayerId };

  // Real per-round points -- the exact same fixture-window + scoring-rule
  // scoping refreshMatchupScores uses for matchup_scores.live_points, so a
  // player's displayed round score can never disagree with the team total
  // it rolls up into.
  const fixtureIds = await getEligibleFixtureIds(supabase, window);
  if (fixtureIds.length > 0) {
    const { data: scores } = await supabase
      .from("fantasy_player_scores")
      .select("player_id, fixture_id, points")
      .eq("scoring_rule_version", SCORING_RULE_VERSION)
      .in("player_id", playerIds)
      .in("fixture_id", fixtureIds);

    const { data: fixtureRows } = await supabase.from("fixtures").select("id, kickoff_at").in("id", fixtureIds);
    const kickoffByFixtureId = new Map((fixtureRows ?? []).map((f) => [f.id, f.kickoff_at]));

    for (const row of scores ?? []) {
      const acquiredAt = acquiredAtByPlayerId.get(row.player_id);
      const kickoffAt = kickoffByFixtureId.get(row.fixture_id);
      if (!acquiredAt || !kickoffAt) continue;
      // Pass 14.6: acquired at or before this fixture's kickoff -> counts;
      // acquired after -> the real score still exists in
      // fantasy_player_scores (never touched), it just isn't THIS team's
      // to count -- tracked separately so the manager can still SEE it
      // (brief: "pre-acquisition points remain visible as player
      // performance"), never silently dropped.
      if (new Date(kickoffAt).getTime() >= new Date(acquiredAt).getTime()) {
        pointsByPlayerId.set(row.player_id, (pointsByPlayerId.get(row.player_id) ?? 0) + row.points);
      } else {
        preAcquisitionPointsByPlayerId.set(row.player_id, (preAcquisitionPointsByPlayerId.get(row.player_id) ?? 0) + row.points);
      }
    }
  }

  // Fixture display state per PLAYER (Pass 14 -- was per club, which is
  // structurally blind to an international fixture whose participants
  // are national teams, not the player's own club; see
  // player-fixture-participation.ts), scoped strictly to this round's
  // window (never a future round's fixture just to have something to
  // show -- same rule getMatchupFixtureIntelligence follows). A player
  // can have more than one eligible fixture in a round (club AND
  // international, or two internationals) -- picks whichever is most
  // relevant to show without changing what it's worth: live first, else
  // the earliest still-upcoming one, else the most recent final one. The
  // POINTS value above already sums every fixture in the window
  // regardless of which one is displayed, so this choice is purely
  // presentational.
  const teamIdsByPlayer = await getTeamIdsByPlayer(supabase, playerIds);
  const allTeamIds = Array.from(new Set(Array.from(teamIdsByPlayer.values()).flat()));
  const fixtures = await getFixturesForTeamIds(supabase, allTeamIds, { window });

  const involvedClubIds = Array.from(new Set(fixtures.flatMap((f) => [f.homeClubId, f.awayClubId])));
  const { data: clubs } = involvedClubIds.length
    ? await supabase.from("clubs").select("id, short_name").in("id", involvedClubIds)
    : { data: [] as { id: string; short_name: string }[] };
  const shortNameById = new Map((clubs ?? []).map((c) => [c.id, c.short_name]));

  for (const playerId of playerIds) {
    const teamIds = new Set(teamIdsByPlayer.get(playerId) ?? []);
    const playerFixtures = fixtures.filter((f) => teamIds.has(f.homeClubId) || teamIds.has(f.awayClubId));
    if (playerFixtures.length === 0) continue;

    const live = playerFixtures.find((f) => f.status === "live" || f.status === "ht");
    const upcoming = playerFixtures.find((f) => f.status === "scheduled" || f.status === "postponed");
    const chosen = live ?? upcoming ?? playerFixtures[playerFixtures.length - 1];
    const isHome = teamIds.has(chosen.homeClubId);
    const homeLabel = shortNameById.get(chosen.homeClubId) ?? "—";
    const awayLabel = shortNameById.get(chosen.awayClubId) ?? "—";
    fixtureByPlayerId.set(playerId, {
      opponent: isHome ? awayLabel : homeLabel,
      isHome,
      kickoff: chosen.kickoffAt.toISOString(),
      state: FIXTURE_STATUS_TO_MATCH_STATE[chosen.status] ?? "upcoming",
      homeLabel,
      awayLabel,
    });
  }

  return { pointsByPlayerId, preAcquisitionPointsByPlayerId, fixtureByPlayerId };
}

export async function queryMatchupSquads(supabase: SupabaseClientType, matchup: CurrentMatchup): Promise<MatchupSquads> {
  const teamIds = [matchup.homeFantasyTeamId, matchup.awayFantasyTeamId];

  const { data: entries } = await supabase
    .from("roster_entries")
    .select("player_id, acquired_at")
    .in("fantasy_team_id", teamIds)
    .eq("status", "active");

  const playerIds = Array.from(new Set((entries ?? []).map((e) => e.player_id)));
  // Safe keyed by player_id alone: a player can only be actively owned by
  // ONE of these two teams at a time (league_player_ownership's own
  // PRIMARY KEY), so there's exactly one acquired_at per id here.
  const acquiredAtByPlayerId = new Map((entries ?? []).map((e) => [e.player_id, e.acquired_at]));

  const window: RoundWindow = { startsAt: new Date(matchup.roundStartsAt), endsAt: new Date(matchup.roundEndsAt) };
  const { pointsByPlayerId, preAcquisitionPointsByPlayerId, fixtureByPlayerId } = await getRoundPlayerState(
    supabase,
    playerIds,
    window,
    acquiredAtByPlayerId
  );

  const [home, away] = await Promise.all([
    buildMatchupTeamSquad(supabase, matchup.homeFantasyTeamId, matchup.roundId, pointsByPlayerId, fixtureByPlayerId, preAcquisitionPointsByPlayerId),
    buildMatchupTeamSquad(supabase, matchup.awayFantasyTeamId, matchup.roundId, pointsByPlayerId, fixtureByPlayerId, preAcquisitionPointsByPlayerId),
  ]);

  return { home, away };
}

export interface StandingsRow {
  fantasyTeamId: string;
  teamName: string;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  pointsFor: number;
  pointsAgainst: number;
  /** Soccer-style league points: WIN=3, DRAW=1, LOSS=0 (Pass 12A) — never confused with `pointsFor`, the fantasy points actually scored. */
  leaguePoints: number;
}

/**
 * The standings table for ONE EXPLICIT season id — never "whichever
 * season is current." This is the single shared core both `getStandings`
 * (current-season convenience wrapper, below) and the season-archive
 * view (`getSeasonArchiveDetail`, src/data-access/seasons.ts) call —
 * Pass 12B's historical views must never accidentally go through a
 * "resolve the current season" helper, so this function takes a
 * `seasonId` directly and does no such resolution itself. Derived from
 * that season's completed (`status = 'final'`) matchups' `matchup_scores`
 * — never a stored win/loss column. `matchups` has no season_id of its
 * own (Pass 12A deliberately avoids that duplication); scoping is done
 * via `fantasy_rounds.season_id`. Ranking/tiebreak logic lives in
 * `@/domain/fantasy/standings` so it's pure and independently tested
 * rather than duplicated here. `[]` until at least one matchup in this
 * specific season has been played.
 */
export async function getStandingsForSeason(supabase: SupabaseClientType, seasonId: string): Promise<StandingsRow[]> {
  const { data: rounds } = await supabase.from("fantasy_rounds").select("id").eq("season_id", seasonId);
  const roundIds = (rounds ?? []).map((r) => r.id);
  if (roundIds.length === 0) return [];

  const { data: matchups } = await supabase
    .from("matchups")
    .select(
      "id, home_fantasy_team_id, away_fantasy_team_id, matchup_scores(fantasy_team_id, final_points)"
    )
    .in("fantasy_round_id", roundIds)
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
    played: row.played,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
    pointsFor: row.pointsFor,
    pointsAgainst: row.pointsAgainst,
    leaguePoints: row.leaguePoints,
  }));
}

/**
 * League standings for the league's CURRENT (latest) season — resolves
 * which season that is, then delegates to `getStandingsForSeason`. This
 * is the "current season" convenience wrapper the League page itself
 * uses; the season archive view calls `getStandingsForSeason` directly
 * with an explicit historical `seasonId` instead of this function (see
 * that function's own doc comment for why the distinction matters).
 */
export async function getStandings(leagueId: string): Promise<StandingsRow[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await resolveClient();

  const { data: season } = await supabase
    .from("seasons")
    .select("id")
    .eq("league_id", leagueId)
    .order("season_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!season) return [];

  return getStandingsForSeason(supabase, season.id);
}

export interface LeagueMatchupSummary {
  id: string;
  roundNumber: number;
  status: "scheduled" | "live" | "final";
  homeTeamId: string;
  homeTeamName: string;
  homePoints: number;
  awayTeamId: string;
  awayTeamName: string;
  awayPoints: number;
}

export interface LeagueRecordEntry {
  teamName: string;
  value: number;
  opponentName?: string;
  roundNumber: number;
}

export interface LeagueRecords {
  highestScore: LeagueRecordEntry | null;
  lowestScore: LeagueRecordEntry | null;
  largestMargin: LeagueRecordEntry | null;
  closestMatchup: LeagueRecordEntry | null;
  mostPointsFor: { teamName: string; value: number } | null;
  mostPointsAgainst: { teamName: string; value: number } | null;
}

export interface LeagueCompetitionSummary {
  /** This league's current (in-progress, else soonest upcoming) round's matchups -- every pairing, not scoped to one manager. `[]` once every round is final (season concluded) or before the draft/first round exists. */
  currentRoundMatchups: LeagueMatchupSummary[];
  /** Completed matchups, most recent round first. */
  recentResults: LeagueMatchupSummary[];
  records: LeagueRecords;
}

/**
 * League-wide competition data for the League page's "competition
 * center" surfaces: the current round's matchups (every pairing, not
 * just the caller's own), recent completed results, and records derived
 * ONLY from completed (`status = 'final'`) matchups -- never from a live
 * or scheduled one, so nothing here can misrepresent an in-progress
 * result as final. One shared query over `matchups`+`matchup_scores`
 * (plus one small `fantasy_rounds`/`fantasy_teams` lookup) powers all
 * three sections -- never a separate fetch per section.
 */
export async function getLeagueCompetitionSummary(leagueId: string): Promise<LeagueCompetitionSummary> {
  if (!isSupabaseConfigured()) return emptyCompetitionSummary();
  const supabase = await resolveClient();
  return queryLeagueCompetitionSummary(supabase, leagueId);
}

function emptyCompetitionSummary(): LeagueCompetitionSummary {
  return {
    currentRoundMatchups: [],
    recentResults: [],
    records: {
      highestScore: null,
      lowestScore: null,
      largestMargin: null,
      closestMatchup: null,
      mostPointsFor: null,
      mostPointsAgainst: null,
    },
  };
}

/**
 * Client-injectable core of `getLeagueCompetitionSummary` -- same
 * reasoning as `queryPlayerDatabase`/`queryMatchupSquads`: lets the real
 * database prove this against a real league in
 * matchups.integration.test.ts without a live Next.js request.
 *
 * Pass 12B: scoped to the league's CURRENT (latest) season. Before
 * multi-season support this was scoped by `league_id` alone, which was
 * correct when a league could only ever have one season's worth of
 * matchups ever -- now that `start_next_season` lets a league accumulate
 * several seasons' matchups, "current round"/"recent results"/"records"
 * must never blend an old, completed season's matchups into the new
 * season's view. The season archive (`getSeasonMatchupResults`, below)
 * is the explicitly-season-scoped equivalent for a HISTORICAL season.
 */
export async function queryLeagueCompetitionSummary(
  supabase: SupabaseClientType,
  leagueId: string
): Promise<LeagueCompetitionSummary> {
  const empty = emptyCompetitionSummary();

  const { data: season } = await supabase
    .from("seasons")
    .select("id")
    .eq("league_id", leagueId)
    .order("season_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!season) return empty;

  // No `.order()` on the embedded `fantasy_rounds(number)` column --
  // PostgREST does not order outer rows by an embedded relation's column
  // (confirmed live elsewhere in this file, see getPlayerDatabase's own
  // club-sort fix in src/data-access/players.ts); sorted in JS below
  // instead, after `roundNumber` has been pulled out of the embed.
  const { data: allMatchups } = await supabase
    .from("matchups")
    .select(
      "id, status, home_fantasy_team_id, away_fantasy_team_id, fantasy_rounds!inner(number, season_id), matchup_scores(fantasy_team_id, live_points, final_points)"
    )
    .eq("fantasy_rounds.season_id", season.id);

  if (!allMatchups || allMatchups.length === 0) return empty;

  const teamIds = Array.from(
    new Set(allMatchups.flatMap((m) => [m.home_fantasy_team_id, m.away_fantasy_team_id]))
  );
  const { data: teams } = await supabase.from("fantasy_teams").select("id, name").in("id", teamIds);
  const nameById = new Map((teams ?? []).map((t) => [t.id, t.name]));

  function toSummary(m: NonNullable<typeof allMatchups>[number]): LeagueMatchupSummary {
    const scores = m.matchup_scores ?? [];
    const home = scores.find((s) => s.fantasy_team_id === m.home_fantasy_team_id);
    const away = scores.find((s) => s.fantasy_team_id === m.away_fantasy_team_id);
    return {
      id: m.id,
      roundNumber: (m.fantasy_rounds as unknown as { number: number }).number,
      status: m.status as LeagueMatchupSummary["status"],
      homeTeamId: m.home_fantasy_team_id,
      homeTeamName: nameById.get(m.home_fantasy_team_id) ?? "—",
      homePoints: home?.final_points ?? home?.live_points ?? 0,
      awayTeamId: m.away_fantasy_team_id,
      awayTeamName: nameById.get(m.away_fantasy_team_id) ?? "—",
      awayPoints: away?.final_points ?? away?.live_points ?? 0,
    };
  }

  const summaries = allMatchups.map(toSummary).sort((a, b) => b.roundNumber - a.roundNumber);
  const finalSummaries = summaries.filter((s) => s.status === "final");

  // Current round: the lowest-numbered round that ISN'T final yet (the
  // list is already sorted round-descending, so scan from the end) --
  // same "in-progress, else soonest upcoming" notion `getCurrentMatchup`
  // uses, just league-wide instead of one manager's own matchup.
  const nonFinal = summaries.filter((s) => s.status !== "final");
  const currentRoundNumber = nonFinal.length > 0 ? Math.min(...nonFinal.map((s) => s.roundNumber)) : null;
  const currentRoundMatchups = currentRoundNumber !== null ? nonFinal.filter((s) => s.roundNumber === currentRoundNumber) : [];

  const recentResults = finalSummaries.slice(0, 5);

  const records: LeagueRecords = { ...empty.records };
  if (finalSummaries.length > 0) {
    let highest: LeagueRecordEntry | null = null;
    let lowest: LeagueRecordEntry | null = null;
    let largestMargin: LeagueRecordEntry | null = null;
    let closest: LeagueRecordEntry | null = null;
    const totalForByTeam = new Map<string, number>();
    const totalAgainstByTeam = new Map<string, number>();

    for (const m of finalSummaries) {
      for (const [team, opponent, points] of [
        [m.homeTeamName, m.awayTeamName, m.homePoints],
        [m.awayTeamName, m.homeTeamName, m.awayPoints],
      ] as const) {
        if (!highest || points > highest.value) highest = { teamName: team, value: points, opponentName: opponent, roundNumber: m.roundNumber };
        if (!lowest || points < lowest.value) lowest = { teamName: team, value: points, opponentName: opponent, roundNumber: m.roundNumber };
      }
      totalForByTeam.set(m.homeTeamId, (totalForByTeam.get(m.homeTeamId) ?? 0) + m.homePoints);
      totalForByTeam.set(m.awayTeamId, (totalForByTeam.get(m.awayTeamId) ?? 0) + m.awayPoints);
      totalAgainstByTeam.set(m.homeTeamId, (totalAgainstByTeam.get(m.homeTeamId) ?? 0) + m.awayPoints);
      totalAgainstByTeam.set(m.awayTeamId, (totalAgainstByTeam.get(m.awayTeamId) ?? 0) + m.homePoints);

      const margin = Math.round(Math.abs(m.homePoints - m.awayPoints) * 100) / 100;
      const winner = m.homePoints >= m.awayPoints ? m.homeTeamName : m.awayTeamName;
      const loser = m.homePoints >= m.awayPoints ? m.awayTeamName : m.homeTeamName;
      if (!largestMargin || margin > largestMargin.value) {
        largestMargin = { teamName: winner, value: margin, opponentName: loser, roundNumber: m.roundNumber };
      }
      if (!closest || margin < closest.value) {
        closest = { teamName: winner, value: margin, opponentName: loser, roundNumber: m.roundNumber };
      }
    }

    records.highestScore = highest;
    records.lowestScore = lowest;
    records.largestMargin = largestMargin;
    records.closestMatchup = closest;

    let mostFor: { teamName: string; value: number } | null = null;
    let mostAgainst: { teamName: string; value: number } | null = null;
    for (const [teamId, total] of totalForByTeam) {
      if (!mostFor || total > mostFor.value) mostFor = { teamName: nameById.get(teamId) ?? "—", value: Math.round(total * 100) / 100 };
    }
    for (const [teamId, total] of totalAgainstByTeam) {
      if (!mostAgainst || total > mostAgainst.value) mostAgainst = { teamName: nameById.get(teamId) ?? "—", value: Math.round(total * 100) / 100 };
    }
    records.mostPointsFor = mostFor;
    records.mostPointsAgainst = mostAgainst;
  }

  return { currentRoundMatchups, recentResults, records };
}

/**
 * Every FINAL matchup in ONE EXPLICIT (typically historical) season,
 * grouped by round ascending — the "rounds/results for that season" slice
 * of the Pass 12B season archive. Takes `seasonId` directly, never
 * resolves "the current season" itself, so a historical season's results
 * can never accidentally reflect whichever season is active right now.
 */
export async function getSeasonMatchupResults(supabase: SupabaseClientType, seasonId: string): Promise<LeagueMatchupSummary[]> {
  const { data: rows } = await supabase
    .from("matchups")
    .select(
      "id, status, home_fantasy_team_id, away_fantasy_team_id, fantasy_rounds!inner(number, season_id), matchup_scores(fantasy_team_id, live_points, final_points)"
    )
    .eq("fantasy_rounds.season_id", seasonId)
    .eq("status", "final");

  if (!rows || rows.length === 0) return [];

  const teamIds = Array.from(new Set(rows.flatMap((m) => [m.home_fantasy_team_id, m.away_fantasy_team_id])));
  const { data: teams } = await supabase.from("fantasy_teams").select("id, name").in("id", teamIds);
  const nameById = new Map((teams ?? []).map((t) => [t.id, t.name]));

  return rows
    .map((m): LeagueMatchupSummary => {
      const scores = m.matchup_scores ?? [];
      const home = scores.find((s) => s.fantasy_team_id === m.home_fantasy_team_id);
      const away = scores.find((s) => s.fantasy_team_id === m.away_fantasy_team_id);
      return {
        id: m.id,
        roundNumber: (m.fantasy_rounds as unknown as { number: number }).number,
        status: m.status as LeagueMatchupSummary["status"],
        homeTeamId: m.home_fantasy_team_id,
        homeTeamName: nameById.get(m.home_fantasy_team_id) ?? "—",
        homePoints: home?.final_points ?? home?.live_points ?? 0,
        awayTeamId: m.away_fantasy_team_id,
        awayTeamName: nameById.get(m.away_fantasy_team_id) ?? "—",
        awayPoints: away?.final_points ?? away?.live_points ?? 0,
      };
    })
    .sort((a, b) => a.roundNumber - b.roundNumber);
}
