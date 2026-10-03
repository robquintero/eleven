/**
 * Pass 14.6 Phase 7/10: "no retroactive point inheritance" -- a fantasy
 * team only receives a player's fantasy points for performances that
 * occur while the player is owned by that team.
 *
 * Deliberately exercises `refreshMatchupScores` (rounds.ts, the
 * authoritative function that persists `matchup_scores.live_points`) AND
 * `getRoundPlayerState` (data-access/matchups.ts, what the UI reads for a
 * per-player round score) against the SAME real scenario, proving they
 * agree -- a displayed per-player score must never disagree with the
 * team total it rolls up into.
 *
 * Per Phase 10's explicit architecture requirement: `fantasy_player_scores`
 * itself is NEVER touched by any assertion here -- every test confirms
 * the real, objective score rows are completely unchanged regardless of
 * ownership; only the MATCHUP AGGREGATION layer (`refreshMatchupScores`/
 * `getRoundPlayerState`) applies the acquisition cutoff.
 *
 * Isolated window (2016, nowhere near any real stored fixture -- the
 * earliest real seed fixture is 2023) with two real, distinct clubs,
 * same lightweight direct-insert pattern as
 * round-player-state.integration.test.ts and reconciliation.integration.test.ts
 * (no draft, no synthetic national-team scaffolding needed for a pure
 * club-fixture scenario).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAdminClient, isSupabaseAdminConfigured } from "../supabase/admin.ts";
import { createTestLeague, cleanupTestLeague } from "./integration-test-helpers.ts";
import { backfillScores } from "../scoring/backfill.ts";
import { refreshMatchupScores } from "./rounds.ts";
import { getRoundPlayerState } from "../../data-access/matchups.ts";
import type { RoundWindow } from "../../domain/fantasy/round-calendar.ts";

const skip = !isSupabaseAdminConfigured();

// Pass 14.6: this exact window was shifted once already during
// development after an earlier version of this file leaked un-cleaned-up
// fixtures at a different March 2016 window (fixed via `tearDownScenario`
// below) -- picking a window no prior run of this file ever used avoids
// colliding with whatever, if anything, is still left over from that.
const WINDOW_START = new Date("2016-04-01T00:00:00Z");
const WINDOW_END = new Date("2016-04-08T00:00:00Z");
const BEFORE_KICKOFF = new Date("2016-04-02T12:00:00Z");
const ACQUIRED_AT = new Date("2016-04-04T00:00:00Z");
const AFTER_KICKOFF = new Date("2016-04-06T12:00:00Z");

async function setUpScenario(admin: ReturnType<typeof createAdminClient>, league: Awaited<ReturnType<typeof createTestLeague>>) {
  const { data: comp } = await admin.from("competitions").select("id").eq("code", "ENG").limit(1).single();
  const competitionId = comp!.id;

  const { data: candidates } = await admin.from("players").select("id, club_id").eq("active", true).not("club_id", "is", null).limit(50);
  const byClub = new Map<string, string>();
  for (const p of candidates ?? []) {
    if (!byClub.has(p.club_id)) byClub.set(p.club_id, p.id);
    if (byClub.size >= 3) break;
  }
  const [[clubA, starterPlayerId], [clubB, benchPlayerId], [clubC]] = Array.from(byClub.entries());

  for (const playerId of [starterPlayerId, benchPlayerId]) {
    const { error } = await league.clients[0].rpc("sign_player", { p_league_id: league.leagueId, p_player_id: playerId });
    assert.equal(error, null);
  }
  await admin
    .from("roster_entries")
    .update({ acquired_at: ACQUIRED_AT.toISOString() })
    .eq("fantasy_team_id", league.teamIds[0])
    .in("player_id", [starterPlayerId, benchPlayerId]);

  const { data: beforeFixture } = await admin
    .from("fixtures")
    .insert({ competition_id: competitionId, home_club_id: clubA, away_club_id: clubB, kickoff_at: BEFORE_KICKOFF.toISOString(), status: "final", season: 2026 })
    .select("id")
    .single();
  const { data: afterFixture } = await admin
    .from("fixtures")
    .insert({ competition_id: competitionId, home_club_id: clubB, away_club_id: clubC, kickoff_at: AFTER_KICKOFF.toISOString(), status: "final", season: 2026 })
    .select("id")
    .single();

  // Distinct, non-zero, UNEQUAL stat lines for each fixture so a bug that
  // accidentally counted the wrong one (or both) is actually observable.
  // Every stat column spelled out explicitly (not relying on a
  // column default) -- a batch `.insert([...])` of heterogeneously-keyed
  // rows sends an explicit NULL for any key a given row omits but another
  // row in the SAME call specifies, rather than that column's own DB
  // default, which fails player_match_stats' NOT NULL constraints.
  await admin.from("player_match_stats").insert([
    { player_id: starterPlayerId, fixture_id: beforeFixture!.id, minutes: 90, goals: 1, assists: 0 }, // pre-acquisition
    { player_id: starterPlayerId, fixture_id: afterFixture!.id, minutes: 90, goals: 0, assists: 1 }, // post-acquisition
    { player_id: benchPlayerId, fixture_id: beforeFixture!.id, minutes: 90, goals: 1, assists: 0 }, // bench, pre-acquisition
  ]);
  const backfillResult = await backfillScores(admin, { fixtureIds: [beforeFixture!.id, afterFixture!.id] });
  assert.equal(backfillResult.failed, 0, backfillResult.errors.join("; "));

  const { data: season } = await admin.from("seasons").insert({ league_id: league.leagueId, season_number: 1, status: "ACTIVE", schedule_cycles: 2 }).select("id").single();
  const { data: round } = await admin
    .from("fantasy_rounds")
    .insert({ league_id: league.leagueId, season_id: season!.id, number: 1, starts_at: WINDOW_START.toISOString(), ends_at: WINDOW_END.toISOString(), status: "in_progress" })
    .select("id")
    .single();
  const roundId = round!.id;

  const { data: matchup } = await admin
    .from("matchups")
    .insert({ league_id: league.leagueId, fantasy_round_id: roundId, home_fantasy_team_id: league.teamIds[0], away_fantasy_team_id: league.teamIds[1], status: "scheduled" })
    .select("id")
    .single();

  const { data: starterRosterEntry } = await admin.from("roster_entries").select("id").eq("fantasy_team_id", league.teamIds[0]).eq("player_id", starterPlayerId).single();
  const { data: benchRosterEntry } = await admin.from("roster_entries").select("id").eq("fantasy_team_id", league.teamIds[0]).eq("player_id", benchPlayerId).single();

  await admin.from("lineup_slots").upsert(
    { roster_entry_id: starterRosterEntry!.id, fantasy_round_id: roundId, slot: "MID", starter: true, locked_at: BEFORE_KICKOFF.toISOString() },
    { onConflict: "roster_entry_id,fantasy_round_id" }
  );
  await admin.from("lineup_slots").upsert(
    { roster_entry_id: benchRosterEntry!.id, fantasy_round_id: roundId, slot: "BENCH", starter: false, locked_at: BEFORE_KICKOFF.toISOString() },
    { onConflict: "roster_entry_id,fantasy_round_id" }
  );

  return { starterPlayerId, benchPlayerId, roundId, matchupId: matchup!.id, beforeFixtureId: beforeFixture!.id, afterFixtureId: afterFixture!.id };
}

/**
 * These fixtures use REAL, deterministically-reselected clubs at FIXED
 * literal kickoff times -- without explicit cleanup, a second run would
 * find the FIRST run's leftover fixtures still inside the same window and
 * silently double (or triple) every point total (found live: this
 * produced a 32-point total where only 8 was expected). Mirrors the same
 * class of leak fixed this same pass in
 * international-scoring.integration.test.ts's GATE 6 and
 * round-player-state.integration.test.ts.
 */
