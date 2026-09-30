import { test } from "node:test";
import assert from "node:assert/strict";
import { isRosterCompositionValid, isRosterCompletable, canDraftPosition, draftablePositions } from "./roster-rules.ts";

test("a complete, legal 16-player roster (2 GK, 4 DEF, 6 MID, 4 FWD) satisfies isRosterCompositionValid", () => {
  assert.equal(isRosterCompositionValid({ GK: 2, DEF: 4, MID: 6, FWD: 4 }), true);
});

test("a complete roster at the opposite legal extreme (2 GK, 6 DEF, 4 MID, 4 FWD) is also valid", () => {
  assert.equal(isRosterCompositionValid({ GK: 2, DEF: 6, MID: 4, FWD: 4 }), true);
});

test("a roster with the wrong total (15, not 16) is invalid even if every position is individually in range", () => {
  assert.equal(isRosterCompositionValid({ GK: 2, DEF: 4, MID: 4, FWD: 4 }), false);
});

test("3 goalkeepers is invalid -- GK is locked at exactly 2", () => {
  assert.equal(isRosterCompositionValid({ GK: 3, DEF: 4, MID: 4, FWD: 3 }), false);
});

test("1 goalkeeper is invalid -- GK minimum is 2", () => {
  assert.equal(isRosterCompositionValid({ GK: 1, DEF: 5, MID: 5, FWD: 3 }), false);
});

test("7 defenders exceeds the DEF maximum of 6", () => {
  assert.equal(isRosterCompositionValid({ GK: 2, DEF: 7, MID: 4, FWD: 3 }), false);
});

test("7 midfielders exceeds the MID maximum of 6", () => {
  assert.equal(isRosterCompositionValid({ GK: 2, DEF: 4, MID: 7, FWD: 3 }), false);
});

test("5 forwards exceeds the FWD maximum of 4", () => {
  assert.equal(isRosterCompositionValid({ GK: 2, DEF: 4, MID: 5, FWD: 5 }), false);
});

test("3 defenders is below the DEF minimum of 4", () => {
  assert.equal(isRosterCompositionValid({ GK: 2, DEF: 3, MID: 6, FWD: 5 }), false);
});

test("1 forward is below the FWD minimum of 2", () => {
  assert.equal(isRosterCompositionValid({ GK: 2, DEF: 6, MID: 7, FWD: 1 }), false);
});

test("the brief's own worked example: 2 picks left, GK and DEF each need 1 more -- a MID/FWD pick is rejected", () => {
  // Roster so far: 1 GK (needs 1 more), 3 DEF (needs 1 more), 4 MID (met), 2 FWD (met) = 10 players, 2 picks remain to reach 16... wait squadSize is 16 so 2 remain means 14 drafted so far; adjust counts to be concrete and consistent.
  const counts = { GK: 1, DEF: 3, MID: 6, FWD: 4 }; // 14 players; needs GK+1 and DEF+1 to hit minimums, exactly 2 slots left
  assert.equal(canDraftPosition(counts, "MID", 2), false, "MID is already at its max (6) here too, but even if it weren't this pick must be rejected");
  assert.equal(canDraftPosition(counts, "FWD", 2), false, "FWD is at its max (4) -- rejected on that basis alone");
  assert.equal(canDraftPosition(counts, "GK", 2), true, "GK still has an unmet minimum and 2 picks remain -- legal");
  assert.equal(canDraftPosition(counts, "DEF", 2), true, "DEF still has an unmet minimum and 2 picks remain -- legal");
});

