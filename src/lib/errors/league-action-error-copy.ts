import type { LeagueActionErrorCode } from "@/lib/errors/league-action-error";

/** User-facing copy for every LeagueActionErrorCode — see DESIGN.md's status-vocabulary conventions (`LEAGUE_LOOKUP / <CODE>`). */
export const LEAGUE_ACTION_ERROR_COPY: Record<LeagueActionErrorCode, string> = {
  NOT_AUTHENTICATED: "Sign in to do that.",
  INVALID_CODE: "LEAGUE_LOOKUP / INVALID_CODE — that invite code doesn't match any league.",
  LEAGUE_CLOSED: "LEAGUE_LOOKUP / CLOSED — this league isn't accepting new members.",
  ALREADY_MEMBER: "LEAGUE_LOOKUP / ALREADY_MEMBER — you're already in this league.",
  ALREADY_OWNS_TEAM: "LEAGUE_LOOKUP / ALREADY_OWNS_TEAM — you already have a team in this league.",
  LEAGUE_FULL: "LEAGUE_LOOKUP / FULL — this league has reached its manager limit.",
  INVITE_CODE_GENERATION_FAILED: "Couldn't generate an invite code — try again.",
  UNKNOWN: "Something went wrong. Try again.",
};
