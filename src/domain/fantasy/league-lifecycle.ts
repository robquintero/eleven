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
  | "SEASON_COMPLETE"
  | "COMPLETED";

export interface LeagueLifecycleInput {
  /** `fantasy_leagues.status` — "draft" | "active" | "completed" | "archived". */
  leagueStatus: string;
  memberCount: number;
  maxTeams: number;
  /** null when no `drafts` row exists for the league yet (the common case pre-Pass-8). */
  draftStatus: "scheduled" | "in_progress" | "completed" | null;
  /**
   * Pass 12A: `seasons.status` for the league's current (latest) season,
   * or null/undefined if no season row exists yet. Optional — a caller
   * that only needs the pre-12A distinctions (e.g. a compact nav status
   * chip) can omit it entirely, in which case a completed season is
   * indistinguishable from the ordinary post-draft `ACTIVE` state, exactly
   * as it was before seasons existed. Only the League page (which actually
   * shows season identity/champion) needs to pass the real value.
   */
  seasonStatus?: "SETUP" | "ACTIVE" | "COMPLETED" | null;
}

/**
 * Pure derivation — no I/O, no defaults invented beyond what the caller
 * passed in. Callers are expected to have already resolved `null`/missing
 * league data to a `NO_LEAGUE` state before ever calling this.
 *
 * `SEASON_COMPLETE` (Pass 12A) is deliberately distinct from `COMPLETED`:
 * the league itself is permanent and keeps playing (a future season can
 * start), whereas `COMPLETED` means the whole league/account state is
 * archived. A season finishing never implies the league is done.
 */
export function deriveLeagueLifecycle(input: LeagueLifecycleInput): LeagueLifecycleState {
  const { leagueStatus, memberCount, draftStatus, seasonStatus } = input;

  if (leagueStatus === "completed") return "COMPLETED";
  if (leagueStatus === "archived") return "COMPLETED";

  if (draftStatus === "in_progress") return "DRAFTING";
  if (draftStatus === "completed") {
    if (seasonStatus === "COMPLETED") return "SEASON_COMPLETE";
    return "ACTIVE";
  }

  if (memberCount < MIN_MANAGERS_TO_START_DRAFT) return "WAITING_FOR_MANAGERS";

  return "READY_FOR_DRAFT";
}

export const LEAGUE_LIFECYCLE_LABEL: Record<LeagueLifecycleState, string> = {
  NO_LEAGUE: "NO LEAGUE",
  WAITING_FOR_MANAGERS: "WAITING FOR MANAGERS",
  READY_FOR_DRAFT: "READY FOR DRAFT",
  DRAFTING: "DRAFTING",
  ACTIVE: "ACTIVE",
  SEASON_COMPLETE: "SEASON COMPLETE",
  COMPLETED: "COMPLETED",
};
