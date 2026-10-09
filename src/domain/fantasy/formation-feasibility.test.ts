import { test } from "node:test";
import assert from "node:assert/strict";
import { checkFormationFeasibility } from "./formation-feasibility.ts";

const CURRENT_4_4_2 = { GK: { min: 1, max: 1 }, DEF: { min: 4, max: 4 }, MID: { min: 4, max: 4 }, FWD: { min: 2, max: 2 } };
const PREPARED_4_3_3 = { GK: { min: 1, max: 1 }, DEF: { min: 4, max: 4 }, MID: { min: 3, max: 3 }, FWD: { min: 3, max: 3 } };

// Real position counts from "5 Men of Class" (docs/audits/
// 5-men-of-class-draft-snapshot-2026-10-09.json), computed from the
// original draft-pick positions -- a regression fixture tying this check
// to the actual Pass 2 squad impact finding.
const FIVE_MEN_OF_CLASS_SQUADS: Record<string, { GK: number; DEF: number; MID: number; FWD: number }> = {
  "Phantom FC": { GK: 2, DEF: 4, MID: 6, FWD: 4 },
  "Pressure FC": { GK: 2, DEF: 4, MID: 6, FWD: 4 },
  "75Hard": { GK: 2, DEF: 5, MID: 6, FWD: 3 },
  "Expected Toulouse FC": { GK: 2, DEF: 5, MID: 5, FWD: 4 },
  "2 Goals 1 Cup": { GK: 2, DEF: 6, MID: 6, FWD: 2 },
};

test("every 5 Men of Class squad is feasible for the current 4-4-2 formation", () => {
  for (const [team, counts] of Object.entries(FIVE_MEN_OF_CLASS_SQUADS)) {
    const result = checkFormationFeasibility(counts, CURRENT_4_4_2);
    assert.equal(result.feasible, true, `${team} should be 4-4-2 feasible`);
  }
});

test("4 of 5 squads are already feasible for the prepared 4-3-3 formation", () => {
  const feasibleTeams = Object.entries(FIVE_MEN_OF_CLASS_SQUADS).filter(
    ([, counts]) => checkFormationFeasibility(counts, PREPARED_4_3_3).feasible
  );
  assert.equal(feasibleTeams.length, 4);
});

test("'2 Goals 1 Cup' is NOT feasible for 4-3-3 under original draft positions -- short exactly one FWD", () => {
  const result = checkFormationFeasibility(FIVE_MEN_OF_CLASS_SQUADS["2 Goals 1 Cup"], PREPARED_4_3_3);
  assert.equal(result.feasible, false);
  assert.deepEqual(result.shortfalls, [{ position: "FWD", have: 2, need: 3, short: 1 }]);
});

test("a squad exactly at the formation's minimums at every position is feasible (boundary, not just comfortably above)", () => {
  const result = checkFormationFeasibility({ GK: 1, DEF: 4, MID: 3, FWD: 3 }, PREPARED_4_3_3);
  assert.equal(result.feasible, true);
  assert.deepEqual(result.shortfalls, []);
});

// Pass 3: after the four product-owner-approved position overrides
// (Guehi MID->DEF, Porro MID->DEF, Rogers FWD->MID, Amaimouni MID->FWD)
// are applied, every squad's corrected position counts -- computed from
// docs/audits/5-men-of-class-draft-snapshot-2026-10-09.json plus those
// four corrections. "2 Goals 1 Cup" (the only previously-infeasible
// squad -- see the test above) gains its third FWD from Amaimouni's
// correction and becomes feasible without any roster transaction.
const FIVE_MEN_OF_CLASS_SQUADS_AFTER_PASS_3_OVERRIDES: Record<string, { GK: number; DEF: number; MID: number; FWD: number }> = {
  "Phantom FC": { GK: 2, DEF: 4, MID: 6, FWD: 4 },
  "Pressure FC": { GK: 2, DEF: 5, MID: 5, FWD: 4 },
  "75Hard": { GK: 2, DEF: 6, MID: 5, FWD: 3 },
  "Expected Toulouse FC": { GK: 2, DEF: 5, MID: 6, FWD: 3 },
  "2 Goals 1 Cup": { GK: 2, DEF: 6, MID: 5, FWD: 3 },
};

test("after the four approved Pass 3 overrides, every 5 Men of Class squad -- including the previously-infeasible '2 Goals 1 Cup' -- is 4-3-3 feasible", () => {
  for (const [team, counts] of Object.entries(FIVE_MEN_OF_CLASS_SQUADS_AFTER_PASS_3_OVERRIDES)) {
    const result = checkFormationFeasibility(counts, PREPARED_4_3_3);
    assert.equal(result.feasible, true, `${team} should be 4-3-3 feasible after the Pass 3 overrides: ${JSON.stringify(result.shortfalls)}`);
  }
});
