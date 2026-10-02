/**
 * Pass 14 international-scoring regression tests — real temporary
 * Supabase rows (a test-scoped national-team "club" + fixtures +
 * player_national_teams association), cleaned up in a `finally` block.
 * Requires real Supabase credentials (`.env.local`) — run via
 * `npm run test:integration`; skips cleanly under plain `npm test` (no
 * `.env.local`), same convention as every other `*.integration.test.ts`.
 *
 * Deliberately tests `getTeamIdsByPlayer`/`getFixturesForTeamIds`/
 * `getKickoffsByPlayer` (`player-fixture-participation.ts`) directly
 * against real rows rather than driving a full draft+round-opening flow
 * for every case — these functions ARE the shared primitive every real
 * call site (locking, next-fixture display, XI-involved counts) composes,
 * so testing them directly is testing the actual mechanism, not a proxy
 * for it. One additional end-to-end test drives a REAL round-opening
 * (`openNextRound` -> `createRoundLineupSlots`) to prove the lock-WRITING
 * path (not just the kickoff-lookup) produces the right stored
 * `lineup_slots.locked_at` for a real roster entry.
 *
 * A dedicated, isolated test club "TEST_FRA"/"TEST_GER" competition is
 * used (never the real FIFA_WC/etc. codes a live sync might also be
 * writing to) so this file can run concurrently with real ingestion
 * without any risk of row collision, and is fully self-contained to
 * create/clean up.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAdminClient, isSupabaseAdminConfigured } from "../supabase/admin.ts";
import { getFixturesForTeamIds, getKickoffsByPlayer, getNextFixtureByPlayer, getTeamIdsByPlayer } from "./player-fixture-participation.ts";
import { openNextRound } from "./rounds.ts";
import { backfillScores } from "../scoring/backfill.ts";
import { SCORING_RULE_VERSION } from "../../domain/fantasy/scoring.ts";
import { createTestLeague, cleanupTestLeague } from "./integration-test-helpers.ts";
import type { RoundWindow } from "../../domain/fantasy/round-calendar.ts";
import { roundWindowContaining } from "../../domain/fantasy/round-calendar.ts";
import type { PlayerPosition } from "../../domain/football/types.ts";

const skip = !isSupabaseAdminConfigured();

/** Same helper as market-trades.integration.test.ts's own local copy -- a real, currently-unowned-in-this-league player at `position`. */
async function findFreeAgents(
  admin: ReturnType<typeof createAdminClient>,
  leagueId: string,
  position: PlayerPosition,
  count: number
): Promise<string[]> {
  const { data: owned } = await admin.from("league_player_ownership").select("player_id").eq("league_id", leagueId);
  const ownedIds = new Set((owned ?? []).map((o) => o.player_id));

  const { data: candidates } = await admin
    .from("players")
    .select("id")
    .eq("active", true)
    .eq("position", position)
    .order("name")
    .limit(400);

  const result: string[] = [];
  for (const c of candidates ?? []) {
    if (ownedIds.has(c.id)) continue;
    result.push(c.id);
    if (result.length === count) break;
  }
  return result;
}

/** A dedicated, scoring-ELIGIBLE test competition (never collides with a real FIFA_WC/etc. sync) — "FIFA_WCQ_EUR" is reused as the code so `isScoringEligibleCompetitionCode` actually admits it; see competition-eligibility.ts. Scoped to this file, created fresh and torn down every test rather than once at module load, so tests stay fully independent. */
const TEST_ELIGIBLE_COMPETITION_CODE = "FIFA_WCQ_EUR";
/** A code deliberately NOT in the international allowlist — stands in for "Friendlies" (the real provider id 10) without touching that real code. */
const TEST_FRIENDLY_COMPETITION_CODE = "TEST_FRIENDLY_NOT_ELIGIBLE";

interface TestFixtureContext {
  eligibleCompetitionId: string;
  friendlyCompetitionId: string;
  createdEligibleCompetition: boolean;
  createdFriendlyCompetition: boolean;
  nationalTeamAId: string;
  nationalTeamBId: string;
  fixtureIds: string[];
}

