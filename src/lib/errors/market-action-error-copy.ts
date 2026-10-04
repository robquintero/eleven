import type { MarketActionErrorCode } from "@/lib/errors/market-action-error";

/** User-facing copy for every MarketActionErrorCode. PLAYER_ALREADY_OWNED is the exact "two managers clicked ADD at once" race outcome — phrased as the brief's own wording, not the draft's "already drafted" copy. */
export const MARKET_ACTION_ERROR_COPY: Record<MarketActionErrorCode, string> = {
  NOT_AUTHENTICATED: "Sign in to do that.",
  NOT_LEAGUE_MEMBER: "You don't have a team in this league.",
  PLAYER_NOT_FOUND: "That player doesn't exist.",
  PLAYER_NOT_ACTIVE: "That player isn't currently eligible.",
  PLAYER_ALREADY_OWNED: "Player is no longer available.",
  PLAYER_NOT_OWNED_BY_TEAM: "That player isn't on your roster.",
  ROSTER_FULL: "Your roster is already full (16 players) — drop a player first.",
  ROSTER_LIMIT_EXCEEDED: "Adding that player would exceed the position limit for your roster.",
  PLAYER_LOCKED: "This player is locked for the current matchday and can't be dropped until the round ends.",
  UNKNOWN: "Something went wrong. Try again.",
};

/**
 * Pass 14.7 Phase 5: classifies each market-action failure as an expected
 * GAME-RULE outcome (never red/error styling) or a genuine unexpected
 * ERROR. `PLAYER_ALREADY_OWNED` (a real race between two managers),
 * `ROSTER_FULL`/`ROSTER_LIMIT_EXCEEDED` (roster constraints), and
 * `PLAYER_LOCKED` (the brief's own named example) are all states a
 * manager can genuinely reach through normal use. Everything else here
 * signals something actually went wrong (stale auth/membership, a
 * reference to a player that doesn't exist/isn't owned the way the client
 * thought) rather than the engine correctly enforcing a rule.
 */
export const MARKET_ACTION_ERROR_KIND: Record<MarketActionErrorCode, "rule" | "error"> = {
  NOT_AUTHENTICATED: "error",
  NOT_LEAGUE_MEMBER: "error",
  PLAYER_NOT_FOUND: "error",
  PLAYER_NOT_ACTIVE: "error",
  PLAYER_ALREADY_OWNED: "rule",
  PLAYER_NOT_OWNED_BY_TEAM: "error",
  ROSTER_FULL: "rule",
  ROSTER_LIMIT_EXCEEDED: "rule",
  PLAYER_LOCKED: "rule",
  UNKNOWN: "error",
};
