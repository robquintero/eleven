/**
 * Pure transforms: raw API-Football response items -> normalized,
 * provider-independent contracts (`src/lib/football-providers/types.ts`).
 * No network calls, no side effects — every function here is a plain
 * `rawItem -> Normalized*` mapping, which is what makes them directly
 * testable against static fixture JSON (see `__fixtures__/` and
 * `adapter.test.ts`).
 */

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
  // "Forward" is a real, distinct label API-Football uses on some
  // per-competition statistics entries (discovered live: Raphinha's
  // Spanish Super Cup entry reports "Forward" while his same-season
  // La Liga/UCL entries for the same club report "Attacker") — same
  // outfield-striker position, different string. See docs/football-data-system.md
  // "Player universe integrity" for the full story.
  Forward: "FWD",
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
 * Takes the matching competition config alongside the raw item rather
 * than guessing Eleven's competition `code` from provider fields — the
 * config is the source of truth for that mapping. Deliberately typed to
 * the minimal shape this function needs (not `BigFiveCompetitionConfig`)
 * so it works for any configured competition, Big Five or UEFA — see
 * `src/lib/football-ingestion/types.ts`'s `CompetitionSyncTarget` doc
 * comment for why the two config types stay separate.
 */
export function normalizeCompetition(
  item: ApiFootballLeagueItem,
  config: { code: string; providerSeason: number }
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
    isNationalTeam: item.team.national === true,
  };
}

/**
 * `item.statistics` has ONE ENTRY PER COMPETITION the player appeared in
 * for a team, not one entry per team (see `ApiFootballPlayerItem`'s doc
 * comment) — so picking "the" entry for `clubExternalId` needs a
 * preference order, not just the first array match:
 *
 *   1. the entry for the exact competition being synced (most accurate
 *      shirt number/position for that context)
 *   2. any entry for this club with a position Eleven recognizes
 *      (guards against a domestic-cup entry reporting an unrecognized
 *      label like "Forward" while the league entry for the same
 *      club/season reports the recognized "Attacker" — discovered live
 *      via Raphinha at Barcelona, whose Spanish Super Cup entry happened
 *      to sort first)
 *   3. any entry for this club at all
 *
 * Returns `null` when the player has no statistics entry for the
 * requested club at all, or when none of that club's entries has a
 * position Eleven understands — an ingestion service should skip that
 * player rather than guess from an unrelated club's entry or invent a
 * position.
 */
export function normalizePlayer(
  item: ApiFootballPlayerItem,
  clubExternalId: string,
  competitionExternalId: string
): NormalizedPlayer | null {
  const clubStats = item.statistics.filter((s) => String(s.team.id) === clubExternalId);
  const stats =
    clubStats.find((s) => String(s.league.id) === competitionExternalId) ??
    clubStats.find((s) => mapPosition(s.games.position) !== undefined) ??
    clubStats[0];
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
    round: item.league.round,
    homeScore: item.goals.home ?? undefined,
    awayScore: item.goals.away ?? undefined,
  };
}

/**
 * Flattens `/fixtures/players`' per-team grouping into one normalized row
 * per player. Legacy columns remain zero-coalesced for V1-V3. V4 also
 * preserves nullable reported counts and fixture-team provenance.
 * The earlier implementation only carried
 * the fields `player_match_stats` has columns for — the raw endpoint
 * returns considerably more (rating, passes, duels, dribbles, fouls,
 * penalties). V4 now preserves the useful nullable counts; ratings
 * remain unscored. See docs/scoring-model-v4.md for the coverage limits.
 *
 * `chancesCreated` is mapped from the provider's "key passes" — the
 * historical label for key passes; V4 calls it KEY PASSES, not a
 * provider field named identically.
 */
export function normalizeFixturePlayerStats(
  teams: ApiFootballFixturePlayersItem[],
  fixtureExternalId: string
): NormalizedFixturePlayerStats[] {
  const rows: NormalizedFixturePlayerStats[] = [];

  for (const team of teams) {
    for (const entry of team.players) {
      const stats = entry.statistics?.[0];
      if (!stats) continue;

      const numeric = (value: number | null | undefined): number | null =>
        typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
      const reportedStats = {
        minutes: numeric(stats.games?.minutes), goals: numeric(stats.goals?.total), assists: numeric(stats.goals?.assists),
        shots: numeric(stats.shots?.total), shotsOnTarget: numeric(stats.shots?.on), keyPasses: numeric(stats.passes?.key),
        tackles: numeric(stats.tackles?.total), interceptions: numeric(stats.tackles?.interceptions), blocks: numeric(stats.tackles?.blocks),
        saves: numeric(stats.goals?.saves), yellowCards: numeric(stats.cards?.yellow), redCards: numeric(stats.cards?.red),
        duelsTotal: numeric(stats.duels?.total), duelsWon: numeric(stats.duels?.won),
        successfulDribbles: numeric(stats.dribbles?.success), foulsDrawn: numeric(stats.fouls?.drawn), foulsCommitted: numeric(stats.fouls?.committed),
        penaltiesWon: numeric(stats.penalty?.won), penaltiesMissed: numeric(stats.penalty?.missed), penaltiesSaved: numeric(stats.penalty?.saved),
        goalsConceded: numeric(stats.goals?.conceded), passesTotal: numeric(stats.passes?.total),
        // Stored for evidence, never scored or converted to an accurate-pass count.
        passAccuracyRaw: stats.passes?.accuracy ?? null,
      };
      rows.push({
        fixtureExternalId, playerExternalId: String(entry.player.id), participationTeamExternalId: String(team.team.id), reportedStats,
        // Historical V1-V3 inputs retain their shipped zero-coalescing behavior.
        minutes: reportedStats.minutes ?? 0, started: !stats.games?.substitute,
        goals: reportedStats.goals ?? 0, assists: reportedStats.assists ?? 0,
        shotsOnTarget: reportedStats.shotsOnTarget ?? 0, chancesCreated: reportedStats.keyPasses ?? 0,
        tackles: reportedStats.tackles ?? 0, interceptions: reportedStats.interceptions ?? 0,
        blocks: reportedStats.blocks ?? 0, saves: reportedStats.saves ?? 0,
        yellowCards: reportedStats.yellowCards ?? 0, redCards: reportedStats.redCards ?? 0,
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
