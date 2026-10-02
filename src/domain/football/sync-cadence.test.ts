import { test } from "node:test";
import assert from "node:assert/strict";
import { determineFixtureSyncCadence, isDueForSync } from "./sync-cadence.ts";

const NOW = new Date("2026-10-04T15:00:00Z");

test("a live fixture always needs syncing, regardless of kickoff time", () => {
  const decision = determineFixtureSyncCadence(
    { status: "live", kickoffAt: "2026-10-04T14:00:00Z" },
    NOW
  );
  assert.equal(decision.shouldSync, true);
  assert.equal(decision.reason, "live");
  assert.equal(decision.suggestedIntervalMinutes, 1, "Pass 12D: tightened to minute-level now that the real account quota (7,500/day) was confirmed to support it");
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

// ===========================================================================
// isDueForSync -- Gate 1 go-live finding: suggestedIntervalMinutes above was
// computed but never enforced; a single real Big Five matchday was
// calculated to cost 16,000+ provider requests/day this way. These tests
// protect the actual enforcement.
// ===========================================================================

test("isDueForSync: never synced before (lastSyncedAt null) is always due, regardless of phase", () => {
  const liveDecision = determineFixtureSyncCadence({ status: "live", kickoffAt: "2026-10-04T14:00:00Z" }, NOW);
  const finalDecision = determineFixtureSyncCadence({ status: "final", kickoffAt: "2026-10-04T13:00:00Z" }, NOW);
  assert.equal(isDueForSync(liveDecision, null, NOW), true);
  assert.equal(isDueForSync(finalDecision, null, NOW), true);
});

test("isDueForSync: a live fixture is due every tick regardless of how recently it was synced -- the 1-minute cadence is never throttled", () => {
  const decision = determineFixtureSyncCadence({ status: "live", kickoffAt: "2026-10-04T14:00:00Z" }, NOW);
  const justSynced = new Date(NOW.getTime() - 10_000); // 10 seconds ago
  assert.equal(isDueForSync(decision, justSynced, NOW), true);
});

test("isDueForSync: a recently-final fixture synced less than 60 minutes ago is NOT due -- this is the actual fix for the quota overage", () => {
  const decision = determineFixtureSyncCadence({ status: "final", kickoffAt: "2026-10-04T13:00:00Z" }, NOW);
  assert.equal(decision.suggestedIntervalMinutes, 60);
  const syncedTwoMinutesAgo = new Date(NOW.getTime() - 2 * 60_000);
  assert.equal(isDueForSync(decision, syncedTwoMinutesAgo, NOW), false);
});

test("isDueForSync: a recently-final fixture becomes due again once its full suggested interval has elapsed", () => {
  const decision = determineFixtureSyncCadence({ status: "final", kickoffAt: "2026-10-04T13:00:00Z" }, NOW);
  const syncedExactlyAtInterval = new Date(NOW.getTime() - 60 * 60_000);
  const syncedJustPastInterval = new Date(NOW.getTime() - 61 * 60_000);
  assert.equal(isDueForSync(decision, syncedExactlyAtInterval, NOW), true);
  assert.equal(isDueForSync(decision, syncedJustPastInterval, NOW), true);
});

test("isDueForSync: an approaching-kickoff fixture synced less than 30 minutes ago is NOT due", () => {
  const decision = determineFixtureSyncCadence({ status: "scheduled", kickoffAt: "2026-10-04T16:00:00Z" }, NOW);
  assert.equal(decision.suggestedIntervalMinutes, 30);
  const syncedTenMinutesAgo = new Date(NOW.getTime() - 10 * 60_000);
  assert.equal(isDueForSync(decision, syncedTenMinutesAgo, NOW), false);
});

test("isDueForSync: a fixture whose base decision is shouldSync=false is never due, no matter how long ago it was last synced (or never)", () => {
  const settledDecision = determineFixtureSyncCadence({ status: "final", kickoffAt: "2026-09-01T13:00:00Z" }, NOW);
  assert.equal(settledDecision.shouldSync, false);
  assert.equal(isDueForSync(settledDecision, null, NOW), false);
  assert.equal(isDueForSync(settledDecision, new Date("2020-01-01T00:00:00Z"), NOW), false);
});
