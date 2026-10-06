/**
 * Eleven's Tuesday → Monday calendar: Tuesday 06:00 UTC to the following
 * Tuesday 06:00 UTC, end exclusive. See docs/fantasy-round-calendar-analysis.md
 * for the empirical evidence and docs/game-rules.md "Fantasy round boundary"
 * for why. Pure calendar math only — knows nothing about leagues, fixtures,
 * or which weeks actually have eligible football in them (that's
 * `src/lib/fantasy-engine/rounds.ts`'s job, since it requires a DB read).
 *
 * Every function here is a pure function of its arguments — no
 * `Date.now()`/`new Date()` read internally, per the Pass 9 clock-injection
 * rule extended to fantasy game logic (brief §Clock injection).
 */

export interface RoundWindow {
  /** Inclusive. */
  startsAt: Date;
  /** Exclusive. */
  endsAt: Date;
}

const ROUND_LENGTH_MS = 7 * 24 * 60 * 60 * 1000;
/** Fixed UTC hour; never a local-time/DST rule. */
export const ROUND_BOUNDARY_UTC_HOUR = 6;
/** An arbitrary Tuesday before any real Eleven data. */
const ANCHOR_TUESDAY_UTC = Date.UTC(2000, 0, 4, ROUND_BOUNDARY_UTC_HOUR);

/** The Tue→Mon window a given instant falls inside. */
export function roundWindowContaining(date: Date): RoundWindow {
  const diff = date.getTime() - ANCHOR_TUESDAY_UTC;
  const windowIndex = Math.floor(diff / ROUND_LENGTH_MS);
  const startsAt = new Date(ANCHOR_TUESDAY_UTC + windowIndex * ROUND_LENGTH_MS);
  const endsAt = new Date(startsAt.getTime() + ROUND_LENGTH_MS);
  return { startsAt, endsAt };
}

/** Next canonical window — adjacent for canonical inputs, never overlapping. */
export function nextRoundWindow(window: RoundWindow): RoundWindow {
  // Legacy persisted windows can end at midnight. New recurring windows
  // always use the canonical boundary, never propagate that old anchor.
  const containingEnd = roundWindowContaining(window.endsAt);
  const startsAt = containingEnd.startsAt < window.endsAt ? containingEnd.endsAt : window.endsAt;
  return { startsAt, endsAt: new Date(startsAt.getTime() + ROUND_LENGTH_MS) };
}

/** Whether `date` falls inside `window` — start inclusive, end exclusive. */
export function isWithinWindow(date: Date, window: RoundWindow): boolean {
  return date >= window.startsAt && date < window.endsAt;
}

/** Two windows are the same window iff they start at the same instant (length is always fixed). */
export function isSameWindow(a: RoundWindow, b: RoundWindow): boolean {
  return a.startsAt.getTime() === b.startsAt.getTime();
}
