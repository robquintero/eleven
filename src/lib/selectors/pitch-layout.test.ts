import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutStartingXi, formationSlots, assignToSlots } from "./pitch-layout.ts";

test("a lone player in a row is centered at x=50", () => {
  const result = layoutStartingXi([{ position: "GK", value: "keeper" }]);
  assert.equal(result[0].x, 50);
});

test("a full back four uses the realistic 4-4-2 preset, spanning most of the pitch width", () => {
  // Pass 10.5C.5: there is only one preset now (4-4-2), so an exact
  // 4-player DEF group always gets it -- not a generic even spread
  // (that fallback is for a non-standard DEF count only, see below).
  const result = layoutStartingXi([
    { position: "DEF", value: "a" },
    { position: "DEF", value: "b" },
    { position: "DEF", value: "c" },
    { position: "DEF", value: "d" },
  ]);
  const xs = result.map((r) => r.x).sort((a, b) => a - b);
  assert.equal(xs[0], 12);
  assert.equal(xs[xs.length - 1], 88);
});

test("GK sits at the lowest y, FWD at the highest -- attacking direction is up the pitch", () => {
  const result = layoutStartingXi([
    { position: "GK", value: "a" },
    { position: "DEF", value: "b" },
    { position: "MID", value: "c" },
    { position: "FWD", value: "d" },
  ]);
  const yOf = (pos: string) => result.find((r) => r.position === pos)!.y;
  assert.ok(yOf("GK") < yOf("DEF"));
  assert.ok(yOf("DEF") < yOf("MID"));
  assert.ok(yOf("MID") < yOf("FWD"));
});

test("every input value survives layout unchanged, none dropped or duplicated", () => {
  const inputs = [
    { position: "DEF" as const, value: "p1" },
    { position: "MID" as const, value: "p2" },
    { position: "MID" as const, value: "p3" },
  ];
  const result = layoutStartingXi(inputs);
  assert.deepEqual(
    result.map((r) => r.value).sort(),
    inputs.map((i) => i.value).sort()
  );
});

test("an empty starting XI produces an empty layout", () => {
  assert.deepEqual(layoutStartingXi([]), []);
});

// ---------------------------------------------------------------------
// Pass 10.5C.1 / 10.5C.5: realistic 4-4-2 geometry -- Eleven V1 supports
// exactly one formation (src/domain/fantasy/constants.ts's
// FORMATION_RULES), so layoutStartingXi/formationSlots no longer take a
// formation argument at all; there is only ever one preset.
// ---------------------------------------------------------------------

test("the two strikers form a central strike partnership, not spread to the touchlines", () => {
  const result = layoutStartingXi([
    { position: "FWD" as const, value: "a" },
    { position: "FWD" as const, value: "b" },
  ]);
  const xs = result.map((r) => r.x).sort((a, b) => a - b);
  assert.ok(xs[0] > 30 && xs[0] < 50, `left striker should sit centrally, got x=${xs[0]}`);
  assert.ok(xs[1] > 50 && xs[1] < 70, `right striker should sit centrally, got x=${xs[1]}`);
  assert.ok(xs[1] - xs[0] < 30, `strikers should be close together, gap was ${xs[1] - xs[0]}`);
});

test("the 4-4-2 preset produces exactly as many coordinates as its own DEF/MID/FWD counts, each distinct", () => {
  const shape = { DEF: 4, MID: 4, FWD: 2 };
  for (const position of ["DEF", "MID", "FWD"] as const) {
    const items = Array.from({ length: shape[position] }, (_, i) => ({ position, value: i }));
    const result = layoutStartingXi(items);
    assert.equal(result.length, shape[position], `${position} should produce ${shape[position]} coordinates`);
    const xs = new Set(result.map((r) => r.x));
    assert.equal(xs.size, result.length, `${position} coordinates should be distinct`);
  }
});

test("a non-standard composition that doesn't match the 4-4-2 preset's exact count falls back to the generic even spread", () => {
  // 5 forwards matches no preset count at all.
  const result = layoutStartingXi(Array.from({ length: 5 }, (_, i) => ({ position: "FWD" as const, value: i })));
  const xs = result.map((r) => r.x).sort((a, b) => a - b);
  assert.equal(xs[0], 10);
  assert.equal(xs[xs.length - 1], 90);
});

