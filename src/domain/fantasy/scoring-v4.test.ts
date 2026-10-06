import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateFantasyScoreV4, SCORING_V4_STATS, type ScoringInputV4 } from "./scoring-v4.ts";
import { calculateFantasyScore, calculateFantasyScoreV2, calculateFantasyScoreV3, SCORING_RULE_VERSION } from "./scoring.ts";
import { calculateFantasyScoreV1 } from "./scoring-v1.ts";
import { scoreStoredPerformance, scoringVersion } from "../../lib/scoring/versions.ts";
import type { PlayerPosition } from "../football/types.ts";
const input = (stats: ScoringInputV4["stats"] = {}, position: PlayerPosition = "MID", concededByOwnTeam: number | null = null): ScoringInputV4 => ({ position, stats, concededByOwnTeam });

for (const rule of SCORING_V4_STATS) for (const position of ["GK", "DEF", "MID", "FWD"] as const) {
  test(`V4 ${rule.label} × ${position}: explicit zero/null/missing/one/multiple`, () => {
    for (const value of [null, undefined, 0, 1, 7]) {
      const score = calculateFantasyScoreV4(input({ [rule.key]: value }, position));
      const expected = (rule.goalkeeperOnly && position !== "GK" ? 0 : (value ?? 0) * (rule.positionUnits?.[position] ?? rule.units)) || 0;
      assert.equal(score.totalUnits, expected);
      assert.equal(score.components[rule.key], expected / 100);
      assert.equal(score.entries.find(e => e.key === rule.key)?.count, value ?? null);
    }
  });
}
test("V4 intentional shot + SOT + goal stacking, no milestone duplication", () => {
  assert.equal(calculateFantasyScoreV4(input({ goals: 1, shots: 1, shotsOnTarget: 1 })).total, 10);
  assert.equal(calculateFantasyScoreV4(input({ goals: 3, shots: 3, shotsOnTarget: 3 })).total, 30);
});
test("V4 appearance tiers and clean sheet thresholds use real participation and known concessions", () => {
  for (const [minutes, units] of [[0, 0], [1, 100], [5, 100], [59, 100], [60, 200], [89, 200], [90, 300], [120, 300]]) {
    assert.equal(calculateFantasyScoreV4(input({ minutes })).totalUnits, units);
    assert.equal(calculateFantasyScoreV4(input({ minutes }, "GK", 0)).components.cleanSheet, minutes >= 60 ? 7 : 0);
  }
  for (const p of ["GK", "DEF", "MID", "FWD"] as const) {
    assert.equal(calculateFantasyScoreV4(input({ minutes: 90 }, p, 0)).components.cleanSheet, { GK: 7, DEF: 6, MID: 3, FWD: 0 }[p]);
    assert.equal(calculateFantasyScoreV4(input({ minutes: 90 }, p, 1)).components.cleanSheet, 0);
    assert.equal(calculateFantasyScoreV4(input({ minutes: 90 }, p, null)).components.cleanSheet, 0);
  }
});
test("V4 unavailable counts stay distinguishable from explicit zero; malformed/negative inputs are not invented", () => {
  for (const count of [undefined, null, -1, NaN, Infinity, 0.5]) {
    const score = calculateFantasyScoreV4(input({ duelsWon: count }));
    assert.equal(score.total, 0); assert.ok(score.unavailable.includes("duelsWon"));
  }
  assert.ok(!calculateFantasyScoreV4(input({ duelsWon: 0 })).unavailable.includes("duelsWon"));
});
test("V4 breakdown is exact in integer hundredths, deterministic and never accumulates across live/final/corrections", () => {
  const before = input({ minutes: 90, goals: 1, shots: 4, shotsOnTarget: 2, keyPasses: 3, duelsWon: 7, foulsCommitted: 3, yellowCards: 1 });
  const score = calculateFantasyScoreV4(before);
  assert.equal(score.totalUnits, score.entries.reduce((n, e) => n + e.units, 0));
  assert.equal(score.totalUnits, Object.values(score.components).reduce((n, value) => n + Math.round(value * 100), 0));
  assert.deepEqual(score, calculateFantasyScoreV4(before));
  const corrected = calculateFantasyScoreV4({ ...before, stats: { ...before.stats, goals: 0 } });
  assert.equal(score.totalUnits - corrected.totalUnits, 700);
  const live = calculateFantasyScoreV4(input({ minutes: 30, shots: 2, duelsWon: 1 }));
  const final = calculateFantasyScoreV4(input({ minutes: 90, shots: 4, duelsWon: 4 }));
  assert.notEqual(final.totalUnits, final.totalUnits + live.totalUnits);
});
test("historical V1/V2/V3 are preserved; current alias remains V3 and unknown models fail closed", () => {
  const row = { minutes: 90, goals: 1, assists: 1, shots_on_target: 2, chances_created: 2, tackles: 1, interceptions: 1, blocks: 0, saves: 0, yellow_cards: 1, red_cards: 0 };
  const legacy = { position: "MID" as const, minutes: 90, goals: 1, assists: 1, shotsOnTarget: 2, chancesCreated: 2, tackles: 1, interceptions: 1, blocks: 0, saves: 0, yellowCards: 1, redCards: 0, concededByOwnClub: 0 };
  assert.equal(calculateFantasyScoreV1(legacy).total, 12.5);
  assert.equal(calculateFantasyScoreV2(legacy).total, 17.1);
  assert.equal(calculateFantasyScoreV3(legacy).total, 22.5);
  for (const [version, scorer] of [["ELEVEN_STANDARD_V1", calculateFantasyScoreV1], ["ELEVEN_STANDARD_V2", calculateFantasyScoreV2], ["ELEVEN_STANDARD_V3", calculateFantasyScoreV3]] as const) assert.deepEqual(scoreStoredPerformance(version, row, "MID", 0), scorer(legacy));
  assert.throws(() => scoreStoredPerformance("ELEVEN_STANDARD_V4", row, "MID", 0), /V4_REQUIRES_REPORTED_STATS/);
  assert.equal(SCORING_RULE_VERSION, "ELEVEN_STANDARD_V3");
  assert.deepEqual(calculateFantasyScore(legacy), calculateFantasyScoreV3(legacy));
  assert.throws(() => scoringVersion(undefined)); assert.throws(() => scoringVersion("LATEST"));
});
test("V4 stored provider-null counts override legacy zero and fixture position survives later catalog changes", () => {
  const row = { minutes: 90, goals: 0, assists: 0, shots_on_target: 0, chances_created: 0, tackles: 0, interceptions: 0, blocks: 0, saves: 0, yellow_cards: 0, red_cards: 0,
    scoring_position: "DEF", reported_stats: { duelsWon: 3, yellowCards: null } };
  const score = scoreStoredPerformance("ELEVEN_STANDARD_V4", row, "FWD", null);
  assert.equal(score.total, 0.75);
  assert.ok("unavailable" in score && score.unavailable.includes("yellowCards"));
});
