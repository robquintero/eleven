import { SCORING_RULE_VERSION } from "../../domain/fantasy/scoring.ts";
/**
 * Pass 14.1 — fantasy round reconciliation regression suite (CASE A-J from
 * the brief). Every test builds its own isolated league/round/matchup
 * directly (bypassing `openNextRound`'s real-time window discovery, which
 * is tied to actual current football data) so each case gets a fully
 * controlled, collision-free Tue-Mon window far from any real stored
 * fixture. `createRoundLineupSlots`/`openNextRound` themselves are
 * unchanged and untested here — this suite is specifically about
 * `reconcileFantasyRound`/`reconcileFantasyStateForFixtures` repairing
 * ALREADY-PERSISTED lineup_slots/matchup_scores rows against whatever
 * fixtures/stats exist at reconciliation time, which is exactly the
 * "late discovery" contract those rows don't otherwise get re-evaluated
 * under.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAdminClient, isSupabaseAdminConfigured } from "../supabase/admin.ts";
import { createTestLeague, cleanupTestLeague } from "./integration-test-helpers.ts";
import { reconcileFantasyRound, reconcileFantasyStateForFixtures } from "./reconciliation.ts";
import { backfillScores } from "../scoring/backfill.ts";
import { roundWindowContaining } from "../../domain/fantasy/round-calendar.ts";
import type { RoundWindow } from "../../domain/fantasy/round-calendar.ts";
import { INTERNATIONAL_SCORING_EPOCH } from "../football-ingestion/competition-eligibility.ts";

const skip = !isSupabaseAdminConfigured();

/** A fully isolated Tue-Mon window, far from any real stored fixture -- `yearOffset` keeps each test case's window distinct from every other's. */
function isolatedWindow(yearOffset: number): RoundWindow {
  return roundWindowContaining(new Date(Date.UTC(2090 + yearOffset, 0, 7)));
}

interface TestRound {
  roundId: string;
  seasonId: string;
  matchupId: string;
  window: RoundWindow;
}

/** Minimal season + round + matchup, inserted directly -- reconciliation's contract only cares about fantasy_rounds.starts_at/ends_at/status and existing matchups/lineup_slots rows, never how they were created. */
async function setupRound(
  admin: ReturnType<typeof createAdminClient>,
  leagueId: string,
  homeTeamId: string,
  awayTeamId: string,
  window: RoundWindow,
  status: "in_progress" | "completed" = "in_progress"
): Promise<TestRound> {
  const { data: season, error: seasonError } = await admin
    .from("seasons")
    .insert({ league_id: leagueId, season_number: 1, status: "ACTIVE", schedule_cycles: 2 })
    .select("id")
    .single();
  if (seasonError || !season) throw new Error(`failed to create test season: ${seasonError?.message}`);

  const { data: round, error: roundError } = await admin
    .from("fantasy_rounds")
    .insert({
      league_id: leagueId,
      season_id: season.id,
      number: 1,
      starts_at: window.startsAt.toISOString(),
      ends_at: window.endsAt.toISOString(),
      status,
    })
    .select("id")
    .single();
  if (roundError || !round) throw new Error(`failed to create test round: ${roundError?.message}`);

  const { data: matchup, error: matchupError } = await admin
    .from("matchups")
    .insert({
      league_id: leagueId,
      fantasy_round_id: round.id,
      home_fantasy_team_id: homeTeamId,
      away_fantasy_team_id: awayTeamId,
      status: status === "completed" ? "final" : "scheduled",
    })
    .select("id")
    .single();
  if (matchupError || !matchup) throw new Error(`failed to create test matchup: ${matchupError?.message}`);

  return { roundId: round.id, seasonId: season.id, matchupId: matchup.id, window };
}

/** Inserts a lineup_slots row directly with an explicit initial `locked_at` -- simulates "the round opened before this fixture was known" (locked_at: null) or "already correctly locked" (locked_at: an ISO string) without going through the full createRoundLineupSlots flow. */
async function setupLineupSlot(
  admin: ReturnType<typeof createAdminClient>,
  rosterEntryId: string,
  roundId: string,
  starter: boolean,
  lockedAt: string | null
): Promise<string> {
  const { data, error } = await admin
    .from("lineup_slots")
    .upsert(
      { roster_entry_id: rosterEntryId, fantasy_round_id: roundId, slot: starter ? "MID" : "BENCH", starter, locked_at: lockedAt },
      { onConflict: "roster_entry_id,fantasy_round_id" }
    )
    .select("id")
    .single();
  if (error || !data) throw new Error(`failed to create test lineup_slot: ${error?.message}`);
  return data.id;
}

async function getRosterEntryId(admin: ReturnType<typeof createAdminClient>, teamId: string, playerId: string): Promise<string> {
  const { data } = await admin.from("roster_entries").select("id").eq("fantasy_team_id", teamId).eq("player_id", playerId).single();
  return data!.id;
}

async function getLineupSlot(admin: ReturnType<typeof createAdminClient>, rosterEntryId: string, roundId: string) {
  const { data } = await admin.from("lineup_slots").select("*").eq("roster_entry_id", rosterEntryId).eq("fantasy_round_id", roundId).single();
  return data!;
}

async function getMatchupScore(admin: ReturnType<typeof createAdminClient>, matchupId: string, fantasyTeamId: string) {
  const { data } = await admin.from("matchup_scores").select("*").eq("matchup_id", matchupId).eq("fantasy_team_id", fantasyTeamId).maybeSingle();
  return data;
}