// ---------------------------------------------------------------------
// Pass 10.5C.2: stable slot identity -- formationSlots() gives every
// starting-XI position a fixed id, and assignToSlots() maps a
// stably-ordered list of items onto those ids without ever reshuffling
// items already placed just because more get added later.
// ---------------------------------------------------------------------

test("formationSlots produces exactly 11 slots with unique, stable ids matching 1 GK / 4 DEF / 4 MID / 2 FWD", () => {
  const slots = formationSlots();
  assert.equal(slots.length, 11);
  const ids = new Set(slots.map((s) => s.id));
  assert.equal(ids.size, 11, "slot ids must all be unique");
  const shape = { GK: 1, DEF: 4, MID: 4, FWD: 2 };
  for (const position of ["GK", "DEF", "MID", "FWD"] as const) {
    assert.equal(slots.filter((s) => s.position === position).length, shape[position], `${position} slot count`);
  }
});

test("formationSlots is deterministic -- calling it twice gives identical ids and coordinates", () => {
  assert.deepEqual(formationSlots(), formationSlots());
});

test("assignToSlots: item i of a position lands on that position's i-th slot, in the given (stable) order", () => {
  const slots = formationSlots();
  const players = [
    { position: "DEF" as const, name: "leftmost" },
    { position: "DEF" as const, name: "second" },
    { position: "DEF" as const, name: "third" },
    { position: "DEF" as const, name: "rightmost" },
  ];
  const assignment = assignToSlots(players, slots);
  assert.equal(assignment.get("DEF-0")!.name, "leftmost");
  assert.equal(assignment.get("DEF-1")!.name, "second");
  assert.equal(assignment.get("DEF-2")!.name, "third");
  assert.equal(assignment.get("DEF-3")!.name, "rightmost");
});

test("left/right striker placement remains stable: assigning the second striker does not move the first", () => {
  const slots = formationSlots();
  // Simulates the editing sequence: striker A is already placed (e.g. via
  // a prior fill), THEN striker B gets added -- A's slot must not move.
  const afterFirst = assignToSlots([{ position: "FWD" as const, name: "A" }], slots);
  assert.equal(afterFirst.get("FWD-0")!.name, "A");

  const afterSecond = assignToSlots(
    [
      { position: "FWD" as const, name: "A" },
      { position: "FWD" as const, name: "B" },
    ],
    slots
  );
  assert.equal(afterSecond.get("FWD-0")!.name, "A", "the first striker must stay on FWD-0");
  assert.equal(afterSecond.get("FWD-1")!.name, "B", "the second striker takes the remaining slot, FWD-1");
});

test("assigning a player to a specific slot does not move players already assigned to other slots, across mixed positions", () => {
  const slots = formationSlots();
  const before = assignToSlots(
    [
      { position: "DEF" as const, name: "def-a" },
      { position: "MID" as const, name: "mid-a" },
    ],
    slots
  );
  const defSlotForA = [...before.entries()].find(([, v]) => v.name === "def-a")![0];
  const midSlotForA = [...before.entries()].find(([, v]) => v.name === "mid-a")![0];

  // Adding MORE players of the SAME positions must not relocate the ones already placed.
  const after = assignToSlots(
    [
      { position: "DEF" as const, name: "def-a" },
      { position: "DEF" as const, name: "def-b" },
      { position: "MID" as const, name: "mid-a" },
      { position: "MID" as const, name: "mid-b" },
    ],
    slots
  );
  assert.equal(after.get(defSlotForA)!.name, "def-a", "def-a must still occupy its original slot");
  assert.equal(after.get(midSlotForA)!.name, "mid-a", "mid-a must still occupy its original slot");
});

test("assignToSlots leaves unfilled slots absent from the map (never fabricates an occupant)", () => {
  const slots = formationSlots();
  const assignment = assignToSlots([{ position: "GK" as const, name: "keeper" }], slots);
  assert.equal(assignment.size, 1);
  assert.equal(assignment.has("DEF-0"), false);
});