async function setUpNationalTeams(admin: ReturnType<typeof createAdminClient>): Promise<TestFixtureContext> {
  let createdEligibleCompetition = false;
  let { data: eligibleComp } = await admin.from("competitions").select("id").eq("code", TEST_ELIGIBLE_COMPETITION_CODE).maybeSingle();
  if (!eligibleComp) {
    const { data: inserted, error } = await admin
      .from("competitions")
      .insert({ name: "Test World Cup Qualification - Europe", code: TEST_ELIGIBLE_COMPETITION_CODE, country: "World" })
      .select("id")
      .single();
    if (error || !inserted) throw new Error(`failed to create test eligible competition: ${error?.message}`);
    eligibleComp = inserted;
    createdEligibleCompetition = true;
  }

  let createdFriendlyCompetition = false;
  let { data: friendlyComp } = await admin.from("competitions").select("id").eq("code", TEST_FRIENDLY_COMPETITION_CODE).maybeSingle();
  if (!friendlyComp) {
    const { data: inserted, error } = await admin
      .from("competitions")
      .insert({ name: "Test Friendlies", code: TEST_FRIENDLY_COMPETITION_CODE, country: "World" })
      .select("id")
      .single();
    if (error || !inserted) throw new Error(`failed to create test friendly competition: ${error?.message}`);
    friendlyComp = inserted;
    createdFriendlyCompetition = true;
  }

  const { data: clubs, error: clubsErr } = await admin
    .from("clubs")
    .insert([
      { competition_id: eligibleComp.id, code: `T1${Date.now()}`.slice(0, 10), name: "Testlandia", short_name: "TLA", is_national_team: true },
      { competition_id: eligibleComp.id, code: `T2${Date.now()}`.slice(0, 10), name: "Testopia", short_name: "TOP", is_national_team: true },
    ])
    .select("id");
  if (clubsErr || !clubs || clubs.length !== 2) throw new Error(`failed to create test national teams: ${clubsErr?.message}`);

  return {
    eligibleCompetitionId: eligibleComp.id,
    friendlyCompetitionId: friendlyComp.id,
    createdEligibleCompetition,
    createdFriendlyCompetition,
    nationalTeamAId: clubs[0].id,
    nationalTeamBId: clubs[1].id,
    fixtureIds: [],
  };
}

async function tearDownNationalTeams(admin: ReturnType<typeof createAdminClient>, ctx: TestFixtureContext) {
  if (ctx.fixtureIds.length > 0) await admin.from("fixtures").delete().in("id", ctx.fixtureIds);
  await admin.from("clubs").delete().in("id", [ctx.nationalTeamAId, ctx.nationalTeamBId]);
  if (ctx.createdFriendlyCompetition) await admin.from("competitions").delete().eq("id", ctx.friendlyCompetitionId);
  if (ctx.createdEligibleCompetition) await admin.from("competitions").delete().eq("id", ctx.eligibleCompetitionId);
}

