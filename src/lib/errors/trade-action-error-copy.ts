import type { TradeActionErrorCode } from "@/lib/errors/trade-action-error";

/** User-facing copy for every TradeActionErrorCode. */
export const TRADE_ACTION_ERROR_COPY: Record<TradeActionErrorCode, string> = {
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
