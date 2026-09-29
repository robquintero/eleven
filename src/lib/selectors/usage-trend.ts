/**
 * Pure derivations over a player's real recent-match data
 * (`getPlayerRecentMatches`) — the "underlying recent-match data/selectors"
 * the Pass 8 brief (§24) asks Form Tracker's foundation to prepare,
 * without computing anything that looks like an Eleven fantasy score.
 * Every input here is a raw football stat (minutes, started); there is no
 * points/rating concept anywhere in this module.
 */

export interface RecentMatch {
  minutes: number;
  started: boolean;
}

export interface UsageTrend {
  /** Minutes played per match, oldest first — the sparkline series. */
  minutesByMatch: number[];
  averageMinutes: number;
  starts: number;
  /** Fraction of matches started, 0-1. */
  startRate: number;
  matchesConsidered: number;
}

/** `null` when there isn't enough real match history yet — render "INSUFFICIENT MATCH DATA", never a guessed trend. */
export function getUsageTrend(matches: RecentMatch[]): UsageTrend | null {
  if (matches.length === 0) return null;

  const starts = matches.filter((m) => m.started).length;
  const totalMinutes = matches.reduce((sum, m) => sum + m.minutes, 0);

  return {
    minutesByMatch: matches.map((m) => m.minutes),
    averageMinutes: Math.round((totalMinutes / matches.length) * 10) / 10,
    starts,
    startRate: Math.round((starts / matches.length) * 100) / 100,
    matchesConsidered: matches.length,
  };
}
