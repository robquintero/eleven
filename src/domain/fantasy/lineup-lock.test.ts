import { test } from "node:test";
import assert from "node:assert/strict";
import { computeLockInstant, isLocked } from "./lineup-lock.ts";

test("a player with no eligible fixtures this round has no lock instant", () => {
  assert.equal(computeLockInstant([]), null);
});

test("a player with one eligible fixture locks at that fixture's kickoff", () => {
  const kickoff = new Date("2026-09-19T15:00:00Z");
  assert.equal(computeLockInstant([kickoff])!.toISOString(), kickoff.toISOString());
});

test("a player with domestic + UCL fixtures in the same round locks at the EARLIER of the two, not the later", () => {
  const domestic = new Date("2026-09-19T15:00:00Z");
  const ucl = new Date("2026-09-16T19:00:00Z"); // earlier in the week
  assert.equal(computeLockInstant([domestic, ucl])!.toISOString(), ucl.toISOString());
});

test("null lockedAt is never locked, regardless of now", () => {
  assert.equal(isLocked(null, new Date("2099-01-01T00:00:00Z")), false);
});

test("one second before kickoff: unlocked", () => {
  const kickoff = new Date("2026-09-19T15:00:00Z");
  const oneSecondBefore = new Date(kickoff.getTime() - 1000);
  assert.equal(isLocked(kickoff, oneSecondBefore), false);
});

test("exact kickoff instant: locked", () => {
  const kickoff = new Date("2026-09-19T15:00:00Z");
  assert.equal(isLocked(kickoff, kickoff), true);
});

test("one second after kickoff: locked", () => {
  const kickoff = new Date("2026-09-19T15:00:00Z");
  const oneSecondAfter = new Date(kickoff.getTime() + 1000);
  assert.equal(isLocked(kickoff, oneSecondAfter), true);
});

test("a locked-at-first-kickoff player stays locked for a LATER eligible fixture in the same round -- the whole round's slot state is frozen, not re-openable between matches", () => {
  const first = new Date("2026-09-16T19:00:00Z");
  const second = new Date("2026-09-19T15:00:00Z");
  const lockedAt = computeLockInstant([first, second]);
  // Between the two kickoffs, the slot is already locked (it locked at `first`).
  const betweenTheTwoMatches = new Date("2026-09-18T00:00:00Z");
  assert.equal(isLocked(lockedAt, betweenTheTwoMatches), true);
});
