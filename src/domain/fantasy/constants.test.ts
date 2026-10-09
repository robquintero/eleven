import { test } from "node:test";
import assert from "node:assert/strict";
import { FORMATION_RULES, isStarterCompositionValid, deriveFormationLabel } from "./constants.ts";

// Autonomous stabilization pass, Phase B: Eleven is 4-3-3 only (was 4-4-2
// through Pass 10.5C.5) -- `positionRange` is a fixed point (min === max
// for every position), not a range spanning several named formations, so
// `isStarterCompositionValid` accepts exactly one shape: 1 GK / 4 DEF /
// 3 MID / 3 FWD.

test("the exact 4-3-3 starting XI passes", () => {
  assert.equal(isStarterCompositionValid({ GK: 1, DEF: 4, MID: 3, FWD: 3 }), true);
});

test("a formerly-valid 4-4-2 starting XI is now rejected -- only 4-3-3 is legal", () => {
  assert.equal(isStarterCompositionValid({ GK: 1, DEF: 4, MID: 4, FWD: 2 }), false);
});

test("a formerly-valid 3-5-2 starting XI is now rejected -- only 4-3-3 is legal", () => {
  assert.equal(isStarterCompositionValid({ GK: 1, DEF: 3, MID: 5, FWD: 2 }), false);
});

test("zero goalkeepers is invalid", () => {
  assert.equal(
    isStarterCompositionValid({ GK: 0, DEF: 4, MID: 4, FWD: 3 }),
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

test("a position outside its fixed count is invalid even if the total is 11", () => {
  // 5 defenders, 1 midfielder: GK+DEF+MID+FWD still sums to 11, but DEF
  // must be exactly 4 and MID exactly 3 now -- neither matches.
  assert.equal(
    isStarterCompositionValid({ GK: 1, DEF: 5, MID: 1, FWD: 4 }),
    false
  );
});

test("FORMATION_RULES is fixed to exactly 4-3-3", () => {
  assert.equal(FORMATION_RULES.startersTotal, 11);
  assert.equal(FORMATION_RULES.squadSizeApprox, 16);
  assert.deepEqual(FORMATION_RULES.positionRange.GK, { min: 1, max: 1 });
  assert.deepEqual(FORMATION_RULES.positionRange.DEF, { min: 4, max: 4 });
  assert.deepEqual(FORMATION_RULES.positionRange.MID, { min: 3, max: 3 });
  assert.deepEqual(FORMATION_RULES.positionRange.FWD, { min: 3, max: 3 });
});

test("deriveFormationLabel names a formation from DEF/MID/FWD counts, GK omitted (matching real football convention)", () => {
  assert.equal(deriveFormationLabel({ GK: 1, DEF: 4, MID: 4, FWD: 2 }), "4-4-2");
  assert.equal(deriveFormationLabel({ GK: 1, DEF: 3, MID: 5, FWD: 2 }), "3-5-2");
  assert.equal(deriveFormationLabel({ GK: 1, DEF: 5, MID: 4, FWD: 1 }), "5-4-1");
});

test("deriveFormationLabel handles a partial/empty starting XI without throwing", () => {
  assert.equal(deriveFormationLabel({}), "0-0-0");
});
