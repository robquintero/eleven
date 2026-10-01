/**
 * Pass 12A: real-database integration tests for the season engine --
 * season creation/backfill (auto-bootstrap inside `openNextRound`),
 * `set_season_schedule_format` (commissioner-only, pre-season-only),
 * odd-manager BYE scheduling, and the one small end-to-end lifecycle
 * smoke test the brief calls for (create league -> season -> schedule ->
 * finalize -> standings -> complete -> champion -> progression called
 * twice is idempotent). Deliberately NOT a multi-season simulation
 * battery -- see docs/game-rules.md and this pass's own completion
 * report for why that would be out of scope.
 *
 * Same conventions as the rest of this pass's integration tests: real
 * temporary Supabase Auth users/leagues via `createTestLeague`, no draft
 * run anywhere (rosters stay empty -- matchups still open/finalize/score
 * 0-0 correctly with zero players, which is itself a useful edge case),
 * cleaned up in a `finally` block, skipped entirely under plain `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAdminClient, isSupabaseAdminConfigured } from "../supabase/admin.ts";
import { openNextRound, finalizeRoundIfReady } from "./rounds.ts";
import { progressSeason } from "./season.ts";
import { computeTotalRounds } from "../../domain/fantasy/season.ts";
import { createTestLeague, cleanupTestLeague } from "./integration-test-helpers.ts";

const skip = !isSupabaseAdminConfigured();

// A real historical window with confirmed, fully-settled fixtures (same
// anchor date draft-engine.integration.test.ts and simulate.ts already
// rely on) -- lets `finalizeRoundIfReady` actually finalize without
// waiting on real-world match timing.
const HISTORICAL_START = new Date("2026-08-25T00:00:00Z");

function settleClockFor(windowEndsAt: Date): Date {
  return new Date(windowEndsAt.getTime() + 25 * 3600 * 1000);
}

test("openNextRound auto-bootstraps a default (TWICE) ACTIVE season on first round open, with total_rounds computed from the real team count", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 4, 16);
  try {
    const opened = await openNextRound(admin, league.leagueId, HISTORICAL_START);
    assert.ok(opened.ok, `round must open: ${!opened.ok ? opened.error : ""}`);
    if (!opened.ok) return;

    const { data: round } = await admin.from("fantasy_rounds").select("season_id, number").eq("id", opened.roundId).single();
    assert.equal(round!.number, 1);
    assert.ok(round!.season_id, "the round must belong to a real season");

    const { data: season } = await admin.from("seasons").select("status, schedule_cycles, season_number, total_rounds").eq("id", round!.season_id).single();
    assert.equal(season!.status, "ACTIVE");
    assert.equal(season!.schedule_cycles, 2, "default schedule format is TWICE");
    assert.equal(season!.season_number, 1);
    assert.equal(season!.total_rounds, computeTotalRounds(4, 2), "4 managers, TWICE = (4-1)*2 = 6 rounds");
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

test("set_season_schedule_format is commissioner-only, pre-season-only, and is honored when the first round actually opens", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 16);
  try {
    const nonCommissioner = await league.clients[1].rpc("set_season_schedule_format", { p_league_id: league.leagueId, p_cycles: 1 });
    assert.equal(nonCommissioner.error?.message, "NOT_COMMISSIONER");

    const invalid = await league.clients[0].rpc("set_season_schedule_format", { p_league_id: league.leagueId, p_cycles: 5 });
    assert.ok(invalid.error, "5 is not a supported schedule format");

    const ok = await league.clients[0].rpc("set_season_schedule_format", { p_league_id: league.leagueId, p_cycles: 1 });
    assert.equal(ok.error, null);

    const { data: setupSeason } = await admin.from("seasons").select("status, schedule_cycles, total_rounds").eq("league_id", league.leagueId).single();
    assert.equal(setupSeason!.status, "SETUP");
    assert.equal(setupSeason!.schedule_cycles, 1);
    assert.equal(setupSeason!.total_rounds, null, "total_rounds isn't computed until the real team count is known at round-open time");

    const alreadyStarted = await league.clients[0].rpc("set_season_schedule_format", { p_league_id: league.leagueId, p_cycles: 2 });
    assert.equal(alreadyStarted.error?.message, "SEASON_ALREADY_STARTED");

    const opened = await openNextRound(admin, league.leagueId, HISTORICAL_START);
    assert.ok(opened.ok);
    if (!opened.ok) return;

    const { data: activeSeason } = await admin.from("seasons").select("status, schedule_cycles, total_rounds").eq("league_id", league.leagueId).single();
    assert.equal(activeSeason!.status, "ACTIVE", "the SETUP row is promoted, never duplicated");
    assert.equal(activeSeason!.schedule_cycles, 1, "the commissioner's ONCE choice survives into the active season");
    assert.equal(activeSeason!.total_rounds, computeTotalRounds(2, 1), "2 managers, ONCE = 1 round");
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

test("odd manager count (3) gets a deterministic BYE each round -- exactly one real matchup per round, never a phantom third", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 3, 16);
  try {
    const ok = await league.clients[0].rpc("set_season_schedule_format", { p_league_id: league.leagueId, p_cycles: 1 });
    assert.equal(ok.error, null);

    let clock = HISTORICAL_START;
    const matchupTeamPairs: string[][] = [];
    for (let i = 0; i < 3; i++) {
      const opened = await openNextRound(admin, league.leagueId, clock);
      assert.ok(opened.ok, `round ${i + 1} must open: ${!opened.ok ? opened.error : ""}`);
      if (!opened.ok) return;

      const { data: matchups } = await admin
        .from("matchups")
        .select("home_fantasy_team_id, away_fantasy_team_id")
        .eq("fantasy_round_id", opened.roundId);
      assert.equal(matchups?.length, 1, "3 teams -- exactly one real pairing, one team on a bye, never a phantom matchup for it");
      matchupTeamPairs.push([matchups![0]!.home_fantasy_team_id, matchups![0]!.away_fantasy_team_id]);

      const settleClock = settleClockFor(opened.window.endsAt);
      const finalizeResult = await finalizeRoundIfReady(admin, opened.roundId, settleClock);
      assert.equal(finalizeResult.finalized, true, `round ${i + 1} must finalize cleanly against real historical fixtures`);
      clock = settleClock;
    }

    const { data: finalSeason } = await admin.from("seasons").select("status, champion_fantasy_team_id").eq("league_id", league.leagueId).single();
    assert.equal(finalSeason!.status, "ACTIVE", "finalizing the last round via finalizeRoundIfReady directly (not progressSeason) never completes the season on its own");

    const byeCounts = new Map<string, number>();
    for (const teamId of league.teamIds) byeCounts.set(teamId, 0);
    for (const pair of matchupTeamPairs) {
      for (const teamId of league.teamIds) if (!pair.includes(teamId)) byeCounts.set(teamId, byeCounts.get(teamId)! + 1);
    }
    for (const teamId of league.teamIds) assert.equal(byeCounts.get(teamId), 1, "each of the 3 managers sits out exactly one of the 3 rounds in a single ONCE cycle");
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

test("lifecycle smoke test: league -> season -> schedule -> finalize -> standings -> complete -> champion, and progressSeason called twice is idempotent", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 16);
  try {
    const ok = await league.clients[0].rpc("set_season_schedule_format", { p_league_id: league.leagueId, p_cycles: 1 });
    assert.equal(ok.error, null);

    // Round 1 opening is the real production trigger (draft completion ->
    // ensureFirstRoundOpened -> openNextRound) -- progressSeason itself is
    // only ever responsible for progressing an ALREADY-active season, per
    // this pass's design (see season.ts's own doc comment).
    const opened = await openNextRound(admin, league.leagueId, HISTORICAL_START);
    assert.ok(opened.ok);
    if (!opened.ok) return;

    const { data: seasonAfterOpen } = await admin.from("seasons").select("id, total_rounds").eq("league_id", league.leagueId).single();
    assert.equal(seasonAfterOpen!.total_rounds, 1, "2 managers, ONCE = exactly 1 round -- this is already the final round");

    const settleClock = settleClockFor(opened.window.endsAt);
    const first = await progressSeason(admin, league.leagueId, settleClock);
    assert.equal(first.action, "season_completed", "the only round finalizes and it was the final round -- the season must complete in one progressSeason call");
    if (first.action !== "season_completed") return;
    assert.ok(
      first.championFantasyTeamId && league.teamIds.includes(first.championFantasyTeamId),
      "the champion must be a real team in this league"
    );

    const { data: completedSeason } = await admin
      .from("seasons")
      .select("status, completed_at, champion_fantasy_team_id")
      .eq("id", seasonAfterOpen!.id)
      .single();
    assert.equal(completedSeason!.status, "COMPLETED");
    assert.ok(completedSeason!.completed_at);
    assert.equal(completedSeason!.champion_fantasy_team_id, first.championFantasyTeamId);

    // Standings derivation from the authoritative final matchup: with
    // zero rostered players on either side this is a 0-0 draw, so the
    // champion is decided purely by the deterministic team-id fallback
    // (rankStandings' own, separately unit-tested, final tiebreaker) --
    // confirms the real finalized matchup_scores row genuinely drove it,
    // not a fabricated result.
    const { data: matchup } = await admin
      .from("matchups")
      .select("id, home_fantasy_team_id, away_fantasy_team_id, status, matchup_scores(fantasy_team_id, final_points)")
      .eq("fantasy_round_id", opened.roundId)
      .single();
    assert.equal(matchup!.status, "final");
    const scores = matchup!.matchup_scores as unknown as { fantasy_team_id: string; final_points: number }[];
    assert.equal(scores.length, 2);
    for (const s of scores) assert.equal(s.final_points, 0, "no rostered players -- a genuine 0-0, not a fabricated score");
    const expectedChampion = [matchup!.home_fantasy_team_id, matchup!.away_fantasy_team_id].sort()[0];
    assert.equal(first.championFantasyTeamId, expectedChampion, "0-0 draw on both sides -- team id ascending is the only legitimate tiebreak");

    // Idempotency: calling progressSeason again must not re-complete the
    // season, duplicate a round, or recompute a (possibly different)
    // champion -- it must simply recognize there is no ACTIVE season left.
    const second = await progressSeason(admin, league.leagueId, new Date(settleClock.getTime() + 3600_000));
    assert.equal(second.action, "no_active_season");

    const { data: seasonAfterSecondCall } = await admin
      .from("seasons")
      .select("status, completed_at, champion_fantasy_team_id")
      .eq("id", seasonAfterOpen!.id)
      .single();
    assert.deepEqual(seasonAfterSecondCall, completedSeason, "a second progressSeason call changes nothing about the completed season");

    const { data: roundCountAfter } = await admin.from("fantasy_rounds").select("id").eq("season_id", seasonAfterOpen!.id);
    assert.equal(roundCountAfter?.length, 1, "no phantom extra round was ever created by the second call");
  } finally {
    await cleanupTestLeague(admin, league);
  }
});
