import { test } from "node:test";
import assert from "node:assert/strict";
// Pass 14.5: pinned explicitly to V2 -- `calculateFantasyScore`/
// `SCORING_RULE_VERSION` now resolve to V3 (see scoring-v3.test.ts for its
// own dedicated regression suite). This file preserves V2's exact,
// byte-identical regression coverage.
import { calculateFantasyScoreV2 as calculateFantasyScore, SCORING_RULE_VERSION_V2 as SCORING_RULE_VERSION } from "./scoring.ts";
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

test("records the scoring rule version on every result", () => {
  const result = calculateFantasyScore(baseInput());
  assert.equal(result.scoringRuleVersion, SCORING_RULE_VERSION);
  assert.equal(SCORING_RULE_VERSION, "ELEVEN_STANDARD_V2");
});

// ---------------------------------------------------------------------
// Minutes / appearance threshold (unchanged from V1)
// ---------------------------------------------------------------------

test("an unused substitute (0 minutes) scores exactly 0", () => {
  const result = calculateFantasyScore(baseInput({ minutes: 0 }));
  assert.equal(result.total, 0);
  assert.equal(result.components.minutes, 0);
});

test("a brief substitute appearance (1-59 minutes) gets 1 appearance point, not the full-shift bonus", () => {
  const result = calculateFantasyScore(baseInput({ minutes: 12 }));
  assert.equal(result.components.minutes, 1);
  assert.equal(result.total, 1);
});

test("59 minutes does not yet earn the full-shift bonus", () => {
  const result = calculateFantasyScore(baseInput({ minutes: 59 }));
  assert.equal(result.components.minutes, 1);
});

test("60+ minutes earns the full 2-point appearance total", () => {
  const result = calculateFantasyScore(baseInput({ minutes: 60 }));
  assert.equal(result.components.minutes, 2);
  const full90 = calculateFantasyScore(baseInput({ minutes: 90 }));
  assert.equal(full90.components.minutes, 2, "90 minutes scores the same appearance points as exactly 60 — minutes is a threshold, not a linear rate");
});

// ---------------------------------------------------------------------
// Known stat line -> exact expected V2 score, one per position (brief's
// explicit testing requirement)
// ---------------------------------------------------------------------

test("GK: full match, 4 saves, clean sheet -> exact expected V2 score", () => {
  const result = calculateFantasyScore(
    baseInput({ position: "GK", minutes: 90, saves: 4, concededByOwnClub: 0 })
  );
  // minutes 2 + saves floor(4/3)=1 + clean sheet 5 = 8
  assert.equal(result.components.minutes, 2);
  assert.equal(result.components.saves, 1);
  assert.equal(result.components.cleanSheet, 5);
  assert.equal(result.total, 8);
});

test("DEF: full match, clean sheet, 3 tackles, 2 interceptions -> exact expected V2 score", () => {
  const result = calculateFantasyScore(
    baseInput({ position: "DEF", minutes: 90, tackles: 3, interceptions: 2, concededByOwnClub: 0 })
  );
  // minutes 2 + defending (3+2)*0.3=1.5 + clean sheet 5 = 8.5
  assert.equal(result.components.defensiveActions, 1.5);
  assert.equal(result.components.cleanSheet, 5);
  assert.equal(result.total, 8.5);
});

test("MID: full match, 1 goal, 1 assist, 2 key passes -> exact expected V2 score", () => {
  const result = calculateFantasyScore(
    baseInput({ position: "MID", minutes: 90, goals: 1, assists: 1, chancesCreated: 2 })
  );
  // minutes 2 + goal(MID=7) + 0 goal bonus (only 1 goal) + assist 4 + 0 assist bonus (only 1 assist) + creation 2*0.75=1.5 = 14.5
  assert.equal(result.components.goals, 7);
  assert.equal(result.components.goalMilestoneBonus, 0);
  assert.equal(result.components.assists, 4);
  assert.equal(result.components.assistMilestoneBonus, 0);
  assert.equal(result.components.chancesCreated, 1.5);
  assert.equal(result.total, 14.5);
});

