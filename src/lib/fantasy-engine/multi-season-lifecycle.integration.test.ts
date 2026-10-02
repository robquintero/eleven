/**
 * Pass 12B: real-database integration tests for "Start Next Season" --
 * `start_next_season` (supabase/migrations/20261003000000_multi_season_lifecycle.sql),
 * REDRAFT (ownership release + a fresh season-scoped draft), KEEP_ROSTERS
 * (ownership retained, ineligible players released), authorization, and
 * historical-season immutability. Builds on the exact same conventions as
 * `season.integration.test.ts`: real temporary leagues, no real draft for
 * season 1 (rosters built via `sign_player`, matching the Pass 11/12A "fast
 * test" convention), 2-manager ONCE schedules so season 1 is exactly one
 * round, cleaned up in a `finally` block, skipped under plain `npm test`.
 *
 * Deliberately NOT a full-season simulation battery -- one focused
 * lifecycle test per roster mode, plus the authorization/immutability
 * guarantees the brief explicitly calls out.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAdminClient, isSupabaseAdminConfigured } from "../supabase/admin.ts";
import { openNextRound } from "./rounds.ts";
import { progressSeason } from "./season.ts";
import { createTestLeague, cleanupTestLeague, type TestLeague } from "./integration-test-helpers.ts";

const skip = !isSupabaseAdminConfigured();

const HISTORICAL_START = new Date("2026-08-25T00:00:00Z");

function settleClockFor(windowEndsAt: Date): Date {
  return new Date(windowEndsAt.getTime() + 25 * 3600 * 1000);
}

/**
 * Drives a fresh 2-manager, ONCE-schedule league through its entire
 * season 1 (exactly one round) to COMPLETED, via the real
 * `set_season_schedule_format` -> `openNextRound` -> `progressSeason`
 * chain -- the same path `season.integration.test.ts`'s own lifecycle
 * smoke test already proved correct. Returns the completed season's id
 * and the round-1 id so callers can assert historical immutability later.
 */
async function completeSeasonOne(
  admin: ReturnType<typeof createAdminClient>,
  league: TestLeague
): Promise<{ seasonOneId: string; roundOneId: string; champion: string | null }> {
  const ok = await league.clients[0].rpc("set_season_schedule_format", { p_league_id: league.leagueId, p_cycles: 1 });
  assert.equal(ok.error, null);

  const opened = await openNextRound(admin, league.leagueId, HISTORICAL_START);
  assert.ok(opened.ok, `round 1 must open: ${!opened.ok ? opened.error : ""}`);
  if (!opened.ok) throw new Error("unreachable");

  const { data: seasonRow } = await admin.from("fantasy_rounds").select("season_id").eq("id", opened.roundId).single();
  const seasonOneId = seasonRow!.season_id;

  const result = await progressSeason(admin, league.leagueId, settleClockFor(opened.window.endsAt));
  assert.equal(result.action, "season_completed", "2 managers, ONCE = 1 round -- the only round IS the final round");

  const { data: season } = await admin.from("seasons").select("status").eq("id", seasonOneId).single();
  assert.equal(season!.status, "COMPLETED");

  return {
    seasonOneId,
    roundOneId: opened.roundId,
    champion: result.action === "season_completed" ? result.championFantasyTeamId : null,
  };
}

