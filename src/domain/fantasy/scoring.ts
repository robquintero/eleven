/**
 * Eleven's production fantasy scoring engine — pure, deterministic,
 * versioned. See docs/scoring-model.md for ELEVEN_STANDARD_V1's original
 * field-coverage analysis (still accurate — V2 introduces no new raw
 * stat) and docs/scoring-model-v2.md for V2's own design rationale,
 * milestone derivations, and calibration. This module is the SINGLE
 * place those coefficients live (brief: "do not scatter scoring
 * constants through UI/components").
 *
 * Deliberately NOT expressed as this file's own `ScoringRule[]` (a flat
 * `stat * multiplier` list) even though that type already exists in this
 * module — several of Eleven's rules genuinely don't fit that shape:
 *   - MINUTES is a threshold/step function (any appearance vs. 60+
 *     minutes), not a linear per-minute rate.
 *   - Goal/assist MILESTONE bonuses are nonlinear functions of a COUNT
 *     within one match, not a per-event multiplier.
 *   - CLEAN SHEET isn't a stored raw stat at all — it's derived from the
 *     fixture's final score + the player's position + their minutes in
 *     that match (see `fixtures.home_score`/`away_score`'s migration
 *     comment).
 * A generic rule DSL that could express all of this is unnecessary
 * complexity for one production formula — `ScoringRule` stays available
 * (unused today) for a future per-league custom-override system.
 *
 * NEVER uses a provider "rating" field, and never trusts a provider's own
 * fantasy-points field — see docs/domain-model.md invariant #10.
 */

import type { PlayerPosition } from "@/domain/football/types";

export const SCORING_RULE_VERSION = "ELEVEN_STANDARD_V2" as const;
export type ScoringRuleVersion = typeof SCORING_RULE_VERSION;

/** Raw inputs the engine needs for one player's one fixture appearance — every field is either a stored `player_match_stats` column or a directly-derivable fact (never a guess). Identical to V1's input shape — V2 changes the FORMULA, not the available raw stats (none were added to ingestion this pass; see docs/scoring-model-v2.md's own audit). */
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

/**
 * Every component is exposed separately — Pass 12C's explicit
 * requirement that a score must be fully explainable without the UI
 * reverse-engineering it. Component names match the breakdown the brief
 * itself lists: Minutes, Goals, Goal milestone bonus, Assists, Assist
 * milestone bonus, Shots on target, Chances created, Defensive actions,
 * Saves, Clean sheet, Cards.
 */
export interface FantasyScoreBreakdown {
  total: number;
  scoringRuleVersion: ScoringRuleVersion;
  components: {
    minutes: number;
    goals: number;
    goalMilestoneBonus: number;
    assists: number;
    assistMilestoneBonus: number;
    shotsOnTarget: number;
    chancesCreated: number;
    defensiveActions: number;
    saves: number;
    cleanSheet: number;
    cards: number;
  };
}

/**
 * Minutes threshold: 1 point for any appearance, 2 total once 60+ minutes
 * are reached — the same "did they meaningfully feature" curve most
 * fantasy football products use, chosen because a flat per-minute rate
 * would reward a 90th-minute substitute appearance ~90x less than it
 * should relative to a full 90-minute shift, which isn't how real squad
 * rotation value works. Unchanged from V1 — the real-data calibration
 * (docs/scoring-model-v2.md) found no reason to retune this.
 */
const MINUTES_APPEARANCE_POINTS = 1;
const MINUTES_FULL_SHIFT_POINTS = 2;
const MINUTES_FULL_SHIFT_THRESHOLD = 60;

/**
 * Goals scored, by position (V2 design target, docs/scoring-model-v2.md):
 * GK 12 · DEF 8 · MID 7 · FWD 6 — raised from V1's 10/6/5/4 across the
 * board (goals remain king) while preserving the same rarer-for-defensive-
 * positions-worth-more ordering. A forward's goal is still the single
 * most common decisive event; a goalkeeper's is a genuine historic rarity
 * and scores like one.
 */
const GOALS_BY_POSITION: Record<PlayerPosition, number> = { GK: 12, DEF: 8, MID: 7, FWD: 6 };

/** V2: raised from 3 to 4 — assists matter substantially more than a single creative action, but stay well below a goal's value at every position. */
const ASSIST_POINTS = 4;

