import type { PlayerPosition } from "@/domain/football/types";
import type { LeagueSettings } from "@/domain/fantasy/types";

/**
 * Starting-XI composition rules. Pass 10.5C.5: Eleven V1 supports exactly
 * ONE formation, 4-4-2 — `positionRange` is now a single fixed point
 * (min === max for every position) rather than a range spanning multiple
 * named formations, so `isStarterCompositionValid` below rejects anything
 * that isn't exactly 1 GK / 4 DEF / 4 MID / 2 FWD. This is also why
 * `chooseAutomaticStartingXi` (auto-lineup.ts) always produces exactly
 * 4-4-2 with no changes of its own: its minimums-first fill (GK 1, DEF 4,
 * MID 4, FWD 2) already sums to 11, so its later "fill the rest" pass
 * never has anything left to do.
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
    DEF: { min: 4, max: 4 },
    MID: { min: 4, max: 4 },
    FWD: { min: 2, max: 2 },
  },
};

/**
 * The canonical 16-player SQUAD (not starting-XI) composition rule —
 * every roster (drafted, and later free-agency/waivers/trades) must
 * satisfy this, not just `FORMATION_RULES`' looser starting-XI ranges.
 * Note the two rule sets are deliberately different: a squad needs a
 * *deeper* bench than any single matchday's XI requires (e.g. exactly 2
 * GK on the roster so a manager always has a backup, even though only 1
 * ever starts). See `src/domain/fantasy/roster-rules.ts` for the
 * authoritative validation functions built on this — Pass 11's free
 * agency/waivers/trades are expected to reuse those, not re-derive their
 * own copy of these numbers.
 */
export const ROSTER_RULES: {
  squadSize: number;
  positionRange: Record<PlayerPosition, { min: number; max: number }>;
} = {
  squadSize: 16,
  positionRange: {
    GK: { min: 2, max: 2 },
    DEF: { min: 4, max: 6 },
    MID: { min: 4, max: 6 },
    FWD: { min: 2, max: 4 },
  },
};

/**
 * The minimum number of managers required before a commissioner may
 * start the draft — deliberately NOT the same as `settings.maxTeams`
 * (the league's configured target size). A league configured for 10
 * managers can still start its draft with as few as 2; the commissioner
 * chooses when to start, Eleven never requires hitting the configured
 * target first and never auto-starts on reaching this minimum either.
 * Mirrored as a literal in `start_draft()`
 * (supabase/migrations/20260930024807_draft_engine.sql) since SQL can't
 * import this constant — keep both in sync if this ever changes.
 */
export const MIN_MANAGERS_TO_START_DRAFT = 2;

export const DEFAULT_LEAGUE_SETTINGS: LeagueSettings = {
  maxTeams: 10,
  squadSize: FORMATION_RULES.squadSizeApprox,
  starterCount: FORMATION_RULES.startersTotal,
  waiverMode: "priority",
  playoffEnabled: true,
  draftType: "snake",
  // 5 minutes -- deliberately generous for current testing (Pass 10.5).
  // Mirrored in create_league()'s own SQL default
  // (supabase/migrations/20260929141145_functions.sql) and
  // resolve_expired_pick()'s defensive fallback -- keep all three in
  // sync if this ever changes. Not configurable per-league this pass.
  pickTimerSeconds: 300,
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
