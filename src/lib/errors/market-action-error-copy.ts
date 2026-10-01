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
  UNKNOWN: "Something went wrong. Try again.",
};