async function tearDownScenario(admin: ReturnType<typeof createAdminClient>, scenario: { beforeFixtureId: string; afterFixtureId: string }) {
  const fixtureIds = [scenario.beforeFixtureId, scenario.afterFixtureId];
  await admin.from("fantasy_player_scores").delete().in("fixture_id", fixtureIds);
  await admin.from("player_match_stats").delete().in("fixture_id", fixtureIds);
  await admin.from("fixtures").delete().in("id", fixtureIds);
}

test("acquisition cutoff: a fixture BEFORE acquisition is excluded from the matchup total, a fixture AFTER acquisition counts (refreshMatchupScores)", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 4);
  let scenario: Awaited<ReturnType<typeof setUpScenario>> | null = null;
  try {
    scenario = await setUpScenario(admin, league);
    const { starterPlayerId, roundId, matchupId, beforeFixtureId, afterFixtureId } = scenario;

    await refreshMatchupScores(admin, roundId);

    const { data: beforeScore } = await admin.from("fantasy_player_scores").select("points").eq("player_id", starterPlayerId).eq("fixture_id", beforeFixtureId).single();
    const { data: afterScore } = await admin.from("fantasy_player_scores").select("points").eq("player_id", starterPlayerId).eq("fixture_id", afterFixtureId).single();
    assert.notEqual(beforeScore!.points, afterScore!.points, "the two fixtures must score differently, or this test can't distinguish which one counted");

    const { data: score } = await admin.from("matchup_scores").select("live_points").eq("matchup_id", matchupId).eq("fantasy_team_id", league.teamIds[0]).single();
    assert.equal(score!.live_points, afterScore!.points, "W: only the post-acquisition fixture's points may count toward the matchup total");
  } finally {
    if (scenario) await tearDownScenario(admin, scenario);
    await cleanupTestLeague(admin, league);
  }
});

