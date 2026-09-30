import type { PlayerPosition } from "@/domain/football/types";
import type { LeagueSettings } from "@/domain/fantasy/types";

/**
 * Starting-XI composition rules. This is intentionally the full extent of
 * formation validation for this pass — see docs/domain-model.md "Formation
 * rules." Bench eligibility, empty-slot handling, and formation-name
 * derivation (4-3-3 vs 4-4-2 vs 3-5-2) are deferred.
 */
export const FORMATION_RULES: {
  startersTotal: number;
  squadSizeApprox: number;
  positionRange: Record<PlayerPosition, { min: number; max: number }>;
} = {
  startersTotal: 11,
  squadSizeApprox: 16,
  positionRange: {
    GK: { min: 1, max: 1 },
    DEF: { min: 3, max: 5 },
    MID: { min: 3, max: 5 },
    FWD: { min: 1, max: 3 },
  },
};

export const DEFAULT_LEAGUE_SETTINGS: LeagueSettings = {
  maxTeams: 10,
  squadSize: FORMATION_RULES.squadSizeApprox,
  starterCount: FORMATION_RULES.startersTotal,
  waiverMode: "priority",
  playoffEnabled: true,
  draftType: "snake",
  pickTimerSeconds: 60,
};

/**
 * Checks that a set of starter position counts satisfies `FORMATION_RULES`
 * — exactly 11 starters, within each position's min/max range. Pure and
 * deliberately simple; it doesn't know about specific players, bench
 * eligibility, or which formation name (4-3-3, etc.) the counts imply.
 */
export function isStarterCompositionValid(
  counts: Partial<Record<PlayerPosition, number>>
): boolean {
  const total = Object.values(counts).reduce((sum: number, n) => sum + (n ?? 0), 0);
  if (total !== FORMATION_RULES.startersTotal) return false;

  return (Object.keys(FORMATION_RULES.positionRange) as PlayerPosition[]).every(
    (position) => {
      const { min, max } = FORMATION_RULES.positionRange[position];
      const count = counts[position] ?? 0;
      return count >= min && count <= max;
    }
  );
}

/**
 * The `"DEF-MID-FWD"` label for a real starting XI's position counts
 * (e.g. `{DEF:4, MID:4, FWD:2}` → `"4-4-2"`) — GK is never shown, matching
 * real football's own formation-naming convention. Any valid combination
 * FORMATION_RULES allows gets a label, not just the handful of common
 * named formations.
 */
export function deriveFormationLabel(
  counts: Partial<Record<PlayerPosition, number>>
): `${number}-${number}-${number}` {
  return `${counts.DEF ?? 0}-${counts.MID ?? 0}-${counts.FWD ?? 0}`;
}
