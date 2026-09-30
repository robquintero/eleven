import { test } from "node:test";
import assert from "node:assert/strict";
import { isStarterCompositionValid } from "./constants.ts";
import {
  SUPPORTED_FORMATIONS,
  formationTargetCounts,
  canRosterSupplyFormation,
  namedFormationForCounts,
  computeFormationChange,
  type FormationRosterPlayer,
} from "./formations.ts";

test("every supported formation maps to a legal starting-XI shape (exactly 11, within FORMATION_RULES ranges)", () => {
  for (const formation of SUPPORTED_FORMATIONS) {
    const counts = formationTargetCounts(formation);
    assert.equal(counts.GK + counts.DEF + counts.MID + counts.FWD, 11, `${formation} must total 11 starters`);
    assert.ok(isStarterCompositionValid(counts), `${formation}'s counts must satisfy FORMATION_RULES: ${JSON.stringify(counts)}`);
  }
});

test("4-2-3-1 is stored/validated as DEF 4 / MID 5 / FWD 1", () => {
  assert.deepEqual(formationTargetCounts("4-2-3-1"), { GK: 1, DEF: 4, MID: 5, FWD: 1 });
});

test("namedFormationForCounts recovers 4-2-3-1's friendly name from its raw DEF/MID/FWD counts", () => {
  assert.equal(namedFormationForCounts({ DEF: 4, MID: 5, FWD: 1 }), "4-2-3-1");
});

test("namedFormationForCounts recognizes every other supported formation too", () => {
  assert.equal(namedFormationForCounts({ DEF: 4, MID: 4, FWD: 2 }), "4-4-2");
  assert.equal(namedFormationForCounts({ DEF: 4, MID: 3, FWD: 3 }), "4-3-3");
  assert.equal(namedFormationForCounts({ DEF: 3, MID: 5, FWD: 2 }), "3-5-2");
  assert.equal(namedFormationForCounts({ DEF: 3, MID: 4, FWD: 3 }), "3-4-3");
});

test("namedFormationForCounts returns null for a non-standard composition", () => {
  assert.equal(namedFormationForCounts({ DEF: 5, MID: 5, FWD: 1 }), null);
});

test("canRosterSupplyFormation: a roster with only 2 forwards cannot field 4-3-3 or 3-4-3 (both need 3)", () => {
  const roster = { GK: 2, DEF: 6, MID: 6, FWD: 2 };
  assert.equal(canRosterSupplyFormation(roster, "4-3-3"), false);
  assert.equal(canRosterSupplyFormation(roster, "3-4-3"), false);
  assert.equal(canRosterSupplyFormation(roster, "4-4-2"), true);
  assert.equal(canRosterSupplyFormation(roster, "3-5-2"), true);
});

test("canRosterSupplyFormation: a minimal legal roster (2 GK, 4 DEF, 4 MID, 2 FWD) can only field formations within that ceiling", () => {
  const roster = { GK: 2, DEF: 4, MID: 4, FWD: 2 };
  assert.equal(canRosterSupplyFormation(roster, "4-4-2"), true);
  assert.equal(canRosterSupplyFormation(roster, "4-2-3-1"), false, "needs 5 MID, roster only has 4");
  assert.equal(canRosterSupplyFormation(roster, "3-5-2"), false, "needs 5 MID, roster only has 4");
});

function player(id: string, position: FormationRosterPlayer["position"], isStarter: boolean, locked = false): FormationRosterPlayer {
  return { rosterEntryId: id, position, isStarter, locked };
}

