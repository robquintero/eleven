import { test } from "node:test";
import assert from "node:assert/strict";
import { isQualifyingRound } from "./rounds.ts";

test("isQualifyingRound recognizes every real UCL/UEL 2026/27 qualifying round name", () => {
  assert.equal(isQualifyingRound("1st Qualifying Round"), true);
  assert.equal(isQualifyingRound("2nd Qualifying Round"), true);
  assert.equal(isQualifyingRound("3rd Qualifying Round"), true);
  assert.equal(isQualifyingRound("Play-offs"), true);
});

test("isQualifyingRound is false for the main competition's League Stage rounds", () => {
  for (let i = 1; i <= 8; i += 1) {
    assert.equal(isQualifyingRound(`League Stage - ${i}`), false);
  }
});

test("isQualifyingRound is false for domestic regular-season rounds", () => {
  assert.equal(isQualifyingRound("Regular Season - 5"), false);
});

test("isQualifyingRound is false for knockout rounds", () => {
  assert.equal(isQualifyingRound("Round of 16"), false);
  assert.equal(isQualifyingRound("Quarter-finals"), false);
  assert.equal(isQualifyingRound("Final"), false);
});
