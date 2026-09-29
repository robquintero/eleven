/**
 * Every known failure mode of create_league()/join_league_by_invite_code()
 * (see supabase/migrations/20260929141145_functions.sql), mapped from the
 * Postgres RAISE EXCEPTION message to a code the UI can switch on for a
 * precise, non-cryptic error state. Kept dependency-free (no "server-only",
 * no Supabase import) so it's plain, directly testable TypeScript —
 * everything that actually talks to Supabase lives in src/data-access/.
 */
export type LeagueActionErrorCode =
  | "NOT_AUTHENTICATED"
  | "INVALID_CODE"
  | "LEAGUE_CLOSED"
  | "ALREADY_MEMBER"
  | "ALREADY_OWNS_TEAM"
  | "LEAGUE_FULL"
  | "INVITE_CODE_GENERATION_FAILED"
  | "UNKNOWN";

const KNOWN_CODES: readonly LeagueActionErrorCode[] = [
  "NOT_AUTHENTICATED",
  "INVALID_CODE",
  "LEAGUE_CLOSED",
  "ALREADY_MEMBER",
  "ALREADY_OWNS_TEAM",
  "LEAGUE_FULL",
  "INVITE_CODE_GENERATION_FAILED",
];

export class LeagueActionError extends Error {
  code: LeagueActionErrorCode;

  constructor(code: LeagueActionErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = "LeagueActionError";
  }
}

/** Maps a raw Postgres RAISE EXCEPTION message to a typed LeagueActionError, defaulting to UNKNOWN for anything unrecognized. */
export function toLeagueActionError(message: string | undefined): LeagueActionError {
  const code = KNOWN_CODES.find((c) => c === message);
  return new LeagueActionError(code ?? "UNKNOWN", message);
}
