/**
 * Pure pitch-coordinate layout for a starting XI — pure function of
 * position counts, no I/O. The old mock data supplied `x`/`y` directly;
 * now that starters come from real `lineup_slots`, something has to
 * compute where each position's row sits and how its players spread
 * across it. Deliberately simple: one evenly-spaced row per position,
 * bottom-to-top GK → DEF → MID → FWD (attacking direction is "up" the
 * pitch, matching `Pitch`'s own `top: 100 - y` convention).
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

/** Groups by position, then spreads each row's players evenly across x (10-90%) so a lone player sits centered and a full row of 5 doesn't crowd the touchlines. */
export function layoutStartingXi<T>(starters: LayoutInput<T>[]): LayoutResult<T>[] {
  const byPosition = new Map<PlayerPosition, LayoutInput<T>[]>();
  for (const starter of starters) {
    const list = byPosition.get(starter.position) ?? [];
    list.push(starter);
    byPosition.set(starter.position, list);
  }

  const result: LayoutResult<T>[] = [];
  for (const [position, players] of byPosition) {
    const y = ROW_Y[position];
    const n = players.length;
    players.forEach((player, i) => {
      const x = n === 1 ? 50 : 10 + (i * 80) / (n - 1);
      result.push({ position, value: player.value, x, y });
    });
  }
  return result;
}