// ===========================================================================
// Local national-team test infrastructure -- same pattern as
// international-scoring.integration.test.ts's own local copy (house
// convention: duplicated per file, never shared, so each file's test data
// stays fully self-contained).
// ===========================================================================

const TEST_ELIGIBLE_COMPETITION_CODE = "FIFA_WCQ_EUR";

interface NationalTeamCtx {
  eligibleCompetitionId: string;
  createdEligibleCompetition: boolean;
  nationalTeamAId: string;
  nationalTeamBId: string;
  fixtureIds: string[];
  clubIds: string[];
}

async function setUpNationalTeams(admin: ReturnType<typeof createAdminClient>): Promise<NationalTeamCtx> {
  let createdEligibleCompetition = false;
  let { data: comp } = await admin.from("competitions").select("id").eq("code", TEST_ELIGIBLE_COMPETITION_CODE).maybeSingle();
  if (!comp) {
    const { data: inserted, error } = await admin
      .from("competitions")
      .insert({ name: "Test World Cup Qualification - Europe", code: TEST_ELIGIBLE_COMPETITION_CODE, country: "World" })
      .select("id")
      .single();
    if (error || !inserted) throw new Error(`failed to create test eligible competition: ${error?.message}`);
    comp = inserted;
    createdEligibleCompetition = true;
  }

  const suffix = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const { data: clubs, error: clubsErr } = await admin
    .from("clubs")
    .insert([
      { competition_id: comp.id, code: `RA${suffix}`.slice(0, 10), name: `Reconcile A ${suffix}`, short_name: "RCA", is_national_team: true },
      { competition_id: comp.id, code: `RB${suffix}`.slice(0, 10), name: `Reconcile B ${suffix}`, short_name: "RCB", is_national_team: true },
    ])
    .select("id");
  if (clubsErr || !clubs || clubs.length !== 2) throw new Error(`failed to create test national teams: ${clubsErr?.message}`);

  return {
    eligibleCompetitionId: comp.id,
    createdEligibleCompetition,
    nationalTeamAId: clubs[0].id,
    nationalTeamBId: clubs[1].id,
    fixtureIds: [],
    clubIds: clubs.map((c) => c.id),
  };
}

async function tearDownNationalTeams(admin: ReturnType<typeof createAdminClient>, ctx: NationalTeamCtx) {
  if (ctx.fixtureIds.length > 0) await admin.from("fixtures").delete().in("id", ctx.fixtureIds);
  await admin.from("clubs").delete().in("id", ctx.clubIds);
  if (ctx.createdEligibleCompetition) await admin.from("competitions").delete().eq("id", ctx.eligibleCompetitionId);
}

async function insertFixture(
  admin: ReturnType<typeof createAdminClient>,
  competitionId: string,
  homeClubId: string,
  awayClubId: string,
  kickoffAt: Date,
  status: "scheduled" | "live" | "final" = "final"
): Promise<string> {
  const { data, error } = await admin
    .from("fixtures")
    .insert({ competition_id: competitionId, home_club_id: homeClubId, away_club_id: awayClubId, kickoff_at: kickoffAt.toISOString(), status, season: 2026 })
    .select("id")
    .single();
  if (error || !data) throw new Error(`failed to insert test fixture: ${error?.message}`);
  return data.id;
}

async function scorePlayer(admin: ReturnType<typeof createAdminClient>, playerId: string, fixtureId: string, goals: number): Promise<number> {
  await admin.from("player_match_stats").insert({ player_id: playerId, fixture_id: fixtureId, minutes: 90, goals });
  const result = await backfillScores(admin, { scoringRuleVersion: SCORING_RULE_VERSION, fixtureIds: [fixtureId] });
  if (result.failed > 0) throw new Error(`backfillScores failed: ${result.errors.join("; ")}`);
  const { data } = await admin.from("fantasy_player_scores").select("points").eq("player_id", playerId).eq("fixture_id", fixtureId).single();
  return data!.points;
}

async function getMidPlayer(admin: ReturnType<typeof createAdminClient>) {
  const { data } = await admin.from("players").select("id, club_id, competition_id").eq("active", true).eq("position", "MID").limit(1).single();
  return data!;
}

/**
 * Since Pass 14 go-live's real international bootstrap, a large share of
 * real active players now have a REAL `player_national_teams` row (an
 * actual call-up) with its own real fixtures. Most of this suite's cases
 * use windows in year 2090+ (`isolatedWindow`), which no real fixture can
 * ever fall inside, so a plain "first active MID" is safe there. CASE G
 * specifically anchors its window on the REAL international scoring
 * epoch (so it's testing the real constant, not an arbitrary one) and
 * therefore DOES share a real calendar week with real UEFA_NL fixtures --
 * a player who already has a real national-team association could have a
 * real, unrelated, POST-epoch fixture in that same week, which would
 * legitimately (correctly!) lock them independent of this test's own
 * synthetic pre-epoch fixture, breaking the exact-null assertion CASE G
 * needs. This selects a player with no real international baggage at all.
 */
async function getMidPlayerWithNoNationalTeamAssociation(admin: ReturnType<typeof createAdminClient>) {
  const { data: associated } = await admin.from("player_national_teams").select("player_id");
  const associatedIds = new Set((associated ?? []).map((r) => r.player_id));

  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from("players")
      .select("id, club_id, competition_id")
      .eq("active", true)
      .eq("position", "MID")
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(`failed to page through players: ${error.message}`);
    const unassociated = (data ?? []).find((p) => !associatedIds.has(p.id));
    if (unassociated) return unassociated;
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  throw new Error("no active MID with no national-team association found in the live database");
}