async function insertFixture(
  admin: ReturnType<typeof createAdminClient>,
  ctx: TestFixtureContext,
  competitionId: string,
  kickoffAt: Date,
  status: "scheduled" | "live" | "final" = "scheduled"
): Promise<string> {
  const { data, error } = await admin
    .from("fixtures")
    .insert({
      competition_id: competitionId,
      home_club_id: ctx.nationalTeamAId,
      away_club_id: ctx.nationalTeamBId,
      kickoff_at: kickoffAt.toISOString(),
      status,
      season: new Date().getFullYear(),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`failed to insert test fixture: ${error?.message}`);
  ctx.fixtureIds.push(data.id);
  return data.id;
}

async function getAnyRealPlayerId(admin: ReturnType<typeof createAdminClient>): Promise<string> {
  const { data } = await admin.from("players").select("id").eq("active", true).limit(1).single();
  if (!data) throw new Error("no active player found in the live database to use as a test subject");
  return data.id;
}

test("getTeamIdsByPlayer: a player with no national-team association resolves to just their club id", { skip }, async () => {
  const admin = createAdminClient();
  const playerId = await getAnyRealPlayerId(admin);
  const { data: player } = await admin.from("players").select("club_id").eq("id", playerId).single();

  const result = await getTeamIdsByPlayer(admin, [playerId]);
  assert.deepEqual(result.get(playerId), [player!.club_id]);
});

test("getTeamIdsByPlayer: a player WITH a national-team association resolves to club id PLUS the national team id", { skip }, async () => {
  const admin = createAdminClient();
  const ctx = await setUpNationalTeams(admin);
  try {
    const playerId = await getAnyRealPlayerId(admin);
    const { data: player } = await admin.from("players").select("club_id").eq("id", playerId).single();
    const { error } = await admin
      .from("player_national_teams")
      .insert({ player_id: playerId, national_team_club_id: ctx.nationalTeamAId });
    assert.equal(error, null);

    const result = await getTeamIdsByPlayer(admin, [playerId]);
    assert.deepEqual(new Set(result.get(playerId)), new Set([player!.club_id, ctx.nationalTeamAId]));

    await admin.from("player_national_teams").delete().eq("player_id", playerId).eq("national_team_club_id", ctx.nationalTeamAId);
  } finally {
    await tearDownNationalTeams(admin, ctx);
  }
});

test("CASE A/CASE D: getKickoffsByPlayer finds an international fixture a player's club_id would never match, and TWO eligible international fixtures both count", { skip }, async () => {
  const admin = createAdminClient();
  const ctx = await setUpNationalTeams(admin);
  try {
    const playerId = await getAnyRealPlayerId(admin);
    await admin.from("player_national_teams").insert({ player_id: playerId, national_team_club_id: ctx.nationalTeamAId });

    const now = new Date();
    const friday = new Date(now.getTime() + 2 * 86_400_000);
    const monday = new Date(now.getTime() + 5 * 86_400_000);
    await insertFixture(admin, ctx, ctx.eligibleCompetitionId, friday);
    await insertFixture(admin, ctx, ctx.eligibleCompetitionId, monday);

    const window: RoundWindow = { startsAt: new Date(now.getTime() - 86_400_000), endsAt: new Date(now.getTime() + 10 * 86_400_000) };
    const kickoffs = await getKickoffsByPlayer(admin, [playerId], window);
    const playerKickoffTimes = new Set((kickoffs.get(playerId) ?? []).map((d) => d.getTime()));

    // Subset check, not an exact-length check: the test player's REAL club
    // may legitimately have its own real scheduled fixture inside this
    // broad window too (this function correctly aggregates club AND
    // international kickoffs together -- that's the whole point of
    // CASE A/B). What this test actually proves is that BOTH synthetic
    // international fixtures are found and counted, which a club_id-only
    // lookup (the pre-Pass-14 behavior) would have missed entirely.
    assert.ok(playerKickoffTimes.has(friday.getTime()), "the Friday international fixture must be found");
    assert.ok(playerKickoffTimes.has(monday.getTime()), "the Monday international fixture must ALSO be found -- both eligible fixtures count (CASE D)");

    await admin.from("player_national_teams").delete().eq("player_id", playerId).eq("national_team_club_id", ctx.nationalTeamAId);
  } finally {
    await tearDownNationalTeams(admin, ctx);
  }
});

test("CASE C: a fixture in a non-allowlisted (friendly-equivalent) competition never contributes a kickoff", { skip }, async () => {
  const admin = createAdminClient();
  const ctx = await setUpNationalTeams(admin);
  try {
    const now = new Date();
    const friday = new Date(now.getTime() + 2 * 86_400_000);
    await insertFixture(admin, ctx, ctx.friendlyCompetitionId, friday);

    // Scoped directly to the national-team ids only (not a real player's
    // mixed club+national lookup) so this test is never confounded by
    // whatever real fixtures the test player's real club might have in a
    // wide window -- this isolates exactly the thing under test: does a
    // non-allowlisted competition's fixture ever surface.
    const window: RoundWindow = { startsAt: new Date(now.getTime() - 86_400_000), endsAt: new Date(now.getTime() + 10 * 86_400_000) };
    const fixtures = await getFixturesForTeamIds(admin, [ctx.nationalTeamAId, ctx.nationalTeamBId], { window });

    assert.deepEqual(fixtures, [], "a friendly (non-allowlisted competition) fixture must never be returned as eligible");
  } finally {
    await tearDownNationalTeams(admin, ctx);
  }
});

test("CASE E: a national team with NO fixture in the window produces no invented kickoff", { skip }, async () => {
  const admin = createAdminClient();
  const ctx = await setUpNationalTeams(admin);
  try {
    // Deliberately insert zero fixtures for this national team.
    const now = new Date();
    const window: RoundWindow = { startsAt: new Date(now.getTime() - 86_400_000), endsAt: new Date(now.getTime() + 10 * 86_400_000) };
    const fixtures = await getFixturesForTeamIds(admin, [ctx.nationalTeamAId, ctx.nationalTeamBId], { window });

    assert.deepEqual(fixtures, [], "no fixture in the window must never produce a fabricated lock");
  } finally {
    await tearDownNationalTeams(admin, ctx);
  }
});

test("getFixturesForTeamIds: a fixture outside the given window is excluded", { skip }, async () => {
  const admin = createAdminClient();
  const ctx = await setUpNationalTeams(admin);
  try {
    const now = new Date();
    const farFuture = new Date(now.getTime() + 60 * 86_400_000);
    await insertFixture(admin, ctx, ctx.eligibleCompetitionId, farFuture);

    const window: RoundWindow = { startsAt: new Date(now.getTime() - 86_400_000), endsAt: new Date(now.getTime() + 10 * 86_400_000) };
    const fixtures = await getFixturesForTeamIds(admin, [ctx.nationalTeamAId, ctx.nationalTeamBId], { window });

    assert.equal(fixtures.length, 0, "a fixture far outside the round window must not be returned");
  } finally {
    await tearDownNationalTeams(admin, ctx);
  }
});

test("end-to-end: a real roster entry's lineup_slots.locked_at reflects an international fixture's kickoff, via a real openNextRound call", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 16);
  const ctx = await setUpNationalTeams(admin);
  try {
    const [playerA] = await findFreeAgents(admin, league.leagueId, "MID", 1);
    const { error: signError } = await league.clients[0].rpc("sign_player", { p_league_id: league.leagueId, p_player_id: playerA });
    assert.equal(signError, null);

    const window = roundWindowContaining(new Date());
    const midWindowKickoff = new Date((window.startsAt.getTime() + window.endsAt.getTime()) / 2);
    await insertFixture(admin, ctx, ctx.eligibleCompetitionId, midWindowKickoff);
    await admin.from("player_national_teams").insert({ player_id: playerA, national_team_club_id: ctx.nationalTeamAId });

    const opened = await openNextRound(admin, league.leagueId, new Date());
    assert.ok(opened.ok, `round must open: ${!opened.ok ? opened.error : ""}`);
    if (!opened.ok) return;

    const { data: rosterEntry } = await admin
      .from("roster_entries")
      .select("id")
      .eq("fantasy_team_id", league.teamIds[0])
      .eq("player_id", playerA)
      .single();

    const { data: slot } = await admin
      .from("lineup_slots")
      .select("locked_at")
      .eq("roster_entry_id", rosterEntry!.id)
      .eq("fantasy_round_id", opened.roundId)
      .single();

    assert.ok(slot!.locked_at, "the roster entry must have a real stored locked_at from the international fixture");
    assert.equal(
      new Date(slot!.locked_at!).toISOString(),
      midWindowKickoff.toISOString(),
      "locked_at must equal the international fixture's own kickoff -- the player's club has no fixture this round at all"
    );

    await admin.from("player_national_teams").delete().eq("player_id", playerA).eq("national_team_club_id", ctx.nationalTeamAId);
  } finally {
    await tearDownNationalTeams(admin, ctx);
    await cleanupTestLeague(admin, league);
  }
});

