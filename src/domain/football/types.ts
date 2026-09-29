/**
 * Canonical REAL FOOTBALL domain.
 *
 * These are entities as they exist in the real world, independent of any
 * single fantasy league — a `Player` here has no concept of who owns them
 * in fantasy terms. See docs/domain-model.md for the full picture and the
 * reasoning behind keeping this separate from `@/domain/fantasy`.
 *
 * Timestamp convention: every timestamp in the domain layer is an ISO 8601
 * string in UTC, e.g. "2026-10-04T11:15:00.000Z". This matches what the
 * existing UI mock data already does and is the wire format Postgres/
 * Supabase will use — see docs/architecture.md.
 *
 * Status: these types are not yet wired into the UI. The current screens
 * run on the view-model types in `@/lib/types/fantasy`. This module is the
 * target shape for the Postgres schema and the ingestion pipeline built in
 * a later pass.
 */

export type PlayerPosition = "GK" | "DEF" | "MID" | "FWD";

export type FixtureStatus = "scheduled" | "live" | "ht" | "final" | "postponed";

export type AvailabilityStatus = "available" | "doubtful" | "injured" | "suspended";

export interface Competition {
  id: string;
  name: string;
  /** Short competition code, e.g. "ENG", "ESP". */
  code: string;
  country: string;
}

export interface Club {
  id: string;
  competitionId: string;
  name: string;
  shortName: string;
  /** 3-letter code, e.g. "ARS". */
  code: string;
}

export interface Player {
  id: string;
  clubId: string;
  competitionId: string;
  name: string;
  shortName: string;
  position: PlayerPosition;
  shirtNumber?: number;
  nationality?: string;
  /** Whether the player is currently part of an active squad (not retired/released). */
  active: boolean;
  availabilityStatus?: AvailabilityStatus;
}

export interface Fixture {
  id: string;
  competitionId: string;
  homeClubId: string;
  awayClubId: string;
  kickoffAt: string;
  status: FixtureStatus;
}

/**
 * Raw, unweighted match statistics for one player in one fixture.
 *
 * IMPORTANT: this does NOT contain Eleven fantasy points. Scoring is
 * derived separately from these numbers — see `@/domain/fantasy`'s
 * `ScoringRule`/`FantasyPlayerScore` and docs/data-flow.md "Real stats →
 * Eleven scoring". Never trust a provider's own fantasy-points field as
 * canonical Eleven scoring.
 */
export interface PlayerMatchStats {
  id: string;
  playerId: string;
  fixtureId: string;
  minutes: number;
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
  /** Only meaningful for GK/DEF; omitted otherwise. */
  cleanSheet?: boolean;
}

/**
 * A football data provider Eleven ingests from. Kept as an open string
 * rather than a strict union — provider identity is a config/ops concern,
 * not something the domain layer should hard-code and need redeploys for.
 */
export type DataProvider = string;

/**
 * Maps one football-data provider's external identifier to one of
 * Eleven's own canonical entities. Provider IDs are never used as
 * canonical IDs directly (invariant #9, docs/domain-model.md) — this is
 * the only place a provider's ID format is allowed to appear at all,
 * which is what lets Eleven switch providers without touching the rest
 * of the application.
 */
export interface ProviderMapping {
  internalEntityType: "competition" | "club" | "player" | "fixture";
  internalEntityId: string;
  provider: DataProvider;
  externalId: string;
}
