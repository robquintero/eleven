/**
 * Named formation selection for the Team page (Pass 10.5B). Builds on
 * `FORMATION_RULES` (GK exactly 1, DEF 3-5, MID 3-5, FWD 1-3, 11 starters
 * total) — every named formation below is one specific, legal point inside
 * that range, never a separate rule set. No projections/rankings/AI lineup
 * optimization anywhere here — purely deterministic set arithmetic over a
 * roster's own position counts and current starter/lock state.
 *
 * "4-2-3-1" is a naming convention only: Eleven doesn't track
 * defensive-mid vs attacking-mid as separate positions, so it's stored and
 * validated as DEF 4 / MID 5 / FWD 1, exactly like any other 4-5-1 --
 * `namedFormationForCounts` is what recovers the friendlier display name
 * from those raw counts.
 */

import type { PlayerPosition } from "@/domain/football/types";

export type FormationName = "4-4-2" | "4-3-3" | "4-2-3-1" | "3-5-2" | "3-4-3";

export const SUPPORTED_FORMATIONS: readonly FormationName[] = ["4-4-2", "4-3-3", "4-2-3-1", "3-5-2", "3-4-3"];

/** DEF/MID/FWD starter counts for each supported formation (GK is always exactly 1, omitted here). */
const FORMATION_SHAPES: Record<FormationName, { DEF: number; MID: number; FWD: number }> = {
  "4-4-2": { DEF: 4, MID: 4, FWD: 2 },
  "4-3-3": { DEF: 4, MID: 3, FWD: 3 },
  "4-2-3-1": { DEF: 4, MID: 5, FWD: 1 },
  "3-5-2": { DEF: 3, MID: 5, FWD: 2 },
  "3-4-3": { DEF: 3, MID: 4, FWD: 3 },
};

/** The exact required starter count per position for a named formation, including the constant GK 1. */
export function formationTargetCounts(formation: FormationName): Record<PlayerPosition, number> {
  const shape = FORMATION_SHAPES[formation];
  return { GK: 1, DEF: shape.DEF, MID: shape.MID, FWD: shape.FWD };
}

/**
 * Whether a manager's full roster has ENOUGH players at each position to
 * field this formation at all — independent of current starter/bench
 * assignment or lock state (see `computeFormationChange` for the
 * lock-aware, current-state-aware version actually used to apply a
 * change). This is what the Team page uses to grey out a formation the
 * roster genuinely cannot supply, e.g. a roster with only 2 forwards
 * cannot field 4-3-3 or 3-4-3 (both need 3).
 */
export function canRosterSupplyFormation(
  rosterCounts: Partial<Record<PlayerPosition, number>>,
  formation: FormationName
): boolean {
  const target = formationTargetCounts(formation);
  return (Object.keys(target) as PlayerPosition[]).every((position) => (rosterCounts[position] ?? 0) >= target[position]);
}

/** Recovers a named formation's friendly label from raw DEF/MID/FWD starter counts, or `null` if they don't match any of the 5 supported shapes (e.g. a manual swap into a non-standard combination). */
export function namedFormationForCounts(counts: { DEF: number; MID: number; FWD: number }): FormationName | null {
  for (const name of SUPPORTED_FORMATIONS) {
    const shape = FORMATION_SHAPES[name];
    if (shape.DEF === counts.DEF && shape.MID === counts.MID && shape.FWD === counts.FWD) return name;
  }
  return null;
}

export interface FormationRosterPlayer {
  rosterEntryId: string;
  position: PlayerPosition;
  isStarter: boolean;
  locked: boolean;
}

export interface FormationLineupChange {
  rosterEntryId: string;
  starter: boolean;
  position?: PlayerPosition;
}

export type FormationChangeResult =
  | { ok: true; changes: FormationLineupChange[] }
  | { ok: false; error: "ROSTER_CANNOT_SUPPLY_FORMATION" | "LOCKED_PLAYER_CONFLICT" };

