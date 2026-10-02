import "server-only";
// Relative imports (not the usual `@/...` aliases) specifically so
// `queryPlayerDatabase` below stays importable from a plain Node
// integration test (players.integration.test.ts) the same way
// src/lib/fantasy-engine's RPC wrappers already are -- `@/...` aliases
// only resolve under Next.js/webpack's module resolution, never under
// plain `node --experimental-strip-types`. `../lib/supabase/server.ts`
// itself is NOT statically imported here (see `getPlayerDatabase` below)
// for the same reason: it pulls in `next/headers`, which only resolves
// inside a real Next.js module graph, not plain Node.
import { isSupabaseConfigured } from "../lib/supabase/config.ts";
import type { createClient } from "../lib/supabase/server.ts";
import { bigFiveLeagueFromCompetitionCode } from "../lib/leagues.ts";
import { normalizeForSearch } from "../lib/search-normalize.ts";
import { SCORING_RULE_VERSION } from "../domain/fantasy/scoring.ts";
import { getNextFixtureByPlayer, getTeamIdsByPlayer } from "../lib/fantasy-engine/player-fixture-participation.ts";
import type { Player, PlayerFixture, PlayerMatchState, PlayerPosition } from "../lib/types/fantasy.ts";

/** Dynamically imported (not a static top-level import) so this whole module -- specifically `queryPlayerDatabase` -- stays importable from a plain Node integration test; see this file's own import-block comment. */
async function resolveClient() {
  const { createClient } = await import("../lib/supabase/server.ts");
  return createClient();
}

const DEFAULT_PAGE_SIZE = 50;

/** Starting year of the season currently being scored — same convention as `providerSeason`/`backfillScores`'s default (see big-five-competitions.ts). */
const CURRENT_SEASON = 2026;

export interface PlayerQuery {
  query?: string;
  position?: PlayerPosition;
  competitionId?: string;
  clubId?: string;
  availability?: Player["availability"];
  /** Only meaningful with `activeLeagueId` — real per-league ownership, never league-agnostic. "mine" needs the caller's own team resolved too (see below), not just any ownership row. */
  ownership?: "free" | "owned" | "mine";
  sort?: "points" | "name" | "club";
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

/** The exact shape both query paths in `getPlayerDatabase` select -- the direct-order path and the points-sort path's final per-page fetch. */
interface PlayerRow {
  id: string;
  name: string;
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
}

/**
 * The Supabase project caps every unbounded `.select()` at `max_rows`
 * (`supabase/config.toml`, currently 1000) — PostgREST silently truncates
 * rather than erroring. `getPlayerDatabase`'s points-sort path needs every
 * ACTIVE player (2767 at last count, comfortably over that cap) to compute
 * a genuinely global order before paginating, so any query feeding it must
 * page through the cap itself rather than trust a single unlimited
 * `.select()`. `orderColumn` must be a column (or combination enforced by
 * a unique index) that gives the result set a stable total order — OFFSET
 * pagination across repeated queries is only correct with one; an
 * unordered `.select()` has no guaranteed stable row order across calls.
 */
async function fetchAllRows<T>(
  queryFactory: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  batchSize = 1000
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await queryFactory(from, from + batchSize - 1);
    if (error || !data) break;
    all.push(...data);
    if (data.length < batchSize) break;
    from += batchSize;
  }
  return all;
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
 * aggregates (Eleven's versioned scoring engine, currently
 * `ELEVEN_STANDARD_V2` — see docs/scoring-model-v2.md); `undefined` means no scored performance exists
 * yet for that player, rendered as "—", never as 0 (0 is a real,
 * meaningfully bad score; "no data" is a different, honest state). MIN and
 * STARTS come from real `player_match_stats` aggregates; ownership comes
 * from real `league_player_ownership` rows when `activeLeagueId` is given.
 * `fantasyPoints` (a single ROUND's score) stays 0 here — no fantasy round
 * scheduler exists yet (Draft/H2H is a later pass); it belongs to the Team
 * page's live-matchup context, not the Players database.
 */
export async function getPlayerDatabase(query: PlayerQuery = {}): Promise<PlayerDatabasePage> {
  if (!isSupabaseConfigured()) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    return { players: [], total: 0, page, pageSize };
  }
  const supabase = await resolveClient();
  return queryPlayerDatabase(supabase, query);
}

/**
 * The actual query logic, parameterized by an already-resolved Supabase
 * client rather than calling `createClient()` (which needs a live Next.js
 * request's cookies) itself. Exported SPECIFICALLY so integration tests
 * can exercise the real global-points-sort logic against the real
 * database via an admin/service-role client — `getPlayerDatabase` itself
 * can't be called from a plain script/test outside a request context, but
 * this can. `getPlayerDatabase` above is the only production caller.
 */
export async function queryPlayerDatabase(
  supabase: SupabaseClientType,
  query: PlayerQuery = {}
): Promise<PlayerDatabasePage> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
  const empty: PlayerDatabasePage = { players: [], total: 0, page, pageSize };

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

