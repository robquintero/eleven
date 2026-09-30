import { test } from "node:test";
import assert from "node:assert/strict";
import { generateRoundRobinCycle, pairingsForSeasonRound } from "./schedule.ts";

function teamIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `team-${i + 1}`);
}

for (const n of [6, 8, 10, 12]) {
  test(`${n}-team league: every team plays every other team exactly once across the cycle`, () => {
    const teams = teamIds(n);
    const cycle = generateRoundRobinCycle(teams);
    assert.equal(cycle.length, n - 1, `an even ${n}-team round robin has exactly ${n - 1} rounds`);

    const seenPairs = new Set<string>();
    for (const round of cycle) {
      for (const p of round) {
        const key = [p.homeTeamId, p.awayTeamId].sort().join("|");
        assert.ok(!seenPairs.has(key), `pair ${key} must not repeat within one cycle`);
        seenPairs.add(key);
      }
    }
    const expectedPairs = (n * (n - 1)) / 2;
    assert.equal(seenPairs.size, expectedPairs);
  });

  test(`${n}-team league: no team plays itself, no team appears twice in one round`, () => {
    const teams = teamIds(n);
    const cycle = generateRoundRobinCycle(teams);
    for (const round of cycle) {
      const appearances = new Map<string, number>();
      for (const p of round) {
        assert.notEqual(p.homeTeamId, p.awayTeamId, "a team can never play itself");
        appearances.set(p.homeTeamId, (appearances.get(p.homeTeamId) ?? 0) + 1);
        appearances.set(p.awayTeamId, (appearances.get(p.awayTeamId) ?? 0) + 1);
      }
      for (const [team, count] of appearances) {
        assert.equal(count, 1, `team ${team} must appear in at most one pairing per round`);
      }
      // Even league: every team plays every round (no byes for even counts).
      assert.equal(appearances.size, n, "every team plays every round in an even-sized league");
    }
  });
}

test("odd team count produces a deterministic BYE each round -- exactly one team sits out", () => {
  const teams = teamIds(7);
  const cycle = generateRoundRobinCycle(teams);
  assert.equal(cycle.length, 7, "an odd N-team cycle has N rounds (one extra for the rotating bye)");
  for (const round of cycle) {
    const playing = new Set<string>();
    for (const p of round) {
      playing.add(p.homeTeamId);
      playing.add(p.awayTeamId);
    }
    assert.equal(playing.size, 6, "exactly one of the 7 teams has a bye this round");
  }
  // Across the full cycle, every team gets exactly one bye.
  const byeCounts = new Map<string, number>();
  for (const team of teams) byeCounts.set(team, 0);
  for (const round of cycle) {
    const playing = new Set<string>();
    for (const p of round) {
      playing.add(p.homeTeamId);
      playing.add(p.awayTeamId);
    }
    for (const team of teams) {
      if (!playing.has(team)) byeCounts.set(team, byeCounts.get(team)! + 1);
    }
  }
  for (const [team, count] of byeCounts) {
    assert.equal(count, 1, `team ${team} must get exactly one bye across the full cycle`);
  }
});

test("schedule generation is deterministic -- the same team list produces the identical schedule every time", () => {
  const teams = teamIds(8);
  assert.deepEqual(generateRoundRobinCycle(teams), generateRoundRobinCycle(teams));
});

test("pairingsForSeasonRound cycles through the round-robin and reverses home/away on the second lap", () => {
  const teams = teamIds(6);
  const cycle = generateRoundRobinCycle(teams);
  const cycleLength = cycle.length; // 5

  const round1 = pairingsForSeasonRound(cycle, 1);
  assert.deepEqual(round1, cycle[0]);

  // The round immediately after one full cycle should replay the same
  // pairings as round 1, but with home/away swapped.
  const roundAfterFullCycle = pairingsForSeasonRound(cycle, cycleLength + 1);
  for (let i = 0; i < round1.length; i++) {
    assert.equal(roundAfterFullCycle[i].homeTeamId, round1[i].awayTeamId);
    assert.equal(roundAfterFullCycle[i].awayTeamId, round1[i].homeTeamId);
  }
});

test("a single-team or empty league produces no schedule", () => {
  assert.deepEqual(generateRoundRobinCycle([]), []);
  assert.deepEqual(generateRoundRobinCycle(["only-team"]), []);
});
