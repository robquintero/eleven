import { test } from "node:test";
import assert from "node:assert/strict";
import { shuffleOrder, teamPositionForPick, roundForPick, totalPicks } from "./draft-order.ts";

test("shuffleOrder with a deterministic RNG produces a reproducible result", () => {
  const items = ["A", "B", "C", "D"];
  const rng = (() => {
    const values = [0.1, 0.2, 0.3, 0.4];
    let i = 0;
    return () => values[i++ % values.length];
  })();
  const first = shuffleOrder(items, rng);
  const rng2 = (() => {
    const values = [0.1, 0.2, 0.3, 0.4];
    let i = 0;
    return () => values[i++ % values.length];
  })();
  const second = shuffleOrder(items, rng2);
  assert.deepEqual(first, second, "the same RNG sequence must always produce the same shuffle");
});

test("shuffleOrder never drops or duplicates an item", () => {
  const items = ["A", "B", "C", "D", "E"];
  const shuffled = shuffleOrder(items, Math.random);
  assert.deepEqual([...shuffled].sort(), [...items].sort());
});

test("round 1 of a snake draft goes position 1 -> N in order", () => {
  const teamCount = 4;
  assert.equal(teamPositionForPick(1, teamCount), 1);
  assert.equal(teamPositionForPick(2, teamCount), 2);
  assert.equal(teamPositionForPick(3, teamCount), 3);
  assert.equal(teamPositionForPick(4, teamCount), 4);
});

test("round 2 of a snake draft REVERSES to N -> 1", () => {
  const teamCount = 4;
  assert.equal(teamPositionForPick(5, teamCount), 4);
  assert.equal(teamPositionForPick(6, teamCount), 3);
  assert.equal(teamPositionForPick(7, teamCount), 2);
  assert.equal(teamPositionForPick(8, teamCount), 1);
});

test("round 3 reverses back to 1 -> N", () => {
  const teamCount = 4;
  assert.equal(teamPositionForPick(9, teamCount), 1);
  assert.equal(teamPositionForPick(12, teamCount), 4);
});

test("the LAST pick of one round and the FIRST pick of the next round go to the SAME team position (the snake 'turn')", () => {
  const teamCount = 6;
  assert.equal(teamPositionForPick(6, teamCount), teamPositionForPick(7, teamCount));
});

test("snake order works correctly for an odd team count too (6, 8, 10, 12 are the required launch sizes, but the math must not assume even)", () => {
  for (const teamCount of [5, 6, 7, 8, 9, 10, 11, 12]) {
    const seenInRound1 = new Set<number>();
    for (let pick = 1; pick <= teamCount; pick++) {
      seenInRound1.add(teamPositionForPick(pick, teamCount));
    }
    assert.equal(seenInRound1.size, teamCount, `every position must pick exactly once in round 1 of a ${teamCount}-team draft`);
  }
});

test("roundForPick groups picks into the correct round for every required league size", () => {
  for (const teamCount of [6, 8, 10, 12]) {
    assert.equal(roundForPick(1, teamCount), 1);
    assert.equal(roundForPick(teamCount, teamCount), 1);
    assert.equal(roundForPick(teamCount + 1, teamCount), 2);
    assert.equal(roundForPick(teamCount * 2, teamCount), 2);
  }
});

test("totalPicks is teams * rounds", () => {
  assert.equal(totalPicks(8, 16), 128);
  assert.equal(totalPicks(6, 16), 96);
});
