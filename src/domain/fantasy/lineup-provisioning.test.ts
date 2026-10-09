import { test } from "node:test";
import assert from "node:assert/strict";
import { planPartialLineupProvisioning } from "./auto-lineup.ts";
import type { RosterPlayer } from "./auto-lineup.ts";

function missing(counts: Record<string, number>): RosterPlayer[] {
  const players: RosterPlayer[] = [];
  let i = 0;
  for (const [position, count] of Object.entries(counts)) {
    for (let j = 0; j < count; j++) {
      players.push({ rosterEntryId: `missing-${i++}`, position: position as RosterPlayer["position"] });
    }
  }
  return players;
}

// Autonomous stabilization pass, Phase C: the real production incident
// this fixes is a team with exactly ONE existing starter (from a
// manager clicking around mid-draft) and all 15 other roster entries
// missing a slot entirely. FORMATION_RULES is 4-3-3 (GK1/DEF4/MID3/FWD3).

test("a team with zero existing starters needs the full formation from the missing pool -- equivalent to a from-scratch init", () => {
  const plan = planPartialLineupProvisioning(missing({ GK: 2, DEF: 5, MID: 5, FWD: 4 }), []);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.newStarterIds.size, 11);
});

test("the real incident shape: one existing FWD starter, 15 missing entries -- fills exactly the remaining GK1/DEF4/MID3/FWD2", () => {
  const missingEntries = missing({ GK: 2, DEF: 5, MID: 5, FWD: 3 }); // 15 total, matches a 16-player squad minus the 1 existing starter
  const plan = planPartialLineupProvisioning(missingEntries, ["FWD"]);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.newStarterIds.size, 10, "11 total starters minus the 1 already-existing FWD starter");
  const byPosition: Record<string, number> = {};
  for (const entry of missingEntries) {
    if (plan.newStarterIds.has(entry.rosterEntryId)) byPosition[entry.position] = (byPosition[entry.position] ?? 0) + 1;
  }
  assert.deepEqual(byPosition, { GK: 1, DEF: 4, MID: 3, FWD: 2 }, "FWD only needs 2 more since 1 is already an existing starter");
});

test("a fully-initialized team (nothing missing) is the caller's responsibility to detect before calling this -- but an empty missing pool with matching existing starters still resolves cleanly to zero new starters", () => {
  const plan = planPartialLineupProvisioning([], ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "FWD", "FWD", "FWD"]);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.newStarterIds.size, 0);
});

test("exception: existing starters already exceed the formation's max for a position", () => {
  // 5 existing FWD starters -- the fixed formation allows at most 3.
  const plan = planPartialLineupProvisioning(missing({ GK: 1, DEF: 4, MID: 3 }), ["FWD", "FWD", "FWD", "FWD", "FWD"]);
  assert.equal(plan.ok, false);
  if (plan.ok) return;
  assert.match(plan.reason, /FWD/);
});

test("11 existing starters already exactly matching the formation resolves cleanly -- any further missing entries are simply benched, not an exception", () => {
  // 1 GK + 4 DEF + 3 MID + 3 FWD = 11 already (exactly the formation's
  // total, not over it). A further missing DEF has zero remaining need
  // and is correctly left unselected (bench), not treated as a conflict.
  const existing: RosterPlayer["position"][] = ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "FWD", "FWD", "FWD"];
  const plan = planPartialLineupProvisioning(missing({ DEF: 1 }), existing);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.newStarterIds.size, 0);
});

test("exception: not enough depth at a position to complete the formation", () => {
  // Only 1 missing MID, but 3 are needed and none are already starting.
  const plan = planPartialLineupProvisioning(missing({ GK: 1, DEF: 4, MID: 1, FWD: 3 }), []);
  assert.equal(plan.ok, false);
  if (plan.ok) return;
  assert.match(plan.reason, /MID/);
});

test("selection is deterministic -- the same input always produces the identical plan", () => {
  const missingEntries = missing({ GK: 1, DEF: 4, MID: 3, FWD: 3 });
  const planA = planPartialLineupProvisioning(missingEntries, []);
  const planB = planPartialLineupProvisioning(missingEntries, []);
  assert.deepEqual(planA, planB);
});
