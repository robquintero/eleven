/**
 * Every known failure mode of `start_next_season()` (see
 * supabase/migrations/20261003000000_multi_season_lifecycle.sql), mapped
 * from the Postgres RAISE EXCEPTION message to a code the UI can switch
 * on — same pattern as src/lib/errors/league-action-error.ts /
 * draft-action-error.ts. Dependency-free so it's plain, directly testable
 * TypeScript.
 */
export type SeasonActionErrorCode =
  | "NOT_AUTHENTICATED"
  | "INVALID_ROSTER_MODE"
  | "INVALID_SCHEDULE_FORMAT"
  | "LEAGUE_NOT_FOUND"
  | "NOT_COMMISSIONER"
  | "NO_SEASON_TO_FOLLOW"
  | "SEASON_NOT_COMPLETE"
  | "SEASON_ALREADY_STARTED"
  | "UNKNOWN";

const KNOWN_CODES: readonly SeasonActionErrorCode[] = [
  "NOT_AUTHENTICATED",
  "INVALID_ROSTER_MODE",
  "INVALID_SCHEDULE_FORMAT",
  "LEAGUE_NOT_FOUND",
  "NOT_COMMISSIONER",
  "NO_SEASON_TO_FOLLOW",
  "SEASON_NOT_COMPLETE",
  "SEASON_ALREADY_STARTED",
];

export class SeasonActionError extends Error {
  code: SeasonActionErrorCode;

  constructor(code: SeasonActionErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = "SeasonActionError";
  }
}

/** Maps a raw Postgres RAISE EXCEPTION message to a typed SeasonActionError, defaulting to UNKNOWN for anything unrecognized. */
export function toSeasonActionError(message: string | undefined): SeasonActionError {
  const code = KNOWN_CODES.find((c) => c === message);
  return new SeasonActionError(code ?? "UNKNOWN", message);
}
