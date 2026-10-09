import type { DraftActionErrorCode } from "@/lib/errors/draft-action-error";

/** User-facing copy for every DraftActionErrorCode — see DESIGN.md's status-vocabulary conventions. */
export const DRAFT_ACTION_ERROR_COPY: Record<DraftActionErrorCode, string> = {
  STALE_DRAFT_TURN: "That turn has already finished. Updating the draft; your selection was not retried.",
  NOT_AUTHENTICATED: "Sign in to do that.",
  LEAGUE_NOT_FOUND: "DRAFT / LEAGUE_NOT_FOUND — this league doesn't exist.",
  NOT_COMMISSIONER: "DRAFT / NOT_COMMISSIONER — only the commissioner can start the draft.",
  LEAGUE_CLOSED: "DRAFT / LEAGUE_CLOSED — this league isn't open for a draft.",
  DRAFT_ALREADY_EXISTS: "DRAFT / ALREADY_STARTED — this league's draft has already begun.",
  LEAGUE_NOT_FULL: "DRAFT / LEAGUE_NOT_FULL — waiting for more managers before the draft can start.",
  DRAFT_NOT_FOUND: "DRAFT / NOT_FOUND — this draft doesn't exist.",
  DRAFT_NOT_ACTIVE: "DRAFT / NOT_ACTIVE — this draft isn't in progress.",
  NOT_LEAGUE_MEMBER: "DRAFT / NOT_A_MEMBER — you don't have a team in this league.",
  NOT_YOUR_TURN: "The draft has moved on or it is another manager's turn. Updating the draft; your selection was not retried.",
  PLAYER_NOT_FOUND: "DRAFT / PLAYER_NOT_FOUND — that player doesn't exist.",
  PLAYER_NOT_ACTIVE: "DRAFT / PLAYER_NOT_ACTIVE — that player isn't currently eligible.",
  PLAYER_ALREADY_OWNED: "DRAFT / ALREADY_TAKEN — another team already drafted that player.",
  ROSTER_LIMIT_EXCEEDED: "DRAFT / ROSTER_LIMIT — that pick would leave your roster unable to meet position requirements.",
  UNKNOWN: "Something went wrong. Try again.",
};

/**
 * Pass 14.7 Phase 5: classifies each draft-action failure as an expected
 * GAME-RULE outcome (never red/error styling) or a genuine unexpected
 * ERROR. `NOT_YOUR_TURN` is the quintessential example -- a manager
 * clicking to draft out of turn is the engine working correctly, not a
 * bug. `PLAYER_ALREADY_OWNED`/`ROSTER_LIMIT_EXCEEDED` mirror the same
 * market-action reasoning (a real race, a real roster constraint);
 * `LEAGUE_CLOSED`/`DRAFT_ALREADY_EXISTS`/`LEAGUE_NOT_FULL`/
 * `DRAFT_NOT_ACTIVE` are all expected lifecycle states. Everything else
 * signals something actually went wrong (auth/membership/permission
 * boundaries, or a reference to something that doesn't exist).
 */
export const DRAFT_ACTION_ERROR_KIND: Record<DraftActionErrorCode, "rule" | "error"> = {
  STALE_DRAFT_TURN: "rule",
  NOT_AUTHENTICATED: "error",
  LEAGUE_NOT_FOUND: "error",
  NOT_COMMISSIONER: "error",
  LEAGUE_CLOSED: "rule",
  DRAFT_ALREADY_EXISTS: "rule",
  LEAGUE_NOT_FULL: "rule",
  DRAFT_NOT_FOUND: "error",
  DRAFT_NOT_ACTIVE: "rule",
  NOT_LEAGUE_MEMBER: "error",
  NOT_YOUR_TURN: "rule",
  PLAYER_NOT_FOUND: "error",
  PLAYER_NOT_ACTIVE: "error",
  PLAYER_ALREADY_OWNED: "rule",
  ROSTER_LIMIT_EXCEEDED: "rule",
  UNKNOWN: "error",
};
