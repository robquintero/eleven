import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { bigFiveLeagueFromCompetitionCode } from "@/lib/leagues";
import { normalizeForSearch } from "@/lib/search-normalize";
import { SCORING_RULE_VERSION } from "@/domain/fantasy/scoring";
import type { Player, PlayerFixture, PlayerMatchState, PlayerPosition } from "@/lib/types/fantasy";

const DEFAULT_PAGE_SIZE = 50;

/** Starting year of the season currently being scored — same convention as `providerSeason`/`backfillScores`'s default (see big-five-competitions.ts). */
const CURRENT_SEASON = 2026;

export interface PlayerQuery {
  query?: string;
  position?: PlayerPosition;
  competitionId?: string;
  clubId?: string;
  availability?: Player["availability"];
  /** Only meaningful with `activeLeagueId` — real per-league ownership, never league-agnostic. */
  ownership?: "free" | "owned";
  sort?: "name" | "club";
  sortDirection?: "asc" | "desc";
  page?: number;
  pageSize?: number;
  /** When provided, ownership is resolved from this league's real `league_player_ownership` rows. */
  activeLeagueId?: string | null;
}

export interface PlayerDatabasePage {
  players: Player[];
  total: number;
  page: number;
  pageSize: number;
}

const FIXTURE_STATUS_TO_MATCH_STATE: Record<string, PlayerMatchState> = {
  scheduled: "upcoming",
  live: "live",
  ht: "live",
  final: "final",
  postponed: "upcoming",
};

/**
 * The real football player database (`public.players`), paginated and
 * filtered entirely in the query — never a full-table fetch filtered in
 * the browser (see docs/football-data-system.md "Players workspace
 * performance"). `[]`/`total: 0` until Pass 8's ingestion has run for a
 * given scope; this never falls back to a mock roster.
 *
 * `totalPoints`/`averagePoints` come from real `fantasy_player_scores`
 * aggregates (Pass 9's `ELEVEN_STANDARD_V1` engine — see
 * docs/scoring-model.md); `undefined` means no scored performance exists
 * yet for that player, rendered as "—", never as 0 (0 is a real,
 * meaningfully bad score; "no data" is a different, honest state). MIN and
 * STARTS come from real `player_match_stats` aggregates; ownership comes
 * from real `league_player_ownership` rows when `activeLeagueId` is given.
 * `fantasyPoints` (a single ROUND's score) stays 0 here — no fantasy round
 * scheduler exists yet (Draft/H2H is a later pass); it belongs to the Team
 * page's live-matchup context, not the Players database.
 */
