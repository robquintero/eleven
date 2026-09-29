import { test } from "node:test";
import assert from "node:assert/strict";
import { getUsageTrend } from "./usage-trend.ts";

test("getUsageTrend is null with no match history — INSUFFICIENT MATCH DATA, never a guess", () => {
  assert.equal(getUsageTrend([]), null);
});

test("getUsageTrend computes minutes series, average, starts, and start rate", () => {
  const trend = getUsageTrend([
    { minutes: 12, started: false },
    { minutes: 28, started: false },
    { minutes: 61, started: true },
    { minutes: 84, started: true },
    { minutes: 90, started: true },
  ]);

  assert.ok(trend);
  assert.deepEqual(trend.minutesByMatch, [12, 28, 61, 84, 90]);
  assert.equal(trend.averageMinutes, 55);
  assert.equal(trend.starts, 3);
  assert.equal(trend.startRate, 0.6);
  assert.equal(trend.matchesConsidered, 5);
});

test("getUsageTrend handles a single match", () => {
  const trend = getUsageTrend([{ minutes: 90, started: true }]);
  assert.ok(trend);
  assert.equal(trend.averageMinutes, 90);
  assert.equal(trend.startRate, 1);
});

test("getUsageTrend never invents fantasy points — the shape has no points/rating field", () => {
  const trend = getUsageTrend([{ minutes: 45, started: false }]);
  assert.ok(trend);
  assert.equal("points" in trend, false);
  assert.equal("rating" in trend, false);
});
