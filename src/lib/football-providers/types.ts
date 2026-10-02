/**
 * Provider-independent contracts. Every football data provider adapter
 * (currently just `api-football/`) normalizes its own response shapes
 * into these — nothing outside `src/lib/football-providers/` should ever
 * see a raw provider JSON shape.
 *
 * IMPORTANT — these are NOT `src/domain/football` types:
 *   - `src/domain/football` types carry Eleven's own canonical `id`
 *     (a UUID, the Postgres primary key).
 *   - The `Normalized*` types below carry the provider's `externalId`
 *     untouched — they are the shape a future ingestion service (Pass 7B)
 *     reads, resolves through `provider_mappings` (one Eleven UUID per
 *     provider externalId — see docs/domain-model.md and
 *     supabase/migrations/20260929141127_football_foundation.sql), and
 *     only then writes into the `src/domain/football`-shaped Postgres
 *     tables.
 *
 * A `Normalized*` value must only ever contain fields Eleven's domain
 * model actually understands (see src/domain/football/types.ts) — never
 * pass through a provider-specific field "just in case."
 */

import type { AvailabilityStatus, FixtureStatus, PlayerPosition } from "@/domain/football/types";

export interface NormalizedCompetition {
  externalId: string;
  name: string;
  /** Eleven's own short code (e.g. "ENG") — comes from the Big Five config, not guessed from provider data. */
  code: string;
  country: string;
  /** Starting year of the season this data was normalized under, e.g. 2026 for the 2026-27 season. */
  season?: number;
}

export interface NormalizedClub {
  externalId: string;
  competitionExternalId: string;
  name: string;
  shortName: string;
  code: string;
}

export interface NormalizedPlayer {
  externalId: string;
  clubExternalId: string;
  competitionExternalId: string;
  name: string;
  shortName: string;
  position: PlayerPosition;
  shirtNumber?: number;
  nationality?: string;
  active: boolean;
  availabilityStatus?: AvailabilityStatus;
}

export interface NormalizedFixture {
  externalId: string;
  competitionExternalId: string;
  homeClubExternalId: string;
  awayClubExternalId: string;
  /** ISO 8601 UTC — see docs/domain-model.md "Timestamp convention." */
  kickoffAt: string;
  status: FixtureStatus;
  /** Provider round name, e.g. "Regular Season - 5" or "League Stage - 1" — not persisted to `fixtures` (no schema column), used only to filter qualifying rounds out of a sync before anything is written. See `syncFixtures`'s `roundFilter` option. */
  round: string;
  /** `undefined` before kickoff. Powers clean-sheet derivation at scoring time — see `fixtures.home_score`/`away_score`'s migration comment. */
  homeScore?: number;
  awayScore?: number;
}

/**
 * Foundation for future per-player-per-fixture stats ingestion (Pass 7C+).
 * Shape deliberately mirrors `src/domain/football/types.ts`'s
 * `PlayerMatchStats` minus the canonical id/fixtureId/playerId (those get
 * resolved at ingestion time, same as every other Normalized* type here).
 */
export interface NormalizedFixturePlayerStats {
  fixtureExternalId: string;
  playerExternalId: string;
  minutes: number;
  started: boolean;
  goals: number;
  assists: number;
  shotsOnTarget: number;
  chancesCreated: number;
  tackles: number;
  interceptions: number;
  blocks: number;
  saves: number;
  yellowCards: number;
  redCards: number;
  cleanSheet?: boolean;
}

/**
 * What a provider supports for one competition+season. Not every
 * league-season has the same data available — never assume otherwise.
 */
export interface ProviderCoverage {
  fixtures: boolean;
  events: boolean;
  lineups: boolean;
  playerStatistics: boolean;
  injuries: boolean;
  standings: boolean;
}

/**
 * Request budget as reported by the provider on its last response.
 * `undefined` fields mean the provider didn't report that figure on this
 * call, not that the budget is unlimited.
 */
export interface ProviderQuota {
  dailyLimit?: number;
  dailyRemaining?: number;
  minuteLimit?: number;
  minuteRemaining?: number;
}

export interface ProviderPagination {
  currentPage: number;
  totalPages: number;
}

/** Attached to every successful provider client call alongside its data. */
export interface ProviderResponseMeta {
  quota: ProviderQuota;
  pagination?: ProviderPagination;
}
