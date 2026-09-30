import { test } from "node:test";
import assert from "node:assert/strict";
import { determineFixtureSyncCadence } from "./sync-cadence.ts";

const NOW = new Date("2026-10-04T15:00:00Z");

test("a live fixture always needs syncing, regardless of kickoff time", () => {
  const decision = determineFixtureSyncCadence(
    { status: "live", kickoffAt: "2026-10-04T14:00:00Z" },
    NOW
  );
  assert.equal(decision.shouldSync, true);
  assert.equal(decision.reason, "live");
  assert.equal(decision.suggestedIntervalMinutes, 10);
});

test("half-time still counts as live, not settled", () => {
  const decision = determineFixtureSyncCadence(
    { status: "ht", kickoffAt: "2026-10-04T14:00:00Z" },
    NOW
  );
  assert.equal(decision.shouldSync, true);
  assert.equal(decision.reason, "live");
});

test("a fixture finished within the reconciliation window still gets synced", () => {
  const decision = determineFixtureSyncCadence(
    { status: "final", kickoffAt: "2026-10-04T13:00:00Z" }, // finished ~2h ago
    NOW
  );
  assert.equal(decision.shouldSync, true);
  assert.equal(decision.reason, "recently-final-reconciliation");
});

test("a fixture finished long ago (well outside the reconciliation window) is settled — never synced again", () => {
  const decision = determineFixtureSyncCadence(
    { status: "final", kickoffAt: "2026-09-01T13:00:00Z" },
    NOW
  );
  assert.equal(decision.shouldSync, false);
  assert.equal(decision.reason, "settled");
});

test("a postponed fixture is always settled — no cadence applies", () => {
  const decision = determineFixtureSyncCadence(
    { status: "postponed", kickoffAt: "2026-10-04T14:00:00Z" },
    NOW
  );
  assert.equal(decision.shouldSync, false);
  assert.equal(decision.reason, "settled");
});

test("a scheduled fixture kicking off soon is checked more often, to catch the live transition", () => {
  const decision = determineFixtureSyncCadence(
    { status: "scheduled", kickoffAt: "2026-10-04T16:00:00Z" }, // 1h from now
    NOW
  );
  assert.equal(decision.shouldSync, true);
  assert.equal(decision.reason, "approaching-kickoff");
});

test("a scheduled fixture days away is not synced yet", () => {
  const decision = determineFixtureSyncCadence(
    { status: "scheduled", kickoffAt: "2026-10-10T16:00:00Z" },
    NOW
  );
  assert.equal(decision.shouldSync, false);
  assert.equal(decision.reason, "too-far-from-kickoff");
});

test("the exact same fixture input always yields the same decision — deterministic, no hidden clock reads", () => {
  const input = { status: "live" as const, kickoffAt: "2026-10-04T14:00:00Z" };
  const first = determineFixtureSyncCadence(input, NOW);
  const second = determineFixtureSyncCadence(input, NOW);
  assert.deepEqual(first, second);
});

test("a different `now` for the identical fixture can change the decision — proving cadence depends on the injected clock, not a hidden one", () => {
  const input = { status: "scheduled" as const, kickoffAt: "2026-10-04T16:00:00Z" };
  const farBefore = determineFixtureSyncCadence(input, new Date("2026-10-01T00:00:00Z"));
  const closeBefore = determineFixtureSyncCadence(input, new Date("2026-10-04T15:30:00Z"));
  assert.equal(farBefore.shouldSync, false);
  assert.equal(closeBefore.shouldSync, true);
});
