/**
 * The single authoritative roster-validation domain function set — see
 * `ROSTER_RULES` (constants.ts) for the numbers. Pass 11's free agency,
 * waivers, and trades are expected to import and reuse these directly
 * rather than re-deriving their own copy of the position limits; nothing
 * here is draft-specific even though the draft engine is its first (and
 * so far only) caller.
 *
 * The core invariant this module exists to enforce: a roster must never
 * be allowed to reach a state where satisfying the final position
 * minimums becomes mathematically impossible. Concretely — if a team has
 * 2 picks left and still needs 1 GK and 1 DEF to reach the minimums, a
 * MID/FWD pick that would consume one of those two required slots must
 * be rejected, even though that MID/FWD pick doesn't itself exceed any
 * single position's maximum.
 */

import { ROSTER_RULES } from "./constants.ts";
import type { PlayerPosition } from "@/domain/football/types";

export type RosterCounts = Partial<Record<PlayerPosition, number>>;

const POSITIONS: PlayerPosition[] = ["GK", "DEF", "MID", "FWD"];

function countAt(counts: RosterCounts, position: PlayerPosition): number {
  return counts[position] ?? 0;
}

/**
 * Whether a fully-drafted 16-player roster (`counts` summing to
 * `ROSTER_RULES.squadSize`) satisfies every position's min/max. Used for
 * "is this completed roster legal" checks (e.g. after a draft finishes).
 */
export function isRosterCompositionValid(counts: RosterCounts): boolean {
  const total = POSITIONS.reduce((sum, p) => sum + countAt(counts, p), 0);
  if (total !== ROSTER_RULES.squadSize) return false;

  return POSITIONS.every((position) => {
    const { min, max } = ROSTER_RULES.positionRange[position];
    const count = countAt(counts, position);
    return count >= min && count <= max;
  });
}

/**
 * Whether it's still mathematically possible to reach a fully legal
 * roster from `counts` given `picksRemaining` more picks left to make
 * (a roster is always filled to exactly `ROSTER_RULES.squadSize` — this
 * is normally `squadSize - currentTotal`, passed explicitly rather than
 * recomputed here so callers can't accidentally desync the two numbers).
 * Two ways this can fail:
 *   1. Not enough picks left to cover every position's remaining
 *      minimum shortfall (the brief's own example: 2 picks left, GK and
 *      DEF each still need 1 more — no room left for anything else).
 *   2. Too many picks left relative to the room remaining across every
 *      position's maximum (can't happen with today's numbers — mins sum
 *      to 12, maxes sum to 18, squad size is 16 — but checked generally
 *      rather than assuming these specific numbers never change).
 */
export function isRosterCompletable(counts: RosterCounts, picksRemaining: number): boolean {
  if (picksRemaining < 0) return false;

  let minShortfall = 0;
  let maxRoom = 0;
  for (const position of POSITIONS) {
    const { min, max } = ROSTER_RULES.positionRange[position];
    const count = countAt(counts, position);
    if (count > max) return false; // already broken -- never reachable
    minShortfall += Math.max(0, min - count);
    maxRoom += Math.max(0, max - count);
  }

  return minShortfall <= picksRemaining && picksRemaining <= maxRoom;
}

/**
 * Whether drafting (or otherwise acquiring) one more player at
 * `position` is legal RIGHT NOW, given the roster's current counts and
 * how many total picks remain INCLUDING this one. This is the function
 * the draft engine calls before allowing a pick — it folds together the
 * simple "would exceed this position's max" case and the deeper
 * "would make some OTHER position's minimum unreachable" case into one
 * authoritative answer, since both are really the same underlying
 * question: is the roster still completable after this pick?
 */
export function canDraftPosition(
  counts: RosterCounts,
  position: PlayerPosition,
  picksRemainingIncludingThisOne: number
): boolean {
  if (picksRemainingIncludingThisOne < 1) return false;

  const next: RosterCounts = { ...counts, [position]: countAt(counts, position) + 1 };
  return isRosterCompletable(next, picksRemainingIncludingThisOne - 1);
}

/**
 * Every position a team could still legally draft next, given its
 * current counts and total remaining picks (including the one about to
 * be made) — powers the Draft UI's "gray out a position" treatment.
 * Never disables a position merely because some OTHER position's
 * minimum is unmet unless picking this one would make that minimum
 * mathematically unreachable (`canDraftPosition` already encodes exactly
 * that distinction).
 */
export function draftablePositions(counts: RosterCounts, picksRemainingIncludingThisOne: number): PlayerPosition[] {
  return POSITIONS.filter((position) => canDraftPosition(counts, position, picksRemainingIncludingThisOne));
}

/**
 * Pass 11: a free-market roster may legitimately sit below
 * `ROSTER_RULES.squadSize` after a drop — this reports which positions
 * are currently short of their MINIMUM (never their maximum; a market
 * roster is never required to be "completable" the way a draft-in-
 * progress one is, see this module's own header comment). Used by both
 * the Team page's vacancy banner and Home's roster-vacancy readout —
 * kept here, not duplicated in either page, so "what counts as short"
 * only has one definition.
 */
export function rosterVacancies(counts: RosterCounts): { position: PlayerPosition; short: number }[] {
  return POSITIONS.map((position) => ({
    position,
    short: Math.max(0, ROSTER_RULES.positionRange[position].min - countAt(counts, position)),
  })).filter((v) => v.short > 0);
}
