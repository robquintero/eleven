import { test } from "node:test";
import assert from "node:assert/strict";
import { getFormWindows } from "./form-tracker.ts";

function matches(points: (number | null)[]) {
  return points.map((fantasyPoints) => ({ fantasyPoints }));
}

test("all windows are null with zero match history", () => {
  const windows = getFormWindows([]);
  assert.deepEqual(windows, { last3: null, last5: null, last10: null });
});

test("last3 is available with exactly 3 matches, but last5/last10 truthfully report insufficient history", () => {
  const windows = getFormWindows(matches([10, 6, 2]));
  assert.equal(windows.last3, 6);
  assert.equal(windows.last5, null);
  assert.equal(windows.last10, null);
});

test("last3 and last5 are available with 5 matches; last10 is still insufficient", () => {
  const windows = getFormWindows(matches([10, 8, 6, 4, 2]));
  assert.equal(windows.last3, 8); // (10+8+6)/3
  assert.equal(windows.last5, 6); // (10+8+6+4+2)/5
  assert.equal(windows.last10, null);
});

test("all three windows are available with 10+ matches, using only the most recent N for each", () => {
  const windows = getFormWindows(matches([9, 9, 9, 3, 3, 3, 3, 3, 3, 3, 100, 100]));
  assert.equal(windows.last3, 9);
  assert.equal(windows.last5, Math.round(((9 + 9 + 9 + 3 + 3) / 5) * 100) / 100);
  assert.equal(
    windows.last10,
    Math.round(((9 + 9 + 9 + 3 + 3 + 3 + 3 + 3 + 3 + 3) / 10) * 100) / 100
  );
});

test("an unscored match (fantasyPoints: null) is excluded from the average, not treated as 0", () => {
  const windows = getFormWindows(matches([10, null, 2]));
  assert.equal(windows.last3, 6, "average of 10 and 2 only (the two scored matches), not (10+0+2)/3");
});

test("a window where every match is unscored yet is null, not zero", () => {
  const windows = getFormWindows(matches([null, null, null]));
  assert.equal(windows.last3, null);
});
