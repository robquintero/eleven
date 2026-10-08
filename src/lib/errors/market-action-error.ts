/**
 * Every known failure mode of drop_player()/sign_player() (see
 * supabase/migrations/20261001000000_free_market_and_trades.sql), mapped
 * from the Postgres RAISE EXCEPTION message to a code the UI can switch
 * on — same pattern as src/lib/errors/draft-action-error.ts.
 */
export type MarketActionErrorCode =
  | "DRAFT_NOT_COMPLETED"
  | "LEAGUE_NOT_ACTIVE"
  | "NOT_AUTHENTICATED"
  | "NOT_LEAGUE_MEMBER"
  | "PLAYER_NOT_FOUND"
  | "PLAYER_NOT_ACTIVE"
  | "PLAYER_ALREADY_OWNED"
  | "PLAYER_NOT_OWNED_BY_TEAM"
  | "ROSTER_FULL"
  | "ROSTER_LIMIT_EXCEEDED"
  /** Pass 14.6: the player's current-fantasy-round lineup slot has already locked (kickoff of their first eligible fixture has passed) -- see supabase/migrations/20261006000000_drop_lock_enforcement.sql. */
  | "PLAYER_LOCKED"
  | "UNKNOWN";

const KNOWN_CODES: readonly MarketActionErrorCode[] = [
  "DRAFT_NOT_COMPLETED",
  "LEAGUE_NOT_ACTIVE",
  "NOT_AUTHENTICATED",
  "NOT_LEAGUE_MEMBER",
  "PLAYER_NOT_FOUND",
  "PLAYER_NOT_ACTIVE",
  "PLAYER_ALREADY_OWNED",
  "PLAYER_NOT_OWNED_BY_TEAM",
  "ROSTER_FULL",
  "ROSTER_LIMIT_EXCEEDED",
  "PLAYER_LOCKED",
];

export class MarketActionError extends Error {
  code: MarketActionErrorCode;

  constructor(code: MarketActionErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = "MarketActionError";
  }
}

/** Maps a raw Postgres RAISE EXCEPTION message to a typed MarketActionError, defaulting to UNKNOWN for anything unrecognized. */
export function toMarketActionError(message: string | undefined): MarketActionError {
  const code = KNOWN_CODES.find((c) => c === message);
  return new MarketActionError(code ?? "UNKNOWN", message);
}
