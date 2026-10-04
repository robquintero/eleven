/**
 * Pass 14.7 Phase 9 regression: proves the exact signal `runLiveSyncTick`
 * (live-sync.ts) now gates its `last_live_sync_at` marking on --
 * `result.counts.failed === 0` -- is reliable for a provider-call failure
 * that never throws. `syncFixtures` returns a normal (non-throwing)
 * `SyncResult` with `counts.failed` incremented whenever it can't even
 * attempt the real provider call (e.g. the competition isn't synced yet,
 * OR -- the real incident this guards against -- a missing
 * `API_FOOTBALL_KEY` throws inside `getFixtures`, caught internally by
 * `syncFixtures`'s own try/catch). Before this pass, `live-sync.ts` only
 * checked "did `syncFixtures` throw," which this case never does, so a
 * fully failed attempt was marked as a successful sync, silently delaying
 * the next real attempt by a full throttle interval.
 *
 * Deliberately calls `syncFixtures` directly (not `resolveCompetition`,
 * which only recognizes a small fixed set of REAL competition codes) with
 * a synthetic `CompetitionSyncTarget` whose code has no matching
 * `competitions` row -- `syncFixtures`'s own first step returns `fail(...)`
 * before anything that could make a real network call, so this makes
 * ZERO provider requests and touches no real competition/fixture data.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAdminClient, isSupabaseAdminConfigured } from "../supabase/admin.ts";
import { assertMutationTestsAllowedAgainstThisProject } from "../supabase/test-production-guard.ts";
import { syncFixtures } from "./sync-fixtures.ts";

const skip = !isSupabaseAdminConfigured();
assertMutationTestsAllowedAgainstThisProject();

test("syncFixtures: a competition with no matching 'competitions' row fails WITHOUT throwing and WITHOUT using any provider request", { skip }, async () => {
  const admin = createAdminClient();
  const code = `NOT_SYNCED_YET_${Date.now()}`;

  const result = await syncFixtures(admin, { code, providerLeagueId: 999999, providerSeason: 2026 }, { from: "2026-01-01", to: "2026-01-01" });

  assert.equal(result.counts.failed, 1, "the one real failure signal runLiveSyncTick's marking-gate relies on");
  assert.equal(result.requestsUsed, 0, "no real provider call can have happened -- the competition lookup itself failed first");
  assert.ok(
    result.errors.some((e) => e.includes(code) && e.includes("not synced yet")),
    `expected a truthful 'not synced yet' error, got: ${JSON.stringify(result.errors)}`
  );
});
