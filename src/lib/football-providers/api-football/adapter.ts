/**
 * Pure transforms: raw API-Football response items -> normalized,
 * provider-independent contracts (`src/lib/football-providers/types.ts`).
 * No network calls, no side effects — every function here is a plain
 * `rawItem -> Normalized*` mapping, which is what makes them directly
 * testable against static fixture JSON (see `__fixtures__/` and
 * `adapter.test.ts`).
 */

import type { BigFiveCompetitionConfig } from "@/lib/football-providers/api-football/big-five-competitions";
import type {
  ApiFootballFixtureItem,
  ApiFootballFixturePlayersItem,
  ApiFootballLeagueItem,
  ApiFootballPlayerItem,
  ApiFootballSeason,
  ApiFootballTeamItem,
} from "@/lib/football-providers/api-football/types";
import type {
  NormalizedClub,
  NormalizedCompetition,
  NormalizedFixture,
  NormalizedFixturePlayerStats,
  NormalizedPlayer,
  ProviderCoverage,
} from "@/lib/football-providers/types";
import type { FixtureStatus, PlayerPosition } from "@/domain/football/types";

const POSITION_MAP: Record<string, PlayerPosition> = {
  Goalkeeper: "GK",
  Defender: "DEF",
  Midfielder: "MID",
  Attacker: "FWD",
};

/** `undefined` when API-Football reports a position Eleven doesn't have a mapping for — callers should skip the player rather than guess. */
export function mapPosition(rawPosition: string | null | undefined): PlayerPosition | undefined {
  if (!rawPosition) return undefined;
  return POSITION_MAP[rawPosition];
}

const FIXTURE_STATUS_MAP: Record<string, FixtureStatus> = {
  TBD: "scheduled",
  NS: "scheduled",
  "1H": "live",
  "2H": "live",
  ET: "live",
  P: "live",
  LIVE: "live",
  BT: "live",
  HT: "ht",
  FT: "final",
  AET: "final",
  PEN: "final",
  AWD: "final",
  WO: "final",
  PST: "postponed",
  CANC: "postponed",
  SUSP: "postponed",
  INT: "postponed",
  ABD: "postponed",
};

/** Falls back to "scheduled" for any status short code Eleven doesn't recognize yet, rather than throwing — new codes shouldn't break ingestion. */
export function mapFixtureStatus(shortStatus: string): FixtureStatus {
  return FIXTURE_STATUS_MAP[shortStatus] ?? "scheduled";
}

/**
 * Takes the matching Big Five config alongside the raw item rather than
 * guessing Eleven's competition `code` from provider fields — the config
 * is the source of truth for that mapping (see
 * `big-five-competitions.ts`).
 */
export function normalizeCompetition(
  item: ApiFootballLeagueItem,
  config: BigFiveCompetitionConfig
): NormalizedCompetition {
  const season =
    item.seasons.find((s) => s.current) ?? item.seasons.find((s) => s.year === config.providerSeason);

  return {
    externalId: String(item.league.id),
    name: item.league.name,
    code: config.code,
    country: item.country.name,
    season: season?.year,
  };
}

export function normalizeClub(item: ApiFootballTeamItem, competitionExternalId: string): NormalizedClub {
  const shortName = item.team.code ?? item.team.name.slice(0, 3).toUpperCase();
  return {
    externalId: String(item.team.id),
    competitionExternalId,
    name: item.team.name,
    shortName,
    code: shortName,
  };
}

/**
 * Returns `null` (rather than a partially-guessed player) when the
 * provider's position string doesn't map to one Eleven understands, or
 * when the player has no statistics entry for the requested team at all
 * — an ingestion service should skip these, not invent data.
 */
export function normalizePlayer(
  item: ApiFootballPlayerItem,
  clubExternalId: string,
  competitionExternalId: string
): NormalizedPlayer | null {
  const stats = item.statistics.find((s) => String(s.team.id) === clubExternalId) ?? item.statistics[0];
  const position = mapPosition(stats?.games.position);
  if (!position) return null;

  return {
    externalId: String(item.player.id),
    clubExternalId,
    competitionExternalId,
    name: item.player.name,
    shortName: item.player.lastname ?? item.player.name,
    position,
    shirtNumber: stats?.games.number ?? undefined,
    nationality: item.player.nationality ?? undefined,
    active: true,
  };
}

export function normalizeFixture(item: ApiFootballFixtureItem): NormalizedFixture {
  return {
    externalId: String(item.fixture.id),
    competitionExternalId: String(item.league.id),
    homeClubExternalId: String(item.teams.home.id),
    awayClubExternalId: String(item.teams.away.id),
    kickoffAt: new Date(item.fixture.date).toISOString(),
    status: mapFixtureStatus(item.fixture.status.short),
  };
}

/**
 * Flattens `/fixtures/players`' per-team grouping into one normalized row
 * per player. `NormalizedFixturePlayerStats` intentionally only carries
 * the fields `player_match_stats` has columns for — the raw endpoint
 * returns considerably more (rating, passes, duels, dribbles, fouls,
 * penalties); see docs/football-data-system.md "Stats deliberately not
 * modeled" for why those stop here rather than being persisted.
 *
 * `chancesCreated` is mapped from the provider's "key passes" — the
 * closest available proxy for Eleven's chances-created stat; not a
 * provider field named identically.
 */
export function normalizeFixturePlayerStats(
  teams: ApiFootballFixturePlayersItem[],
  fixtureExternalId: string
): NormalizedFixturePlayerStats[] {
  const rows: NormalizedFixturePlayerStats[] = [];

  for (const team of teams) {
    for (const entry of team.players) {
      const stats = entry.statistics[0];
      if (!stats) continue;

      rows.push({
        fixtureExternalId,
        playerExternalId: String(entry.player.id),
        minutes: stats.games.minutes ?? 0,
        started: !stats.games.substitute,
        goals: stats.goals.total ?? 0,
        assists: stats.goals.assists ?? 0,
        shotsOnTarget: stats.shots.on ?? 0,
        chancesCreated: stats.passes.key ?? 0,
        tackles: stats.tackles.total ?? 0,
        interceptions: stats.tackles.interceptions ?? 0,
        blocks: stats.tackles.blocks ?? 0,
        saves: stats.goals.saves ?? 0,
        yellowCards: stats.cards.yellow,
        redCards: stats.cards.red,
      });
    }
  }

  return rows;
}

export function normalizeCoverage(season: ApiFootballSeason): ProviderCoverage {
  return {
    fixtures: season.coverage.fixtures.statistics_fixtures,
    events: season.coverage.fixtures.events,
    lineups: season.coverage.fixtures.lineups,
    playerStatistics: season.coverage.fixtures.statistics_players,
    injuries: season.coverage.injuries,
    standings: season.coverage.standings,
  };
}
