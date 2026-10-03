import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateFantasyScoreV3, SCORING_RULE_VERSION_V3, calculateFantasyScore, SCORING_RULE_VERSION, SCORING_V3_WEIGHTS } from "./scoring.ts";
import type { ScoringInput } from "./scoring.ts";

function baseInput(overrides: Partial<ScoringInput> = {}): ScoringInput {
  return {
    position: "MID",
    minutes: 0,
    goals: 0,
    assists: 0,
    shotsOnTarget: 0,
    chancesCreated: 0,
    tackles: 0,
    interceptions: 0,
    blocks: 0,
    saves: 0,
    yellowCards: 0,
    redCards: 0,
    concededByOwnClub: null,
    ...overrides,
  };
}

test("records the scoring rule version on every result, and is the authoritative current version", () => {
  const result = calculateFantasyScoreV3(baseInput());
  assert.equal(result.scoringRuleVersion, SCORING_RULE_VERSION_V3);
  assert.equal(SCORING_RULE_VERSION_V3, "ELEVEN_STANDARD_V3");
  // Pass 14.5: the generic, every-call-site-imported names now resolve to V3.
  assert.equal(SCORING_RULE_VERSION, SCORING_RULE_VERSION_V3);
  assert.deepEqual(calculateFantasyScore(baseInput({ goals: 1 })), calculateFantasyScoreV3(baseInput({ goals: 1 })));
});

// ---------------------------------------------------------------------
// Minutes: a THIRD tier (90+ "full match") distinct from V2's two-tier
// curve -- brief: "meaningful minutes thresholds / full-match participation."
// ---------------------------------------------------------------------

test("an unused substitute (0 minutes) scores exactly 0", () => {
  const result = calculateFantasyScoreV3(baseInput({ minutes: 0 }));
  assert.equal(result.total, 0);
  assert.equal(result.components.minutes, 0);
});

test("a brief substitute appearance (1-59 minutes) gets the appearance tier only", () => {
  const result = calculateFantasyScoreV3(baseInput({ minutes: 12 }));
  assert.equal(result.components.minutes, 1);
});

test("60-89 minutes is a distinct, higher tier than a brief appearance but lower than a full match", () => {
  const result = calculateFantasyScoreV3(baseInput({ minutes: 75 }));
  assert.equal(result.components.minutes, 2);
});

test("90+ minutes (a full match) scores MORE than 60-89 minutes -- V3's new third tier", () => {
  const sixtyNine = calculateFantasyScoreV3(baseInput({ minutes: 89 }));
  const full = calculateFantasyScoreV3(baseInput({ minutes: 90 }));
  assert.equal(sixtyNine.components.minutes, 2);
  assert.equal(full.components.minutes, 3);
  assert.ok(full.components.minutes > sixtyNine.components.minutes);
});

test("minutes beyond 90 (stoppage time) still score the full-match tier, not more", () => {
  const result = calculateFantasyScoreV3(baseInput({ minutes: 96 }));
  assert.equal(result.components.minutes, 3);
});

// ---------------------------------------------------------------------
// Position-weighted goals -- same ordering as V2 (rarer for defensive
// positions -> worth more), raised values.
// ---------------------------------------------------------------------

test("goal values are raised from V2 at every position, preserving GK > DEF > MID > FWD ordering", () => {
  const gk = calculateFantasyScoreV3(baseInput({ position: "GK", goals: 1 }));
  const def = calculateFantasyScoreV3(baseInput({ position: "DEF", goals: 1 }));
  const mid = calculateFantasyScoreV3(baseInput({ position: "MID", goals: 1 }));
  const fwd = calculateFantasyScoreV3(baseInput({ position: "FWD", goals: 1 }));
  assert.equal(gk.components.goals, 14);
  assert.equal(def.components.goals, 10);
  assert.equal(mid.components.goals, 8);
  assert.equal(fwd.components.goals, 7);
  assert.ok(gk.components.goals > def.components.goals);
  assert.ok(def.components.goals > mid.components.goals);
  assert.ok(mid.components.goals > fwd.components.goals);
});

test("goal milestone bonuses are the same closed-form (goals^2 - 1) as V2, unaffected by the base goal-value change", () => {
  assert.equal(calculateFantasyScoreV3(baseInput({ goals: 2 })).components.goalMilestoneBonus, 3, "brace");
  assert.equal(calculateFantasyScoreV3(baseInput({ goals: 3 })).components.goalMilestoneBonus, 8, "hat trick");
  assert.equal(calculateFantasyScoreV3(baseInput({ goals: 5 })).components.goalMilestoneBonus, 24);
});

// ---------------------------------------------------------------------
// Assists -- raised flat value, same milestone formula.
// ---------------------------------------------------------------------

