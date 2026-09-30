/**
 * Pure decision logic behind Home's "LIVE_FIXTURES"/"NEXT_LOCK" modules
 * (Pass 10.5B) — separated from `src/data-access/matchups.ts`'s I/O
 * (fetching the actual fixture rows) so the round-aware
 * live-vs-upcoming-vs-no-data distinction is independently unit-testable,
 * matching this codebase's convention of pure domain logic + a thin
 * data-access wrapper (see roster-rules.ts, auto-lineup.ts, formations.ts).
 *
 * The three states this must NEVER conflate (see docs/game-rules.md and
 * the Pass 10.5B brief):
 *   - 0 fixtures currently live (a normal, common state)
 *   - genuinely no stored fixture data for the relevant clubs at all
 *   - a real next-upcoming fixture, strictly within THIS round's window
 *     (never a future round, just to have something to show)
 */

import type { RoundWindow } from "./round-calendar.ts";

export type FixtureStatus = "scheduled" | "live" | "ht" | "final" | "postponed";

export interface FixtureRow {
  kickoffAt: string;
  status: FixtureStatus;
  homeClubId: string;
  awayClubId: string;
}

export interface FixtureIntelligenceResult {
  liveFixtureCount: number;
  /** `false` only when `fixtures` is empty -- never merely because nothing is live/upcoming right now. */
  hasAnyFixtureData: boolean;
  /** The soonest still-scheduled fixture at/after `now`, strictly inside `window` -- `null` if none (not the same as "no data": data can exist entirely in the past, or entirely outside this round). */
  nextFixture: FixtureRow | null;
}

function isWithin(kickoffAt: string, window: RoundWindow): boolean {
  const t = new Date(kickoffAt).getTime();
  return t >= window.startsAt.getTime() && t < window.endsAt.getTime();
}

export function computeFixtureIntelligence(
  fixtures: FixtureRow[],
  window: RoundWindow,
  now: Date
): FixtureIntelligenceResult {
  const hasAnyFixtureData = fixtures.length > 0;

  const liveFixtureCount = fixtures.filter(
    (f) => (f.status === "live" || f.status === "ht") && isWithin(f.kickoffAt, window)
  ).length;

  const nowMs = now.getTime();
  const nextFixture =
    fixtures
      .filter((f) => f.status === "scheduled" && new Date(f.kickoffAt).getTime() >= nowMs && isWithin(f.kickoffAt, window))
      .sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime())[0] ?? null;

  return { liveFixtureCount, hasAnyFixtureData, nextFixture };
}