export async function getPlayerDatabase(query: PlayerQuery = {}): Promise<PlayerDatabasePage> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
  const empty: PlayerDatabasePage = { players: [], total: 0, page, pageSize };

  if (!isSupabaseConfigured()) return empty;

  const supabase = await createClient();

  // Computed whenever an active league is known (not only when an
  // ownership filter is applied) — otherwise a row would have to default
  // `ownership` to "free", which misrepresents "we don't know" as "known
  // free." No active league means ownership is left `undefined` and the
  // UI omits the column entirely.
  //
  // Distinguishes "mine" (owned by the CALLER's own team) from "owned" (by
  // some other team) -- Pass 10.5B fix: this previously always returned
  // "owned" even for the caller's own players, which is how the player
  // drawer ended up showing a false "join a league" CTA for an
  // already-owned player (see player-inspector-content.tsx's ownership
  // branch, which only recognizes "mine"/"owned"/"free", never
  // undefined-as-if-truly-owned).
  let ownerTeamIdByPlayerId: Map<string, string> | null = null;
  let myFantasyTeamId: string | null = null;
  if (query.activeLeagueId) {
    const [{ data: ownership }, { data: userData }] = await Promise.all([
      supabase.from("league_player_ownership").select("player_id, fantasy_team_id").eq("league_id", query.activeLeagueId),
      supabase.auth.getUser(),
    ]);
    ownerTeamIdByPlayerId = new Map((ownership ?? []).map((o) => [o.player_id, o.fantasy_team_id]));
    if (userData.user) {
      const { data: myTeam } = await supabase
        .from("fantasy_teams")
        .select("id")
        .eq("league_id", query.activeLeagueId)
        .eq("owner_user_id", userData.user.id)
        .maybeSingle();
      myFantasyTeamId = myTeam?.id ?? null;
    }
  }

  let builder = supabase
    .from("players")
    .select(
      "id, name, position, shirt_number, nationality, availability_status, club_id, clubs(id, name, short_name, competition_id, competitions(code))",
      { count: "exact" }
    )
    .eq("active", true);

  const searchTerm = query.query?.trim();
  if (searchTerm) {
    // Accent/diacritic-insensitive (Pass 10.5B): matched against the
    // generated `*_unaccented` columns (see
    // supabase/migrations/20260930040000_accent_insensitive_search.sql),
    // never the raw `name`/`short_name` — "mbappe" must find "Mbappé" and
    // vice versa. `normalizeForSearch` strips the SAME accents from the
    // incoming term so both sides compare equivalently; `ilike` still
    // handles case-insensitivity as before.
    //
    // Matches the player's own name OR their club's full name/abbreviation
    // (see docs/football-data-system.md "Club naming / search UX") —
    // "Barcelona" and "BAR" both surface Barcelona's players, exactly
    // like searching a player's own name does. Resolved as a separate
    // club lookup rather than an embedded-relation `.or()` filter, which
    // PostgREST doesn't reliably support across a join.
    const normalizedTerm = normalizeForSearch(searchTerm);
    const { data: matchingClubs } = await supabase
      .from("clubs")
      .select("id")
      .or(`name_unaccented.ilike.%${normalizedTerm}%,short_name_unaccented.ilike.%${normalizedTerm}%`);
    const clubIds = (matchingClubs ?? []).map((c) => c.id);

    builder =
      clubIds.length > 0
        ? builder.or(`name_unaccented.ilike.%${normalizedTerm}%,club_id.in.(${clubIds.join(",")})`)
        : builder.ilike("name_unaccented", `%${normalizedTerm}%`);
  }
  if (query.position) builder = builder.eq("position", query.position);
  if (query.competitionId) builder = builder.eq("competition_id", query.competitionId);
  if (query.clubId) builder = builder.eq("club_id", query.clubId);
  if (query.availability) builder = builder.eq("availability_status", query.availability);
  if (ownerTeamIdByPlayerId) {
    const ids = Array.from(ownerTeamIdByPlayerId.keys());
    if (query.ownership === "owned") {
      if (ids.length === 0) return empty;
      builder = builder.in("id", ids);
    } else if (query.ownership === "free") {
      if (ids.length > 0) builder = builder.not("id", "in", `(${ids.join(",")})`);
    }
  }

  if (query.sort === "club") {
    builder = builder.order("short_name", { referencedTable: "clubs", ascending: query.sortDirection !== "desc" });
  } else {
    builder = builder.order("name", { ascending: query.sortDirection !== "desc" });
  }

  const from = (page - 1) * pageSize;
  builder = builder.range(from, from + pageSize - 1);

  const { data, count, error } = await builder;
  if (error || !data) return empty;

  const playerIds = data.map((row) => row.id);
  const clubIds = Array.from(new Set(data.map((row) => row.club_id)));

  const [usageByPlayerId, nextFixtureByClubId, scoresByPlayerId] = await Promise.all([
    getUsageAggregates(supabase, playerIds),
    getNextFixtureByClub(supabase, clubIds),
    getFantasyScoreAggregates(supabase, playerIds),
  ]);

  const players: Player[] = data.map((row) => {
    const club = row.clubs;
    const competitionCode = club?.competitions?.code ?? null;
    const usage = usageByPlayerId.get(row.id);
    const nextFixture = club ? nextFixtureByClubId.get(club.id) : undefined;
    const scores = scoresByPlayerId.get(row.id);

    return {
      id: row.id,
      externalId: "",
      name: row.name,
      club: {
        id: club?.id ?? "unknown",
        name: club?.name ?? "Unknown club",
        shortName: club?.short_name ?? "—",
        league: bigFiveLeagueFromCompetitionCode(competitionCode),
        crestColor: "#6e6e73",
      },
      position: row.position as Player["position"],
      number: row.shirt_number ?? undefined,
      nationality: row.nationality,
      fantasyPoints: 0,
      totalPoints: scores?.totalPoints,
      averagePoints: scores?.averagePoints,
      availability: (row.availability_status as Player["availability"]) ?? "available",
      fixture: nextFixture,
      seasonStats: usage,
      ownership: ownerTeamIdByPlayerId
        ? ownerTeamIdByPlayerId.has(row.id)
          ? ownerTeamIdByPlayerId.get(row.id) === myFantasyTeamId
            ? "mine"
            : "owned"
          : "free"
        : undefined,
    };
  });

  return { players, total: count ?? players.length, page, pageSize };
}

type SupabaseClientType = Awaited<ReturnType<typeof createClient>>;