// ===========================================================================
// CASE A -- late international discovery
// ===========================================================================

test("CASE A: late international discovery -- player locks at real kickoff and performance counts once the fixture is introduced", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 4);
  const ctx = await setUpNationalTeams(admin);
  try {
    const player = await getMidPlayer(admin);
    await admin.from("player_national_teams").insert({ player_id: player.id, national_team_club_id: ctx.nationalTeamAId });
    const { error: signError } = await league.clients[0].rpc("sign_player", { p_league_id: league.leagueId, p_player_id: player.id });
    assert.equal(signError, null);

    const window = isolatedWindow(1);
    const round = await setupRound(admin, league.leagueId, league.teamIds[0], league.teamIds[1], window);
    const rosterEntryId = await getRosterEntryId(admin, league.teamIds[0], player.id);
    // Round "opened" before the fixture was known -- locked_at null.
    await setupLineupSlot(admin, rosterEntryId, round.roundId, true, null);

    const kickoff = new Date(window.startsAt.getTime() + 2 * 86_400_000);
    const fixtureId = await insertFixture(admin, ctx.eligibleCompetitionId, ctx.nationalTeamAId, ctx.nationalTeamBId, kickoff, "final");
    ctx.fixtureIds.push(fixtureId);
    const points = await scorePlayer(admin, player.id, fixtureId, 1);

    const reconcileResult = await reconcileFantasyStateForFixtures(admin, [fixtureId]);
    assert.ok(reconcileResult.roundIds.includes(round.roundId), "the round containing this kickoff must be identified as affected");

    const slot = await getLineupSlot(admin, rosterEntryId, round.roundId);
    assert.equal(new Date(slot.locked_at!).getTime(), kickoff.getTime(), "player must lock at the real fixture kickoff");

    const score = await getMatchupScore(admin, round.matchupId, league.teamIds[0]);
    assert.equal(score!.live_points, points, "matchup total must reflect the late-discovered performance");

    await admin.from("fantasy_player_scores").delete().eq("fixture_id", fixtureId);
    await admin.from("player_match_stats").delete().eq("fixture_id", fixtureId);
    await admin.from("player_national_teams").delete().eq("player_id", player.id).eq("national_team_club_id", ctx.nationalTeamAId);
  } finally {
    await tearDownNationalTeams(admin, ctx);
    await cleanupTestLeague(admin, league);
  }
});

// ===========================================================================
// CASE B -- same fixture known in advance (arrival-order independence)
// ===========================================================================

test("CASE B: fixture known in advance -- final state equals CASE A (arrival-order independence)", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 4);
  const ctx = await setUpNationalTeams(admin);
  try {
    const player = await getMidPlayer(admin);
    await admin.from("player_national_teams").insert({ player_id: player.id, national_team_club_id: ctx.nationalTeamAId });
    const { error: signError } = await league.clients[0].rpc("sign_player", { p_league_id: league.leagueId, p_player_id: player.id });
    assert.equal(signError, null);

    const window = isolatedWindow(2);
    const round = await setupRound(admin, league.leagueId, league.teamIds[0], league.teamIds[1], window);

    // The fixture (and its score) exist BEFORE the lineup slot is ever created.
    const kickoff = new Date(window.startsAt.getTime() + 2 * 86_400_000);
    const fixtureId = await insertFixture(admin, ctx.eligibleCompetitionId, ctx.nationalTeamAId, ctx.nationalTeamBId, kickoff, "final");
    ctx.fixtureIds.push(fixtureId);
    const points = await scorePlayer(admin, player.id, fixtureId, 1);

    const rosterEntryId = await getRosterEntryId(admin, league.teamIds[0], player.id);
    await setupLineupSlot(admin, rosterEntryId, round.roundId, true, null);

    // Still run reconciliation -- must be a no-op-equivalent (derives the
    // same correct state the slot should have had from the start).
    await reconcileFantasyStateForFixtures(admin, [fixtureId]);

    const slot = await getLineupSlot(admin, rosterEntryId, round.roundId);
    assert.equal(new Date(slot.locked_at!).getTime(), kickoff.getTime(), "same lock instant as CASE A");

    const score = await getMatchupScore(admin, round.matchupId, league.teamIds[0]);
    assert.equal(score!.live_points, points, "same matchup total as CASE A -- proves arrival order doesn't matter");

    await admin.from("fantasy_player_scores").delete().eq("fixture_id", fixtureId);
    await admin.from("player_match_stats").delete().eq("fixture_id", fixtureId);
    await admin.from("player_national_teams").delete().eq("player_id", player.id).eq("national_team_club_id", ctx.nationalTeamAId);
  } finally {
    await tearDownNationalTeams(admin, ctx);
    await cleanupTestLeague(admin, league);
  }
});

// ===========================================================================
// CASE C -- late club fixture (proves this is a general engine capability)
// ===========================================================================