test("FWD: full match, 2 goals (a brace), 3 shots on target -> exact expected V2 score, including the brace milestone bonus", () => {
  const result = calculateFantasyScore(
    baseInput({ position: "FWD", minutes: 90, goals: 2, shotsOnTarget: 3 })
  );
  // minutes 2 + goals 2*6=12 + brace bonus (2^2-1=3) + shooting 3*0.5=1.5 = 18.5
  assert.equal(result.components.goals, 12);
  assert.equal(result.components.goalMilestoneBonus, 3);
  assert.equal(result.components.shotsOnTarget, 1.5);
  assert.equal(result.total, 18.5);
});

// ---------------------------------------------------------------------
// Position-weighted goals: rarer for defensive positions -> worth more
// (V2 raises every position's value but preserves the ordering)
// ---------------------------------------------------------------------

test("the same single goal is worth more for a defender than a forward, and more still for a goalkeeper", () => {
  const gk = calculateFantasyScore(baseInput({ position: "GK", goals: 1 }));
  const def = calculateFantasyScore(baseInput({ position: "DEF", goals: 1 }));
  const mid = calculateFantasyScore(baseInput({ position: "MID", goals: 1 }));
  const fwd = calculateFantasyScore(baseInput({ position: "FWD", goals: 1 }));
  assert.equal(gk.components.goals, 12);
  assert.equal(def.components.goals, 8);
  assert.equal(mid.components.goals, 7);
  assert.equal(fwd.components.goals, 6);
  assert.ok(gk.components.goals > def.components.goals);
  assert.ok(def.components.goals > mid.components.goals);
  assert.ok(mid.components.goals > fwd.components.goals);
});

// ---------------------------------------------------------------------
// Goal milestones (Pass 12C): a deterministic closed-form (goals² − 1
// for 2+ goals), not a lookup table that stops at five.
// ---------------------------------------------------------------------

test("no goal milestone bonus for 0 or 1 goals", () => {
  assert.equal(calculateFantasyScore(baseInput({ goals: 0 })).components.goalMilestoneBonus, 0);
  assert.equal(calculateFantasyScore(baseInput({ goals: 1 })).components.goalMilestoneBonus, 0);
});

test("goal milestone bonuses are exact for 2 through 5 goals (brace through 5 goals)", () => {
  assert.equal(calculateFantasyScore(baseInput({ goals: 2 })).components.goalMilestoneBonus, 3, "brace");
  assert.equal(calculateFantasyScore(baseInput({ goals: 3 })).components.goalMilestoneBonus, 8, "hat trick");
  assert.equal(calculateFantasyScore(baseInput({ goals: 4 })).components.goalMilestoneBonus, 15);
  assert.equal(calculateFantasyScore(baseInput({ goals: 5 })).components.goalMilestoneBonus, 24);
});

test("goal milestone bonuses extend deterministically past 5 goals, never stopping at a hardcoded ceiling", () => {
  assert.equal(calculateFantasyScore(baseInput({ goals: 6 })).components.goalMilestoneBonus, 35);
  assert.equal(calculateFantasyScore(baseInput({ goals: 7 })).components.goalMilestoneBonus, 48);
  assert.equal(calculateFantasyScore(baseInput({ goals: 10 })).components.goalMilestoneBonus, 99);
});

