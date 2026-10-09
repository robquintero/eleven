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

export type PartialLineupProvisioningPlan =
  | { ok: true; newStarterIds: Set<string> }
  | { ok: false; reason: string };

/**
 * Autonomous stabilization pass, Phase C: pure decision logic for
 * repairing a team whose lineup_slots are only PARTLY initialized for a
 * round (some roster entries already have a slot — a manager's
 * deliberate choice, or a prior partial attempt — most don't). Unlike
 * `chooseAutomaticStartingXi` (which picks a whole fresh XI from
 * scratch), this only ever decides which of the STILL-MISSING roster
 * entries become new starters, and never reconsiders an existing one.
 *
 * Because `FORMATION_RULES` is a fixed point (min === max per position),
 * "how many more of each position are needed" is fully determined by
 * what's already a starter — there is no "fill extra capacity"
 * round-robin step the way the from-scratch picker needs.
 *
 * Returns `{ ok: false }` rather than guessing whenever the formation
 * genuinely cannot be completed from what's available — either the
 * existing starters already conflict with the current formation, or the
 * missing pool doesn't have enough depth at some position. The caller
 * (lineup.ts's `provisionMissingLineupSlots`) is responsible for
 * reporting that as an observable failure, never silently leaving a
 * team incomplete and never guessing which existing selection to
 * override.
 */
export function planPartialLineupProvisioning(
  missingRosterEntries: RosterPlayer[],
  existingStarterPositions: PlayerPosition[]
): PartialLineupProvisioningPlan {
  const existingStarterCountByPosition: Partial<Record<PlayerPosition, number>> = {};
  for (const position of existingStarterPositions) {
    existingStarterCountByPosition[position] = (existingStarterCountByPosition[position] ?? 0) + 1;
  }

  for (const position of POSITION_ORDER) {
    const target = FORMATION_RULES.positionRange[position];
    const existingCount = existingStarterCountByPosition[position] ?? 0;
    if (existingCount > target.max) {
      return { ok: false, reason: `Existing starters already include ${existingCount} ${position}, more than the formation's ${target.max} -- cannot repair without overriding an existing selection.` };
    }
  }

  const remainingNeedByPosition: Partial<Record<PlayerPosition, number>> = {};
  let remainingStartersNeeded = 0;
  for (const position of POSITION_ORDER) {
    const need = Math.max(0, FORMATION_RULES.positionRange[position].min - (existingStarterCountByPosition[position] ?? 0));
    remainingNeedByPosition[position] = need;
    remainingStartersNeeded += need;
  }
  if (existingStarterPositions.length + remainingStartersNeeded > FORMATION_RULES.startersTotal) {
    return { ok: false, reason: "Existing starters are already inconsistent with the current formation's total -- cannot repair automatically." };
  }

  const missingByPosition = new Map<PlayerPosition, RosterPlayer[]>();
  for (const entry of missingRosterEntries) {
    missingByPosition.set(entry.position, [...(missingByPosition.get(entry.position) ?? []), entry]);
  }
  // Deterministic selection order -- stable by rosterEntryId, never
  // rating/projection-based, matching chooseAutomaticStartingXi's own
  // "no sophisticated recommendations" rule.
  for (const pool of missingByPosition.values()) pool.sort((a, b) => a.rosterEntryId.localeCompare(b.rosterEntryId));

  const newStarterIds = new Set<string>();
  for (const position of POSITION_ORDER) {
    const need = remainingNeedByPosition[position] ?? 0;
    const pool = missingByPosition.get(position) ?? [];
    if (pool.length < need) {
      return { ok: false, reason: `Need ${need} more ${position} starter(s) to complete the formation, but only ${pool.length} unassigned ${position} player(s) exist on the roster.` };
    }
    for (const entry of pool.slice(0, need)) newStarterIds.add(entry.rosterEntryId);
  }

  return { ok: true, newStarterIds };
}
