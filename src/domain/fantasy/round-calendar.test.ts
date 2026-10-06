import { test } from "node:test";
import assert from "node:assert/strict";
import { roundWindowContaining, nextRoundWindow, isWithinWindow, isSameWindow } from "./round-calendar.ts";

test("a Tuesday 06:00:00 UTC instant is the start of its own window", () => {
  const tuesday = new Date("2026-08-11T06:00:00.000Z");
  const window = roundWindowContaining(tuesday);
  assert.equal(window.startsAt.toISOString(), "2026-08-11T06:00:00.000Z");
  assert.equal(window.endsAt.toISOString(), "2026-08-18T06:00:00.000Z");
});

test("a Monday 23:59:59.999 UTC instant is inside of the window that started the preceding Tuesday", () => {
  const mondayNight = new Date("2026-08-17T23:59:59.999Z");
  const window = roundWindowContaining(mondayNight);
  assert.equal(window.startsAt.toISOString(), "2026-08-11T06:00:00.000Z");
});

test("exactly the boundary instant (Tuesday 06:00:00.000 UTC) belongs to the NEW window, not the old one", () => {
  const boundary = new Date("2026-08-18T06:00:00.000Z");
  const window = roundWindowContaining(boundary);
  assert.equal(window.startsAt.toISOString(), "2026-08-18T06:00:00.000Z");
});

test("one millisecond before the boundary still belongs to the OLD window", () => {
  const justBefore = new Date("2026-08-18T05:59:59.999Z");
  const window = roundWindowContaining(justBefore);
  assert.equal(window.startsAt.toISOString(), "2026-08-11T06:00:00.000Z");
});

test("a real domestic weekend fixture (Saturday) and a real UEFA midweek fixture (the preceding Tuesday) fall in the SAME window", () => {
  const uclTuesday = new Date("2026-09-15T19:00:00.000Z");
  const domesticSaturday = new Date("2026-09-19T15:00:00.000Z");
  const w1 = roundWindowContaining(uclTuesday);
  const w2 = roundWindowContaining(domesticSaturday);
  assert.ok(isSameWindow(w1, w2), "the midweek European leg and the weekend that follows it must land in the same round");
});

test("a Monday Night Football fixture stays in the SAME window as the Friday/Saturday/Sunday of its own weekend", () => {
  const friday = new Date("2026-08-21T19:00:00.000Z");
  const mondayNight = new Date("2026-08-24T19:30:00.000Z");
  assert.ok(isSameWindow(roundWindowContaining(friday), roundWindowContaining(mondayNight)));
});

test("nextRoundWindow returns the adjacent, non-overlapping, same-length window", () => {
  const window = roundWindowContaining(new Date("2026-08-11T06:00:00.000Z"));
  const next = nextRoundWindow(window);
  assert.equal(next.startsAt.getTime(), window.endsAt.getTime(), "no gap between windows");
  assert.equal(next.endsAt.getTime() - next.startsAt.getTime(), window.endsAt.getTime() - window.startsAt.getTime());
});

test("isWithinWindow is inclusive of start, exclusive of end", () => {
  const window = roundWindowContaining(new Date("2026-08-11T06:00:00.000Z"));
  assert.equal(isWithinWindow(window.startsAt, window), true);
  assert.equal(isWithinWindow(window.endsAt, window), false);
  assert.equal(isWithinWindow(new Date(window.endsAt.getTime() - 1), window), true);
});

test("calling roundWindowContaining twice with the identical date is deterministic", () => {
  const date = new Date("2026-10-01T12:00:00.000Z");
  assert.deepEqual(roundWindowContaining(date), roundWindowContaining(date));
});

for (const [instant, start] of [
  ["2026-10-05T23:59:00Z", "2026-09-29T06:00:00.000Z"],
  ["2026-10-06T00:00:00Z", "2026-09-29T06:00:00.000Z"],
  ["2026-10-06T03:00:00Z", "2026-09-29T06:00:00.000Z"],
  ["2026-10-06T05:59:59Z", "2026-09-29T06:00:00.000Z"],
  ["2026-10-06T06:00:00Z", "2026-10-06T06:00:00.000Z"],
  ["2026-10-06T06:00:01Z", "2026-10-06T06:00:00.000Z"],
]) test(`${instant} resolves by the fixed Tuesday 06:00 boundary`, () => {
  const window = roundWindowContaining(new Date(instant));
  assert.equal(window.startsAt.toISOString(), start);
  assert.equal(window.endsAt.getTime() - window.startsAt.getTime(), 7 * 24 * 60 * 60 * 1000);
});

test("U.S. spring/fall DST weeks retain Tuesday 06:00 UTC and exactly seven days", () => {
  for (const start of ["2026-03-03", "2026-03-10", "2026-10-27", "2026-11-03"]) {
    const window = roundWindowContaining(new Date(`${start}T06:00:00Z`));
    assert.equal(window.startsAt.toISOString(), `${start}T06:00:00.000Z`);
    assert.equal(window.endsAt.getUTCDay(), 2);
    assert.equal(window.endsAt.getUTCHours(), 6);
    assert.equal(window.endsAt.getTime() - window.startsAt.getTime(), 604800000);
  }
});

test("new windows do not inherit a legacy midnight anchor", () => {
  const next = nextRoundWindow({ startsAt: new Date("2026-09-29T00:00:00Z"), endsAt: new Date("2026-10-06T00:00:00Z") });
  assert.equal(next.startsAt.toISOString(), "2026-10-06T06:00:00.000Z");
  assert.equal(next.endsAt.toISOString(), "2026-10-13T06:00:00.000Z");
});