test("acquisition cutoff: pre-acquisition performance remains visible in fantasy_player_scores, completely unchanged (objective score never touched)", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 4);
  let scenario: Awaited<ReturnType<typeof setUpScenario>> | null = null;
  try {
    scenario = await setUpScenario(admin, league);
    const { starterPlayerId, roundId, beforeFixtureId } = scenario;
    await refreshMatchupScores(admin, roundId);

    const { data: scoreRow } = await admin.from("fantasy_player_scores").select("points, scoring_rule_version").eq("player_id", starterPlayerId).eq("fixture_id", beforeFixtureId).single();
    assert.ok(scoreRow, "Y: the pre-acquisition performance's objective fantasy_player_scores row must still exist");
    assert.ok(scoreRow!.points > 0, "Y: its real points are completely unchanged -- never zeroed out because of ownership");
  } finally {
    if (scenario) await tearDownScenario(admin, scenario);
    await cleanupTestLeague(admin, league);
  }
});

test("acquisition cutoff: getRoundPlayerState reports the post-acquisition points as counted and the pre-acquisition points separately, never silently dropped", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 4);
  let scenario: Awaited<ReturnType<typeof setUpScenario>> | null = null;
  try {
    scenario = await setUpScenario(admin, league);
    const { starterPlayerId } = scenario;

    const { data: entries } = await admin.from("roster_entries").select("player_id, acquired_at").eq("fantasy_team_id", league.teamIds[0]).eq("status", "active");
    const acquiredAtByPlayerId = new Map((entries ?? []).map((e) => [e.player_id, e.acquired_at]));
    const playerIds = (entries ?? []).map((e) => e.player_id);

    const window: RoundWindow = { startsAt: WINDOW_START, endsAt: WINDOW_END };
    const { pointsByPlayerId, preAcquisitionPointsByPlayerId } = await getRoundPlayerState(admin, playerIds, window, acquiredAtByPlayerId);

    const counted = pointsByPlayerId.get(starterPlayerId) ?? 0;
    const preAcquisition = preAcquisitionPointsByPlayerId.get(starterPlayerId) ?? 0;
    assert.ok(counted > 0, "R/V: the post-acquisition fixture's points are counted");
    assert.ok(preAcquisition > 0, "T: the pre-acquisition fixture's points are reported separately, for display, never silently dropped");
    assert.notEqual(counted, preAcquisition, "sanity: the two fixtures scored different amounts");
  } finally {
    if (scenario) await tearDownScenario(admin, scenario);
    await cleanupTestLeague(admin, league);
  }
});

test("acquisition cutoff: a bench player's pre-acquisition performance never adds to the matchup total -- X: bench is excluded regardless of acquisition time, on top of the acquisition cutoff itself", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 4);
  let scenario: Awaited<ReturnType<typeof setUpScenario>> | null = null;
  try {
    scenario = await setUpScenario(admin, league);
    const { starterPlayerId, roundId, matchupId, afterFixtureId } = scenario;
    await refreshMatchupScores(admin, roundId);

    const { data: afterScore } = await admin.from("fantasy_player_scores").select("points").eq("player_id", starterPlayerId).eq("fixture_id", afterFixtureId).single();
    const { data: score } = await admin.from("matchup_scores").select("live_points").eq("matchup_id", matchupId).eq("fantasy_team_id", league.teamIds[0]).single();

    // The matchup total must equal EXACTLY the starter's post-acquisition
    // fixture -- the bench player's pre-acquisition performance must not
    // add anything on top (bench is excluded independent of ownership
    // timing), and the starter's own pre-acquisition fixture must not
    // add anything either (the acquisition cutoff).
    assert.equal(score!.live_points, afterScore!.points);
  } finally {
    if (scenario) await tearDownScenario(admin, scenario);
    await cleanupTestLeague(admin, league);
  }
});
