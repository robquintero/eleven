/**
 * Eleven's fixed weekly fantasy-round boundary — Tuesday 00:00 UTC to the
 * following Monday 23:59:59.999 UTC. See docs/fantasy-round-calendar-analysis.md
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
/** 2000-01-04T00:00:00Z is a Tuesday — an arbitrary, stable anchor for the windowing math below. Any Tuesday 00:00 UTC works identically; this one predates any real Eleven data by decades so there's no risk of it ever needing to change. */
const ANCHOR_TUESDAY_UTC = Date.UTC(2000, 0, 4);

/** The Tue→Mon window a given instant falls inside. */
export function roundWindowContaining(date: Date): RoundWindow {
  const diff = date.getTime() - ANCHOR_TUESDAY_UTC;
  const windowIndex = Math.floor(diff / ROUND_LENGTH_MS);
  const startsAt = new Date(ANCHOR_TUESDAY_UTC + windowIndex * ROUND_LENGTH_MS);
  const endsAt = new Date(startsAt.getTime() + ROUND_LENGTH_MS);
  return { startsAt, endsAt };
}

/** The window immediately following `window` — adjacent, non-overlapping, same length. */
export function nextRoundWindow(window: RoundWindow): RoundWindow {
  return { startsAt: window.endsAt, endsAt: new Date(window.endsAt.getTime() + ROUND_LENGTH_MS) };
}

/** Whether `date` falls inside `window` — start inclusive, end exclusive. */
export function isWithinWindow(date: Date, window: RoundWindow): boolean {
  return date >= window.startsAt && date < window.endsAt;
}

/** Two windows are the same window iff they start at the same instant (length is always fixed). */
export function isSameWindow(a: RoundWindow, b: RoundWindow): boolean {
  return a.startsAt.getTime() === b.startsAt.getTime();
}
