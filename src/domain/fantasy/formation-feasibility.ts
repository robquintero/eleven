/**
 * Formation-feasibility check (Pass 2, 4-3-3 squad impact audit).
 *
 * Generic over any `FORMATION_RULES`-shaped starting-XI requirement, so
 * the same function validates the current 4-4-2 and the prepared (not yet
 * applied) 4-3-3 shape without hardcoding either. A squad is feasible for
 * a formation when it holds at least the minimum required players at
 * every position — nothing about bench size or maxima matters here, only
 * whether the squad even contains enough of each position to START.
 */

import type { PlayerPosition } from "@/domain/football/types";

export type PositionCounts = Partial<Record<PlayerPosition, number>>;

const POSITIONS: PlayerPosition[] = ["GK", "DEF", "MID", "FWD"];

export interface FormationFeasibilityResult {
  feasible: boolean;
  /** Positions where the squad's count is below the formation's minimum, with the shortfall. Empty when feasible. */
  shortfalls: { position: PlayerPosition; have: number; need: number; short: number }[];
}

export function checkFormationFeasibility(
  squadCounts: PositionCounts,
  formationPositionRange: Record<PlayerPosition, { min: number; max: number }>
): FormationFeasibilityResult {
  const shortfalls: FormationFeasibilityResult["shortfalls"] = [];
  for (const position of POSITIONS) {
    const have = squadCounts[position] ?? 0;
    const need = formationPositionRange[position].min;
    if (have < need) {
      shortfalls.push({ position, have, need, short: need - have });
    }
  }
  return { feasible: shortfalls.length === 0, shortfalls };
}