test("a genuinely tight version of the brief's example using positions with room, not already-maxed ones", () => {
  // 1 GK (needs 1 more), 4 DEF (needs 0 more -- min met), 4 MID (has room to grow, min met), 2 FWD (min met) = 11 players, 5 picks remain.
  // Force a tighter scenario: GK needs 1, MID needs... let's construct precisely so exactly one non-GK/DEF pick is illegal.
  // Roster: GK 1 (need +1), DEF 4 (min met, room to 6), MID 4 (min met, room to 6), FWD 2 (min met, room to 4) = 11 players, picksRemaining = 5.
  const counts = { GK: 1, DEF: 4, MID: 4, FWD: 2 };
  // minShortfall = 1 (GK only). With 5 picks remaining, plenty of slack -- every position should still be legal here.
  assert.equal(canDraftPosition(counts, "GK", 5), true);
  assert.equal(canDraftPosition(counts, "MID", 5), true);

  // Now tighten: only 1 pick left, GK still needs 1 -- only GK may legally be picked.
  assert.equal(canDraftPosition(counts, "GK", 1), true);
  assert.equal(canDraftPosition(counts, "MID", 1), false, "picking MID with only 1 slot left would leave GK's minimum unreachable");
  assert.equal(canDraftPosition(counts, "DEF", 1), false);
  assert.equal(canDraftPosition(counts, "FWD", 1), false);
});

test("cannot draft a 3rd goalkeeper even with plenty of picks remaining", () => {
  assert.equal(canDraftPosition({ GK: 2, DEF: 2, MID: 2, FWD: 2 }, "GK", 8), false);
});

test("cannot draft a 7th defender", () => {
  assert.equal(canDraftPosition({ GK: 2, DEF: 6, MID: 2, FWD: 2 }, "DEF", 4), false);
});

test("cannot draft a 7th midfielder", () => {
  assert.equal(canDraftPosition({ GK: 2, DEF: 2, MID: 6, FWD: 2 }, "MID", 4), false);
});

test("cannot draft a 5th forward", () => {
  assert.equal(canDraftPosition({ GK: 2, DEF: 2, MID: 2, FWD: 4 }, "FWD", 6), false);
});

test("a legal flexible composition (2 GK, 5 DEF, 5 MID, 4 FWD) is fully draftable pick by pick", () => {
  // Build it up one pick at a time and confirm every intermediate step remains legal.
  const target = { GK: 2, DEF: 5, MID: 5, FWD: 4 };
  let counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  const order: Array<"GK" | "DEF" | "MID" | "FWD"> = [
    "GK", "GK", "DEF", "DEF", "MID", "MID", "FWD", "FWD",
    "DEF", "DEF", "DEF", "MID", "MID", "MID", "FWD", "FWD",
  ];
  let totalPicked = 0;
  for (const position of order) {
    const picksRemaining = 16 - totalPicked;
    assert.equal(canDraftPosition(counts, position, picksRemaining), true, `pick ${totalPicked + 1} (${position}) should be legal`);
    counts = { ...counts, [position]: counts[position] + 1 };
    totalPicked++;
  }
  assert.deepEqual(counts, target);
  assert.equal(isRosterCompositionValid(counts), true);
});

test("draftablePositions excludes maxed-out positions but includes everything else with plenty of room", () => {
  const positions = draftablePositions({ GK: 2, DEF: 3, MID: 3, FWD: 1 }, 7);
  assert.deepEqual(positions.sort(), ["DEF", "FWD", "MID"]);
});

test("isRosterCompletable is false when there are more picks remaining than total room across every position", () => {
  // All positions maxed except a hypothetical excess -- 0 room anywhere, but picksRemaining > 0.
  assert.equal(isRosterCompletable({ GK: 2, DEF: 6, MID: 6, FWD: 4 }, 1), false);
});

test("isRosterCompletable is true at picksRemaining = 0 exactly when the roster is already fully valid", () => {
  assert.equal(isRosterCompletable({ GK: 2, DEF: 4, MID: 6, FWD: 4 }, 0), true);
  assert.equal(isRosterCompletable({ GK: 1, DEF: 4, MID: 6, FWD: 4 }, 0), false, "GK minimum unmet with zero picks left to fix it");
});
