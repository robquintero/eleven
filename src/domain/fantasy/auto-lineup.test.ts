import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseAutomaticStartingXi } from "./auto-lineup.ts";
import type { RosterPlayer } from "./auto-lineup.ts";

function roster(counts: Record<string, number>): RosterPlayer[] {
  const players: RosterPlayer[] = [];
  let i = 0;
  for (const [position, count] of Object.entries(counts)) {
    for (let j = 0; j < count; j++) {
      players.push({ rosterEntryId: `p${i++}`, position: position as RosterPlayer["position"] });
    }
  }
  return players;
}

test("a well-stocked roster (2 GK, 5 DEF, 5 MID, 3 FWD) produces exactly 11 starters in a valid formation", () => {
  const result = chooseAutomaticStartingXi(roster({ GK: 2, DEF: 5, MID: 5, FWD: 3 }));
  assert.equal(result.starters.length, 11);
  const counts: Record<string, number> = {};
  for (const s of result.starters) counts[s.position] = (counts[s.position] ?? 0) + 1;
  assert.equal(counts.GK, 1, "never starts a second goalkeeper");
  assert.ok(counts.DEF >= 3 && counts.DEF <= 5);
  assert.ok(counts.MID >= 3 && counts.MID <= 5);
  assert.ok(counts.FWD >= 1 && counts.FWD <= 3);
  assert.equal(result.bench.length, 15 - 11);
});

test("a bare-minimum roster (exactly 1 GK, 3 DEF, 3 MID, 1 FWD) starts everyone", () => {
  const result = chooseAutomaticStartingXi(roster({ GK: 1, DEF: 3, MID: 3, FWD: 1 }));
  assert.equal(result.starters.length, 8, "can only field 8 -- not enough depth for 11, which is a genuine roster-construction problem the caller must have prevented upstream");
  assert.equal(result.bench.length, 0);
});

test("never starts more goalkeepers than the formation max (1), even with plenty of GK depth", () => {
  const result = chooseAutomaticStartingXi(roster({ GK: 3, DEF: 5, MID: 5, FWD: 3 }));
  const gkStarters = result.starters.filter((s) => s.position === "GK");
  assert.equal(gkStarters.length, 1);
});

test("is deterministic -- the same roster always produces the identical selection", () => {
  const r = roster({ GK: 2, DEF: 5, MID: 5, FWD: 3 });
  assert.deepEqual(chooseAutomaticStartingXi(r), chooseAutomaticStartingXi(r));
});

test("every chosen starter is also present in the original roster, and starters+bench partition it exactly", () => {
  const r = roster({ GK: 2, DEF: 5, MID: 5, FWD: 3 });
  const result = chooseAutomaticStartingXi(r);
  const allChosenIds = [...result.starters, ...result.bench].map((p) => p.rosterEntryId).sort();
  assert.deepEqual(allChosenIds, r.map((p) => p.rosterEntryId).sort());
});
