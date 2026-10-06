import type { PlayerPosition } from "../football/types.ts";

export const SCORING_RULE_VERSION_V4 = "ELEVEN_STANDARD_V4" as const;
export type V4Category = "ATTACKING" | "PLAYMAKING" | "BALL CARRYING" | "DEFENSE" | "PHYSICAL" | "GOALKEEPING" | "DISCIPLINE / OTHER";
export interface V4StatDefinition {
  key: string; label: string; category: V4Category; field: string;
  /** Integer hundredths of one point; never percentages or provider ratings. */
  units: number; positionUnits?: Record<PlayerPosition, number>; goalkeeperOnly?: boolean;
}
export const V4_DEFENSIVE_UNITS = { GK: 50, DEF: 50, MID: 25, FWD: 10 } as const;
export const V4_DUELS_UNITS = { GK: 10, DEF: 25, MID: 20, FWD: 15 } as const;
/** Actual scoring and Game Rules consume this same configuration. */
export const SCORING_V4_STATS: readonly V4StatDefinition[] = [
  { key: "goals", label: "GOALS", category: "ATTACKING", field: "goals.total", units: 700 },
  { key: "shots", label: "SHOTS", category: "ATTACKING", field: "shots.total", units: 100 },
  { key: "shotsOnTarget", label: "SHOTS ON TARGET", category: "ATTACKING", field: "shots.on", units: 200 },
  { key: "assists", label: "ASSISTS", category: "PLAYMAKING", field: "goals.assists", units: 400 },
  { key: "penaltiesWon", label: "PENALTIES WON", category: "PLAYMAKING", field: "penalty.won", units: 400 },
  { key: "keyPasses", label: "KEY PASSES", category: "PLAYMAKING", field: "passes.key", units: 25 },
  { key: "successfulDribbles", label: "SUCCESSFUL DRIBBLES", category: "BALL CARRYING", field: "dribbles.success", units: 25 },
  { key: "foulsDrawn", label: "FOULS DRAWN", category: "BALL CARRYING", field: "fouls.drawn", units: 25 },
  { key: "tackles", label: "TACKLES", category: "DEFENSE", field: "tackles.total", units: 100, positionUnits: V4_DEFENSIVE_UNITS },
  { key: "interceptions", label: "INTERCEPTIONS", category: "DEFENSE", field: "tackles.interceptions", units: 100, positionUnits: V4_DEFENSIVE_UNITS },
  { key: "blocks", label: "BLOCKS", category: "DEFENSE", field: "tackles.blocks", units: 100, positionUnits: V4_DEFENSIVE_UNITS },
  { key: "duelsWon", label: "DUELS WON", category: "PHYSICAL", field: "duels.won", units: 100, positionUnits: V4_DUELS_UNITS },
  { key: "saves", label: "SAVES", category: "GOALKEEPING", field: "goals.saves", units: 100, goalkeeperOnly: true },
  { key: "penaltiesSaved", label: "PENALTIES SAVED", category: "GOALKEEPING", field: "penalty.saved", units: 500, goalkeeperOnly: true },
  { key: "yellowCards", label: "YELLOW CARDS", category: "DISCIPLINE / OTHER", field: "cards.yellow", units: -100 },
  { key: "redCards", label: "RED CARDS", category: "DISCIPLINE / OTHER", field: "cards.red", units: -400 },
  { key: "foulsCommitted", label: "FOULS COMMITTED", category: "DISCIPLINE / OTHER", field: "fouls.committed", units: -25 },
  { key: "penaltiesMissed", label: "PENALTIES MISSED", category: "DISCIPLINE / OTHER", field: "penalty.missed", units: -300 },
];
export const SCORING_V4_WEIGHTS = {
  stats: SCORING_V4_STATS,
  minutes: { appearance: 100, significant: 200, fullMatch: 300, significantThreshold: 60, fullMatchThreshold: 90 },
  cleanSheet: { GK: 700, DEF: 600, MID: 300, FWD: 0 }, cleanSheetMinutesThreshold: 60,
} as const;

export interface ScoringInputV4 {
  position: PlayerPosition;
  /** Null/missing is unavailable, never an explicit zero. */
  stats: Readonly<Record<string, number | null | undefined>>;
  concededByOwnTeam: number | null;
}
export interface ScoreEntryV4 {
  key: string; label: string; category: V4Category; count: number | null;
  unitsPerEvent: number; multiplier: number; units: number;
}
export interface FantasyScoreBreakdownV4 {
  schema: 4; scoringRuleVersion: typeof SCORING_RULE_VERSION_V4; position: PlayerPosition;
  total: number; totalUnits: number; components: Record<string, number>;
  entries: ScoreEntryV4[]; unavailable: string[];
}
function count(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
/** Pure snapshot recomputation. No state, no accumulation, no BMI. */
export function calculateFantasyScoreV4(input: ScoringInputV4): FantasyScoreBreakdownV4 {
  const entries: ScoreEntryV4[] = SCORING_V4_STATS.map(rule => {
    const value = count(input.stats[rule.key]);
    const positionUnits = rule.positionUnits?.[input.position];
    const multiplier = positionUnits === undefined ? 1 : positionUnits / rule.units;
    const units = rule.goalkeeperOnly && input.position !== "GK" ? 0 : (value ?? 0) * (positionUnits ?? rule.units);
    return { key: rule.key, label: rule.label, category: rule.category, count: value, unitsPerEvent: rule.units, multiplier, units: units || 0 };
  });
  const minutes = count(input.stats.minutes);
  const w = SCORING_V4_WEIGHTS;
  const minutesUnits = minutes === null || minutes === 0 ? 0 : minutes >= w.minutes.fullMatchThreshold ? w.minutes.fullMatch : minutes >= w.minutes.significantThreshold ? w.minutes.significant : w.minutes.appearance;
  entries.push({ key: "minutes", label: "APPEARANCE", category: "DISCIPLINE / OTHER", count: minutes, unitsPerEvent: minutesUnits, multiplier: 1, units: minutesUnits });
  // Preserve V3's participation threshold + own-side fixture score policy.
  // Does not claim on-pitch-only concessions or invent substitution timing.
  const conceded = count(input.concededByOwnTeam);
  const eligible = minutes !== null && conceded !== null ? Number(minutes >= w.cleanSheetMinutesThreshold && conceded === 0) : null;
  entries.push({ key: "cleanSheet", label: "CLEAN SHEET", category: "GOALKEEPING", count: eligible, unitsPerEvent: w.cleanSheet[input.position], multiplier: 1, units: (eligible ?? 0) * w.cleanSheet[input.position] });
  const totalUnits = entries.reduce((sum, entry) => sum + entry.units, 0);
  if (!Number.isSafeInteger(totalUnits)) throw new Error("V4 score exceeds integer precision");
  return { schema: 4, scoringRuleVersion: SCORING_RULE_VERSION_V4, position: input.position,
    totalUnits, total: totalUnits / 100, entries,
    components: Object.fromEntries(entries.map(entry => [entry.key, entry.units / 100])),
    unavailable: entries.filter(entry => entry.count === null).map(entry => entry.key),
  };
}