  // Resolved once, up front, since both the direct-order path and the
  // points-sort path below need the exact same "which players does this
  // ownership filter admit" answer, including its early-`empty` cases.
  let ownershipIdFilter: string[] | null = null;
  let ownershipExcludeIds: string[] | null = null;
  if (ownerTeamIdByPlayerId) {
    const ids = Array.from(ownerTeamIdByPlayerId.keys());
    if (query.ownership === "owned") {
      if (ids.length === 0) return empty;
      ownershipIdFilter = ids;
    } else if (query.ownership === "free") {
      if (ids.length > 0) ownershipExcludeIds = ids;
    } else if (query.ownership === "mine") {
      const myIds = ids.filter((id) => ownerTeamIdByPlayerId!.get(id) === myFantasyTeamId);
      if (!myFantasyTeamId || myIds.length === 0) return empty;
      ownershipIdFilter = myIds;
    }
  }

  const searchTerm = query.query?.trim();
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
  // like searching a player's own name does. Resolved as a separate club
  // lookup rather than an embedded-relation `.or()` filter, which
  // PostgREST doesn't reliably support across a join.
  let matchingClubIds: string[] = [];
  if (searchTerm) {
    const normalizedTerm = normalizeForSearch(searchTerm);
    const { data: matchingClubs } = await supabase
      .from("clubs")
      .select("id")
      .or(`name_unaccented.ilike.%${normalizedTerm}%,short_name_unaccented.ilike.%${normalizedTerm}%`);
    matchingClubIds = (matchingClubs ?? []).map((c) => c.id);
  }