test("CASE C: late CLUB fixture discovery -- same reconciliation mechanism, not an international special case", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 4);
  let fixtureId: string | null = null;
  try {
    const player = await getMidPlayer(admin);
    const { data: otherClub } = await admin.from("clubs").select("id").eq("competition_id", player.competition_id).neq("id", player.club_id).limit(1).single();
    const { error: signError } = await league.clients[0].rpc("sign_player", { p_league_id: league.leagueId, p_player_id: player.id });
    assert.equal(signError, null);

    const window = isolatedWindow(3);
    const round = await setupRound(admin, league.leagueId, league.teamIds[0], league.teamIds[1], window);
    const rosterEntryId = await getRosterEntryId(admin, league.teamIds[0], player.id);
    await setupLineupSlot(admin, rosterEntryId, round.roundId, true, null);

    const kickoff = new Date(window.startsAt.getTime() + 2 * 86_400_000);
    const { data: fixture } = await admin
      .from("fixtures")
      .insert({ competition_id: player.competition_id, home_club_id: player.club_id, away_club_id: otherClub!.id, kickoff_at: kickoff.toISOString(), status: "final", season: 2026 })
      .select("id")
      .single();
    fixtureId = fixture!.id;
    const points = await scorePlayer(admin, player.id, fixtureId!, 2);

    await reconcileFantasyStateForFixtures(admin, [fixtureId!]);

    const slot = await getLineupSlot(admin, rosterEntryId, round.roundId);
    assert.equal(new Date(slot.locked_at!).getTime(), kickoff.getTime());
    const score = await getMatchupScore(admin, round.matchupId, league.teamIds[0]);
    assert.equal(score!.live_points, points);

    await admin.from("fantasy_player_scores").delete().eq("fixture_id", fixtureId!);
    await admin.from("player_match_stats").delete().eq("fixture_id", fixtureId!);
  } finally {
    if (fixtureId) await admin.from("fixtures").delete().eq("id", fixtureId);
    await cleanupTestLeague(admin, league);
  }
});

// ===========================================================================
// CASE D -- club + country aggregation
// ===========================================================================

test("CASE D: club + international performance in the same round both aggregate into the matchup total", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 4);
  const ctx = await setUpNationalTeams(admin);
  let clubFixtureId: string | null = null;
  try {
    const player = await getMidPlayer(admin);
    const { data: otherClub } = await admin.from("clubs").select("id").eq("competition_id", player.competition_id).neq("id", player.club_id).limit(1).single();
    await admin.from("player_national_teams").insert({ player_id: player.id, national_team_club_id: ctx.nationalTeamAId });
    const { error: signError } = await league.clients[0].rpc("sign_player", { p_league_id: league.leagueId, p_player_id: player.id });
    assert.equal(signError, null);

    const window = isolatedWindow(4);
    const round = await setupRound(admin, league.leagueId, league.teamIds[0], league.teamIds[1], window);
    const rosterEntryId = await getRosterEntryId(admin, league.teamIds[0], player.id);
    await setupLineupSlot(admin, rosterEntryId, round.roundId, true, null);

    const clubKickoff = new Date(window.startsAt.getTime() + 1 * 86_400_000);
    const { data: clubFixture } = await admin
      .from("fixtures")
      .insert({ competition_id: player.competition_id, home_club_id: player.club_id, away_club_id: otherClub!.id, kickoff_at: clubKickoff.toISOString(), status: "final", season: 2026 })
      .select("id")
      .single();
    clubFixtureId = clubFixture!.id;
    const clubPoints = await scorePlayer(admin, player.id, clubFixtureId!, 1);

    const intlKickoff = new Date(window.startsAt.getTime() + 3 * 86_400_000);
    const intlFixtureId = await insertFixture(admin, ctx.eligibleCompetitionId, ctx.nationalTeamAId, ctx.nationalTeamBId, intlKickoff, "final");
    ctx.fixtureIds.push(intlFixtureId);
    const intlPoints = await scorePlayer(admin, player.id, intlFixtureId, 0);

    assert.notEqual(clubPoints, intlPoints, "the two performances must be distinguishable, or this test can't prove summing vs overwriting");

    await reconcileFantasyStateForFixtures(admin, [clubFixtureId!, intlFixtureId]);

    const slot = await getLineupSlot(admin, rosterEntryId, round.roundId);
    assert.equal(new Date(slot.locked_at!).getTime(), clubKickoff.getTime(), "lock = the EARLIER of the two kickoffs");

    const score = await getMatchupScore(admin, round.matchupId, league.teamIds[0]);
    assert.equal(score!.live_points, clubPoints + intlPoints, "club + international performances must SUM, neither overwriting the other");

    await admin.from("fantasy_player_scores").delete().in("fixture_id", [clubFixtureId!, intlFixtureId]);
    await admin.from("player_match_stats").delete().in("fixture_id", [clubFixtureId!, intlFixtureId]);
    await admin.from("player_national_teams").delete().eq("player_id", player.id).eq("national_team_club_id", ctx.nationalTeamAId);
  } finally {
    if (clubFixtureId) await admin.from("fixtures").delete().eq("id", clubFixtureId);
    await tearDownNationalTeams(admin, ctx);
    await cleanupTestLeague(admin, league);
  }
});

// ===========================================================================
// CASE E -- bench
// ===========================================================================

