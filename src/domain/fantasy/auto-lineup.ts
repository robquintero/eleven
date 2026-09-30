/**
 * Deterministic starting-XI selection for the simulation harness ONLY
 * (docs/game-rules.md "Simulation") — a real manager always chooses their
 * own lineup through the Team workspace; nothing here is a "smart
 * lineup" feature for real play. Pure function of a roster's position
 * counts; no rating/projection/points input of any kind (same
 * "no sophisticated recommendations" rule as the draft auto-pick).
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
