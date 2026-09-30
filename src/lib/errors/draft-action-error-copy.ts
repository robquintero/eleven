import type { DraftActionErrorCode } from "@/lib/errors/draft-action-error";

/** User-facing copy for every DraftActionErrorCode — see DESIGN.md's status-vocabulary conventions. */
export const DRAFT_ACTION_ERROR_COPY: Record<DraftActionErrorCode, string> = {
  NOT_AUTHENTICATED: "Sign in to do that.",
  LEAGUE_NOT_FOUND: "DRAFT / LEAGUE_NOT_FOUND — this league doesn't exist.",
  NOT_COMMISSIONER: "DRAFT / NOT_COMMISSIONER — only the commissioner can start the draft.",
  LEAGUE_CLOSED: "DRAFT / LEAGUE_CLOSED — this league isn't open for a draft.",
  DRAFT_ALREADY_EXISTS: "DRAFT / ALREADY_STARTED — this league's draft has already begun.",
  LEAGUE_NOT_FULL: "DRAFT / LEAGUE_NOT_FULL — waiting for more managers before the draft can start.",
  DRAFT_NOT_FOUND: "DRAFT / NOT_FOUND — this draft doesn't exist.",
  DRAFT_NOT_ACTIVE: "DRAFT / NOT_ACTIVE — this draft isn't in progress.",
  NOT_LEAGUE_MEMBER: "DRAFT / NOT_A_MEMBER — you don't have a team in this league.",
  NOT_YOUR_TURN: "DRAFT / NOT_YOUR_TURN — it isn't your pick yet.",
  PLAYER_NOT_FOUND: "DRAFT / PLAYER_NOT_FOUND — that player doesn't exist.",
  PLAYER_NOT_ACTIVE: "DRAFT / PLAYER_NOT_ACTIVE — that player isn't currently eligible.",
  PLAYER_ALREADY_OWNED: "DRAFT / ALREADY_TAKEN — another team already drafted that player.",
  UNKNOWN: "Something went wrong. Try again.",
};
