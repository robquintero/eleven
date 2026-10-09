import { test } from "node:test";
import assert from "node:assert/strict";
import { createLatestOnlyGuard } from "./stale-response-guard.ts";

test("a single in-flight request is still the latest when it resolves", () => {
  const guard = createLatestOnlyGuard();
  const token = guard.start();
  assert.equal(guard.isLatest(token), true);
});

test("the real incident: an OLDER, slower request resolving AFTER a newer one must be discarded", () => {
  const guard = createLatestOnlyGuard();
  const olderToken = guard.start(); // e.g. typing "G" -- a broad, slow query
  const newerToken = guard.start(); // then "Gu" -- narrower, resolves first
  assert.equal(guard.isLatest(newerToken), true, "the newer request is current");
  assert.equal(guard.isLatest(olderToken), false, "the older request must be recognized as stale once a newer one started");
});

test("a chain of several requests: only the very last one started is ever current", () => {
  const guard = createLatestOnlyGuard();
  const tokens = [guard.start(), guard.start(), guard.start(), guard.start()];
  for (const token of tokens.slice(0, -1)) assert.equal(guard.isLatest(token), false);
  assert.equal(guard.isLatest(tokens.at(-1)!), true);
});

test("two independent guards never interfere with each other's tokens", () => {
  const guardA = createLatestOnlyGuard();
  const guardB = createLatestOnlyGuard();
  const tokenA = guardA.start();
  guardB.start();
  guardB.start();
  // guardA has only ever started once -- a token numerically equal to
  // one of guardB's tokens must never be mistaken for guardA's own state.
  assert.equal(guardA.isLatest(tokenA), true);
});
