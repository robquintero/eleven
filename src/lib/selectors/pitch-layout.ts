/**
 * Pure pitch-coordinate layout for a starting XI — pure function of
 * position counts (and, since Pass 10.5C.1, the named formation), no I/O.
 * The old mock data supplied `x`/`y` directly; now that starters come
 * from real `lineup_slots`, something has to compute where each
 * position's row sits and how its players spread across it. Attacking
 * direction is "up" the pitch, matching `Pitch`'s own `top: 100 - y`
 * convention.
 *
 * Presentation only — this never changes formation validation/legality
 * (see `src/domain/fantasy/formations.ts`), only where a slot is drawn.
 */

import type { PlayerPosition } from "@/domain/football/types";
import type { FormationName } from "@/domain/fantasy/formations";

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
 * Realistic per-formation coordinates for DEF/MID/FWD (Pass 10.5C.1) —
 * evenly-spaced rows read as a flat "grid," not a real football shape
 * (most visibly: a 4-4-2 strike partnership spread almost to the
 * touchlines instead of standing close together centrally). GK is always
 * exactly 1 and stays centered via the generic fallback below, so it has
 * no entry here. Each array is one fixed, stable left-to-right ordering
 * that callers' own (already position-grouped, stably-ordered) items are
 * zipped against 1:1 — used only when the group's size exactly matches
 * the preset's length; a non-standard composition (e.g. reached only
 * through individual manual swaps, never one of the 5 named shapes)
 * falls back to the original even 10-90 spread instead.
 */
const FORMATION_COORDINATES: Record<FormationName, Partial<Record<PlayerPosition, { x: number; y: number }[]>>> = {
  "4-4-2": {
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
  },
  "4-3-3": {
    DEF: [
      { x: 12, y: 26 },
      { x: 37, y: 22 },
      { x: 63, y: 22 },
      { x: 88, y: 26 },
    ],
    // A compact midfield triangle: one deeper pivot, two more advanced.
    MID: [
      { x: 28, y: 60 },
      { x: 50, y: 46 },
      { x: 72, y: 60 },
    ],
    // Central striker flanked by two genuinely wider, slightly withdrawn forwards.
    FWD: [
      { x: 15, y: 78 },
      { x: 50, y: 88 },
      { x: 85, y: 78 },
    ],
  },
  "4-2-3-1": {
    DEF: [
      { x: 12, y: 26 },
      { x: 37, y: 22 },
      { x: 63, y: 22 },
      { x: 88, y: 26 },
    ],
    // Compact double pivot, then a wide-CAM-wide attacking three underneath the striker.
    MID: [
      { x: 36, y: 44 },
      { x: 64, y: 44 },
      { x: 15, y: 66 },
      { x: 50, y: 70 },
      { x: 85, y: 66 },
    ],
    FWD: [{ x: 50, y: 88 }],
  },
  "3-5-2": {
    // Compact back three.
    DEF: [
      { x: 22, y: 24 },
      { x: 50, y: 20 },
      { x: 78, y: 24 },
    ],
    // Width comes from the wing positions either side of a central trio.
    MID: [
      { x: 8, y: 52 },
      { x: 32, y: 46 },
      { x: 50, y: 42 },
      { x: 68, y: 46 },
      { x: 92, y: 52 },
    ],
    FWD: [
      { x: 40, y: 86 },
      { x: 60, y: 86 },
    ],
  },
  "3-4-3": {
    DEF: [
      { x: 22, y: 24 },
      { x: 50, y: 20 },
      { x: 78, y: 24 },
    ],
    MID: [
      { x: 12, y: 54 },
      { x: 37, y: 50 },
      { x: 63, y: 50 },
      { x: 88, y: 54 },
    ],
    FWD: [
      { x: 18, y: 80 },
      { x: 50, y: 88 },
      { x: 82, y: 80 },
    ],
  },
};

/** Groups by position, then places each row using `formation`'s realistic preset coordinates when the group's size matches it exactly, else the original even 10-90 spread (a lone player centers at x=50). */
export function layoutStartingXi<T>(starters: LayoutInput<T>[], formation?: FormationName): LayoutResult<T>[] {
  const byPosition = new Map<PlayerPosition, LayoutInput<T>[]>();
  for (const starter of starters) {
    const list = byPosition.get(starter.position) ?? [];
    list.push(starter);
    byPosition.set(starter.position, list);
  }

  const result: LayoutResult<T>[] = [];
  for (const [position, players] of byPosition) {
    const n = players.length;
    const preset = formation ? FORMATION_COORDINATES[formation]?.[position] : undefined;

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