  /**
   * Every filter condition common to both query shapes below (the direct
   * name/club order below, and the points-sort id lookup further down) —
   * kept as one small function so the two paths can never drift out of
   * sync, without fighting Supabase's per-`.select()`-shape builder
   * generics (hence the loose `any`-typed parameter: every call here is
   * a plain `.eq`/`.ilike`/`.or`/`.in`/`.not`, which exists identically
   * on every PostgrestFilterBuilder regardless of selected columns).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyCommonFilters<T extends { eq: any; ilike: any; or: any; in: any; not: any }>(b: T): T {
    let next = b;
    if (searchTerm) {
      const normalizedTerm = normalizeForSearch(searchTerm);
      next =
        matchingClubIds.length > 0
          ? next.or(`name_unaccented.ilike.%${normalizedTerm}%,club_id.in.(${matchingClubIds.join(",")})`)
          : next.ilike("name_unaccented", `%${normalizedTerm}%`);
    }
    if (query.position) next = next.eq("position", query.position);
    if (query.competitionId) next = next.eq("competition_id", query.competitionId);
    if (query.clubId) next = next.eq("club_id", query.clubId);
    if (query.availability) next = next.eq("availability_status", query.availability);
    if (ownershipIdFilter) next = next.in("id", ownershipIdFilter);
    if (ownershipExcludeIds) next = next.not("id", "in", `(${ownershipExcludeIds.join(",")})`);
    return next;
  }

  const from = (page - 1) * pageSize;
  let data: PlayerRow[];
  let count: number;

  if (query.sort === "points" || query.sort === "club") {
    // Neither points nor club name is orderable with a single `.order()`
    // call: points aren't a column on `players` at all (aggregated from
    // `fantasy_player_scores`), and club short name is a column on a
    // JOINED table -- PostgREST does not order the outer `players` rows
    // by an embedded to-one relation's column (confirmed live: it
    // silently no-ops and returns rows in the table's default order,
    // the same gotcha `getPlayerRecentMatches`'s own comment documents
    // for a different embedded-relation case). Both cases need the same
    // fix: fetch every filtered candidate's id/name/club_id (paged past
    // the project's max_rows cap via `fetchAllRows` -- a single unlimited
    // `.select()` here previously silently truncated to 1000 of 2767
    // active players, the exact points-sort bug this comment replaces),
    // compute the real sort key in JS, sort+paginate, then fetch the full
    // rows for just that page's ids.
    const idRows = await fetchAllRows<{ id: string; name: string; club_id: string }>((from, to) =>
      applyCommonFilters(supabase.from("players").select("id, name, club_id").eq("active", true))
        .order("id", { ascending: true })
        .range(from, to)
    );

    count = idRows.length;
    if (count === 0) return { players: [], total: 0, page, pageSize };

    let sortedIds: string[];
    if (query.sort === "points") {
      const scoresByCandidateId = await getFantasyScoreAggregates(supabase);
      sortedIds = [...idRows]
        .sort((a, b) => {
          const pointsA = scoresByCandidateId.get(a.id)?.totalPoints ?? 0;
          const pointsB = scoresByCandidateId.get(b.id)?.totalPoints ?? 0;
          if (pointsB !== pointsA) return pointsB - pointsA;
          return a.name.localeCompare(b.name);
        })
        .map((r) => r.id);
    } else {
      const clubShortNameById = await getAllClubShortNames(supabase);
      sortedIds = [...idRows]
        .sort((a, b) => {
          const clubA = clubShortNameById.get(a.club_id) ?? "";
          const clubB = clubShortNameById.get(b.club_id) ?? "";
          const clubCompare = clubA.localeCompare(clubB);
          if (clubCompare !== 0) return clubCompare;
          return a.name.localeCompare(b.name);
        })
        .map((r) => r.id);
    }

    const pageIds = sortedIds.slice(from, from + pageSize);
    if (pageIds.length === 0) return { players: [], total: count, page, pageSize };

    const { data: pageRows, error: pageError } = await supabase
      .from("players")
      .select(
        "id, name, position, shirt_number, nationality, availability_status, club_id, clubs(id, name, short_name, competition_id, competitions(code))"
      )
      .in("id", pageIds);
    if (pageError || !pageRows) return empty;

    const rowById = new Map(pageRows.map((row) => [row.id, row]));
    data = pageIds.map((id) => rowById.get(id)).filter((row): row is PlayerRow => Boolean(row));
  } else {
    let builder = applyCommonFilters(
      supabase
        .from("players")
        .select(
          "id, name, position, shirt_number, nationality, availability_status, club_id, clubs(id, name, short_name, competition_id, competitions(code))",
          { count: "exact" }
        )
        .eq("active", true)
    );

    builder = builder.order("name", { ascending: query.sortDirection !== "desc" });
    builder = builder.range(from, from + pageSize - 1);

    const result = await builder;
    if (result.error || !result.data) return empty;
    data = result.data;
    count = result.count ?? result.data.length;
  }

  const playerIds = data.map((row) => row.id);

  const [usageByPlayerId, nextFixtureByPlayerId, scoresByPlayerId] = await Promise.all([
    getUsageAggregates(supabase, playerIds),
    getNextFixtureByPlayer(supabase, playerIds),
    getFantasyScoreAggregates(supabase, playerIds),
  ]);

  const players: Player[] = data.map((row) => {
    const club = row.clubs;
    const competitionCode = club?.competitions?.code ?? null;
    const usage = usageByPlayerId.get(row.id);
    const nextFixtureInfo = nextFixtureByPlayerId.get(row.id);
    const nextFixture: PlayerFixture | undefined = nextFixtureInfo
      ? {
          opponent: nextFixtureInfo.opponentLabel,
          isHome: nextFixtureInfo.isHome,
          kickoff: nextFixtureInfo.kickoffAt.toISOString(),
          state: FIXTURE_STATUS_TO_MATCH_STATE[nextFixtureInfo.status] ?? "upcoming",
          homeLabel: nextFixtureInfo.homeLabel,
          awayLabel: nextFixtureInfo.awayLabel,
        }
      : undefined;
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
 * Cumulative current-season fantasy points per player (current `SCORING_RULE_VERSION`)
 * (Pass 9). `fantasy_player_scores` doesn't store a season column itself —
 * scoped to the current season via its `fixtures!inner(season)` join
 * rather than assuming every stored score is automatically current, so
 * this stays correct once a future season's scores coexist with 2026's.
 */
/**
 * `playerIds` omitted means "every scored player this season" -- used by
 * `getPlayerDatabase`'s points-sort path, which needs the complete
 * picture to sort correctly anyway (see that call site's own comment).
 * Deliberately NOT implemented as "pass all 2767 active player ids
 * through `.in()`": a filter list that long risks the request URL itself
 * exceeding normal proxy/server limits, on top of still needing
 * `fetchAllRows` pagination for the response. Fetching the whole
 * season's `fantasy_player_scores` table instead (paginated past the
 * project's max_rows cap, same as the id-candidate query above) avoids
 * both problems at once -- it's a bounded ~11.5k rows this season, not
 * proportional to the active-player count. Callers with a small, already-
 * known id list (the normal per-page enrichment path) keep the cheaper
 * `.in()`-filtered query, well under both the URL-length and row-count
 * concerns.
 */
async function getFantasyScoreAggregates(
  supabase: SupabaseClientType,
  playerIds?: string[]
): Promise<Map<string, { totalPoints: number; averagePoints: number }>> {
  const result = new Map<string, { totalPoints: number; averagePoints: number }>();
  if (playerIds && playerIds.length === 0) return result;

  const data = playerIds
    ? (
        await supabase
          .from("fantasy_player_scores")
          .select("player_id, points, fixtures!inner(season)")
          .eq("scoring_rule_version", SCORING_RULE_VERSION)
          .eq("fixtures.season", CURRENT_SEASON)
          .in("player_id", playerIds)
      ).data
    : await fetchAllRows<{ player_id: string; points: number }>((from, to) =>
        supabase
          .from("fantasy_player_scores")
          .select("id, player_id, points, fixtures!inner(season)")
          .eq("scoring_rule_version", SCORING_RULE_VERSION)
          .eq("fixtures.season", CURRENT_SEASON)
          .order("id", { ascending: true })
          .range(from, to)
      );

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

/** Every club's short name, id-keyed -- used by the club-sort path, which needs ALL of them (not just a page's worth) to compute a real sort key. A small table (~200 rows) but paginated via `fetchAllRows` anyway so this never silently breaks if it grows past max_rows. */
async function getAllClubShortNames(supabase: SupabaseClientType): Promise<Map<string, string>> {
  const rows = await fetchAllRows<{ id: string; short_name: string }>((from, to) =>
    supabase.from("clubs").select("id, short_name").order("id", { ascending: true }).range(from, to)
  );
  return new Map(rows.map((c) => [c.id, c.short_name]));
}

async function getClubShortNames(supabase: SupabaseClientType, clubIds: string[]): Promise<Map<string, string>> {
  if (clubIds.length === 0) return new Map();
  const { data } = await supabase.from("clubs").select("id, short_name").in("id", clubIds);
  return new Map((data ?? []).map((c) => [c.id, c.short_name]));
}

/** One player's current-version (`SCORING_RULE_VERSION`) points for a specific set of fixtures, keyed by fixture id. Missing from the map means not yet scored — the caller renders that as `null`, never 0. */
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
  const supabase = await resolveClient();
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
  const supabase = await resolveClient();
  // Pass 14: national teams now live in `clubs` too (fixture participants
  // only) -- excluded here so "France"/"Germany" never show up as a
  // selectable "club" filter on a page that means real, draftable clubs.
  let builder = supabase
    .from("clubs")
    .select("id, name, short_name, competition_id")
    .eq("is_national_team", false)
    .order("name", { ascending: true });
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
  /** Current-version (SCORING_RULE_VERSION) points for this specific match, or `null` if not yet scored (e.g. scoring hasn't been backfilled for this fixture) — never fabricated as 0. */
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
  const supabase = await resolveClient();

  const teamIdsByPlayer = await getTeamIdsByPlayer(supabase, [playerId]);
  const teamIds = new Set(teamIdsByPlayer.get(playerId) ?? []);
  if (teamIds.size === 0) return [];

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
  // Pass 14: which side the player actually played for in each fixture is
  // "home_club_id/away_club_id is one of their team ids (club OR national
  // team)" -- was `=== player.club_id` alone, which is wrong for an
  // international fixture (neither side is the player's permanent club).
  const opponentClubIds = rows.map((row) =>
    teamIds.has(row.fixtures!.home_club_id) ? row.fixtures!.away_club_id : row.fixtures!.home_club_id
  );
  const fixtureIds = rows.map((row) => row.fixtures!.id);
  const [clubShortNames, pointsByFixtureId] = await Promise.all([
    getClubShortNames(supabase, Array.from(new Set(opponentClubIds))),
    getScoresByFixtureId(supabase, playerId, fixtureIds),
  ]);

  return rows.map((row) => {
    const fixture = row.fixtures!;
    const isHome = teamIds.has(fixture.home_club_id);
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

export interface PlayerScoreBreakdown {
  fixtureId: string;
  opponent: string;
  isHome: boolean;
  kickoffAt: string;
  total: number;
  /** `FantasyScoreBreakdown.components` (src/domain/fantasy/scoring.ts), stored verbatim as jsonb at scoring time — read back exactly as computed, never recomputed in the UI layer. */
  components: Record<string, number>;
}

/**
 * Pass 12C: the player's most recently scored match's full breakdown —
 * powers the Player Inspector's modest new Scoring Breakdown panel
 * (brief: "do not make the UI reverse-engineer a score; backend scoring
 * remains authoritative"). `null` means this player has no CURRENT
 * (`SCORING_RULE_VERSION`) scored performance yet. Fetches every scored
 * row for this player rather than filtering fixtures server-side first —
 * a full season's appearances is well under 100 rows, and this avoids the
 * same "PostgREST can't order outer rows by an embedded relation's
 * column" gotcha `getPlayerRecentMatches` already documents, by sorting
 * in JS instead.
 */
export async function getPlayerLatestScoreBreakdown(playerId: string): Promise<PlayerScoreBreakdown | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await resolveClient();

  const teamIdsByPlayer = await getTeamIdsByPlayer(supabase, [playerId]);
  const teamIds = new Set(teamIdsByPlayer.get(playerId) ?? []);
  if (teamIds.size === 0) return null;

  const { data } = await supabase
    .from("fantasy_player_scores")
    .select("fixture_id, points, breakdown, fixtures(kickoff_at, home_club_id, away_club_id)")
    .eq("player_id", playerId)
    .eq("scoring_rule_version", SCORING_RULE_VERSION);

  const rows = (data ?? []).filter((row) => row.fixtures);
  if (rows.length === 0) return null;

  const latest = rows.sort((a, b) => new Date(b.fixtures!.kickoff_at).getTime() - new Date(a.fixtures!.kickoff_at).getTime())[0];
  const fixture = latest.fixtures!;
  // Pass 14: see getPlayerRecentMatches's identical comment above.
  const isHome = teamIds.has(fixture.home_club_id);
  const opponentId = isHome ? fixture.away_club_id : fixture.home_club_id;
  const clubShortNames = await getClubShortNames(supabase, [opponentId]);

  return {
    fixtureId: latest.fixture_id,
    opponent: clubShortNames.get(opponentId) ?? "—",
    isHome,
    kickoffAt: fixture.kickoff_at,
    total: latest.points,
    components: (latest.breakdown as Record<string, number> | null) ?? {},
  };
}
