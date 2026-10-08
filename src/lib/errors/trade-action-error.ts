/**
 * Every known failure mode of propose_trade()/accept_trade()/reject_trade()/
 * cancel_trade() (see supabase/migrations/20261001000000_free_market_and_trades.sql),
 * mapped from the Postgres RAISE EXCEPTION message to a code the UI can
 * switch on — same pattern as src/lib/errors/draft-action-error.ts.
 */
export type TradeActionErrorCode =
  | "DRAFT_NOT_COMPLETED"
  | "LEAGUE_NOT_ACTIVE"
  | "NOT_AUTHENTICATED"
  | "NOT_LEAGUE_MEMBER"
  | "RECEIVING_TEAM_NOT_FOUND"
  | "CANNOT_TRADE_WITH_SELF"
  | "EMPTY_TRADE"
  | "UNEVEN_TRADE"
  | "INVALID_TRADE_ASSET"
  | "TRADE_NOT_FOUND"
  | "NOT_AUTHORIZED"
  | "TRADE_NOT_PENDING"
  | "TRADE_ASSET_NO_LONGER_OWNED"
  | "ROSTER_FULL"
  | "ROSTER_LIMIT_EXCEEDED"
  | "UNKNOWN";

const KNOWN_CODES: readonly TradeActionErrorCode[] = [
  "DRAFT_NOT_COMPLETED",
  "LEAGUE_NOT_ACTIVE",
  "NOT_AUTHENTICATED",
  "NOT_LEAGUE_MEMBER",
  "RECEIVING_TEAM_NOT_FOUND",
  "CANNOT_TRADE_WITH_SELF",
  "EMPTY_TRADE",
  "UNEVEN_TRADE",
  "INVALID_TRADE_ASSET",
  "TRADE_NOT_FOUND",
  "NOT_AUTHORIZED",
  "TRADE_NOT_PENDING",
  "TRADE_ASSET_NO_LONGER_OWNED",
  "ROSTER_FULL",
  "ROSTER_LIMIT_EXCEEDED",
];

export class TradeActionError extends Error {
  code: TradeActionErrorCode;

  constructor(code: TradeActionErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = "TradeActionError";
  }
}

/** Maps a raw Postgres RAISE EXCEPTION message to a typed TradeActionError, defaulting to UNKNOWN for anything unrecognized. */
export function toTradeActionError(message: string | undefined): TradeActionError {
  const code = KNOWN_CODES.find((c) => c === message);
  return new TradeActionError(code ?? "UNKNOWN", message);
}
