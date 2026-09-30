import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateFantasyScore, SCORING_RULE_VERSION } from "./scoring.ts";
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
  assert.equal(SCORING_RULE_VERSION, "ELEVEN_STANDARD_V1");
});

// ---------------------------------------------------------------------
// Minutes / appearance threshold
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
// Known stat line -> exact expected score, one per position (brief's
// explicit testing requirement)
// ---------------------------------------------------------------------

test("GK: full match, 4 saves, clean sheet -> exact expected score", () => {
  const result = calculateFantasyScore(
    baseInput({ position: "GK", minutes: 90, saves: 4, concededByOwnClub: 0 })
  );
  // minutes 2 + saves floor(4/3)=1 + clean sheet 4 = 7
  assert.equal(result.components.minutes, 2);
  assert.equal(result.components.goalkeeping, 1);
  assert.equal(result.components.cleanSheet, 4);
  assert.equal(result.total, 7);
});

test("DEF: full match, clean sheet, 3 tackles, 2 interceptions -> exact expected score", () => {
  const result = calculateFantasyScore(
    baseInput({ position: "DEF", minutes: 90, tackles: 3, interceptions: 2, concededByOwnClub: 0 })
  );
  // minutes 2 + defending (3+2)*0.25=1.25 + clean sheet 4 = 7.25
  assert.equal(result.components.defending, 1.25);
  assert.equal(result.components.cleanSheet, 4);
  assert.equal(result.total, 7.25);
});

test("MID: full match, 1 goal, 1 assist, 2 key passes -> exact expected score", () => {
  const result = calculateFantasyScore(
    baseInput({ position: "MID", minutes: 90, goals: 1, assists: 1, chancesCreated: 2 })
  );
  // minutes 2 + goal(MID=5) + assist 3 + creation 2*0.5=1 = 11
  assert.equal(result.components.goals, 5);
  assert.equal(result.components.assists, 3);
  assert.equal(result.components.creation, 1);
  assert.equal(result.total, 11);
});

test("FWD: full match, 2 goals, 3 shots on target -> exact expected score", () => {
  const result = calculateFantasyScore(
    baseInput({ position: "FWD", minutes: 90, goals: 2, shotsOnTarget: 3 })
  );
  // minutes 2 + goals 2*4=8 + shooting 3*0.5=1.5 = 11.5
  assert.equal(result.components.goals, 8);
  assert.equal(result.components.shooting, 1.5);
  assert.equal(result.total, 11.5);
});

// ---------------------------------------------------------------------
// Position-weighted goals: rarer for defensive positions -> worth more
// ---------------------------------------------------------------------

test("the same single goal is worth more for a defender than a forward, and more still for a goalkeeper", () => {
  const gk = calculateFantasyScore(baseInput({ position: "GK", goals: 1 }));
  const def = calculateFantasyScore(baseInput({ position: "DEF", goals: 1 }));
  const mid = calculateFantasyScore(baseInput({ position: "MID", goals: 1 }));
  const fwd = calculateFantasyScore(baseInput({ position: "FWD", goals: 1 }));
  assert.ok(gk.components.goals > def.components.goals);
  assert.ok(def.components.goals > mid.components.goals);
  assert.ok(mid.components.goals > fwd.components.goals);
});

// ---------------------------------------------------------------------
// Clean sheet edge cases
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

test("a midfielder gets a smaller clean-sheet bonus than a defender", () => {
  const def = calculateFantasyScore(baseInput({ position: "DEF", minutes: 90, concededByOwnClub: 0 }));
  const mid = calculateFantasyScore(baseInput({ position: "MID", minutes: 90, concededByOwnClub: 0 }));
  assert.ok(def.components.cleanSheet > mid.components.cleanSheet);
  assert.ok(mid.components.cleanSheet > 0);
});

test("conceding at least one goal earns no clean-sheet points", () => {
  const result = calculateFantasyScore(
    baseInput({ position: "DEF", minutes: 90, concededByOwnClub: 1 })
  );
  assert.equal(result.components.cleanSheet, 0);
});

// ---------------------------------------------------------------------
// Discipline (negative events)
// ---------------------------------------------------------------------

test("a yellow card subtracts a point", () => {
  const result = calculateFantasyScore(baseInput({ minutes: 90, yellowCards: 1 }));
  assert.equal(result.components.discipline, -1);
});

test("a red card is a heavier penalty than a yellow", () => {
  const yellow = calculateFantasyScore(baseInput({ minutes: 90, yellowCards: 1 }));
  const red = calculateFantasyScore(baseInput({ minutes: 90, redCards: 1 }));
  assert.ok(red.components.discipline < yellow.components.discipline);
});

test("a poor performance (few minutes, a card, nothing else) can score negative overall", () => {
  const result = calculateFantasyScore(baseInput({ minutes: 20, yellowCards: 1 }));
  // minutes 1 + discipline -1 = 0... use two cards to force genuinely negative
  assert.equal(result.total, 0);
  const worse = calculateFantasyScore(baseInput({ minutes: 20, redCards: 1 }));
  assert.ok(worse.total < 0, "a brief, sent-off appearance should score below zero");
});

// ---------------------------------------------------------------------
// Multi-category performance
// ---------------------------------------------------------------------

test("a multi-category performance sums every component correctly", () => {
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
  const expectedSum =
    result.components.minutes +
    result.components.goals +
    result.components.assists +
    result.components.shooting +
    result.components.creation +
    result.components.defending +
    result.components.goalkeeping +
    result.components.cleanSheet +
    result.components.discipline;
  assert.equal(result.total, Math.round(expectedSum * 100) / 100);
  assert.ok(result.total > 0);
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

test("goalkeeping points floor rather than round — 2 saves is not yet worth a point", () => {
  const twoSaves = calculateFantasyScore(baseInput({ position: "GK", saves: 2 }));
  const threeSaves = calculateFantasyScore(baseInput({ position: "GK", saves: 3 }));
  assert.equal(twoSaves.components.goalkeeping, 0);
  assert.equal(threeSaves.components.goalkeeping, 1);
});

test("never uses a provider rating field — ScoringInput has no such field", () => {
  const input = baseInput();
  assert.equal("rating" in input, false);
  assert.equal("providerRating" in input, false);
});
