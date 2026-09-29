/**
 * Canonical FANTASY domain — Eleven-specific entities layered on top of the
 * real football domain (`@/domain/football`). See docs/domain-model.md for
 * the entity-relationship diagram and docs/data-flow.md for how these get
 * created and mutated.
 *
 * Core separation this module exists to enforce: a football `Player` never
 * carries a global fantasy owner. Ownership is contextual to one
 * `FantasyLeague` — see `LeaguePlayerOwnership` below and invariants #1/#2
 * in docs/domain-model.md.
 *
 * Timestamp convention: ISO 8601 strings in UTC throughout, same as the
 * football domain.
 *
 * Status: not yet wired into the UI — see the note at the top of
 * `@/domain/football/types`.
 */

import type { PlayerPosition } from "@/domain/football/types";

// ---------------------------------------------------------------------------
// Users & leagues
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  displayName: string;
  email: string;
  createdAt: string;
}

export type LeagueStatus = "draft" | "active" | "completed" | "archived";

export type DraftType = "snake";

/**
 * "faab" (free-agent acquisition budget) is reserved for later — Eleven has
 * no budgets/prices today, so only priority waivers are actually usable,
 * but the union exists so `LeagueSettings` doesn't need a breaking change
 * when budgeted waivers are added.
 */
export type WaiverMode = "priority" | "faab";

export interface LeagueSettings {
  maxTeams: number;
  squadSize: number;
  starterCount: number;
  waiverMode: WaiverMode;
  tradeDeadline?: string;
  playoffEnabled: boolean;
  draftType: DraftType;
  pickTimerSeconds: number;
}

export interface FantasyLeague {
  id: string;
  name: string;
  inviteCode?: string;
  status: LeagueStatus;
  createdByUserId: string;
  createdAt: string;
  settings: LeagueSettings;
}

export type LeagueRole = "manager" | "commissioner";

export interface LeagueMembership {
  leagueId: string;
  userId: string;
  role: LeagueRole;
  joinedAt: string;
}

// ---------------------------------------------------------------------------
// Teams & rosters
// ---------------------------------------------------------------------------

export interface FantasyTeam {
  id: string;
  leagueId: string;
  ownerUserId: string;
  name: string;
  abbreviation: string;
  createdAt: string;
}

export type RosterAcquisitionType = "draft" | "waiver" | "free_agent" | "trade";

export type RosterEntryStatus = "active" | "dropped";

export interface RosterEntry {
  id: string;
  leagueId: string;
  fantasyTeamId: string;
  /** References `@/domain/football/types`' `Player.id` — never duplicated here. */
  playerId: string;
  acquisitionType: RosterAcquisitionType;
  acquiredAt: string;
  status: RosterEntryStatus;
}

export type LineupSlotPosition = PlayerPosition | "BENCH";

export interface LineupSlot {
  rosterEntryId: string;
  fantasyRoundId: string;
  slot: LineupSlotPosition;
  starter: boolean;
  /**
   * Set the moment this specific player's real-world fixture kicks off.
   * Eleven uses player-level locking, not one global weekly lock — see
   * "Player locking" in docs/domain-model.md.
   */
  lockedAt?: string;
}

/**
 * The single source of truth for "who owns this player, in this league."
 * A `Player` itself never stores this — see the module doc comment above
 * and invariants #1–#3 in docs/domain-model.md. The future Postgres schema
 * enforces `UNIQUE (leagueId, playerId)` on this table.
 */
export interface LeaguePlayerOwnership {
  leagueId: string;
  playerId: string;
  fantasyTeamId: string;
  rosterEntryId: string;
}

// ---------------------------------------------------------------------------
// Rounds & matchups
// ---------------------------------------------------------------------------

export type FantasyRoundStatus = "upcoming" | "in_progress" | "completed";

/**
 * An Eleven-defined date window — NOT the same thing as an official
 * Premier League/La Liga/etc. gameweek number. Two leagues can run
 * different round calendars over the same real fixtures.
 */
export interface FantasyRound {
  id: string;
  leagueId: string;
  number: number;
  startsAt: string;
  endsAt: string;
  status: FantasyRoundStatus;
}

export type MatchupStatus = "scheduled" | "live" | "final";

