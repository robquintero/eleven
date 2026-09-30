import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutStartingXi } from "./pitch-layout.ts";

test("a lone player in a row is centered at x=50", () => {
  const result = layoutStartingXi([{ position: "GK", value: "keeper" }]);
  assert.equal(result[0].x, 50);
});

test("a full back four spreads evenly from x=10 to x=90", () => {
  const result = layoutStartingXi([
    { position: "DEF", value: "a" },
    { position: "DEF", value: "b" },
    { position: "DEF", value: "c" },
    { position: "DEF", value: "d" },
  ]);
  const xs = result.map((r) => r.x).sort((a, b) => a - b);
  assert.equal(xs[0], 10);
  assert.equal(xs[xs.length - 1], 90);
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
// Pass 10.5C.1: realistic, formation-specific geometry -- presentation
// only, never changes which/how many slots a formation has (that stays
// entirely count-based, see src/domain/fantasy/formations.ts).
// ---------------------------------------------------------------------

test("4-4-2: the two strikers form a central strike partnership, not spread to the touchlines", () => {
  const result = layoutStartingXi(
    [
      { position: "FWD" as const, value: "a" },
      { position: "FWD" as const, value: "b" },
    ],
    "4-4-2"
  );
  const xs = result.map((r) => r.x).sort((a, b) => a - b);
  assert.ok(xs[0] > 30 && xs[0] < 50, `left striker should sit centrally, got x=${xs[0]}`);
  assert.ok(xs[1] > 50 && xs[1] < 70, `right striker should sit centrally, got x=${xs[1]}`);
  assert.ok(xs[1] - xs[0] < 30, `strikers should be close together, gap was ${xs[1] - xs[0]}`);
});

test("4-3-3: a lone central striker sits between two genuinely wider forwards", () => {
  const result = layoutStartingXi(
    [
      { position: "FWD" as const, value: "left" },
      { position: "FWD" as const, value: "center" },
      { position: "FWD" as const, value: "right" },
    ],
    "4-3-3"
  );
  const xs = result.map((r) => r.x);
  const centerX = xs.find((x) => x > 40 && x < 60);
  assert.ok(centerX !== undefined, "one forward must sit centrally");
  const wideOnes = xs.filter((x) => x !== centerX);
  assert.ok(wideOnes.every((x) => x < 25 || x > 75), `the other two forwards must be genuinely wide, got ${wideOnes}`);
});

test("4-2-3-1: a lone striker, with the midfield five split into a compact double pivot and a wider attacking three", () => {
  const fwd = layoutStartingXi([{ position: "FWD" as const, value: "striker" }], "4-2-3-1");
  assert.equal(fwd.length, 1);
  assert.ok(fwd[0].x > 40 && fwd[0].x < 60, "the lone striker should be central");

  const mid = layoutStartingXi(
    ["pivot1", "pivot2", "left-am", "cam", "right-am"].map((value) => ({ position: "MID" as const, value })),
    "4-2-3-1"
  );
  assert.equal(mid.length, 5);
  // The double pivot sits deeper (smaller y, closer to the back four) than the attacking three.
  const ys = mid.map((m) => m.y).sort((a, b) => a - b);
  const deepest2 = ys.slice(0, 2);
  const advanced3 = ys.slice(2);
  assert.ok(Math.max(...deepest2) < Math.min(...advanced3), "the double pivot must sit deeper than the attacking three");
});

test("3-5-2 and 3-4-3: the back three is compact, not spread to the touchlines like a back four", () => {
  for (const formation of ["3-5-2", "3-4-3"] as const) {
    const result = layoutStartingXi(
      [
        { position: "DEF" as const, value: "a" },
        { position: "DEF" as const, value: "b" },
        { position: "DEF" as const, value: "c" },
      ],
      formation
    );
    const xs = result.map((r) => r.x).sort((a, b) => a - b);
    assert.ok(xs[0] > 10 && xs[xs.length - 1] < 90, `${formation}'s back three should be compact, got ${xs}`);
  }
});

test("every supported formation's preset produces exactly as many coordinates as its own DEF/MID/FWD counts", () => {
  const shapes: Record<string, { DEF: number; MID: number; FWD: number }> = {
    "4-4-2": { DEF: 4, MID: 4, FWD: 2 },
    "4-3-3": { DEF: 4, MID: 3, FWD: 3 },
    "4-2-3-1": { DEF: 4, MID: 5, FWD: 1 },
    "3-5-2": { DEF: 3, MID: 5, FWD: 2 },
    "3-4-3": { DEF: 3, MID: 4, FWD: 3 },
  };
  for (const [formation, shape] of Object.entries(shapes) as [
    "4-4-2" | "4-3-3" | "4-2-3-1" | "3-5-2" | "3-4-3",
    { DEF: number; MID: number; FWD: number },
  ][]) {
    for (const position of ["DEF", "MID", "FWD"] as const) {
      const items = Array.from({ length: shape[position] }, (_, i) => ({ position, value: i }));
      const result = layoutStartingXi(items, formation);
      assert.equal(result.length, shape[position], `${formation} ${position} should produce ${shape[position]} coordinates`);
      // Every coordinate must be a valid, distinct on-pitch position.
      const xs = new Set(result.map((r) => r.x));
      assert.equal(xs.size, result.length, `${formation} ${position} coordinates should be distinct`);
    }
  }
});

test("a non-standard composition that doesn't match any preset's exact count falls back to the generic even spread", () => {
  // 5 forwards matches no supported formation's FWD count at all.
  const result = layoutStartingXi(
    Array.from({ length: 5 }, (_, i) => ({ position: "FWD" as const, value: i })),
    "4-4-2"
  );
  const xs = result.map((r) => r.x).sort((a, b) => a - b);
  assert.equal(xs[0], 10);
  assert.equal(xs[xs.length - 1], 90);
});

test("no formation argument at all still uses the original generic even spread (backward compatible)", () => {
  const result = layoutStartingXi([
    { position: "FWD" as const, value: "a" },
    { position: "FWD" as const, value: "b" },
  ]);
  const xs = result.map((r) => r.x).sort((a, b) => a - b);
  assert.equal(xs[0], 10);
  assert.equal(xs[1], 90);
});