test("an assist is worth 5 (raised from V2's 4)", () => {
  const result = calculateFantasyScoreV3(baseInput({ assists: 1 }));
  assert.equal(result.components.assists, 5);
});

test("assist milestone bonuses are the same triangular closed-form as V2", () => {
  assert.equal(calculateFantasyScoreV3(baseInput({ assists: 2 })).components.assistMilestoneBonus, 2);
  assert.equal(calculateFantasyScoreV3(baseInput({ assists: 3 })).components.assistMilestoneBonus, 5);
});

// ---------------------------------------------------------------------
// Shooting / creation / defending -- raised per-event weights (the floor-
// raising levers for ordinary and defensive performances).
// ---------------------------------------------------------------------

test("a shot on target is worth 0.75 (raised from V2's 0.5)", () => {
  assert.equal(calculateFantasyScoreV3(baseInput({ shotsOnTarget: 2 })).components.shotsOnTarget, 1.5);
});

test("a chance created is worth 1.0 (raised from V2's 0.75)", () => {
  assert.equal(calculateFantasyScoreV3(baseInput({ chancesCreated: 3 })).components.chancesCreated, 3);
});

test("each defensive action (tackle/interception/block) is worth 0.5 (raised from V2's 0.3), summed across all three", () => {
  const result = calculateFantasyScoreV3(baseInput({ tackles: 2, interceptions: 1, blocks: 1 }));
  assert.equal(result.components.defensiveActions, 2);
});

// ---------------------------------------------------------------------
// Saves -- continuous per-save rate, not V2's stepped floor(saves/3).
// ---------------------------------------------------------------------

test("saves pay out continuously (0.5 per save), not in steps of 3 the way V2 did", () => {
  assert.equal(calculateFantasyScoreV3(baseInput({ position: "GK", saves: 1 })).components.saves, 0.5);
  assert.equal(calculateFantasyScoreV3(baseInput({ position: "GK", saves: 2 })).components.saves, 1);
  assert.equal(calculateFantasyScoreV3(baseInput({ position: "GK", saves: 5 })).components.saves, 2.5);
});

test("a goalkeeper's 4th and 5th save each visibly add value (V2 made the 4th save worth nothing extra until the 6th)", () => {
  const four = calculateFantasyScoreV3(baseInput({ position: "GK", saves: 4 })).components.saves;
  const five = calculateFantasyScoreV3(baseInput({ position: "GK", saves: 5 })).components.saves;
  assert.ok(five > four);
});

// ---------------------------------------------------------------------
// Clean sheet -- same shape/threshold as V2 (GK/DEF highest, MID some,
// FWD never), raised values.
// ---------------------------------------------------------------------

test("clean sheet values are raised from V2 at every eligible position", () => {
  const gk = calculateFantasyScoreV3(baseInput({ position: "GK", minutes: 90, concededByOwnClub: 0 }));
  const def = calculateFantasyScoreV3(baseInput({ position: "DEF", minutes: 90, concededByOwnClub: 0 }));
  const mid = calculateFantasyScoreV3(baseInput({ position: "MID", minutes: 90, concededByOwnClub: 0 }));
  const fwd = calculateFantasyScoreV3(baseInput({ position: "FWD", minutes: 90, concededByOwnClub: 0 }));
  assert.equal(gk.components.cleanSheet, 6);
  assert.equal(def.components.cleanSheet, 6);
  assert.equal(mid.components.cleanSheet, 3);
  assert.equal(fwd.components.cleanSheet, 0);
});

test("no clean-sheet credit below the 60-minute threshold, or when the result/fixture score isn't known yet -- unchanged rule from V2", () => {
  assert.equal(calculateFantasyScoreV3(baseInput({ position: "DEF", minutes: 45, concededByOwnClub: 0 })).components.cleanSheet, 0);
  assert.equal(calculateFantasyScoreV3(baseInput({ position: "DEF", minutes: 90, concededByOwnClub: null })).components.cleanSheet, 0);
});

// ---------------------------------------------------------------------
// Discipline -- red cards hurt more than V2's.
// ---------------------------------------------------------------------

test("a yellow card is unchanged from V2 (-1)", () => {
  assert.equal(calculateFantasyScoreV3(baseInput({ yellowCards: 1 })).components.cards, -1);
});

test("a red card is a harsher penalty than V2's (-4, not -3)", () => {
  assert.equal(calculateFantasyScoreV3(baseInput({ redCards: 1 })).components.cards, -4);
});

test("a red-card performance with little else can still score well below zero", () => {
  const result = calculateFantasyScoreV3(baseInput({ minutes: 25, redCards: 1 }));
  assert.ok(result.total < 0);
});

// ---------------------------------------------------------------------
// Determinism / breakdown self-consistency -- same guarantees as V2.
// ---------------------------------------------------------------------

