/**
 * Pass 12A: pure season-schedule math. Deliberately does NOT reimplement
 * pairing generation — `generateRoundRobinCycle`/`pairingsForSeasonRound`
 * (./schedule.ts) are reused exactly as they already are; this module
 * only answers "how many fantasy rounds does a season with N managers and
 * C round-robin cycles actually have," which the existing scheduler never
 * needed to know on its own (it just produces pairings for whichever
 * round number it's asked about).
 */

export type ScheduleCycles = 1 | 2 | 3;

export const DEFAULT_SCHEDULE_CYCLES: ScheduleCycles = 2;

/** UI label for each schedule format — lives here (not a data-access/UI file) so client components can import it without pulling in any server-only code. */
export const SCHEDULE_CYCLES_LABEL: Record<ScheduleCycles, string> = {
  1: "ONCE",
  2: "TWICE",
  3: "THREE TIMES",
};

export function isValidScheduleCycles(value: number): value is ScheduleCycles {
  return value === 1 || value === 2 || value === 3;
}

/**
 * Rounds in ONE round-robin cycle — `teamCount - 1` for an even manager
 * count, `teamCount` for an odd one (one BYE per manager per cycle, same
 * synthetic-null-slot mechanism `generateRoundRobinCycle` already uses).
 * `teamCount < 2` has no meaningful schedule at all (1 fantasy round).
 */
export function computeCycleLength(teamCount: number): number {
  if (teamCount < 2) return 1;
  return teamCount % 2 === 0 ? teamCount - 1 : teamCount;
}

/** Total fantasy rounds for a full season: one cycle's length, repeated `scheduleCycles` times (everyone plays everyone once/twice/three times). */
export function computeTotalRounds(teamCount: number, scheduleCycles: ScheduleCycles): number {
  return computeCycleLength(teamCount) * scheduleCycles;
}

export type SeasonLifecycleStatus = "SETUP" | "ACTIVE" | "COMPLETED";

/**
 * Pass 13: the read-only "SEASON 2 · TWICE · ROUND 3 / 14 · ACTIVE"
 * identity line — the League page's lightweight header-strip replacement
 * for the old always-boxed season status panel (see DESIGN.md §23/§6 —
 * "make current season/round state feel important without giant cards").
 * Takes plain primitives rather than a `SeasonSummary` (data-access) so
 * this stays a dependency-free domain function; `null` renders a truthful
 * pre-season label rather than fabricating a round.
 */
export function leagueSeasonIdentityLabel(
  season: {
    seasonNumber: number;
    scheduleCycles: ScheduleCycles;
    totalRounds: number | null;
    currentRoundNumber: number | null;
    status: SeasonLifecycleStatus;
  } | null
): string {
  if (!season) return "SEASON NOT STARTED";
  const roundLabel =
    season.totalRounds !== null && season.currentRoundNumber !== null
      ? `ROUND ${season.currentRoundNumber} / ${season.totalRounds}`
      : season.totalRounds !== null
        ? `${season.totalRounds} ROUNDS SCHEDULED`
        : "SCHEDULE PENDING";
  return `SEASON ${season.seasonNumber} · ${SCHEDULE_CYCLES_LABEL[season.scheduleCycles]} · ${roundLabel} · ${season.status}`;
}