async function getUsageAggregates(
  supabase: SupabaseClientType,
  playerIds: string[]
): Promise<Map<string, Player["seasonStats"]>> {
  const result = new Map<string, Player["seasonStats"]>();
  if (playerIds.length === 0) return result;

  const { data } = await supabase
    .from("player_match_stats")
    .select("player_id, minutes, started, goals, assists")
    .in("player_id", playerIds);

  if (!data) return result;

  const byPlayer = new Map<string, { minutes: number; starts: number; apps: number; goals: number; assists: number }>();
  for (const row of data) {
    const agg = byPlayer.get(row.player_id) ?? { minutes: 0, starts: 0, apps: 0, goals: 0, assists: 0 };
    agg.minutes += row.minutes;
    agg.starts += row.started ? 1 : 0;
    agg.apps += 1;
    agg.goals += row.goals;
    agg.assists += row.assists;
    byPlayer.set(row.player_id, agg);
  }

  for (const [playerId, agg] of byPlayer) {
    result.set(playerId, {
      appearances: agg.apps,
      starts: agg.starts,
      minutes: agg.minutes,
      goals: agg.goals,
      assists: agg.assists,
    });
  }

  return result;
}

/**
 * Cumulative current-season `ELEVEN_STANDARD_V1` fantasy points per player
 * (Pass 9). `fantasy_player_scores` doesn't store a season column itself —
 * scoped to the current season via its `fixtures!inner(season)` join
 * rather than assuming every stored score is automatically current, so
 * this stays correct once a future season's scores coexist with 2026's.
 */
async function getFantasyScoreAggregates(
  supabase: SupabaseClientType,
  playerIds: string[]
): Promise<Map<string, { totalPoints: number; averagePoints: number }>> {
  const result = new Map<string, { totalPoints: number; averagePoints: number }>();
  if (playerIds.length === 0) return result;

  const { data } = await supabase
    .from("fantasy_player_scores")
    .select("player_id, points, fixtures!inner(season)")
    .eq("scoring_rule_version", SCORING_RULE_VERSION)
    .eq("fixtures.season", CURRENT_SEASON)
    .in("player_id", playerIds);

  if (!data) return result;

  const byPlayer = new Map<string, { total: number; count: number }>();
  for (const row of data) {
    const agg = byPlayer.get(row.player_id) ?? { total: 0, count: 0 };
    agg.total += row.points;
    agg.count += 1;
    byPlayer.set(row.player_id, agg);
  }

  for (const [playerId, agg] of byPlayer) {
    result.set(playerId, {
      totalPoints: Math.round(agg.total * 100) / 100,
      averagePoints: Math.round((agg.total / agg.count) * 100) / 100,
    });
  }

  return result;
}

async function getNextFixtureByClub(
  supabase: SupabaseClientType,
  clubIds: string[]
): Promise<Map<string, PlayerFixture>> {
  const result = new Map<string, PlayerFixture>();
  if (clubIds.length === 0) return result;

  const { data } = await supabase
    .from("fixtures")
    .select("kickoff_at, status, home_club_id, away_club_id")
    .eq("status", "scheduled")
    .or(`home_club_id.in.(${clubIds.join(",")}),away_club_id.in.(${clubIds.join(",")})`)
    .order("kickoff_at", { ascending: true });

  if (!data) return result;

  const clubShortNames = await getClubShortNames(
    supabase,
    Array.from(new Set(data.flatMap((f) => [f.home_club_id, f.away_club_id])))
  );

  for (const fixture of data) {
    for (const [clubId, opponentId, isHome] of [
      [fixture.home_club_id, fixture.away_club_id, true] as const,
      [fixture.away_club_id, fixture.home_club_id, false] as const,
    ]) {
      if (!clubIds.includes(clubId) || result.has(clubId)) continue;
      result.set(clubId, {
        opponent: clubShortNames.get(opponentId) ?? "—",
        isHome,
        kickoff: fixture.kickoff_at,
        state: FIXTURE_STATUS_TO_MATCH_STATE[fixture.status] ?? "upcoming",
      });
    }
  }

  return result;
}

async function getClubShortNames(supabase: SupabaseClientType, clubIds: string[]): Promise<Map<string, string>> {
  if (clubIds.length === 0) return new Map();
  const { data } = await supabase.from("clubs").select("id, short_name").in("id", clubIds);
  return new Map((data ?? []).map((c) => [c.id, c.short_name]));
}

/** One player's ELEVEN_STANDARD_V1 points for a specific set of fixtures, keyed by fixture id. Missing from the map means not yet scored — the caller renders that as `null`, never 0. */
async function getScoresByFixtureId(
  supabase: SupabaseClientType,
  playerId: string,
  fixtureIds: string[]
): Promise<Map<string, number>> {
  if (fixtureIds.length === 0) return new Map();
  const { data } = await supabase
    .from("fantasy_player_scores")
    .select("fixture_id, points")
    .eq("player_id", playerId)
    .eq("scoring_rule_version", SCORING_RULE_VERSION)
    .in("fixture_id", fixtureIds);
  return new Map((data ?? []).map((s) => [s.fixture_id, s.points]));
}

export interface CompetitionFilterOption {
  id: string;
  code: string;
  name: string;
}

