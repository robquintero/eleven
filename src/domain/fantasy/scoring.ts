/**
 * Eleven's production fantasy scoring engine — pure, deterministic,
 * versioned. See docs/scoring-model.md for the empirical field-coverage
 * analysis and the reasoning behind every coefficient below; this module
 * is the SINGLE place those coefficients live (brief: "do not scatter
 * scoring constants through UI/components").
 *
 * Deliberately NOT expressed as this file's own `ScoringRule[]` (a flat
 * `stat * multiplier` list) even though that type already exists in this
 * module — two of Eleven's rules genuinely don't fit that shape:
 *   - MINUTES is a threshold/step function (any appearance vs. 60+
 *     minutes), not a linear per-minute rate.
 *   - CLEAN SHEET isn't a stored raw stat at all — it's derived from the
 *     fixture's final score + the player's position + their minutes in
 *     that match (see `fixtures.home_score`/`away_score`'s migration
 *     comment). `ScoringRule` has nothing to derive from; it only reads
 *     already-stored per-stat numbers.
 * A generic rule DSL that could express both is unnecessary complexity
 * for one production formula — `ScoringRule` stays available (unused
 * today) for a future per-league custom-override system.
 *
 * NEVER uses a provider "rating" field, and never trusts a provider's own
 * fantasy-points field — see docs/domain-model.md invariant #10.
 */

import type { PlayerPosition } from "@/domain/football/types";

export const SCORING_RULE_VERSION = "ELEVEN_STANDARD_V1" as const;
export type ScoringRuleVersion = typeof SCORING_RULE_VERSION;

/** Raw inputs the engine needs for one player's one fixture appearance — every field is either a stored `player_match_stats` column or a directly-derivable fact (never a guess). */
export interface ScoringInput {
  position: PlayerPosition;
  minutes: number;
  goals: number;
  assists: number;
  shotsOnTarget: number;
  chancesCreated: number;
  tackles: number;
  interceptions: number;
  blocks: number;
  saves: number;
  yellowCards: number;
  redCards: number;
  /**
   * Goals conceded by the PLAYER'S OWN CLUB in this fixture, or `null`
   * when the fixture's final score isn't known yet (never fabricated —
   * see `fixtures.home_score`/`away_score`). `null` always means "no
   * clean-sheet component," the same as a genuinely non-zero concession.
   */
  concededByOwnClub: number | null;
}

export interface FantasyScoreBreakdown {
  total: number;
  scoringRuleVersion: ScoringRuleVersion;
  components: {
    minutes: number;
    goals: number;
    assists: number;
    shooting: number;
    creation: number;
    defending: number;
    goalkeeping: number;
    cleanSheet: number;
    discipline: number;
  };
}

/**
 * Minutes threshold: 1 point for any appearance, 2 total once 60+ minutes
 * are reached — the same "did they meaningfully feature" curve most
 * fantasy football products use, chosen because a flat per-minute rate
 * would reward a 90th-minute substitute appearance ~90x less than it
 * should relative to a full 90-minute shift, which isn't how real squad
 * rotation value works.
 */
const MINUTES_APPEARANCE_POINTS = 1;
const MINUTES_FULL_SHIFT_POINTS = 2;
const MINUTES_FULL_SHIFT_THRESHOLD = 60;

/** Goals scored, by position — rarer for defensive positions, weighted higher: a center back's goal is a bigger fantasy event than a striker's. */
const GOALS_BY_POSITION: Record<PlayerPosition, number> = { GK: 10, DEF: 6, MID: 5, FWD: 4 };

const ASSIST_POINTS = 3;

/** Clean sheet — requires 60+ minutes (a substitute who plays the last 5 minutes of a shutout shouldn't get full credit) and a real, known 0-concession result. Zero for forwards: a striker's fantasy value isn't about defensive results. */
const CLEAN_SHEET_BY_POSITION: Record<PlayerPosition, number> = { GK: 4, DEF: 4, MID: 1, FWD: 0 };
const CLEAN_SHEET_MINUTES_THRESHOLD = 60;

const SHOT_ON_TARGET_POINTS = 0.5;
const CHANCE_CREATED_POINTS = 0.5;
/** Tackles + interceptions + blocks, summed then weighted per action — deliberately modest per-action, but a genuinely busy defensive shift (5+ actions) adds up to real, clean-sheet-independent value, which is what keeps a good defender's score meaningful even in a game their side doesn't win. */
const DEFENSIVE_ACTION_POINTS = 0.25;
/** GK saves only; other positions never record saves (see docs/scoring-model.md coverage report). */
const SAVES_PER_POINT = 3;

const YELLOW_CARD_POINTS = -1;
const RED_CARD_POINTS = -3;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Deterministic and idempotent: the same `ScoringInput` always produces
 * the exact same `FantasyScoreBreakdown`, with no dependency on the
 * current clock, the provider, or any UI state. Safe to call as many
 * times as needed (recomputation, not accumulation) — see
 * `docs/scoring-model.md` "Why recompute, never increment."
 */
export function calculateFantasyScore(input: ScoringInput): FantasyScoreBreakdown {
  const minutesPoints =
    input.minutes >= MINUTES_FULL_SHIFT_THRESHOLD
      ? MINUTES_FULL_SHIFT_POINTS
      : input.minutes > 0
        ? MINUTES_APPEARANCE_POINTS
        : 0;

  const goalsPoints = input.goals * GOALS_BY_POSITION[input.position];
  const assistsPoints = input.assists * ASSIST_POINTS;
  const shootingPoints = input.shotsOnTarget * SHOT_ON_TARGET_POINTS;
  const creationPoints = input.chancesCreated * CHANCE_CREATED_POINTS;
  const defendingPoints = (input.tackles + input.interceptions + input.blocks) * DEFENSIVE_ACTION_POINTS;
  const goalkeepingPoints = Math.floor(input.saves / SAVES_PER_POINT);

  const isCleanSheet = input.minutes >= CLEAN_SHEET_MINUTES_THRESHOLD && input.concededByOwnClub === 0;
  const cleanSheetPoints = isCleanSheet ? CLEAN_SHEET_BY_POSITION[input.position] : 0;

  const disciplinePoints = input.yellowCards * YELLOW_CARD_POINTS + input.redCards * RED_CARD_POINTS;

  const components = {
    minutes: minutesPoints,
    goals: round2(goalsPoints),
    assists: round2(assistsPoints),
    shooting: round2(shootingPoints),
    creation: round2(creationPoints),
    defending: round2(defendingPoints),
    goalkeeping: goalkeepingPoints,
    cleanSheet: cleanSheetPoints,
    discipline: disciplinePoints,
  };

  const total = round2(Object.values(components).reduce((sum, v) => sum + v, 0));

  return { total, scoringRuleVersion: SCORING_RULE_VERSION, components };
}
