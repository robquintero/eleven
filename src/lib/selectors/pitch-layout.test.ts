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
