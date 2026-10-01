/**
 * Pure pitch-coordinate layout for a starting XI — pure function of
 * position counts, no I/O. The old mock data supplied `x`/`y` directly;
 * now that starters come from real `lineup_slots`, something has to
 * compute where each position's row sits and how its players spread
 * across it. Attacking direction is "up" the pitch, matching `Pitch`'s
 * own `top: 100 - y` convention.
 *
 * Pass 10.5C.5: Eleven V1 is 4-4-2 only (see
 * `src/domain/fantasy/constants.ts`'s `FORMATION_RULES`) — the realistic
 * per-position coordinates below are this one shape's geometry, not a
 * selectable preset among several. Presentation only — this never changes
 * starter-composition validation/legality (`isStarterCompositionValid`),
 * only where a slot is drawn.
 */

import type { PlayerPosition } from "@/domain/football/types";

const ROW_Y: Record<PlayerPosition, number> = { GK: 10, DEF: 35, MID: 60, FWD: 85 };

export interface LayoutInput<T> {
  position: PlayerPosition;
  value: T;
}

export interface LayoutResult<T> {
  position: PlayerPosition;
  value: T;
  x: number;
  y: number;
}

/**
 * Realistic 4-4-2 coordinates for DEF/MID/FWD (Pass 10.5C.1) —
 * evenly-spaced rows read as a flat "grid," not a real football shape
 * (most visibly: a strike partnership spread almost to the touchlines
 * instead of standing close together centrally). GK is always exactly 1
 * and stays centered via the generic fallback below, so it has no entry
 * here. Each array is one fixed, stable left-to-right ordering that
 * callers' own (already position-grouped, stably-ordered) items are
 * zipped against 1:1 — used only when the group's size exactly matches
 * the preset's length; a non-standard composition (shouldn't arise now
 * that starter composition is fixed to exactly 4-4-2, but kept as a safe
 * fallback for an in-progress/incomplete XI) falls back to the original
 * even 10-90 spread instead.
 */
const FORMATION_COORDINATES: Partial<Record<PlayerPosition, { x: number; y: number }[]>> = {
  DEF: [
    { x: 12, y: 26 },
    { x: 37, y: 22 },
    { x: 63, y: 22 },
    { x: 88, y: 26 },
  ],
  MID: [
    { x: 12, y: 54 },
    { x: 37, y: 50 },
    { x: 63, y: 50 },
    { x: 88, y: 54 },
  ],
  // A central strike partnership, close together, not spread wide.
  FWD: [
    { x: 40, y: 86 },
    { x: 60, y: 86 },
  ],
};

export interface FormationSlot {
  id: string;
  position: PlayerPosition;
  x: number;
  y: number;
}

const GK_SLOT: FormationSlot = { id: "GK-0", position: "GK", x: 50, y: 10 };

/**
 * The full, ordered set of exactly 11 starting-XI slots for Eleven's one
 * supported formation (4-4-2), each with a STABLE id (e.g. "DEF-0".."DEF-3",
 * left-to-right matching `FORMATION_COORDINATES`) tied to its realistic
 * coordinate — Pass 10.5C.2's canonical slot identity. The Team lineup
 * editor (`team-workspace.tsx`) uses these ids so a player assigned to a
 * specific slot (e.g. by clicking "right CB") stays there for the rest of
 * the editing session regardless of what gets assigned to other slots
 * afterward — the previous implementation only tracked "this player is a
 * DEF starter" and re-derived left-to-right placement generically on
 * every render, which silently reordered players as more were added.
 */
export function formationSlots(): FormationSlot[] {
  const slots: FormationSlot[] = [GK_SLOT];
  for (const position of ["DEF", "MID", "FWD"] as const) {
    const coords = FORMATION_COORDINATES[position] ?? [];
    coords.forEach((coord, i) => {
      slots.push({ id: `${position}-${i}`, position, x: coord.x, y: coord.y });
    });
  }
  return slots;
}

export interface SlotAssignable {
  position: PlayerPosition;
}

/**
 * Maps a stably-ordered list of items (e.g. real persisted starters,
 * already sorted the way the caller wants them to land left-to-right —
 * see `roster.ts`'s `updated_at` sort) onto a formation's slot ids: item
 * i of position P lands on that position's i-th slot, e.g. the first DEF
 * item gets "DEF-0" (Pass 10.5C.2's stable slot identity — see
 * `formationSlots`). A position with fewer items than slots simply leaves
 * the remaining slot ids absent from the result (empty); a position with
 * MORE items than slots (shouldn't happen when `items`' own counts match
 * the target formation) silently drops the excess rather than crashing.
 */
export function assignToSlots<T extends SlotAssignable>(items: T[], slots: FormationSlot[]): Map<string, T> {
  const assignment = new Map<string, T>();
  const positions: PlayerPosition[] = ["GK", "DEF", "MID", "FWD"];
  for (const position of positions) {
    const slotsForPosition = slots.filter((s) => s.position === position);
    const itemsForPosition = items.filter((item) => item.position === position);
    slotsForPosition.forEach((slot, i) => {
      const item = itemsForPosition[i];
      if (item) assignment.set(slot.id, item);
    });
  }
  return assignment;
}

/** Groups by position, then places each row using 4-4-2's realistic preset coordinates when the group's size matches it exactly, else the original even 10-90 spread (a lone player centers at x=50). */
export function layoutStartingXi<T>(starters: LayoutInput<T>[]): LayoutResult<T>[] {
  const byPosition = new Map<PlayerPosition, LayoutInput<T>[]>();
  for (const starter of starters) {
    const list = byPosition.get(starter.position) ?? [];
    list.push(starter);
    byPosition.set(starter.position, list);
  }

  const result: LayoutResult<T>[] = [];
  for (const [position, players] of byPosition) {
    const n = players.length;
    const preset = FORMATION_COORDINATES[position];

    if (preset && preset.length === n) {
      players.forEach((player, i) => {
        result.push({ position, value: player.value, x: preset[i].x, y: preset[i].y });
      });
    } else {
      const y = ROW_Y[position];
      players.forEach((player, i) => {
        const x = n === 1 ? 50 : 10 + (i * 80) / (n - 1);
        result.push({ position, value: player.value, x, y });
      });
    }
  }
  return result;
}