const POSITIONS: PlayerPosition[] = ["GK", "DEF", "MID", "FWD"];

/**
 * Deterministically computes the minimal set of starter/bench changes to
 * move a roster from its CURRENT lineup to the given formation:
 *
 *   1. A locked starter never moves (forced to stay a starter).
 *   2. A locked bench player never moves (forced to stay benched).
 *   3. Among the rest, keep as many CURRENT unlocked starters as the
 *      target formation still has room for (preserves the existing
 *      lineup as much as possible), preferring earlier entries in the
 *      caller's own ordering (pass a stable order, e.g. by player name,
 *      for reproducibility — same convention as auto-lineup.ts).
 *   4. Promote from unlocked bench, in the same stable order, to fill any
 *      remaining shortfall.
 *   5. Demote any leftover unlocked starters (the surplus) to the bench.
 *
 * Rejects rather than partially applying: if the roster's players at some
 * position, even ignoring lock state, aren't enough to supply the target
 * (ROSTER_CANNOT_SUPPLY_FORMATION), or are enough only by moving a locked
 * player (LOCKED_PLAYER_CONFLICT).
 */
export function computeFormationChange(
  roster: FormationRosterPlayer[],
  formation: FormationName
): FormationChangeResult {
  const target = formationTargetCounts(formation);
  const changes: FormationLineupChange[] = [];

  for (const position of POSITIONS) {
    const atPosition = roster.filter((p) => p.position === position);
    const need = target[position];

    if (need > atPosition.length) {
      return { ok: false, error: "ROSTER_CANNOT_SUPPLY_FORMATION" };
    }

    const lockedStarters = atPosition.filter((p) => p.isStarter && p.locked);
    const unlockedStarters = atPosition.filter((p) => p.isStarter && !p.locked);
    const unlockedBench = atPosition.filter((p) => !p.isStarter && !p.locked);

    const usable = lockedStarters.length + unlockedStarters.length + unlockedBench.length;
    if (need > usable || lockedStarters.length > need) {
      return { ok: false, error: "LOCKED_PLAYER_CONFLICT" };
    }

    const remainingNeeded = need - lockedStarters.length;
    const keepFromUnlockedStarters = unlockedStarters.slice(0, remainingNeeded);
    const demoteFromUnlockedStarters = unlockedStarters.slice(remainingNeeded);
    const stillNeeded = remainingNeeded - keepFromUnlockedStarters.length;
    const promoteFromBench = unlockedBench.slice(0, Math.max(0, stillNeeded));

    for (const demoted of demoteFromUnlockedStarters) {
      changes.push({ rosterEntryId: demoted.rosterEntryId, starter: false });
    }
    for (const promoted of promoteFromBench) {
      changes.push({ rosterEntryId: promoted.rosterEntryId, starter: true, position });
    }
  }

  return { ok: true, changes };
}

/**
 * How many EMPTY starting-XI slots remain per position to reach
 * `formation`'s full 11-player shape, given how many are already filled
 * at each position (real starters, and/or locally-queued-but-unsaved
 * fills — the caller decides what counts as "filled") — Pass 10.5C. Never
 * negative: a position already at or past its target simply has 0 empty
 * slots, it's never treated as "over capacity" here (that's a completely
 * different, already-handled case — see `computeFormationChange`'s own
 * max-exceeded check for actual persisted lineup changes). Pure, and
 * deliberately agnostic to pitch layout/coordinates — this only answers
 * "how many, of which position," not "where."
 */
export function emptySlotCounts(
  filledCounts: Partial<Record<PlayerPosition, number>>,
  formation: FormationName
): Record<PlayerPosition, number> {
  const target = formationTargetCounts(formation);
  const result = {} as Record<PlayerPosition, number>;
  for (const position of POSITIONS) {
    result[position] = Math.max(0, target[position] - (filledCounts[position] ?? 0));
  }
  return result;
}
