/**
 * Form Tracker (Pass 9 §Phase 7) — real Eleven fantasy points averaged
 * over the last 3/5/10 completed matches, derived from
 * `RecentMatchRow.fantasyPoints` (src/data-access/players.ts). Each window
 * is independently `null` when there isn't enough real history to fill
 * it — "last 10" with only 4 matches played is INSUFFICIENT MATCH DATA,
 * not a average of what happens to exist mislabeled as a 10-match window.
 * Matches with `fantasyPoints: null` (not yet scored) are excluded from
 * the average rather than treated as 0.
 */

export interface FormMatch {
  fantasyPoints: number | null;
}

export interface FormWindows {
  last3: number | null;
  last5: number | null;
  last10: number | null;
}

const WINDOWS = [3, 5, 10] as const;

function windowAverage(matches: FormMatch[], size: number): number | null {
  if (matches.length < size) return null;
  const window = matches.slice(0, size).filter((m) => m.fantasyPoints !== null);
  if (window.length === 0) return null;
  const sum = window.reduce((total, m) => total + (m.fantasyPoints as number), 0);
  return Math.round((sum / window.length) * 100) / 100;
}

/** `matches` must be most-recent-first (same order `getPlayerRecentMatches` returns). */
export function getFormWindows(matches: FormMatch[]): FormWindows {
  const [last3, last5, last10] = WINDOWS.map((size) => windowAverage(matches, size));
  return { last3, last5, last10 };
}
