import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { bigFiveLeagueFromCompetitionCode } from "@/lib/leagues";
import type { Player, PlayerFixture, PlayerMatchState, PlayerPosition } from "@/lib/types/fantasy";

const DEFAULT_PAGE_SIZE = 50;

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
 * Deliberately does not compute fantasy points/form/recentForm — those
 * depend on the scoring engine (Pass 9), which doesn't exist yet. MIN and
 * STARTS come from real `player_match_stats` aggregates; ownership comes
 * from real `league_player_ownership` rows when `activeLeagueId` is given.
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
  let ownedPlayerIds: Set<string> | null = null;
  if (query.activeLeagueId) {
    const { data: ownership } = await supabase
      .from("league_player_ownership")
      .select("player_id")
      .eq("league_id", query.activeLeagueId);
    ownedPlayerIds = new Set((ownership ?? []).map((o) => o.player_id));
  }

  let builder = supabase
    .from("players")
    .select(
      "id, name, position, shirt_number, availability_status, club_id, clubs(id, name, short_name, competition_id, competitions(code))",
      { count: "exact" }
    )
    .eq("active", true);

  if (query.query?.trim()) builder = builder.ilike("name", `%${query.query.trim()}%`);
  if (query.position) builder = builder.eq("position", query.position);
  if (query.competitionId) builder = builder.eq("competition_id", query.competitionId);
  if (query.clubId) builder = builder.eq("club_id", query.clubId);
  if (query.availability) builder = builder.eq("availability_status", query.availability);
  if (ownedPlayerIds) {
    const ids = Array.from(ownedPlayerIds);
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

  const [usageByPlayerId, nextFixtureByClubId] = await Promise.all([
    getUsageAggregates(supabase, playerIds),
    getNextFixtureByClub(supabase, clubIds),
  ]);

  const players: Player[] = data.map((row) => {
    const club = row.clubs;
    const competitionCode = club?.competitions?.code ?? null;
    const usage = usageByPlayerId.get(row.id);
    const nextFixture = club ? nextFixtureByClubId.get(club.id) : undefined;

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
      fantasyPoints: 0,
      availability: (row.availability_status as Player["availability"]) ?? "available",
      fixture: nextFixture,
      seasonStats: usage,
      ownership: ownedPlayerIds ? (ownedPlayerIds.has(row.id) ? "owned" : "free") : undefined,
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
  shortName: string;
  competitionId: string;
}

/** Real ingested clubs, optionally scoped to one competition. `[]` until `sync clubs` has run for that scope. */
export async function getClubFilters(competitionId?: string): Promise<ClubFilterOption[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  let builder = supabase.from("clubs").select("id, short_name, competition_id").order("short_name", { ascending: true });
  if (competitionId) builder = builder.eq("competition_id", competitionId);
  const { data } = await builder;
  return (data ?? []).map((c) => ({ id: c.id, shortName: c.short_name, competitionId: c.competition_id }));
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
}

/** A player's most recent completed matches, most recent first — powers the inspector's usage trend (see src/lib/selectors/usage-trend.ts). `[]` means INSUFFICIENT MATCH DATA. */
export async function getPlayerRecentMatches(playerId: string, limit = 5): Promise<RecentMatchRow[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();

  const { data: player } = await supabase.from("players").select("club_id").eq("id", playerId).maybeSingle();
  if (!player) return [];

  const { data, error } = await supabase
    .from("player_match_stats")
    .select(
      "minutes, started, goals, assists, fixtures(id, kickoff_at, home_club_id, away_club_id, status)"
    )
    .eq("player_id", playerId)
    .order("kickoff_at", { referencedTable: "fixtures", ascending: false })
    .limit(limit);

  if (error || !data) return [];

  const rows = data.filter((row) => row.fixtures);
  const opponentClubIds = rows.map((row) =>
    row.fixtures!.home_club_id === player.club_id ? row.fixtures!.away_club_id : row.fixtures!.home_club_id
  );
  const clubShortNames = await getClubShortNames(supabase, Array.from(new Set(opponentClubIds)));

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
      goals: row.goals,
      assists: row.assists,
    };
  });
}