test("CASE E: a bench player locks appropriately but their performance does NOT contribute starter points", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 4);
  const ctx = await setUpNationalTeams(admin);
  try {
    const player = await getMidPlayer(admin);
    await admin.from("player_national_teams").insert({ player_id: player.id, national_team_club_id: ctx.nationalTeamAId });
    const { error: signError } = await league.clients[0].rpc("sign_player", { p_league_id: league.leagueId, p_player_id: player.id });
    assert.equal(signError, null);

    const window = isolatedWindow(5);
    const round = await setupRound(admin, league.leagueId, league.teamIds[0], league.teamIds[1], window);
    const rosterEntryId = await getRosterEntryId(admin, league.teamIds[0], player.id);
    await setupLineupSlot(admin, rosterEntryId, round.roundId, false, null); // BENCH

    const kickoff = new Date(window.startsAt.getTime() + 2 * 86_400_000);
    const fixtureId = await insertFixture(admin, ctx.eligibleCompetitionId, ctx.nationalTeamAId, ctx.nationalTeamBId, kickoff, "final");
    ctx.fixtureIds.push(fixtureId);
    await scorePlayer(admin, player.id, fixtureId, 3);

    await reconcileFantasyStateForFixtures(admin, [fixtureId]);

    const slot = await getLineupSlot(admin, rosterEntryId, round.roundId);
    assert.equal(new Date(slot.locked_at!).getTime(), kickoff.getTime(), "a bench player still locks when their eligible fixture kicks off");
    assert.equal(slot.starter, false, "reconciliation must never promote a bench slot to starter");

    const score = await getMatchupScore(admin, round.matchupId, league.teamIds[0]);
    assert.equal(score?.live_points ?? 0, 0, "a bench player's performance must never contribute to the matchup total");

    await admin.from("fantasy_player_scores").delete().eq("fixture_id", fixtureId);
    await admin.from("player_match_stats").delete().eq("fixture_id", fixtureId);
    await admin.from("player_national_teams").delete().eq("player_id", player.id).eq("national_team_club_id", ctx.nationalTeamAId);
  } finally {
    await tearDownNationalTeams(admin, ctx);
    await cleanupTestLeague(admin, league);
  }
});

// ===========================================================================
// CASE F -- zero minutes
// ===========================================================================

test("CASE F: an eligible fixture locks the player even with zero appearance -- no performance is invented", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 4);
  const ctx = await setUpNationalTeams(admin);
  try {
    const player = await getMidPlayer(admin);
    await admin.from("player_national_teams").insert({ player_id: player.id, national_team_club_id: ctx.nationalTeamAId });
    const { error: signError } = await league.clients[0].rpc("sign_player", { p_league_id: league.leagueId, p_player_id: player.id });
    assert.equal(signError, null);

    const window = isolatedWindow(6);
    const round = await setupRound(admin, league.leagueId, league.teamIds[0], league.teamIds[1], window);
    const rosterEntryId = await getRosterEntryId(admin, league.teamIds[0], player.id);
    await setupLineupSlot(admin, rosterEntryId, round.roundId, true, null);

    const kickoff = new Date(window.startsAt.getTime() + 2 * 86_400_000);
    const fixtureId = await insertFixture(admin, ctx.eligibleCompetitionId, ctx.nationalTeamAId, ctx.nationalTeamBId, kickoff, "final");
    ctx.fixtureIds.push(fixtureId);
    // Deliberately NO player_match_stats row -- never appeared.

    await reconcileFantasyStateForFixtures(admin, [fixtureId]);

    const slot = await getLineupSlot(admin, rosterEntryId, round.roundId);
    assert.equal(new Date(slot.locked_at!).getTime(), kickoff.getTime(), "locking is fixture-based, not appearance-based -- the team's match beginning is what locks them");

    const { data: scoreRow } = await admin.from("fantasy_player_scores").select("id").eq("player_id", player.id).eq("fixture_id", fixtureId).maybeSingle();
    assert.equal(scoreRow, null, "no fantasy_player_scores row may be invented for a player who never appeared");

    const score = await getMatchupScore(admin, round.matchupId, league.teamIds[0]);
    assert.equal(score?.live_points ?? 0, 0);

    await admin.from("player_national_teams").delete().eq("player_id", player.id).eq("national_team_club_id", ctx.nationalTeamAId);
  } finally {
    await tearDownNationalTeams(admin, ctx);
    await cleanupTestLeague(admin, league);
  }
});

// ===========================================================================
// CASE G -- pre-epoch international
// ===========================================================================

test("CASE G: a pre-epoch international fixture never locks, scores, or contributes, even after reconciliation", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 4);
  const ctx = await setUpNationalTeams(admin);
  try {
    const player = await getMidPlayerWithNoNationalTeamAssociation(admin);
    await admin.from("player_national_teams").insert({ player_id: player.id, national_team_club_id: ctx.nationalTeamAId });
    const { error: signError } = await league.clients[0].rpc("sign_player", { p_league_id: league.leagueId, p_player_id: player.id });
    assert.equal(signError, null);

    // A round window that itself CONTAINS the pre-epoch instant, so the
    // only reason this must fail to lock/score is the epoch, not the
    // window math. Anchored directly on the kickoff itself (not an
    // arbitrary earlier offset) -- an offset of even a day or two can
    // cross the window's own Tuesday boundary into the PRECEDING week's
    // window, which would make this test's own setup wrong rather than
    // proving anything about the epoch.
    const kickoff = new Date(INTERNATIONAL_SCORING_EPOCH.getTime() - 1000); // 1 second before the epoch
    const window = roundWindowContaining(kickoff);
    const round = await setupRound(admin, league.leagueId, league.teamIds[0], league.teamIds[1], window);
    const rosterEntryId = await getRosterEntryId(admin, league.teamIds[0], player.id);
    await setupLineupSlot(admin, rosterEntryId, round.roundId, true, null);

    const fixtureId = await insertFixture(admin, ctx.eligibleCompetitionId, ctx.nationalTeamAId, ctx.nationalTeamBId, kickoff, "final");
    ctx.fixtureIds.push(fixtureId);
    await admin.from("player_match_stats").insert({ player_id: player.id, fixture_id: fixtureId, minutes: 90, goals: 5 });
    await backfillScores(admin, { scoringRuleVersion: SCORING_RULE_VERSION, fixtureIds: [fixtureId] }); // must refuse to score (proven already in Gate 8's own epoch test) -- re-confirmed here via the engine-level effect

    await reconcileFantasyStateForFixtures(admin, [fixtureId]);

    const slot = await getLineupSlot(admin, rosterEntryId, round.roundId);
    assert.equal(slot.locked_at, null, "a pre-epoch international fixture must never create a lock");

    const { data: scoreRow } = await admin.from("fantasy_player_scores").select("id").eq("player_id", player.id).eq("fixture_id", fixtureId).maybeSingle();
    assert.equal(scoreRow, null, "a pre-epoch international fixture must never produce a fantasy_player_scores row");

    const score = await getMatchupScore(admin, round.matchupId, league.teamIds[0]);
    assert.equal(score?.live_points ?? 0, 0);

    await admin.from("player_match_stats").delete().eq("fixture_id", fixtureId);
    await admin.from("player_national_teams").delete().eq("player_id", player.id).eq("national_team_club_id", ctx.nationalTeamAId);
  } finally {
    await tearDownNationalTeams(admin, ctx);
    await cleanupTestLeague(admin, league);
  }
});

