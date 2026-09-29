import { test } from "node:test";
import assert from "node:assert/strict";
import { FORMATION_RULES, isStarterCompositionValid } from "./constants.ts";

test("a valid 4-3-3 starting XI passes", () => {
  assert.equal(
    isStarterCompositionValid({ GK: 1, DEF: 4, MID: 3, FWD: 3 }),
    true
  );
});

test("a valid 3-5-2 starting XI passes", () => {
  assert.equal(
    isStarterCompositionValid({ GK: 1, DEF: 3, MID: 5, FWD: 2 }),
    true
  );
});

test("zero goalkeepers is invalid", () => {
  assert.equal(
    isStarterCompositionValid({ GK: 0, DEF: 5, MID: 3, FWD: 3 }),
    false
  );
});

test("two goalkeepers is invalid", () => {
  assert.equal(
    isStarterCompositionValid({ GK: 2, DEF: 4, MID: 3, FWD: 2 }),
    false
  );
});

test("too few starters overall is invalid", () => {
  assert.equal(
    isStarterCompositionValid({ GK: 1, DEF: 4, MID: 3, FWD: 2 }),
    false
  );
});

test("a position outside its min/max range is invalid even if the total is 11", () => {
  // 6 defenders is above the DEF max of 5, even though GK+DEF+MID+FWD = 11.
  assert.equal(
    isStarterCompositionValid({ GK: 1, DEF: 6, MID: 3, FWD: 1 }),
    false
  );
});

test("FORMATION_RULES matches the documented squad shape", () => {
  assert.equal(FORMATION_RULES.startersTotal, 11);
  assert.equal(FORMATION_RULES.squadSizeApprox, 16);
  assert.deepEqual(FORMATION_RULES.positionRange.GK, { min: 1, max: 1 });
});
