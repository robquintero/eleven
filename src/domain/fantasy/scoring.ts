/**
 * Eleven's production fantasy scoring engine — pure, deterministic,
 * versioned. See docs/scoring-model.md for ELEVEN_STANDARD_V1's original
 * field-coverage analysis (still accurate — neither V2 nor V3 introduces
 * a new raw stat) and docs/scoring-model-v2.md for V2's own design
 * rationale. This module is the SINGLE place those coefficients live
 * (brief: "do not scatter scoring constants through UI/components").
 *
 * Pass 14.5 adds ELEVEN_STANDARD_V3 alongside V2 — a real new exported
 * formula (`calculateFantasyScoreV3`), not a mutation of the V2 one.
 * `calculateFantasyScoreV2`/`SCORING_RULE_VERSION_V2` remain exactly as
 * they were (byte-identical behavior, still covered by scoring.test.ts) —
 * "do not destroy V2" (brief §Phase 4). `calculateFantasyScore`/
 * `SCORING_RULE_VERSION` (the names every other call site already
 * imports — backfill.ts, replay.ts, rounds.ts, data-access/matchups.ts,
 * data-access/players.ts) now resolve to V3: this is the one place the
 * "authoritative scoring path" switch happens, with zero changes required
 * at any of those call sites (see docs/scoring-model-v3.md for the full
 * audit/calibration behind this cutover).
 *
 * NEVER uses a provider "rating" field, and never trusts a provider's own
 * fantasy-points field — see docs/domain-model.md invariant #10. Both
 * versions share the exact same `ScoringInput` shape: Pass 14.5's own
 * audit (docs/scoring-model-v3.md) found no additional API-Football stat
 * reliably ingested-but-unused, so V3's "more statistical texture" comes
 * from recalibrating weights on the stats Eleven already has, never from
 * inventing a field Eleven doesn't reliably receive.
 */

import type { PlayerPosition } from "@/domain/football/types";

/** Raw inputs the engine needs for one player's one fixture appearance — every field is either a stored `player_match_stats` column or a directly-derivable fact (never a guess). Identical for V2 and V3 — see this module's own doc comment. */
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
 * Saves, Clean sheet, Cards. Identical shape for V2 and V3 — only the
 * numbers inside differ — so `src/components/players/scoring-breakdown.tsx`
 * needs no version-specific branching.
 */