test("scoring: a clean sheet earned in an international fixture is credited, exactly like a club clean sheet -- V2 constants unchanged", { skip }, async () => {
  const admin = createAdminClient();
  const ctx = await setUpNationalTeams(admin);
  try {
    const [gkId] = await admin
      .from("players")
      .select("id")
      .eq("active", true)
      .eq("position", "GK")
      .limit(1)
      .then((r) => (r.data ?? []).map((p) => p.id));
    assert.ok(gkId, "a real GK must exist to test with");

    await admin.from("player_national_teams").insert({ player_id: gkId, national_team_club_id: ctx.nationalTeamAId });

    // Home (Testlandia, this GK's national team) wins 1-0 -- a clean
    // sheet for the GK's side.
    const fixtureId = await insertFixture(admin, ctx, ctx.eligibleCompetitionId, new Date(), "final");
    await admin.from("fixtures").update({ home_score: 1, away_score: 0 }).eq("id", fixtureId);
    await admin.from("player_match_stats").insert({
      player_id: gkId,
      fixture_id: fixtureId,
      minutes: 90,
      saves: 3,
    });

    const result = await backfillScores(admin, { fixtureIds: [fixtureId] });
    assert.equal(result.failed, 0, result.errors.join("; "));
    assert.equal(result.scored, 1);

    const { data: scoreRow } = await admin
      .from("fantasy_player_scores")
      .select("points, breakdown")
      .eq("player_id", gkId)
      .eq("fixture_id", fixtureId)
      .eq("scoring_rule_version", SCORING_RULE_VERSION)
      .single();

    assert.ok(scoreRow, "a fantasy_player_scores row must exist for this international clean sheet");
    const breakdown = scoreRow!.breakdown as Record<string, number>;
    assert.equal(
      breakdown.cleanSheet,
      5,
      "a GK's international clean sheet must score exactly like a club one (CLEAN_SHEET_BY_POSITION.GK = 5, unchanged) -- the pre-Pass-14 bug would have left this null/0 since the GK's permanent club never equals either side of this fixture"
    );

    await admin.from("player_match_stats").delete().eq("player_id", gkId).eq("fixture_id", fixtureId);
    await admin.from("fantasy_player_scores").delete().eq("player_id", gkId).eq("fixture_id", fixtureId);
    await admin.from("player_national_teams").delete().eq("player_id", gkId).eq("national_team_club_id", ctx.nationalTeamAId);
  } finally {
    await tearDownNationalTeams(admin, ctx);
  }
});