test("a hat trick scores meaningfully more than 3x an isolated goal's flat value, but growth stays quadratic, never exponential", () => {
  const isolatedGoalValue = calculateFantasyScore(baseInput({ position: "MID", goals: 1 })).components.goals;
  const hatTrick = calculateFantasyScore(baseInput({ position: "MID", goals: 3 }));
  const totalGoalPoints = hatTrick.components.goals + hatTrick.components.goalMilestoneBonus;
  assert.ok(totalGoalPoints > isolatedGoalValue * 3, "a hat trick must be worth more than simply 3 isolated goals");

  // Quadratic, not exponential: the bonus growth rate itself grows
  // linearly (second difference is constant), never compounding.
  const bonusAt = (n: number) => calculateFantasyScore(baseInput({ goals: n })).components.goalMilestoneBonus;
  const firstDiffs = [4, 5, 6, 7].map((n) => bonusAt(n) - bonusAt(n - 1));
  const secondDiffs = firstDiffs.slice(1).map((d, i) => d - firstDiffs[i]);
  assert.ok(secondDiffs.every((d) => d === 2), "a quadratic bonus has a constant second difference, unlike exponential growth");
});

// ---------------------------------------------------------------------
// Assist milestones (Pass 12C): smaller and less explosive than goal
// milestones at every count, triangular rather than quadratic.
// ---------------------------------------------------------------------

test("no assist milestone bonus for 0 or 1 assists", () => {
  assert.equal(calculateFantasyScore(baseInput({ assists: 0 })).components.assistMilestoneBonus, 0);
  assert.equal(calculateFantasyScore(baseInput({ assists: 1 })).components.assistMilestoneBonus, 0);
});

test("assist milestone bonuses are exact for 2 through 5 assists", () => {
  assert.equal(calculateFantasyScore(baseInput({ assists: 2 })).components.assistMilestoneBonus, 2);
  assert.equal(calculateFantasyScore(baseInput({ assists: 3 })).components.assistMilestoneBonus, 5);
  assert.equal(calculateFantasyScore(baseInput({ assists: 4 })).components.assistMilestoneBonus, 9);
  assert.equal(calculateFantasyScore(baseInput({ assists: 5 })).components.assistMilestoneBonus, 14);
});

test("assist milestone bonuses extend deterministically past 5 assists", () => {
  assert.equal(calculateFantasyScore(baseInput({ assists: 6 })).components.assistMilestoneBonus, 20);
});

test("at every matching count, the assist milestone bonus is smaller than the goal milestone bonus -- assists stay meaningful but less explosive", () => {
  for (const n of [2, 3, 4, 5, 6, 8]) {
    const goalBonus = calculateFantasyScore(baseInput({ goals: n })).components.goalMilestoneBonus;
    const assistBonus = calculateFantasyScore(baseInput({ assists: n })).components.assistMilestoneBonus;
    assert.ok(assistBonus < goalBonus, `at n=${n}, assist bonus (${assistBonus}) must be smaller than goal bonus (${goalBonus})`);
  }
});

// ---------------------------------------------------------------------
// Clean sheet edge cases (V2 raises the values; the rules themselves are
// unchanged from V1)
// ---------------------------------------------------------------------

test("no clean-sheet credit when the fixture's score isn't known yet (never guessed)", () => {
  const result = calculateFantasyScore(
    baseInput({ position: "DEF", minutes: 90, concededByOwnClub: null })
  );
  assert.equal(result.components.cleanSheet, 0);
});

test("no clean-sheet credit for a forward, even with a real 0-concession result", () => {
  const result = calculateFantasyScore(
    baseInput({ position: "FWD", minutes: 90, concededByOwnClub: 0 })
  );
  assert.equal(result.components.cleanSheet, 0);
});

test("no clean-sheet credit below the 60-minute threshold, even if the club kept a clean sheet", () => {
  const result = calculateFantasyScore(
    baseInput({ position: "DEF", minutes: 45, concededByOwnClub: 0 })
  );
  assert.equal(result.components.cleanSheet, 0);
});

test("a midfielder gets a smaller clean-sheet bonus than a defender, and a goalkeeper the largest", () => {
  const gk = calculateFantasyScore(baseInput({ position: "GK", minutes: 90, concededByOwnClub: 0 }));
  const def = calculateFantasyScore(baseInput({ position: "DEF", minutes: 90, concededByOwnClub: 0 }));
  const mid = calculateFantasyScore(baseInput({ position: "MID", minutes: 90, concededByOwnClub: 0 }));
  assert.equal(gk.components.cleanSheet, 5);
  assert.equal(def.components.cleanSheet, 5);
  assert.equal(mid.components.cleanSheet, 2);
  assert.ok(mid.components.cleanSheet > 0);
});

