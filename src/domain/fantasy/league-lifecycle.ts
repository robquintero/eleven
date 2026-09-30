import { MIN_MANAGERS_TO_START_DRAFT } from "./constants.ts";

/**
 * Derives the league's PRODUCT lifecycle state from persisted data, rather
 * than storing it as its own column — see docs/product-state.md "League
 * lifecycle." Every state here must be justified by data that already
 * exists in Postgres (`fantasy_leagues.status`, a membership count against
 * `MIN_MANAGERS_TO_START_DRAFT`, and whether a `drafts` row exists for the
 * league); nothing here is invented product state.
 *
 * `READY_FOR_DRAFT` requires only `MIN_MANAGERS_TO_START_DRAFT` (2)
 * managers, NOT `maxTeams` (the league's configured target size) — a
 * league configured for 10 can start its draft the moment a 2nd manager
 * joins; `maxTeams` only ever gated *joining* (see
 * `join_league_by_invite_code`'s `LEAGUE_FULL` check), never starting.
 *
 * DRAFTING/ACTIVE are reachable in this type because the schema (and RLS)
 * already supports a `drafts` row existing — the draft engine landed in
 * Pass 10.
 */

export type LeagueLifecycleState =
  | "NO_LEAGUE"
  | "WAITING_FOR_MANAGERS"
  | "READY_FOR_DRAFT"
  | "DRAFTING"
  | "ACTIVE"
  | "COMPLETED";

export interface LeagueLifecycleInput {
  /** `fantasy_leagues.status` — "draft" | "active" | "completed" | "archived". */
  leagueStatus: string;
  memberCount: number;
  maxTeams: number;
  /** null when no `drafts` row exists for the league yet (the common case pre-Pass-8). */
  draftStatus: "scheduled" | "in_progress" | "completed" | null;
}

/**
 * Pure derivation — no I/O, no defaults invented beyond what the caller
 * passed in. Callers are expected to have already resolved `null`/missing
 * league data to a `NO_LEAGUE` state before ever calling this.
 */
export function deriveLeagueLifecycle(input: LeagueLifecycleInput): LeagueLifecycleState {
  const { leagueStatus, memberCount, draftStatus } = input;

  if (leagueStatus === "completed") return "COMPLETED";
  if (leagueStatus === "archived") return "COMPLETED";

  if (draftStatus === "in_progress") return "DRAFTING";
  if (draftStatus === "completed") return "ACTIVE";

  if (memberCount < MIN_MANAGERS_TO_START_DRAFT) return "WAITING_FOR_MANAGERS";

  return "READY_FOR_DRAFT";
}

export const LEAGUE_LIFECYCLE_LABEL: Record<LeagueLifecycleState, string> = {
  NO_LEAGUE: "NO LEAGUE",
  WAITING_FOR_MANAGERS: "WAITING FOR MANAGERS",
  READY_FOR_DRAFT: "READY FOR DRAFT",
  DRAFTING: "DRAFTING",
  ACTIVE: "ACTIVE",
  COMPLETED: "COMPLETED",
};
