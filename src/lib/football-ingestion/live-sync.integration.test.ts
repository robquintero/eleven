/**
 * Regression test for the Pass 14 go-live Gate 1 finding: the live-sync
 * cron's own `suggestedIntervalMinutes` (sync-cadence.ts) was computed but
 * never enforced -- every fixture within its approaching-kickoff or
 * recently-final-reconciliation window got re-synced on literally every
 * one-minute tick for the window's entire duration, which a real Big Five
 * matchday was calculated at 16,000+ provider requests/day this way, over
 * double the 7,500/day budget. The fix persists `fixtures.last_live_sync_at`
 * and gates re-sync through `isDueForSync`.
 *
 * Proves the real `runLiveSyncTick` orchestration wiring end-to-end
 * WITHOUT spending any real API-Football quota: each test fixture is
 * inserted under a deliberately unresolvable competition code, so
 * `resolveCompetition` throws synchronously (caught by runLiveSyncTick's
 * own try/catch) before any network call could happen. Whether that
 * attempt happened at all -- which is exactly what the throttle gates --
 * is observable in `result.errors`, which records
 * "syncFixtures failed for <code>: ..." only when the competition was
 * actually reached.
 *
 * Uses the REAL current time as `now` (never a fixed historical date) --
 * an earlier version of this file used a fixed past date and, because
 * `determineFixtureSyncCadence`'s "final" branch has no lower bound on a
 * negative minutes-since-kickoff, that incorrectly classified several
 * REAL already-finished Big Five fixtures (whose real kickoffs were AFTER
 * the test's contrived `now`) as "due," triggering real provider calls
 * against production data. Real `now` can never predate real stored
 * fixtures the way an arbitrary past literal can.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAdminClient, isSupabaseAdminConfigured } from "../supabase/admin.ts";
import { runLiveSyncTick } from "./live-sync.ts";

const skip = !isSupabaseAdminConfigured();

async function setUpFakeCompetition(admin: ReturnType<typeof createAdminClient>, code: string) {
  const { data, error } = await admin
    .from("competitions")
    .insert({ name: `Throttle test ${code}`, code, country: "World", season: 2026 })
    .select("id")
    .single();
  if (error || !data) throw new Error(`failed to create fake competition ${code}: ${error?.message}`);
  return data.id;
}

async function setUpFakeClubs(admin: ReturnType<typeof createAdminClient>, competitionId: string, suffix: string) {
  const { data, error } = await admin
    .from("clubs")
    .insert([
      { competition_id: competitionId, code: `TA${suffix}`.slice(0, 10), name: `Throttle A ${suffix}`, short_name: "TA" },
      { competition_id: competitionId, code: `TB${suffix}`.slice(0, 10), name: `Throttle B ${suffix}`, short_name: "TB" },
    ])
    .select("id");
  if (error || !data || data.length !== 2) throw new Error(`failed to create fake clubs: ${error?.message}`);
  return { homeClubId: data[0]!.id, awayClubId: data[1]!.id };
}

test("runLiveSyncTick does NOT re-attempt a recently-final fixture's competition when its throttle interval has not yet elapsed", { skip }, async () => {
  const admin = createAdminClient();
  const code = `THR_DUE_${Date.now()}`;
  const competitionId = await setUpFakeCompetition(admin, code);
  const { homeClubId, awayClubId } = await setUpFakeClubs(admin, competitionId, String(Date.now()).slice(-6));

  const now = new Date();
  const kickoff = new Date(now.getTime() - 2 * 3600_000); // 2h ago -- "final", well within the 24h reconciliation window
  const syncedTwoMinutesAgo = new Date(now.getTime() - 2 * 60_000); // well within the 60-minute throttle

  const { data: fixture, error: fixtureErr } = await admin
    .from("fixtures")
    .insert({
      competition_id: competitionId,
      home_club_id: homeClubId,
      away_club_id: awayClubId,
      kickoff_at: kickoff.toISOString(),
      status: "final",
      season: 2026,
      last_live_sync_at: syncedTwoMinutesAgo.toISOString(),
    })
    .select("id")
    .single();
  assert.equal(fixtureErr, null);

  try {
    const result = await runLiveSyncTick(admin, now);
    assert.ok(
      !result.errors.some((e) => e.includes(code)),
      `a throttled fixture's competition must NOT be attempted this tick; errors: ${JSON.stringify(result.errors.filter((e) => e.includes(code)))}`
    );

    const { data: after } = await admin.from("fixtures").select("last_live_sync_at").eq("id", fixture!.id).single();
    assert.equal(
      new Date(after!.last_live_sync_at!).getTime(),
      syncedTwoMinutesAgo.getTime(),
      "a throttled fixture's last_live_sync_at must be left untouched, not bumped to now"
    );
  } finally {
    await admin.from("fixtures").delete().eq("id", fixture!.id);
    await admin.from("clubs").delete().in("id", [homeClubId, awayClubId]);
    await admin.from("competitions").delete().eq("id", competitionId);
  }
});

test("runLiveSyncTick DOES attempt a recently-final fixture's competition once its throttle interval has elapsed (or it was never synced)", { skip }, async () => {
  const admin = createAdminClient();
  const code = `THR_OVERDUE_${Date.now()}`;
  const competitionId = await setUpFakeCompetition(admin, code);
  const { homeClubId, awayClubId } = await setUpFakeClubs(admin, competitionId, String(Date.now()).slice(-6));

  const now = new Date();
  const kickoff = new Date(now.getTime() - 2 * 3600_000);

  const { data: fixture, error: fixtureErr } = await admin
    .from("fixtures")
    .insert({
      competition_id: competitionId,
      home_club_id: homeClubId,
      away_club_id: awayClubId,
      kickoff_at: kickoff.toISOString(),
      status: "final",
      season: 2026,
      last_live_sync_at: null, // never synced -- always due regardless of interval
    })
    .select("id")
    .single();
  assert.equal(fixtureErr, null);

  try {
    const result = await runLiveSyncTick(admin, now);
    assert.ok(
      result.errors.some((e) => e.includes(code)),
      `an overdue fixture's competition MUST be attempted this tick (and fail harmlessly since ${code} isn't a real resolvable competition); errors: ${JSON.stringify(result.errors)}`
    );
  } finally {
    await admin.from("fixtures").delete().eq("id", fixture!.id);
    await admin.from("clubs").delete().in("id", [homeClubId, awayClubId]);
    await admin.from("competitions").delete().eq("id", competitionId);
  }
});

test("runLiveSyncTick never throttles a LIVE fixture, even if it was synced moments ago", { skip }, async () => {
  const admin = createAdminClient();
  const code = `THR_LIVE_${Date.now()}`;
  const competitionId = await setUpFakeCompetition(admin, code);
  const { homeClubId, awayClubId } = await setUpFakeClubs(admin, competitionId, String(Date.now()).slice(-6));

  const now = new Date();
  const kickoff = new Date(now.getTime() - 30 * 60_000); // kicked off 30 min ago, still live
  const syncedTenSecondsAgo = new Date(now.getTime() - 10_000);

  const { data: fixture, error: fixtureErr } = await admin
    .from("fixtures")
    .insert({
      competition_id: competitionId,
      home_club_id: homeClubId,
      away_club_id: awayClubId,
      kickoff_at: kickoff.toISOString(),
      status: "live",
      season: 2026,
      last_live_sync_at: syncedTenSecondsAgo.toISOString(),
    })
    .select("id")
    .single();
  assert.equal(fixtureErr, null);

  try {
    const result = await runLiveSyncTick(admin, now);
    assert.ok(
      result.errors.some((e) => e.includes(code)),
      `a LIVE fixture must be attempted every tick regardless of how recently it was synced; errors: ${JSON.stringify(result.errors)}`
    );
  } finally {
    await admin.from("fixtures").delete().eq("id", fixture!.id);
    await admin.from("clubs").delete().in("id", [homeClubId, awayClubId]);
    await admin.from("competitions").delete().eq("id", competitionId);
  }
});