// ===========================================================================
// CASE H -- provider correction
// ===========================================================================

test("CASE H: a provider correction after reconciliation updates the SAME score row and matchup total -- no duplicate", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 4);
  const ctx = await setUpNationalTeams(admin);
  try {
    const player = await getMidPlayer(admin);
    await admin.from("player_national_teams").insert({ player_id: player.id, national_team_club_id: ctx.nationalTeamAId });
    const { error: signError } = await league.clients[0].rpc("sign_player", { p_league_id: league.leagueId, p_player_id: player.id });
    assert.equal(signError, null);

    const window = isolatedWindow(8);
    const round = await setupRound(admin, league.leagueId, league.teamIds[0], league.teamIds[1], window);
    const rosterEntryId = await getRosterEntryId(admin, league.teamIds[0], player.id);
    await setupLineupSlot(admin, rosterEntryId, round.roundId, true, null);

    const kickoff = new Date(window.startsAt.getTime() + 2 * 86_400_000);
    const fixtureId = await insertFixture(admin, ctx.eligibleCompetitionId, ctx.nationalTeamAId, ctx.nationalTeamBId, kickoff, "final");
    ctx.fixtureIds.push(fixtureId);
    const firstPoints = await scorePlayer(admin, player.id, fixtureId, 1);
    await reconcileFantasyStateForFixtures(admin, [fixtureId]);

    const firstScoreRow = await getMatchupScore(admin, round.matchupId, league.teamIds[0]);
    assert.equal(firstScoreRow!.live_points, firstPoints);

    // Provider correction: one more goal.
    await admin.from("player_match_stats").update({ goals: 2 }).eq("player_id", player.id).eq("fixture_id", fixtureId);
    const correctionResult = await backfillScores(admin, { scoringRuleVersion: SCORING_RULE_VERSION, fixtureIds: [fixtureId] });
    assert.equal(correctionResult.failed, 0);
    await reconcileFantasyStateForFixtures(admin, [fixtureId]);

    const { data: allScoreRows } = await admin.from("fantasy_player_scores").select("id, points").eq("player_id", player.id).eq("fixture_id", fixtureId);
    assert.equal(allScoreRows!.length, 1, "no duplicate fantasy_player_scores row");
    assert.notEqual(allScoreRows![0]!.points, firstPoints, "the correction must change the score");

    const secondScoreRow = await getMatchupScore(admin, round.matchupId, league.teamIds[0]);
    assert.equal(secondScoreRow!.id, firstScoreRow!.id, "the SAME matchup_scores row, never a duplicate");
    assert.equal(secondScoreRow!.live_points, allScoreRows![0]!.points, "matchup total must reflect the corrected score");

    await admin.from("fantasy_player_scores").delete().eq("fixture_id", fixtureId);
    await admin.from("player_match_stats").delete().eq("fixture_id", fixtureId);
    await admin.from("player_national_teams").delete().eq("player_id", player.id).eq("national_team_club_id", ctx.nationalTeamAId);
  } finally {
    await tearDownNationalTeams(admin, ctx);
    await cleanupTestLeague(admin, league);
  }
});

// ===========================================================================
// CASE I -- idempotency
// ===========================================================================