/** Real ingested competitions only — `[]` until at least one `sync competitions` has run. */
export async function getCompetitionFilters(): Promise<CompetitionFilterOption[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("competitions").select("id, code, name").order("name", { ascending: true });
  return data ?? [];
}

export interface ClubFilterOption {
  id: string;
  /** Full human-readable name — e.g. "Bayern München". The primary label in any search/filter/select/browse UI (see docs/football-data-system.md "Club naming"). Never assume `shortName` alone is unambiguous: the provider can supply the same abbreviation for two different real clubs. */
  name: string;
  /** Compact operational abbreviation — e.g. "BAY". Appropriate for dense workstation surfaces (tables, fixture strips), never as the sole identifying label in a filter/search context. */
  shortName: string;
  competitionId: string;
}

/** Real ingested clubs, optionally scoped to one competition, ordered by full name (never by the possibly-ambiguous abbreviation). `[]` until `sync clubs` has run for that scope. */
export async function getClubFilters(competitionId?: string): Promise<ClubFilterOption[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  let builder = supabase.from("clubs").select("id, name, short_name, competition_id").order("name", { ascending: true });
  if (competitionId) builder = builder.eq("competition_id", competitionId);
  const { data } = await builder;
  return (data ?? []).map((c) => ({ id: c.id, name: c.name, shortName: c.short_name, competitionId: c.competition_id }));
}

export interface RecentMatchRow {
  fixtureId: string;
  opponent: string;
  isHome: boolean;
  kickoffAt: string;
  minutes: number;
  started: boolean;
  goals: number;
  assists: number;
  /** ELEVEN_STANDARD_V1 points for this specific match, or `null` if not yet scored (e.g. scoring hasn't been backfilled for this fixture) — never fabricated as 0. */
  fantasyPoints: number | null;
}

/**
 * A player's most recent completed matches, most recent first — powers the
 * inspector's usage trend (src/lib/selectors/usage-trend.ts) and Form
 * Tracker (src/lib/selectors/form-tracker.ts). `[]` means INSUFFICIENT
 * MATCH DATA. Default limit is 10 to cover Form Tracker's largest window
 * (last 10) in one fetch — the inspector still renders 3/5/10 sub-windows
 * from this same result rather than issuing three separate queries.
 */
export async function getPlayerRecentMatches(playerId: string, limit = 10): Promise<RecentMatchRow[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();

  const { data: player } = await supabase.from("players").select("club_id").eq("id", playerId).maybeSingle();
  if (!player) return [];

  // Sorted and limited in JS, not via `.order("kickoff_at", { referencedTable:
  // "fixtures" })` — found live while building Form Tracker: PostgREST
  // doesn't order the OUTER rows by a many-to-one embedded relation's
  // column that way (it silently no-ops), so the previous version of this
  // query returned matches in an essentially arbitrary order while still
  // claiming "most recent first." That was a latent bug even for the
  // simple 5-match usage trend; it becomes a correctness bug for Form
  // Tracker, which depends on genuinely-most-recent windowing. A player's
  // total appearances in one season (domestic + UCL/UEL) is well under
  // 100, so fetching all of them and sorting here is cheap and correct.
  const { data, error } = await supabase
    .from("player_match_stats")
    .select(
      "minutes, started, goals, assists, fixtures(id, kickoff_at, home_club_id, away_club_id, status)"
    )
    .eq("player_id", playerId);

  if (error || !data) return [];

  const rows = data
    .filter((row) => row.fixtures)
    .sort((a, b) => new Date(b.fixtures!.kickoff_at).getTime() - new Date(a.fixtures!.kickoff_at).getTime())
    .slice(0, limit);
  const opponentClubIds = rows.map((row) =>
    row.fixtures!.home_club_id === player.club_id ? row.fixtures!.away_club_id : row.fixtures!.home_club_id
  );
  const fixtureIds = rows.map((row) => row.fixtures!.id);
  const [clubShortNames, pointsByFixtureId] = await Promise.all([
    getClubShortNames(supabase, Array.from(new Set(opponentClubIds))),
    getScoresByFixtureId(supabase, playerId, fixtureIds),
  ]);

  return rows.map((row) => {
    const fixture = row.fixtures!;
    const isHome = fixture.home_club_id === player.club_id;
    const opponentId = isHome ? fixture.away_club_id : fixture.home_club_id;
    return {
      fixtureId: fixture.id,
      opponent: clubShortNames.get(opponentId) ?? "—",
      isHome,
      kickoffAt: fixture.kickoff_at,
      minutes: row.minutes,
      started: row.started,
      fantasyPoints: pointsByFixtureId.get(fixture.id) ?? null,
      goals: row.goals,
      assists: row.assists,
    };
  });
}
