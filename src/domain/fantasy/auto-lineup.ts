/**
 * Deterministic starting-XI selection. Two callers use this:
 *
 *   1. The simulation harness (docs/game-rules.md "Simulation") — a
 *      stand-in for a manager's own choice.
 *   2. Post-draft lineup initialization (Pass 10.5) — the moment a
 *      team's draft completes, this picks its FIRST real starting XI
 *      automatically, so a manager's squad doesn't sit entirely on the
 *      bench until they manually set one. After initialization a real
 *      manager can freely rearrange it through the existing Team
 *      lineup-editing UI, exactly as if they'd set it themselves — this
 *      function only ever runs once, at that starting point.
 *
 * Never a "smart lineup" feature beyond that starting point — no
 * rating/projection/points input of any kind (same "no sophisticated
 * recommendations" rule as the draft auto-pick). Pure function of a
 * roster's position counts.
 */

import { FORMATION_RULES } from "./constants.ts";
import type { PlayerPosition } from "@/domain/football/types";

export interface RosterPlayer {
  rosterEntryId: string;
  position: PlayerPosition;
}

export interface AutoLineupResult {
  starters: RosterPlayer[];
  bench: RosterPlayer[];
}

const POSITION_ORDER: PlayerPosition[] = ["GK", "DEF", "MID", "FWD"];

/**
 * Fills each position's minimum first (GK 1, DEF 3, MID 3, FWD 1), then
 * rounds through DEF/MID/FWD in that fixed order adding one more at a
 * time (never exceeding that position's max) until exactly 11 starters
 * are chosen or the roster runs out of eligible players. Deterministic:
 * within a position, players are chosen in the order given (callers pass
 * a stable, e.g. name-sorted, order for reproducibility).
 */
export function chooseAutomaticStartingXi(roster: RosterPlayer[]): AutoLineupResult {
  const byPosition = new Map<PlayerPosition, RosterPlayer[]>();
  for (const position of POSITION_ORDER) byPosition.set(position, []);
  for (const player of roster) byPosition.get(player.position)?.push(player);

  const chosen: RosterPlayer[] = [];
  const takenCountByPosition: Record<PlayerPosition, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };

  function takeOne(position: PlayerPosition): boolean {
    const pool = byPosition.get(position)!;
    const alreadyTaken = takenCountByPosition[position];
    if (alreadyTaken >= pool.length) return false;
    if (alreadyTaken >= FORMATION_RULES.positionRange[position].max) return false;
    chosen.push(pool[alreadyTaken]);
    takenCountByPosition[position] += 1;
    return true;
  }

  // Minimums first.
  for (const position of POSITION_ORDER) {
    while (takenCountByPosition[position] < FORMATION_RULES.positionRange[position].min) {
      if (!takeOne(position)) break;
    }
  }

  // Fill the rest, round-robin over DEF/MID/FWD (outfield depth first —
  // a second goalkeeper never starts), stopping at 11.
  const fillOrder: PlayerPosition[] = ["DEF", "MID", "FWD"];
  let progressed = true;
  while (chosen.length < FORMATION_RULES.startersTotal && progressed) {
    progressed = false;
    for (const position of fillOrder) {
      if (chosen.length >= FORMATION_RULES.startersTotal) break;
      if (takeOne(position)) progressed = true;
    }
  }

  const chosenIds = new Set(chosen.map((c) => c.rosterEntryId));
  const bench = roster.filter((p) => !chosenIds.has(p.rosterEntryId));

  return { starters: chosen, bench };
}
