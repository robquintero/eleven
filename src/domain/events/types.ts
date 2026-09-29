/**
 * A lightweight product event model — NOT event sourcing, CQRS, or a
 * message bus. This exists so meaningful actions (a pick, a trade, a
 * lineup change) have one typed shape to log/notify/feed from, without
 * committing to any particular infrastructure. See docs/architecture.md.
 */

export type DomainEventType =
  | "LEAGUE_CREATED"
  | "TEAM_CREATED"
  | "DRAFT_STARTED"
  | "DRAFT_PICK_MADE"
  | "DRAFT_COMPLETED"
  | "LINEUP_UPDATED"
  | "PLAYER_LOCKED"
  | "WAIVER_SUBMITTED"
  | "WAIVER_RESOLVED"
  | "TRADE_PROPOSED"
  | "TRADE_ACCEPTED"
  | "TRADE_REJECTED"
  | "TRADE_COMPLETED"
  | "MATCHUP_STARTED"
  | "PLAYER_POINTS_UPDATED"
  | "MATCHUP_FINAL"
  | "ROUND_FINALIZED";

export interface DomainEvent<TPayload = Record<string, unknown>> {
  id: string;
  type: DomainEventType;
  leagueId?: string;
  actorUserId?: string;
  fantasyTeamId?: string;
  entityType?: string;
  entityId?: string;
  createdAt: string;
  payload: TPayload;
}

export type OperationsFeedStatus = "info" | "success" | "warning" | "danger";

/**
 * A pre-formatted, display-ready row for Eleven's future operations feed.
 * Usually derived from a `DomainEvent`, but kept as its own shape so the
 * feed's presentation concerns (title/primary/secondary text) don't leak
 * back into event payloads that other consumers (notifications, audit
 * logs) also read.
 */
export interface OperationsFeedEntry {
  id: string;
  eventType: DomainEventType;
  timestamp: string;
  title: string;
  primaryText: string;
  secondaryText?: string;
  status?: OperationsFeedStatus;
  /** Free-form ids this entry points back to, e.g. a trade or transaction code. */
  references?: string[];
}