export interface FantasyScoreBreakdown {
  total: number;
  scoringRuleVersion: string;
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// =====================================================================
// ELEVEN_STANDARD_V2 — unchanged. Kept byte-identical to how it shipped
// in Pass 12C/14 so every historical `fantasy_player_scores` row tagged
// 'ELEVEN_STANDARD_V2' remains exactly reproducible from stored
// `player_match_stats` (docs/scoring-model.md "Why recompute, never
// increment"). See docs/scoring-model-v2.md for the full design
// rationale this section originally shipped with.
// =====================================================================

export const SCORING_RULE_VERSION_V2 = "ELEVEN_STANDARD_V2" as const;

const V2_MINUTES_APPEARANCE_POINTS = 1;
const V2_MINUTES_FULL_SHIFT_POINTS = 2;
const V2_MINUTES_FULL_SHIFT_THRESHOLD = 60;

const V2_GOALS_BY_POSITION: Record<PlayerPosition, number> = { GK: 12, DEF: 8, MID: 7, FWD: 6 };
const V2_ASSIST_POINTS = 4;

function v2GoalMilestoneBonus(goals: number): number {
  return goals >= 2 ? goals * goals - 1 : 0;
}

function v2AssistMilestoneBonus(assists: number): number {
  return assists >= 2 ? (assists * (assists + 1)) / 2 - 1 : 0;
}

const V2_CLEAN_SHEET_BY_POSITION: Record<PlayerPosition, number> = { GK: 5, DEF: 5, MID: 2, FWD: 0 };
const V2_CLEAN_SHEET_MINUTES_THRESHOLD = 60;

const V2_SHOT_ON_TARGET_POINTS = 0.5;
const V2_CHANCE_CREATED_POINTS = 0.75;
const V2_DEFENSIVE_ACTION_POINTS = 0.3;
const V2_SAVES_PER_POINT = 3;

const V2_YELLOW_CARD_POINTS = -1;
const V2_RED_CARD_POINTS = -3;

/** ELEVEN_STANDARD_V2, preserved exactly as it shipped — see docs/scoring-model-v2.md. */
export function calculateFantasyScoreV2(input: ScoringInput): FantasyScoreBreakdown {
  const minutesPoints =
    input.minutes >= V2_MINUTES_FULL_SHIFT_THRESHOLD
      ? V2_MINUTES_FULL_SHIFT_POINTS
      : input.minutes > 0
        ? V2_MINUTES_APPEARANCE_POINTS
        : 0;

  const goalsPoints = input.goals * V2_GOALS_BY_POSITION[input.position];
  const goalBonusPoints = v2GoalMilestoneBonus(input.goals);
  const assistsPoints = input.assists * V2_ASSIST_POINTS;
  const assistBonusPoints = v2AssistMilestoneBonus(input.assists);
  const shootingPoints = input.shotsOnTarget * V2_SHOT_ON_TARGET_POINTS;
  const creationPoints = input.chancesCreated * V2_CHANCE_CREATED_POINTS;
  const defendingPoints = (input.tackles + input.interceptions + input.blocks) * V2_DEFENSIVE_ACTION_POINTS;
  const savesPoints = Math.floor(input.saves / V2_SAVES_PER_POINT);

  const isCleanSheet = input.minutes >= V2_CLEAN_SHEET_MINUTES_THRESHOLD && input.concededByOwnClub === 0;
  const cleanSheetPoints = isCleanSheet ? V2_CLEAN_SHEET_BY_POSITION[input.position] : 0;

  const cardsPoints = input.yellowCards * V2_YELLOW_CARD_POINTS + input.redCards * V2_RED_CARD_POINTS;

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

  return { total, scoringRuleVersion: SCORING_RULE_VERSION_V2, components };
}

// =====================================================================
// ELEVEN_STANDARD_V3 — Pass 14.5. Same ScoringInput, same exposed
// component shape, recalibrated weights. Full rationale, the real-data
// calibration (V2 vs V3 distributions, representative performances
// including the real Michael Olise France v Italy game), and exactly
// which API-Football-derived fields were considered and rejected for
// inclusion: docs/scoring-model-v3.md.
//
// Design summary (see docs/scoring-model-v3.md for the numbers behind
// each choice):
//   - Minutes gains a THIRD tier: a 90+ minute "full match" appearance is
//     now worth more than a 60-89 minute one (brief: "meaningful minutes
//     thresholds / full-match participation") -- previously both scored
//     identically.
//   - Every per-event weight that ISN'T goals/clean-sheet (already
//     position-scaled in V2) is raised -- assists, shots on target,
//     chances created, defensive actions, saves -- specifically to raise
//     the floor for ordinary and defensive/goalkeeping performances
//     (brief: "defensive players and goalkeepers can matter," "ordinary
//     starters contribute meaningful points"), since those are the only
//     levers available without inventing a stat Eleven doesn't ingest.
//   - Goals/clean-sheet keep V2's position-sensitive shape (still the
//     single clearest "positional value" signal) but are raised too, so
//     an elite attacking game still swings a matchup more than a merely
//     good one.
//   - Red cards are a harsher penalty than V2's (-4, not -3) -- "negative
//     performances still hurt."
//   - Saves move from a stepped `floor(saves/3)` to a continuous per-save
//     rate -- a goalkeeper's 4th/5th save now visibly contributes instead
//     of needing a 6th before the next point appears.
// =====================================================================

export const SCORING_RULE_VERSION_V3 = "ELEVEN_STANDARD_V3" as const;

const V3_MINUTES_APPEARANCE_POINTS = 1;
const V3_MINUTES_SIGNIFICANT_POINTS = 2;
const V3_MINUTES_FULL_MATCH_POINTS = 3;
const V3_MINUTES_SIGNIFICANT_THRESHOLD = 60;
const V3_MINUTES_FULL_MATCH_THRESHOLD = 90;

const V3_GOALS_BY_POSITION: Record<PlayerPosition, number> = { GK: 14, DEF: 10, MID: 8, FWD: 7 };
const V3_ASSIST_POINTS = 5;

function v3GoalMilestoneBonus(goals: number): number {
  return goals >= 2 ? goals * goals - 1 : 0;
}

function v3AssistMilestoneBonus(assists: number): number {
  return assists >= 2 ? (assists * (assists + 1)) / 2 - 1 : 0;
}

const V3_CLEAN_SHEET_BY_POSITION: Record<PlayerPosition, number> = { GK: 6, DEF: 6, MID: 3, FWD: 0 };
const V3_CLEAN_SHEET_MINUTES_THRESHOLD = 60;

const V3_SHOT_ON_TARGET_POINTS = 0.75;
const V3_CHANCE_CREATED_POINTS = 1;
const V3_DEFENSIVE_ACTION_POINTS = 0.5;
const V3_SAVE_POINTS = 0.5;

const V3_YELLOW_CARD_POINTS = -1;
const V3_RED_CARD_POINTS = -4;

/** ELEVEN_STANDARD_V3 — see this section's own doc comment and docs/scoring-model-v3.md. */
export function calculateFantasyScoreV3(input: ScoringInput): FantasyScoreBreakdown {
  const minutesPoints =
    input.minutes >= V3_MINUTES_FULL_MATCH_THRESHOLD
      ? V3_MINUTES_FULL_MATCH_POINTS
      : input.minutes >= V3_MINUTES_SIGNIFICANT_THRESHOLD
        ? V3_MINUTES_SIGNIFICANT_POINTS
        : input.minutes > 0
          ? V3_MINUTES_APPEARANCE_POINTS
          : 0;

  const goalsPoints = input.goals * V3_GOALS_BY_POSITION[input.position];
  const goalBonusPoints = v3GoalMilestoneBonus(input.goals);
  const assistsPoints = input.assists * V3_ASSIST_POINTS;
  const assistBonusPoints = v3AssistMilestoneBonus(input.assists);
  const shootingPoints = input.shotsOnTarget * V3_SHOT_ON_TARGET_POINTS;
  const creationPoints = input.chancesCreated * V3_CHANCE_CREATED_POINTS;
  const defendingPoints = (input.tackles + input.interceptions + input.blocks) * V3_DEFENSIVE_ACTION_POINTS;
  const savesPoints = input.saves * V3_SAVE_POINTS;

  const isCleanSheet = input.minutes >= V3_CLEAN_SHEET_MINUTES_THRESHOLD && input.concededByOwnClub === 0;
  const cleanSheetPoints = isCleanSheet ? V3_CLEAN_SHEET_BY_POSITION[input.position] : 0;

  const cardsPoints = input.yellowCards * V3_YELLOW_CARD_POINTS + input.redCards * V3_RED_CARD_POINTS;

  const components = {
    minutes: minutesPoints,
    goals: round2(goalsPoints),
    goalMilestoneBonus: goalBonusPoints,
    assists: round2(assistsPoints),
    assistMilestoneBonus: round2(assistBonusPoints),
    shotsOnTarget: round2(shootingPoints),
    chancesCreated: round2(creationPoints),
    defensiveActions: round2(defendingPoints),
    saves: round2(savesPoints),
    cleanSheet: cleanSheetPoints,
    cards: cardsPoints,
  };

  const total = round2(Object.values(components).reduce((sum, v) => sum + v, 0));

  return { total, scoringRuleVersion: SCORING_RULE_VERSION_V3, components };
}

// =====================================================================
// Authoritative current version -- every existing call site (backfill.ts,
// replay.ts, rounds.ts, data-access/matchups.ts, data-access/players.ts)
// imports exactly these two names and needs no further change to compute
// and read V3 going forward; V2 rows remain reachable via
// `SCORING_RULE_VERSION_V2`/`calculateFantasyScoreV2` for historical
// comparison/replay.
// =====================================================================

export const SCORING_RULE_VERSION = SCORING_RULE_VERSION_V3;
export type ScoringRuleVersion = typeof SCORING_RULE_VERSION;
export const calculateFantasyScore = calculateFantasyScoreV3;