test("start_next_season authorization: commissioner-only, requires a COMPLETED latest season", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 16);
  try {
    const noSeasonYet = await league.clients[0].rpc("start_next_season", {
      p_league_id: league.leagueId,
      p_roster_mode: "REDRAFT",
      p_schedule_cycles: 2,
    });
    assert.equal(noSeasonYet.error?.message, "NO_SEASON_TO_FOLLOW", "no season has ever existed for this league yet");

    await completeSeasonOne(admin, league);

    const nonCommissioner = await league.clients[1].rpc("start_next_season", {
      p_league_id: league.leagueId,
      p_roster_mode: "REDRAFT",
      p_schedule_cycles: 2,
    });
    assert.equal(nonCommissioner.error?.message, "NOT_COMMISSIONER");

    const invalidMode = await league.clients[0].rpc("start_next_season", {
      p_league_id: league.leagueId,
      p_roster_mode: "DYNASTY",
      p_schedule_cycles: 2,
    });
    assert.ok(invalidMode.error, "an unsupported roster mode must be rejected");
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

test("start_next_season REDRAFT: releases all ownership, creates a fresh season-scoped draft, and is idempotent against a double-click", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 16);
  try {
    const [gk1] = await admin.from("players").select("id").eq("active", true).eq("position", "GK").order("name").limit(1).then((r) => r.data!);
    const [gk2] = await admin.from("players").select("id").eq("active", true).eq("position", "GK").order("name", { ascending: false }).limit(1).then((r) => r.data!);
    await league.clients[0].rpc("sign_player", { p_league_id: league.leagueId, p_player_id: gk1.id });
    await league.clients[1].rpc("sign_player", { p_league_id: league.leagueId, p_player_id: gk2.id });

    await completeSeasonOne(admin, league);

    const redraft = await league.clients[0].rpc("start_next_season", {
      p_league_id: league.leagueId,
      p_roster_mode: "REDRAFT",
      p_schedule_cycles: 2,
    });
    assert.equal(redraft.error, null);
    const { season_id: seasonTwoId, season_number: seasonTwoNumber, draft_id: draftId } = redraft.data![0];
    assert.equal(seasonTwoNumber, 2);
    assert.ok(draftId, "REDRAFT must create a draft");

    const { data: ownershipAfter } = await admin.from("league_player_ownership").select("player_id").eq("league_id", league.leagueId);
    assert.equal(ownershipAfter?.length, 0, "every player must be released for a REDRAFT");

    const { data: rosterEntries } = await admin.from("roster_entries").select("status").eq("league_id", league.leagueId);
    assert.ok(rosterEntries!.every((r) => r.status === "dropped"), "soft-deleted, never hard-deleted -- same semantics as drop_player");

    const { data: draftRow } = await admin.from("drafts").select("season_id, status, league_id").eq("id", draftId).single();
    assert.equal(draftRow!.season_id, seasonTwoId, "the new draft must be tied to season 2, not left ambiguous");
    assert.equal(draftRow!.status, "in_progress");

    const { data: draftOrders } = await admin.from("draft_orders").select("fantasy_team_id").eq("draft_id", draftId);
    assert.equal(draftOrders?.length, 2, "a fresh randomized draft order for both managers");

    const { data: seasonTwo } = await admin.from("seasons").select("status, roster_mode, schedule_cycles").eq("id", seasonTwoId).single();
    assert.equal(seasonTwo!.status, "SETUP", "season 2 stays SETUP until its draft completes -- the same lifecycle season 1 already uses");
    assert.equal(seasonTwo!.roster_mode, "REDRAFT");
    assert.equal(seasonTwo!.schedule_cycles, 2);

    // Idempotency: a second "Start Next Season" call for the same league
    // must never create a second SETUP/ACTIVE season -- the latest season
    // is now SETUP, not COMPLETED, so the RPC's own precondition rejects it.
    const doubleClick = await league.clients[0].rpc("start_next_season", {
      p_league_id: league.leagueId,
      p_roster_mode: "REDRAFT",
      p_schedule_cycles: 1,
    });
    assert.equal(doubleClick.error?.message, "SEASON_NOT_COMPLETE");

    const { data: seasonCount } = await admin.from("seasons").select("id").eq("league_id", league.leagueId);
    assert.equal(seasonCount?.length, 2, "exactly season 1 and season 2 -- no phantom third season from the double-click");
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

test("REDRAFT's new draft completing activates season 2 through the existing canonical round-open chain, with round numbering reset to 1", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 16);
  try {
    const { roundOneId: seasonOneRoundId } = await completeSeasonOne(admin, league);

    const redraft = await league.clients[0].rpc("start_next_season", {
      p_league_id: league.leagueId,
      p_roster_mode: "REDRAFT",
      p_schedule_cycles: 1,
    });
    assert.equal(redraft.error, null);
    const { draft_id: draftId, season_id: seasonTwoId } = redraft.data![0];
    assert.ok(draftId, "REDRAFT must create a draft");

    // Drive the redraft to completion via the real auto-pick RPC, same
    // mechanism draftToCompletion (integration-test-helpers.ts) uses.
    const farFuture = new Date(HISTORICAL_START.getTime() + 365 * 24 * 3600 * 1000).toISOString();
    for (let i = 0; i < 16 * 2 + 2; i++) {
      const { data: status } = await admin.from("drafts").select("status").eq("id", draftId).single();
      if (status?.status === "completed") break;
      const { error } = await admin.rpc("resolve_expired_pick", { p_draft_id: draftId, p_as_of: farFuture });
      if (error) throw new Error(`redraft auto-pick failed: ${error.message}`);
    }
    const { data: finalDraftStatus } = await admin.from("drafts").select("status").eq("id", draftId).single();
    assert.equal(finalDraftStatus!.status, "completed");

    // The real production trigger: maybeOpenFirstRound, now dispatching
    // correctly for a SECOND (season-scoped) draft on this league.
    const { maybeOpenFirstRound } = await import("./draft-completion.ts");
    await maybeOpenFirstRound(draftId);

    const { data: seasonTwo } = await admin.from("seasons").select("status, total_rounds").eq("id", seasonTwoId).single();
    assert.equal(seasonTwo!.status, "ACTIVE", "completing the redraft must activate season 2");

    const { data: seasonTwoRounds } = await admin.from("fantasy_rounds").select("id, number").eq("season_id", seasonTwoId);
    assert.equal(seasonTwoRounds?.length, 1, "2 managers, ONCE -- exactly 1 round, just like season 1");
    assert.equal(seasonTwoRounds![0]!.number, 1, "round numbering resets to 1 for the new season, never continuing season 1's numbering");
    assert.notEqual(seasonTwoRounds![0]!.id, seasonOneRoundId, "a genuinely new round, not season 1's old one");
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

test("start_next_season KEEP_ROSTERS: retains eligible ownership untouched, releases only players who became ineligible, and never runs a draft", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 16);
  try {
    const { data: gks } = await admin.from("players").select("id").eq("active", true).eq("position", "GK").order("name").limit(2);
    const eligiblePlayerId = gks![0]!.id;
    const soonIneligiblePlayerId = gks![1]!.id;
    await league.clients[0].rpc("sign_player", { p_league_id: league.leagueId, p_player_id: eligiblePlayerId });
    await league.clients[1].rpc("sign_player", { p_league_id: league.leagueId, p_player_id: soonIneligiblePlayerId });

    await completeSeasonOne(admin, league);

    // Simulate the player losing eligibility between seasons (e.g. no
    // longer part of Eleven's draftable universe) -- never something the
    // app itself flips, but exactly the flag KEEP_ROSTERS must respect.
    await admin.from("players").update({ active: false }).eq("id", soonIneligiblePlayerId);

    const keepRosters = await league.clients[0].rpc("start_next_season", {
      p_league_id: league.leagueId,
      p_roster_mode: "KEEP_ROSTERS",
      p_schedule_cycles: 1,
    });
    assert.equal(keepRosters.error, null);
    const { season_id: seasonTwoId, draft_id: draftId } = keepRosters.data![0];
    assert.equal(draftId, null, "KEEP_ROSTERS must never create a draft");

    const { data: eligibleOwnership } = await admin
      .from("league_player_ownership")
      .select("fantasy_team_id")
      .eq("league_id", league.leagueId)
      .eq("player_id", eligiblePlayerId)
      .maybeSingle();
    assert.equal(eligibleOwnership?.fantasy_team_id, league.teamIds[0], "an eligible player's ownership is left completely untouched");

    const { data: ineligibleOwnership } = await admin
      .from("league_player_ownership")
      .select("player_id")
      .eq("league_id", league.leagueId)
      .eq("player_id", soonIneligiblePlayerId)
      .maybeSingle();
    assert.equal(ineligibleOwnership, null, "the now-ineligible player must be released, not silently kept or replaced");

    const { data: ineligibleRosterEntry } = await admin
      .from("roster_entries")
      .select("status")
      .eq("fantasy_team_id", league.teamIds[1])
      .eq("player_id", soonIneligiblePlayerId)
      .single();
    assert.equal(ineligibleRosterEntry!.status, "dropped");

    // Activation: the Server Action's own next step (admin-client engine
    // call, exercised here directly) opens season 2's first round.
    const opened = await openNextRound(admin, league.leagueId, new Date());
    assert.ok(opened.ok, `season 2 must activate: ${!opened.ok ? opened.error : ""}`);

    const { data: seasonTwo } = await admin.from("seasons").select("status, roster_mode").eq("id", seasonTwoId).single();
    assert.equal(seasonTwo!.status, "ACTIVE");
    assert.equal(seasonTwo!.roster_mode, "KEEP_ROSTERS");
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

test("historical season immutability: starting season 2 never mutates season 1's standings, results, or champion", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 16);
  try {
    const { seasonOneId, champion: seasonOneChampion } = await completeSeasonOne(admin, league);

    const { getStandingsForSeason, getSeasonMatchupResults } = await import("../../data-access/matchups.ts");
    const standingsBefore = await getStandingsForSeason(admin, seasonOneId);
    const resultsBefore = await getSeasonMatchupResults(admin, seasonOneId);
    assert.ok(standingsBefore.length === 2 && resultsBefore.length === 1, "sanity: season 1 has a real final table and one final result");

    await league.clients[0].rpc("start_next_season", { p_league_id: league.leagueId, p_roster_mode: "REDRAFT", p_schedule_cycles: 2 });

    const standingsAfter = await getStandingsForSeason(admin, seasonOneId);
    const resultsAfter = await getSeasonMatchupResults(admin, seasonOneId);
    assert.deepEqual(standingsAfter, standingsBefore, "season 1's final table must be byte-for-byte unchanged once season 2 exists");
    assert.deepEqual(resultsAfter, resultsBefore, "season 1's final results must be byte-for-byte unchanged once season 2 exists");

    const { data: seasonOneRow } = await admin.from("seasons").select("status, champion_fantasy_team_id, completed_at").eq("id", seasonOneId).single();
    assert.equal(seasonOneRow!.status, "COMPLETED");
    assert.equal(seasonOneRow!.champion_fantasy_team_id, seasonOneChampion);
  } finally {
    await cleanupTestLeague(admin, league);
  }
});