test("CASE I: running reconciliation 1, 5, and 20 times with unchanged data produces identical results, no duplicates", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 4);
  const ctx = await setUpNationalTeams(admin);
  try {
    const player = await getMidPlayer(admin);
    await admin.from("player_national_teams").insert({ player_id: player.id, national_team_club_id: ctx.nationalTeamAId });
    const { error: signError } = await league.clients[0].rpc("sign_player", { p_league_id: league.leagueId, p_player_id: player.id });
    assert.equal(signError, null);

    const window = isolatedWindow(9);
    const round = await setupRound(admin, league.leagueId, league.teamIds[0], league.teamIds[1], window);
    const rosterEntryId = await getRosterEntryId(admin, league.teamIds[0], player.id);
    await setupLineupSlot(admin, rosterEntryId, round.roundId, true, null);

    const kickoff = new Date(window.startsAt.getTime() + 2 * 86_400_000);
    const fixtureId = await insertFixture(admin, ctx.eligibleCompetitionId, ctx.nationalTeamAId, ctx.nationalTeamBId, kickoff, "final");
    ctx.fixtureIds.push(fixtureId);
    const points = await scorePlayer(admin, player.id, fixtureId, 1);

    await reconcileFantasyRound(admin, round.roundId); // run 1
    const after1 = { slot: await getLineupSlot(admin, rosterEntryId, round.roundId), score: await getMatchupScore(admin, round.matchupId, league.teamIds[0]) };

    for (let i = 0; i < 4; i++) await reconcileFantasyRound(admin, round.roundId); // runs 2-5
    const after5 = { slot: await getLineupSlot(admin, rosterEntryId, round.roundId), score: await getMatchupScore(admin, round.matchupId, league.teamIds[0]) };

    for (let i = 0; i < 15; i++) await reconcileFantasyRound(admin, round.roundId); // runs 6-20
    const after20 = { slot: await getLineupSlot(admin, rosterEntryId, round.roundId), score: await getMatchupScore(admin, round.matchupId, league.teamIds[0]) };

    for (const after of [after1, after5, after20]) {
      assert.equal(new Date(after.slot.locked_at!).getTime(), kickoff.getTime());
      assert.equal(after.score!.live_points, points);
    }
    assert.equal(after1.slot.id, after5.slot.id, "same row, never duplicated");
    assert.equal(after1.score!.id, after5.score!.id, "same row, never duplicated");
    assert.equal(after5.slot.id, after20.slot.id);
    assert.equal(after5.score!.id, after20.score!.id);

    const { count: slotCount } = await admin.from("lineup_slots").select("*", { count: "exact", head: true }).eq("roster_entry_id", rosterEntryId).eq("fantasy_round_id", round.roundId);
    assert.equal(slotCount, 1, "exactly one lineup_slots row after 20 reconciliations");
    const { count: scoreCount } = await admin.from("matchup_scores").select("*", { count: "exact", head: true }).eq("matchup_id", round.matchupId).eq("fantasy_team_id", league.teamIds[0]);
    assert.equal(scoreCount, 1, "exactly one matchup_scores row after 20 reconciliations");

    await admin.from("fantasy_player_scores").delete().eq("fixture_id", fixtureId);
    await admin.from("player_match_stats").delete().eq("fixture_id", fixtureId);
    await admin.from("player_national_teams").delete().eq("player_id", player.id).eq("national_team_club_id", ctx.nationalTeamAId);
  } finally {
    await tearDownNationalTeams(admin, ctx);
    await cleanupTestLeague(admin, league);
  }
});

// ===========================================================================
// CASE J -- multiple fixtures: lock = earliest, points = sum
// ===========================================================================

test("CASE J: two eligible international fixtures in the same round -- lock is the FIRST kickoff, points are the SUM, discovered in either order", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 4);
  const ctx = await setUpNationalTeams(admin);
  try {
    const player = await getMidPlayer(admin);
    await admin.from("player_national_teams").insert({ player_id: player.id, national_team_club_id: ctx.nationalTeamAId });
    const { error: signError } = await league.clients[0].rpc("sign_player", { p_league_id: league.leagueId, p_player_id: player.id });
    assert.equal(signError, null);

    const window = isolatedWindow(10);
    const round = await setupRound(admin, league.leagueId, league.teamIds[0], league.teamIds[1], window);
    const rosterEntryId = await getRosterEntryId(admin, league.teamIds[0], player.id);
    await setupLineupSlot(admin, rosterEntryId, round.roundId, true, null);

    const laterKickoff = new Date(window.startsAt.getTime() + 4 * 86_400_000);
    const earlierKickoff = new Date(window.startsAt.getTime() + 1 * 86_400_000);

    // Discover the LATER fixture first -- the lock must still end up at
    // the earlier one once it's also discovered, never getting "stuck"
    // at whichever was found first.
    const laterFixtureId = await insertFixture(admin, ctx.eligibleCompetitionId, ctx.nationalTeamAId, ctx.nationalTeamBId, laterKickoff, "final");
    ctx.fixtureIds.push(laterFixtureId);
    const laterPoints = await scorePlayer(admin, player.id, laterFixtureId, 0);
    await reconcileFantasyStateForFixtures(admin, [laterFixtureId]);

    let slot = await getLineupSlot(admin, rosterEntryId, round.roundId);
    assert.equal(new Date(slot.locked_at!).getTime(), laterKickoff.getTime(), "only the later fixture is known so far");

    const earlierFixtureId = await insertFixture(admin, ctx.eligibleCompetitionId, ctx.nationalTeamBId, ctx.nationalTeamAId, earlierKickoff, "final");
    ctx.fixtureIds.push(earlierFixtureId);
    const earlierPoints = await scorePlayer(admin, player.id, earlierFixtureId, 1);
    assert.notEqual(earlierPoints, laterPoints, "the two performances must be distinguishable");
    await reconcileFantasyStateForFixtures(admin, [earlierFixtureId]);

    slot = await getLineupSlot(admin, rosterEntryId, round.roundId);
    assert.equal(new Date(slot.locked_at!).getTime(), earlierKickoff.getTime(), "lock moves EARLIER once the genuinely-first fixture is discovered");

    const score = await getMatchupScore(admin, round.matchupId, league.teamIds[0]);
    assert.equal(score!.live_points, earlierPoints + laterPoints, "both fixtures' points sum");

    await admin.from("fantasy_player_scores").delete().in("fixture_id", [earlierFixtureId, laterFixtureId]);
    await admin.from("player_match_stats").delete().in("fixture_id", [earlierFixtureId, laterFixtureId]);
    await admin.from("player_national_teams").delete().eq("player_id", player.id).eq("national_team_club_id", ctx.nationalTeamAId);
  } finally {
    await tearDownNationalTeams(admin, ctx);
    await cleanupTestLeague(admin, league);
  }
});