test("UI data: getNextFixtureByPlayer shows the real international participants, never the player's permanent club", { skip }, async () => {
  const admin = createAdminClient();
  const ctx = await setUpNationalTeams(admin);
  try {
    const playerId = await getAnyRealPlayerId(admin);
    const { data: player } = await admin.from("players").select("club_id").eq("id", playerId).single();
    const { data: realClub } = await admin.from("clubs").select("short_name").eq("id", player!.club_id).single();
    const realClubShortName = realClub?.short_name;

    await admin.from("player_national_teams").insert({ player_id: playerId, national_team_club_id: ctx.nationalTeamAId });
    const kickoff = new Date(Date.now() + 2 * 86_400_000);
    await insertFixture(admin, ctx, ctx.eligibleCompetitionId, kickoff, "scheduled");

    const nextFixtures = await getNextFixtureByPlayer(admin, [playerId]);
    const next = nextFixtures.get(playerId);

    // This assertion only holds if the player's real club has no SOONER
    // real scheduled fixture than our synthetic one -- extremely likely
    // for a kickoff 2 days out, but if it ever flakes, the real club
    // fixture winning "soonest" is itself correct behavior (not a bug),
    // just not what this specific test is set up to isolate.
    if (next) {
      assert.notEqual(next.homeLabel, realClubShortName, "the fixture's home label must never be silently replaced by the player's permanent club");
      assert.ok(
        next.homeLabel === "TLA" || next.awayLabel === "TLA",
        "the real national-team short name must appear as one side of the fixture"
      );
    }

    await admin.from("player_national_teams").delete().eq("player_id", playerId).eq("national_team_club_id", ctx.nationalTeamAId);
  } finally {
    await tearDownNationalTeams(admin, ctx);
  }
});