test("calling the engine twice with the same input produces an identical result", () => {
  const input = baseInput({ position: "FWD", minutes: 90, goals: 2, assists: 1, shotsOnTarget: 4 });
  assert.deepEqual(calculateFantasyScoreV3(input), calculateFantasyScoreV3(input));
});

test("the breakdown always explains the total exactly, for an ordinary and a historic performance alike", () => {
  const ordinary = calculateFantasyScoreV3(baseInput({ position: "MID", minutes: 90, tackles: 2, chancesCreated: 1 }));
  const historic = calculateFantasyScoreV3(baseInput({ position: "FWD", minutes: 90, goals: 3, assists: 1, shotsOnTarget: 4 }));
  for (const result of [ordinary, historic]) {
    const sum = Object.values(result.components).reduce((s, v) => s + v, 0);
    assert.equal(result.total, Math.round(sum * 100) / 100);
  }
});

test("never uses a provider rating field -- ScoringInput has no such field (same contract as V2)", () => {
  const input = baseInput();
  assert.equal("rating" in input, false);
});

// ---------------------------------------------------------------------
// The real Michael Olise France v Italy performance (docs/scoring-model-v3.md's
// own calibration anchor): 90 minutes, 1 goal, 2 shots on target, 2
// chances created, 4 interceptions, no card, no clean sheet. V2 scored
// this exactly 12.7 (scoring.test.ts has no literal test for this real
// row, but it's independently reproducible from the V2 formula).
// ---------------------------------------------------------------------

test("the real Olise France v Italy performance scores higher under V3 than the real, known V2 result (12.7), without absurd inflation", () => {
  const olise = baseInput({
    position: "MID",
    minutes: 90,
    goals: 1,
    assists: 0,
    shotsOnTarget: 2,
    chancesCreated: 2,
    tackles: 0,
    interceptions: 4,
    blocks: 0,
    concededByOwnClub: 1, // not a clean sheet
  });
  const v3 = calculateFantasyScoreV3(olise);
  // minutes 3 (full match) + goals 8 (MID) + assists 0 + shots 1.5 (2*0.75)
  // + chances 2 (2*1.0) + defending 2 (4*0.5) = 16.5
  assert.equal(v3.total, 16.5);
  assert.ok(v3.total > 12.7, "V3 must score this real, good-but-not-elite performance higher than V2's 12.7");
  assert.ok(v3.total < 25, "the increase must stay proportionate -- not absurd inflation for a single goal + solid defensive work");
});

// ---------------------------------------------------------------------
// Pass 14.6 AE: the Game Rules UI (game-rules-dialog.tsx) renders
// SCORING_V3_WEIGHTS directly -- these assertions prove that object
// actually matches what the real engine computes, so the UI can never
// silently drift from the formula it claims to document.
// ---------------------------------------------------------------------

test("SCORING_V3_WEIGHTS matches calculateFantasyScoreV3's real output for one weight of every category", () => {
  const w = SCORING_V3_WEIGHTS;

  assert.equal(calculateFantasyScoreV3(baseInput({ minutes: 45 })).components.minutes, w.minutes.appearance);
  assert.equal(calculateFantasyScoreV3(baseInput({ minutes: 75 })).components.minutes, w.minutes.significant);
  assert.equal(calculateFantasyScoreV3(baseInput({ minutes: 90 })).components.minutes, w.minutes.fullMatch);

  for (const position of ["GK", "DEF", "MID", "FWD"] as const) {
    assert.equal(calculateFantasyScoreV3(baseInput({ position, goals: 1 })).components.goals, w.goalsByPosition[position]);
    assert.equal(calculateFantasyScoreV3(baseInput({ position, minutes: 90, concededByOwnClub: 0 })).components.cleanSheet, w.cleanSheetByPosition[position]);
  }

  assert.equal(calculateFantasyScoreV3(baseInput({ assists: 1 })).components.assists, w.assist);
  assert.equal(calculateFantasyScoreV3(baseInput({ shotsOnTarget: 1 })).components.shotsOnTarget, w.shotOnTarget);
  assert.equal(calculateFantasyScoreV3(baseInput({ chancesCreated: 1 })).components.chancesCreated, w.chanceCreated);
  assert.equal(calculateFantasyScoreV3(baseInput({ tackles: 1 })).components.defensiveActions, w.defensiveAction);
  assert.equal(calculateFantasyScoreV3(baseInput({ saves: 1 })).components.saves, w.save);
  assert.equal(calculateFantasyScoreV3(baseInput({ yellowCards: 1 })).components.cards, w.yellowCard);
  assert.equal(calculateFantasyScoreV3(baseInput({ redCards: 1 })).components.cards, w.redCard);
});