/**
 * Goal milestone bonus — a deterministic, closed-form function of TOTAL
 * goals in this one match (never a lookup table that stops at an
 * arbitrary number): `goals² − 1` for 2+ goals, 0 for 0 or 1. This is a
 * genuine formula, not five hardcoded cases — it is exact for every
 * input the brief names (brace=3, hat trick=8, 4 goals=15, 5 goals=24)
 * AND extends naturally and deterministically past 5 (6 goals=35, 7=48,
 * …) without ever needing another branch. Quadratic, not exponential —
 * "avoiding absurd exponential behavior" while still guaranteeing a hat
 * trick (3×7=21 MID flat, +8 bonus = 29) is meaningfully more than simply
 * 3× an isolated goal's value.
 */
function goalMilestoneBonus(goals: number): number {
  return goals >= 2 ? goals * goals - 1 : 0;
}

/**
 * Assist milestone bonus — the same closed-form philosophy as goals, but
 * triangular (`n(n+1)/2 − 1`) rather than quadratic, so it grows
 * noticeably more slowly: meaningful (2 assists=2, 3=5, 4=9, 5=14) but
 * consistently smaller than the equivalent goal milestone at every n≥2,
 * matching "assist milestones should be meaningful but less explosive
 * than goal milestones."
 */
function assistMilestoneBonus(assists: number): number {
  return assists >= 2 ? (assists * (assists + 1)) / 2 - 1 : 0;
}

/**
 * Clean sheet — requires 60+ minutes (a substitute who plays the last 5
 * minutes of a shutout shouldn't get full credit) and a real, known
 * 0-concession result. Zero for forwards: a striker's fantasy value isn't
 * about defensive results. V2 raises GK/DEF from 4→5 and MID from 1→2
 * (docs/scoring-model-v2.md calibration) — a defensive midfielder now has
 * a more credible "good non-G/A" path leaning on clean sheet + defensive
 * actions together, one of the archetypes the brief explicitly calls out.
 */
const CLEAN_SHEET_BY_POSITION: Record<PlayerPosition, number> = { GK: 5, DEF: 5, MID: 2, FWD: 0 };
const CLEAN_SHEET_MINUTES_THRESHOLD = 60;

const SHOT_ON_TARGET_POINTS = 0.5;
/** V2: raised from 0.5 to 0.75 — a genuinely creative match (4-6 chances created) now contributes closer to the "good non-G/A performance" band on its own. */
const CHANCE_CREATED_POINTS = 0.75;
/** Tackles + interceptions + blocks, summed then weighted per action. V2 raises this from 0.25 to 0.3 — still deliberately modest per-action, but a genuinely busy defensive shift (5-6+ actions) now adds up to more clearly meaningful, clean-sheet-independent value. */
const DEFENSIVE_ACTION_POINTS = 0.3;
/** GK saves only; other positions never record saves (see docs/scoring-model.md coverage report). Unchanged from V1. */
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
  const goalBonusPoints = goalMilestoneBonus(input.goals);
  const assistsPoints = input.assists * ASSIST_POINTS;
  const assistBonusPoints = assistMilestoneBonus(input.assists);
  const shootingPoints = input.shotsOnTarget * SHOT_ON_TARGET_POINTS;
  const creationPoints = input.chancesCreated * CHANCE_CREATED_POINTS;
  const defendingPoints = (input.tackles + input.interceptions + input.blocks) * DEFENSIVE_ACTION_POINTS;
  const savesPoints = Math.floor(input.saves / SAVES_PER_POINT);

  const isCleanSheet = input.minutes >= CLEAN_SHEET_MINUTES_THRESHOLD && input.concededByOwnClub === 0;
  const cleanSheetPoints = isCleanSheet ? CLEAN_SHEET_BY_POSITION[input.position] : 0;

  const cardsPoints = input.yellowCards * YELLOW_CARD_POINTS + input.redCards * RED_CARD_POINTS;

  const components = {
    minutes: minutesPoints,
    goals: round2(goalsPoints),
    goalMilestoneBonus: goalBonusPoints,
    assists: round2(assistsPoints),
    assistMilestoneBonus: round2(assistBonusPoints),
    shotsOnTarget: round2(shootingPoints),
    chancesCreated: round2(creationPoints),
    defensiveActions: round2(defendingPoints),
    saves: savesPoints,
    cleanSheet: cleanSheetPoints,
    cards: cardsPoints,
  };

  const total = round2(Object.values(components).reduce((sum, v) => sum + v, 0));

  return { total, scoringRuleVersion: SCORING_RULE_VERSION, components };
}