test("computeFormationChange: switching 4-4-2 to 4-3-3 demotes one MID and promotes one FWD from bench", () => {
  const roster: FormationRosterPlayer[] = [
    player("gk1", "GK", true),
    player("gk2", "GK", false),
    player("d1", "DEF", true), player("d2", "DEF", true), player("d3", "DEF", true), player("d4", "DEF", true),
    player("m1", "MID", true), player("m2", "MID", true), player("m3", "MID", true), player("m4", "MID", true),
    player("f1", "FWD", true), player("f2", "FWD", true),
    player("f3", "FWD", false),
  ];
  const result = computeFormationChange(roster, "4-3-3");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  // 4-3-3 needs DEF4(have4,no change)/MID3(have4 starting, demote 1)/FWD3(have2 starting, promote 1 from bench).
  const demoted = result.changes.filter((c) => !c.starter);
  const promoted = result.changes.filter((c) => c.starter);
  assert.equal(demoted.length, 1, "exactly one surplus MID demoted");
  assert.equal(demoted[0].rosterEntryId, "m4", "demotes the LAST unlocked starter in the given (stable) order, keeping the earlier ones");
  assert.equal(promoted.length, 1, "exactly one FWD promoted from bench");
  assert.equal(promoted[0].rosterEntryId, "f3");
  assert.equal(promoted[0].position, "FWD");
});

test("computeFormationChange: a locked starter whose position the new formation needs FEWER of is never demoted -- LOCKED_PLAYER_CONFLICT", () => {
  const roster: FormationRosterPlayer[] = [
    player("gk1", "GK", true),
    player("gk2", "GK", false),
    player("d1", "DEF", true), player("d2", "DEF", true), player("d3", "DEF", true), player("d4", "DEF", true),
    // All 4 MID starters are LOCKED -- 4-3-3 only needs 3, but none can be demoted.
    player("m1", "MID", true, true), player("m2", "MID", true, true), player("m3", "MID", true, true), player("m4", "MID", true, true),
    player("f1", "FWD", true), player("f2", "FWD", true),
    player("f3", "FWD", false),
  ];
  const result = computeFormationChange(roster, "4-3-3");
  assert.deepEqual(result, { ok: false, error: "LOCKED_PLAYER_CONFLICT" });
});

test("computeFormationChange: promoting would require a locked bench player -- LOCKED_PLAYER_CONFLICT, not a false ROSTER_CANNOT_SUPPLY_FORMATION", () => {
  const roster: FormationRosterPlayer[] = [
    player("gk1", "GK", true),
    player("gk2", "GK", false),
    player("d1", "DEF", true), player("d2", "DEF", true), player("d3", "DEF", true),
    player("m1", "MID", true), player("m2", "MID", true), player("m3", "MID", true), player("m4", "MID", true), player("m5", "MID", true),
    player("f1", "FWD", true),
    // Only bench FWD is locked -- 3-4-3 needs 3 FWD, roster HAS 3 FWD total, but the 2 non-starting ones are unavailable to promote.
    player("f2", "FWD", false, true),
    player("f3", "FWD", false, true),
  ];
  const result = computeFormationChange(roster, "3-4-3");
  assert.deepEqual(result, { ok: false, error: "LOCKED_PLAYER_CONFLICT" });
});

test("computeFormationChange: roster genuinely lacks enough players at a position -- ROSTER_CANNOT_SUPPLY_FORMATION", () => {
  const roster: FormationRosterPlayer[] = [
    player("gk1", "GK", true),
    player("gk2", "GK", false),
    player("d1", "DEF", true), player("d2", "DEF", true), player("d3", "DEF", true), player("d4", "DEF", true),
    player("m1", "MID", true), player("m2", "MID", true), player("m3", "MID", true), player("m4", "MID", true),
    player("f1", "FWD", true), player("f2", "FWD", true),
    // Only 2 FWD on the entire roster -- 4-3-3 needs 3.
  ];
  const result = computeFormationChange(roster, "4-3-3");
  assert.deepEqual(result, { ok: false, error: "ROSTER_CANNOT_SUPPLY_FORMATION" });
});

test("computeFormationChange: no-op when the roster is already in the target formation", () => {
  const roster: FormationRosterPlayer[] = [
    player("gk1", "GK", true),
    player("gk2", "GK", false),
    player("d1", "DEF", true), player("d2", "DEF", true), player("d3", "DEF", true), player("d4", "DEF", true),
    player("m1", "MID", true), player("m2", "MID", true), player("m3", "MID", true), player("m4", "MID", true),
    player("f1", "FWD", true), player("f2", "FWD", true),
  ];
  const result = computeFormationChange(roster, "4-4-2");
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.changes, []);
});
