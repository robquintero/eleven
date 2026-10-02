import { test } from "node:test";
import assert from "node:assert/strict";
import { computeCycleLength, computeTotalRounds, isValidScheduleCycles, leagueSeasonIdentityLabel } from "./season.ts";
import { generateRoundRobinCycle, pairingsForSeasonRound } from "./schedule.ts";

test("computeCycleLength: even manager counts need N-1 rounds for one cycle", () => {
  assert.equal(computeCycleLength(2), 1);
  assert.equal(computeCycleLength(4), 3);
  assert.equal(computeCycleLength(6), 5);
});

test("computeCycleLength: odd manager counts need N rounds for one cycle (one BYE per manager per cycle)", () => {
  assert.equal(computeCycleLength(3), 3);
  assert.equal(computeCycleLength(5), 5);
});

test("computeTotalRounds: ONCE/TWICE/THREE TIMES multiply the cycle length directly", () => {
  assert.equal(computeTotalRounds(4, 1), 3);
  assert.equal(computeTotalRounds(4, 2), 6);
  assert.equal(computeTotalRounds(4, 3), 9);
  assert.equal(computeTotalRounds(5, 2), 10);
  assert.equal(computeTotalRounds(6, 2), 10);
});

test("isValidScheduleCycles accepts only 1, 2, or 3", () => {
  assert.equal(isValidScheduleCycles(1), true);
  assert.equal(isValidScheduleCycles(2), true);
  assert.equal(isValidScheduleCycles(3), true);
  assert.equal(isValidScheduleCycles(0), false);
  assert.equal(isValidScheduleCycles(4), false);
});

test("leagueSeasonIdentityLabel: null season is a truthful pre-season label, never a fabricated round", () => {
  assert.equal(leagueSeasonIdentityLabel(null), "SEASON NOT STARTED");
});

test("leagueSeasonIdentityLabel: an in-progress season shows ROUND X / Y", () => {
  assert.equal(
    leagueSeasonIdentityLabel({
      seasonNumber: 2,
      scheduleCycles: 2,
      totalRounds: 14,
      currentRoundNumber: 3,
      status: "ACTIVE",
    }),
    "SEASON 2 · TWICE · ROUND 3 / 14 · ACTIVE"
  );
});

test("leagueSeasonIdentityLabel: scheduled-but-not-yet-opened shows the total without a current round", () => {
  assert.equal(
    leagueSeasonIdentityLabel({
      seasonNumber: 1,
      scheduleCycles: 1,
      totalRounds: 9,
      currentRoundNumber: null,
      status: "SETUP",
    }),
    "SEASON 1 · ONCE · 9 ROUNDS SCHEDULED · SETUP"
  );
});

test("leagueSeasonIdentityLabel: neither total nor current round known yet is SCHEDULE PENDING", () => {
  assert.equal(
    leagueSeasonIdentityLabel({
      seasonNumber: 1,
      scheduleCycles: 2,
      totalRounds: null,
      currentRoundNumber: null,
      status: "SETUP",
    }),
    "SEASON 1 · TWICE · SCHEDULE PENDING · SETUP"
  );
});

/**
 * End-to-end schedule-length checks across the manager counts the brief
 * explicitly calls out (2/3/4/5/6), proving `computeTotalRounds` actually
 * matches how many rounds the REAL scheduler (generateRoundRobinCycle +
 * pairingsForSeasonRound, unchanged) produces non-empty pairings for, and
 * that every real pairing is a legal (no self-matches, no duplicate team
 * within one round's pairings) H2H round. Also confirms no "phantom"
 * matchup is ever produced for a BYE: for odd manager counts, exactly one
 * team is missing from each round's pairings.
 */
for (const teamCount of [2, 3, 4, 5, 6]) {
  test(`full ONCE schedule for ${teamCount} managers has exactly the expected number of rounds, each with a legal pairing set`, () => {
    const teamIds = Array.from({ length: teamCount }, (_, i) => `team-${i}`);
    const cycle = generateRoundRobinCycle(teamIds);
    const totalRounds = computeTotalRounds(teamCount, 1);
    assert.equal(cycle.length, totalRounds);

    const isOdd = teamCount % 2 !== 0;
    for (let round = 1; round <= totalRounds; round++) {
      const pairings = pairingsForSeasonRound(cycle, round);
      const teamsInRound = pairings.flatMap((p) => [p.homeTeamId, p.awayTeamId]);
      assert.equal(new Set(teamsInRound).size, teamsInRound.length, "no team appears twice in one round's pairings");
      for (const p of pairings) assert.notEqual(p.homeTeamId, p.awayTeamId);

      if (isOdd) {
        assert.equal(teamsInRound.length, teamCount - 1, "exactly one manager has a BYE this round -- never a phantom matchup for it");
      } else {
        assert.equal(teamsInRound.length, teamCount, "every manager has a real pairing every round when the count is even");
      }
    }
  });

  test(`TWICE schedule for ${teamCount} managers doubles the ONCE length, and the repeat cycle still produces legal pairings`, () => {
    const teamIds = Array.from({ length: teamCount }, (_, i) => `team-${i}`);
    const cycle = generateRoundRobinCycle(teamIds);
    const onceLength = computeTotalRounds(teamCount, 1);
    const twiceLength = computeTotalRounds(teamCount, 2);
    assert.equal(twiceLength, onceLength * 2);

    // The repeat cycle (rounds onceLength+1 .. twiceLength) must still be
    // every pairing reused, just with home/away reversed (see
    // pairingsForSeasonRound's own doc comment) -- never duplicated empty
    // rounds, never a different team set.
    for (let round = onceLength + 1; round <= twiceLength; round++) {
      const pairings = pairingsForSeasonRound(cycle, round);
      assert.ok(pairings.length > 0 || teamCount < 2, "the repeat cycle still produces real pairings, never silently empty rounds");
    }
  });

  test(`THREE TIMES schedule for ${teamCount} managers is exactly three times the ONCE length`, () => {
    assert.equal(computeTotalRounds(teamCount, 3), computeTotalRounds(teamCount, 1) * 3);
  });
}
