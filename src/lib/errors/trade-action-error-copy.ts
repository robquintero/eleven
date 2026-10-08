import { PRE_DRAFT_ACQUISITION_COPY } from "../../domain/fantasy/player-acquisition.ts";
import type { TradeActionErrorCode } from "@/lib/errors/trade-action-error";

/** User-facing copy for every TradeActionErrorCode. */
export const TRADE_ACTION_ERROR_COPY: Record<TradeActionErrorCode, string> = {
  DRAFT_NOT_COMPLETED: PRE_DRAFT_ACQUISITION_COPY,
  LEAGUE_NOT_ACTIVE: "Player acquisitions are unavailable for this league.",
  NOT_AUTHENTICATED: "Sign in to do that.",
  NOT_LEAGUE_MEMBER: "You don't have a team in this league.",
  RECEIVING_TEAM_NOT_FOUND: "That team doesn't exist in this league.",
  CANNOT_TRADE_WITH_SELF: "You can't propose a trade with your own team.",
  EMPTY_TRADE: "Select at least one player to offer or request.",
  UNEVEN_TRADE: "Trades must contain the same number of players from each team.",
  INVALID_TRADE_ASSET: "One of the selected players isn't owned by the team you selected them for.",
  TRADE_NOT_FOUND: "That trade doesn't exist.",
  NOT_AUTHORIZED: "You can't do that with this trade.",
  TRADE_NOT_PENDING: "This trade has already been resolved.",
  TRADE_ASSET_NO_LONGER_OWNED: "This trade can no longer be completed — ownership has changed since it was proposed.",
  ROSTER_FULL: "This trade would leave a roster over the 16-player limit.",
  ROSTER_LIMIT_EXCEEDED: "This trade would exceed a position limit for one of the rosters.",
  UNKNOWN: "Something went wrong. Try again.",
};

/**
 * Pass 14.7 Phase 5: classifies each trade-action failure as an expected
 * GAME-RULE outcome (never red/error styling) or a genuine unexpected
 * ERROR. `TRADE_ASSET_NO_LONGER_OWNED` is the brief's own named example
 * ("trade/drop restriction") -- a real race where ownership changed after
 * the trade was proposed, already proven as an expected, truthful outcome
 * (see market-trades.integration.test.ts's own dedicated test).
 * `ROSTER_FULL`/`ROSTER_LIMIT_EXCEEDED`/`UNEVEN_TRADE`/`EMPTY_TRADE`/
 * `CANNOT_TRADE_WITH_SELF`/`TRADE_NOT_PENDING` are all constraints a
 * manager can genuinely reach through normal use. Everything else signals
 * something actually went wrong (auth/membership boundaries, or a
 * reference to a team/trade/asset that doesn't exist the way the client
 * thought).
 */
export const TRADE_ACTION_ERROR_KIND: Record<TradeActionErrorCode, "rule" | "error"> = {
  DRAFT_NOT_COMPLETED: "rule",
  LEAGUE_NOT_ACTIVE: "rule",
  NOT_AUTHENTICATED: "error",
  NOT_LEAGUE_MEMBER: "error",
  RECEIVING_TEAM_NOT_FOUND: "error",
  CANNOT_TRADE_WITH_SELF: "rule",
  EMPTY_TRADE: "rule",
  UNEVEN_TRADE: "rule",
  INVALID_TRADE_ASSET: "error",
  TRADE_NOT_FOUND: "error",
  NOT_AUTHORIZED: "error",
  TRADE_NOT_PENDING: "rule",
  TRADE_ASSET_NO_LONGER_OWNED: "rule",
  ROSTER_FULL: "rule",
  ROSTER_LIMIT_EXCEEDED: "rule",
  UNKNOWN: "error",
};
