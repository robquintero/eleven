/**
 * Every known failure mode of start_draft()/make_draft_pick() (see
 * supabase/migrations/20260930024807_draft_engine.sql), mapped from the
 * Postgres RAISE EXCEPTION message to a code the UI can switch on —
 * same pattern as src/lib/errors/league-action-error.ts. Dependency-free
 * so it's plain, directly testable TypeScript.
 */
export type DraftActionErrorCode =
  | "NOT_AUTHENTICATED"
  | "LEAGUE_NOT_FOUND"
  | "NOT_COMMISSIONER"
  | "LEAGUE_CLOSED"
  | "DRAFT_ALREADY_EXISTS"
  | "LEAGUE_NOT_FULL"
  | "DRAFT_NOT_FOUND"
  | "DRAFT_NOT_ACTIVE"
  | "NOT_LEAGUE_MEMBER"
  | "NOT_YOUR_TURN"
  | "PLAYER_NOT_FOUND"
  | "PLAYER_NOT_ACTIVE"
  | "PLAYER_ALREADY_OWNED"
  | "ROSTER_LIMIT_EXCEEDED"
  | "UNKNOWN";

const KNOWN_CODES: readonly DraftActionErrorCode[] = [
  "NOT_AUTHENTICATED",
  "LEAGUE_NOT_FOUND",
  "NOT_COMMISSIONER",
  "LEAGUE_CLOSED",
  "DRAFT_ALREADY_EXISTS",
  "LEAGUE_NOT_FULL",
  "DRAFT_NOT_FOUND",
  "DRAFT_NOT_ACTIVE",
  "NOT_LEAGUE_MEMBER",
  "NOT_YOUR_TURN",
  "PLAYER_NOT_FOUND",
  "PLAYER_NOT_ACTIVE",
  "PLAYER_ALREADY_OWNED",
  "ROSTER_LIMIT_EXCEEDED",
];

export class DraftActionError extends Error {
  code: DraftActionErrorCode;

  constructor(code: DraftActionErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = "DraftActionError";
  }
}

/** Maps a raw Postgres RAISE EXCEPTION message to a typed DraftActionError, defaulting to UNKNOWN for anything unrecognized. */
export function toDraftActionError(message: string | undefined): DraftActionError {
  const code = KNOWN_CODES.find((c) => c === message);
  return new DraftActionError(code ?? "UNKNOWN", message);
}