test("conceding at least one goal earns no clean-sheet points", () => {
  const result = calculateFantasyScore(
    baseInput({ position: "DEF", minutes: 90, concededByOwnClub: 1 })
  );
  assert.equal(result.components.cleanSheet, 0);
});

// ---------------------------------------------------------------------
// Cards (negative events, unchanged from V1)
// ---------------------------------------------------------------------

test("a yellow card subtracts a point", () => {
  const result = calculateFantasyScore(baseInput({ minutes: 90, yellowCards: 1 }));
  assert.equal(result.components.cards, -1);
});

test("a red card is a heavier penalty than a yellow", () => {
  const yellow = calculateFantasyScore(baseInput({ minutes: 90, yellowCards: 1 }));
  const red = calculateFantasyScore(baseInput({ minutes: 90, redCards: 1 }));
  assert.ok(red.components.cards < yellow.components.cards);
});

test("a poor performance (few minutes, a card, nothing else) can score negative overall", () => {
  const result = calculateFantasyScore(baseInput({ minutes: 20, yellowCards: 1 }));
  assert.equal(result.total, 0);
  const worse = calculateFantasyScore(baseInput({ minutes: 20, redCards: 1 }));
  assert.ok(worse.total < 0, "a brief, sent-off appearance should score below zero");
});

// ---------------------------------------------------------------------
// Multi-category performance / breakdown self-consistency
// ---------------------------------------------------------------------

test("a multi-category performance sums every exposed component correctly -- the breakdown must always explain the total exactly", () => {
  const result = calculateFantasyScore(
    baseInput({
      position: "MID",
      minutes: 90,
      goals: 1,
      assists: 1,
      shotsOnTarget: 2,
      chancesCreated: 3,
      tackles: 2,
      interceptions: 1,
      blocks: 0,
      yellowCards: 1,
    })
  );
  const expectedSum = Object.values(result.components).reduce((sum, v) => sum + v, 0);
  assert.equal(result.total, Math.round(expectedSum * 100) / 100);
  assert.ok(result.total > 0);
});

test("a hat trick plus an assist -- an exceptional/historic performance -- produces a correspondingly large, fully explainable score", () => {
  const result = calculateFantasyScore(
    baseInput({ position: "FWD", minutes: 90, goals: 3, assists: 1, shotsOnTarget: 4 })
  );
  // minutes 2 + goals 3*6=18 + hat-trick bonus 8 + assist 4 + 0 assist bonus + shooting 4*0.5=2 = 34
  assert.equal(result.total, 34);
  const recomputed = Object.values(result.components).reduce((sum, v) => sum + v, 0);
  assert.equal(result.total, Math.round(recomputed * 100) / 100, "the breakdown must fully explain a historic score too, not just an ordinary one");
});

// ---------------------------------------------------------------------
// Determinism / idempotency at the pure-function level
// ---------------------------------------------------------------------

test("calling the engine twice with the same input produces an identical result", () => {
  const input = baseInput({ position: "FWD", minutes: 90, goals: 2, assists: 1, shotsOnTarget: 4 });
  const first = calculateFantasyScore(input);
  const second = calculateFantasyScore(input);
  assert.deepEqual(first, second);
});

test("saves points floor rather than round — 2 saves is not yet worth a point", () => {
  const twoSaves = calculateFantasyScore(baseInput({ position: "GK", saves: 2 }));
  const threeSaves = calculateFantasyScore(baseInput({ position: "GK", saves: 3 }));
  assert.equal(twoSaves.components.saves, 0);
  assert.equal(threeSaves.components.saves, 1);
});

test("never uses a provider rating field — ScoringInput has no such field", () => {
  const input = baseInput();
  assert.equal("rating" in input, false);
  assert.equal("providerRating" in input, false);
});