export interface Matchup {
  id: string;
  leagueId: string;
  fantasyRoundId: string;
  homeFantasyTeamId: string;
  awayFantasyTeamId: string;
  status: MatchupStatus;
}

export interface MatchupScore {
  matchupId: string;
  fantasyTeamId: string;
  livePoints: number;
  /** Derived/optional — never canonical domain truth. See "Projections" in docs/domain-model.md. */
  projectedPoints?: number;
  finalPoints?: number;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Draft
// ---------------------------------------------------------------------------

export type DraftStatus = "scheduled" | "in_progress" | "completed";

export interface Draft {
  id: string;
  leagueId: string;
  status: DraftStatus;
  type: DraftType;
  currentRound: number;
  currentPick: number;
  startedAt?: string;
  completedAt?: string;
}

export interface DraftOrder {
  draftId: string;
  fantasyTeamId: string;
  /** 1-indexed position in round 1; snake order reverses each subsequent round. */
  position: number;
}

export interface DraftPick {
  id: string;
  draftId: string;
  round: number;
  pickNumber: number;
  fantasyTeamId: string;
  playerId: string;
  pickedAt: string;
}

// ---------------------------------------------------------------------------
// Waivers
// ---------------------------------------------------------------------------

export type WaiverStatus = "pending" | "won" | "lost" | "cancelled";

export interface WaiverClaim {
  id: string;
  leagueId: string;
  fantasyTeamId: string;
  targetPlayerId: string;
  dropPlayerId?: string;
  priority: number;
  status: WaiverStatus;
  submittedAt: string;
  processedAt?: string;
}

// ---------------------------------------------------------------------------
// Trades
// ---------------------------------------------------------------------------

export type TradeStatus =
  | "draft"
  | "pending"
  | "accepted"
  | "rejected"
  | "countered"
  | "cancelled"
  | "expired"
  | "completed";

export interface Trade {
  id: string;
  leagueId: string;
  proposingTeamId: string;
  receivingTeamId: string;
  status: TradeStatus;
  createdAt: string;
  expiresAt?: string;
  acceptedAt?: string;
  completedAt?: string;
}

/**
 * One player moving from one side of a trade to the other. A `Trade` has
 * many `TradeAsset`s, which is what lets a single trade express 1-for-1,
 * 2-for-1, 2-for-2, etc. rather than assuming a fixed shape.
 */
export interface TradeAsset {
  id: string;
  tradeId: string;
  fromTeamId: string;
  toTeamId: string;
  playerId: string;
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export type TransactionType =
  | "draft_pick"
  | "free_agent_add"
  | "waiver_add"
  | "drop"
  | "trade"
  | "commissioner_move";

/**
 * A generic, auditable record of any roster-affecting action. Every
 * ownership change (draft pick, waiver, trade, commissioner override)
 * should eventually produce one of these — see invariant #6.
 */
export interface Transaction {
  id: string;
  leagueId: string;
  type: TransactionType;
  actorUserId?: string;
  fantasyTeamId?: string;
  createdAt: string;
  /** Free-form pointer back to the source record, e.g. a trade or draft-pick id. */
  reference?: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/** The raw stats Eleven's scoring formula is allowed to weight. */
export type ScoringStat =
  | "goals"
  | "assists"
  | "shotsOnTarget"
  | "chancesCreated"
  | "tackles"
  | "interceptions"
  | "blocks"
  | "saves"
  | "cleanSheet"
  | "yellowCards"
  | "redCards"
  | "minutesPlayed";

/**
 * One weighted line in Eleven's scoring formula. Backend-owned — the
 * frontend never computes fantasy points itself. See docs/data-flow.md
 * "Real stats → Eleven scoring".
 */
export interface ScoringRule {
  stat: ScoringStat;
  multiplier: number;
  /** Optional per-position weight override, e.g. clean sheets score more for a GK than a MID. */
  positionModifier?: Partial<Record<PlayerPosition, number>>;
}

/**
 * The result of applying every relevant `ScoringRule` to one player's
 * `PlayerMatchStats` for one fixture. This — not anything a provider
 * supplies — is Eleven's canonical fantasy score for that player/fixture.
 */
export interface FantasyPlayerScore {
  playerId: string;
  fixtureId: string;
  fantasyRoundId: string;
  points: number;
  breakdown: Partial<Record<ScoringStat, number>>;
  calculatedAt: string;
}
