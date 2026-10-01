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

// Pass 10.5C.5: Eleven V1 is 4-4-2 only -- FORMATION_RULES' positionRange
// is now a fixed point (GK 1, DEF 4, MID 4, FWD 2), which already sums to
// 11, so chooseAutomaticStartingXi's minimums-first fill always produces
// exactly that shape for any legally-drafted (ROSTER_RULES-conforming)
// 16-player roster -- its "fill the rest" round-robin pass never has
// anything left to do.

test("a well-stocked roster (2 GK, 5 DEF, 5 MID, 3 FWD) produces exactly the fixed 4-4-2 shape", () => {
  const result = chooseAutomaticStartingXi(roster({ GK: 2, DEF: 5, MID: 5, FWD: 3 }));
  assert.equal(result.starters.length, 11);
  const counts: Record<string, number> = {};
  for (const s of result.starters) counts[s.position] = (counts[s.position] ?? 0) + 1;
  assert.deepEqual(counts, { GK: 1, DEF: 4, MID: 4, FWD: 2 }, "the auto-XI must always be exactly 4-4-2, not merely a legal range");
  assert.equal(result.bench.length, 15 - 11);
});

test("a legally-drafted 16-player roster (2 GK, 6 DEF, 4 MID, 4 FWD) -- an unusual but valid ROSTER_RULES shape -- still produces exactly 4-4-2", () => {
  const result = chooseAutomaticStartingXi(roster({ GK: 2, DEF: 6, MID: 4, FWD: 4 }));
  const counts: Record<string, number> = {};
  for (const s of result.starters) counts[s.position] = (counts[s.position] ?? 0) + 1;
  assert.deepEqual(counts, { GK: 1, DEF: 4, MID: 4, FWD: 2 });
});

test("a roster below the new fixed minimums (1 GK, 3 DEF, 3 MID, 1 FWD) starts everyone it can, short of 11", () => {
  const result = chooseAutomaticStartingXi(roster({ GK: 1, DEF: 3, MID: 3, FWD: 1 }));
  assert.equal(result.starters.length, 8, "can only field 8 -- not enough depth for 4-4-2's fixed minimums, a roster-construction problem ROSTER_RULES prevents upstream in practice");
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