// ===========================================================================
// CASE K -- outside-round performance (the real Olise/France-Italy shape):
// a fixture with a valid, already-scored performance whose kickoff falls
// OUTSIDE the round's window must have ZERO effect on that round, no
// matter how reconciliation is invoked. This is the real production
// scenario traced during this pass: Olise's real France vs Italy
// performance (12.7 points, successfully stored) correctly does NOT
// count toward Kaka FC's Round 1 in "The Room," because that fixture's
// real kickoff (2026-10-02T18:45:00Z) falls BEFORE Round 1's real window
// even begins (2026-10-06T00:00:00Z) -- there is no bug to fix there;
// this test is what proves the engine's own boundary is correct rather
// than merely assumed.
// ===========================================================================

test("CASE K: a valid, already-scored performance whose fixture kickoff falls OUTSIDE the round's window has zero effect on that round", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 4);
  const ctx = await setUpNationalTeams(admin);
  try {
    const player = await getMidPlayer(admin);
    await admin.from("player_national_teams").insert({ player_id: player.id, national_team_club_id: ctx.nationalTeamAId });
    const { error: signError } = await league.clients[0].rpc("sign_player", { p_league_id: league.leagueId, p_player_id: player.id });
    assert.equal(signError, null);

    const window = isolatedWindow(11);
    const round = await setupRound(admin, league.leagueId, league.teamIds[0], league.teamIds[1], window);
    const rosterEntryId = await getRosterEntryId(admin, league.teamIds[0], player.id);

    // The round's REAL, already-correct lock -- as if derived from this
    // player's actual first eligible in-window fixture (Olise's real
    // Round 1 locked_at, 2026-10-10T13:30:00Z, is exactly this kind of
    // value: already correct, from a real in-window fixture). This test
    // doesn't need that real in-window fixture to exist; it only needs to
    // prove the OUTSIDE-window one below can never change this value.
    const correctInWindowLock = new Date(window.startsAt.getTime() + 4 * 86_400_000).toISOString();
    await setupLineupSlot(admin, rosterEntryId, round.roundId, true, correctInWindowLock);

    // BEFORE the round: a real, valid, already-scored performance -- the
    // exact shape of the real Olise case (a genuine fantasy_player_scores
    // row exists for this player), just outside this round's window.
    const beforeKickoff = new Date(window.startsAt.getTime() - 2 * 86_400_000);
    const beforeFixtureId = await insertFixture(admin, ctx.eligibleCompetitionId, ctx.nationalTeamAId, ctx.nationalTeamBId, beforeKickoff, "final");
    ctx.fixtureIds.push(beforeFixtureId);
    await scorePlayer(admin, player.id, beforeFixtureId, 3); // a substantial, unmistakable score, same shape as Olise's real 12.7

    // AFTER the round: the symmetric case -- the window exclusion must
    // not be a one-sided ">=" vs "<=" accident.
    const afterKickoff = new Date(window.endsAt.getTime() + 2 * 86_400_000);
    const afterFixtureId = await insertFixture(admin, ctx.eligibleCompetitionId, ctx.nationalTeamAId, ctx.nationalTeamBId, afterKickoff, "final");
    ctx.fixtureIds.push(afterFixtureId);
    await scorePlayer(admin, player.id, afterFixtureId, 5);

    const beforeReconcile = await reconcileFantasyStateForFixtures(admin, [beforeFixtureId]);
    assert.ok(!beforeReconcile.roundIds.includes(round.roundId), "a fixture entirely before the round's window must never identify this round as affected");

    const afterReconcile = await reconcileFantasyStateForFixtures(admin, [afterFixtureId]);
    assert.ok(!afterReconcile.roundIds.includes(round.roundId), "a fixture entirely after the round's window must never identify this round as affected");

    // Explicit reconciliation of the round ITSELF (not just the
    // fixture-triggered path) must also leave it untouched -- proves the
    // exclusion is in reconcileFantasyRound's own window-scoped kickoff
    // lookup (getKickoffsByPlayer), not merely in the affected-round
    // finder skipping the call.
    const directResult = await reconcileFantasyRound(admin, round.roundId);
    assert.equal(directResult!.locksRepaired, 0, "the out-of-window performances must not be mistaken for a legitimate earlier/missing lock");

    const slot = await getLineupSlot(admin, rosterEntryId, round.roundId);
    assert.equal(
      new Date(slot.locked_at!).getTime(),
      new Date(correctInWindowLock).getTime(),
      "the round's real, already-correct lock must be completely unaffected by the outside-round fixture"
    );

    const score = await getMatchupScore(admin, round.matchupId, league.teamIds[0]);
    assert.equal(score?.live_points ?? 0, 0, "the outside-round performance's points must never contribute to this round's matchup total");

    await admin.from("fantasy_player_scores").delete().in("fixture_id", [beforeFixtureId, afterFixtureId]);
    await admin.from("player_match_stats").delete().in("fixture_id", [beforeFixtureId, afterFixtureId]);
    await admin.from("player_national_teams").delete().eq("player_id", player.id).eq("national_team_club_id", ctx.nationalTeamAId);
  } finally {
    await tearDownNationalTeams(admin, ctx);
    await cleanupTestLeague(admin, league);
  }
});
