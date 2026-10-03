/**
 * COMMITTED regression test for Pass 11.5's Matchup "game center": the
 * explicit historical rule that a matchup's lineup must come from that
 * round's real `lineup_slots` records, never from CURRENT roster
 * ownership. A player can leave a roster after their round-lineup already
 * locked; the historical matchup must still show them exactly as they
 * were scored, not silently vanish or get replaced by whoever owns the
 * roster spot now.
 *
 * Pass 14.6: the departure here is a TRADE, not a drop -- dropping an
 * already-LOCKED starter is now rejected outright
 * (20261006000000_drop_lock_enforcement.sql), so the previous version of
 * this test (drop a locked starter) is no longer a legal sequence. A
 * trade of a locked player remains explicitly unrestricted (the brief's
 * own carve-out: "do not accidentally prohibit trades"), and
 * `_release_current_round_slot` leaves an already-locked slot completely
 * untouched either way (same market-trades.integration.test.ts's own
 * "lock integrity" trade test proves directly) -- so a trade is the
 * correct, still-legal way to exercise "current ownership changed, the
 * locked historical slot must not."
 *
 * Uses `queryMatchupSquads` (the client-injectable core of
 * `getMatchupSquads`) with the real admin client, since `getMatchupSquads`
 * itself requires a live Next.js request's cookies. Builds rosters via
 * `sign_player` (no draft needed, same convention as
 * market-trades.integration.test.ts) and opens a round directly via
 * `openNextRound` -- real fixtures/scoring engine, no mocked data.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAdminClient, isSupabaseAdminConfigured } from "../lib/supabase/admin.ts";
import { openNextRound } from "../lib/fantasy-engine/rounds.ts";
import { createTestLeague, cleanupTestLeague } from "../lib/fantasy-engine/integration-test-helpers.ts";
import { queryMatchupSquads, queryLeagueCompetitionSummary, type CurrentMatchup } from "./matchups.ts";

const skip = !isSupabaseAdminConfigured();

test("a historical round's matchup lineup reflects that round's real lineup_slots, not current ownership -- a player TRADED away after locking still appears, locked", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 16);
  try {
    const { data: gks } = await admin.from("players").select("id").eq("active", true).eq("position", "GK").order("name").limit(1);
    const playerId = gks![0]!.id;
    const { data: returnCandidates } = await admin.from("players").select("id").eq("active", true).neq("id", playerId).limit(1);
    const returnPlayerId = returnCandidates![0]!.id;

    const { error: signError } = await league.clients[0].rpc("sign_player", {
      p_league_id: league.leagueId,
      p_player_id: playerId,
    });
    assert.equal(signError, null);
    const { error: signReturnError } = await league.clients[1].rpc("sign_player", {
      p_league_id: league.leagueId,
      p_player_id: returnPlayerId,
    });
    assert.equal(signReturnError, null);

    const { data: rosterEntry } = await admin
      .from("roster_entries")
      .select("id")
      .eq("fantasy_team_id", league.teamIds[0])
      .eq("player_id", playerId)
      .single();
    const rosterEntryId = rosterEntry!.id;

    const opened = await openNextRound(admin, league.leagueId, new Date());
    assert.ok(opened.ok, `round must open: ${!opened.ok ? opened.error : ""}`);
    if (!opened.ok) return;

    const pastLock = new Date(Date.now() - 3_600_000).toISOString();
    await admin
      .from("lineup_slots")
      .update({ starter: true, slot: "GK", locked_at: pastLock })
      .eq("roster_entry_id", rosterEntryId)
      .eq("fantasy_round_id", opened.roundId);

    const { data: matchupRow } = await admin
      .from("matchups")
      .select("home_fantasy_team_id, away_fantasy_team_id")
      .eq("fantasy_round_id", opened.roundId)
      .single();
    const { data: round } = await admin.from("fantasy_rounds").select("starts_at, ends_at, number").eq("id", opened.roundId).single();

    const matchup: CurrentMatchup = {
      id: "test-matchup",
      roundId: opened.roundId,
      roundNumber: round!.number,
      roundStartsAt: round!.starts_at,
      roundEndsAt: round!.ends_at,
      roundStatus: "in_progress",
      status: "live",
      homeFantasyTeamId: matchupRow!.home_fantasy_team_id,
      awayFantasyTeamId: matchupRow!.away_fantasy_team_id,
      homeTeamName: "Home",
      awayTeamName: "Away",
      homeLivePoints: 0,
      awayLivePoints: 0,
      homeFinalPoints: null,
      awayFinalPoints: null,
      isUserHome: true,
      scoresUpdatedAt: null,
    };

    // Trade the player AFTER the round has locked -- current ownership no
    // longer includes them at all (a drop here would instead be rejected
    // outright -- see this test's own header comment).
    const { data: proposed, error: proposeError } = await league.clients[0].rpc("propose_trade", {
      p_league_id: league.leagueId,
      p_receiving_team_id: league.teamIds[1],
      p_offered_player_ids: [playerId],
      p_requested_player_ids: [returnPlayerId],
    });
    assert.equal(proposeError, null);
    const { error: acceptError } = await league.clients[1].rpc("accept_trade", { p_trade_id: proposed![0]!.trade_id });
    assert.equal(acceptError, null);

    const { data: ownershipAfterTrade } = await admin
      .from("league_player_ownership")
      .select("fantasy_team_id")
      .eq("league_id", league.leagueId)
      .eq("player_id", playerId)
      .single();
    assert.equal(ownershipAfterTrade!.fantasy_team_id, league.teamIds[1], "sanity check: the player must genuinely belong to the OTHER team now");

    const squads = await queryMatchupSquads(admin, matchup);
    const team0Squad = matchup.homeFantasyTeamId === league.teamIds[0] ? squads.home : squads.away;

    const starterSlot = team0Squad.starters.find((s) => s.player.id === playerId);
    assert.ok(
      starterSlot,
      "the traded-away player must still appear as a starter in this HISTORICAL round's matchup, even though they are now owned by the other team"
    );
    assert.equal(starterSlot!.locked, true, "their locked slot must still read as locked");
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

test("getMatchupSquads returns a complete 4-4-2-shaped squad for a fully-rostered team with real per-round points populated", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 16);
  try {
    const positions: { position: "GK" | "DEF" | "MID" | "FWD"; count: number }[] = [
      { position: "GK", count: 2 },
      { position: "DEF", count: 6 },
      { position: "MID", count: 6 },
      { position: "FWD", count: 2 },
    ];
    for (const { position, count } of positions) {
      const { data: candidates } = await admin.from("players").select("id").eq("active", true).eq("position", position).order("name").limit(count);
      for (const c of candidates ?? []) {
        const { error } = await league.clients[0].rpc("sign_player", { p_league_id: league.leagueId, p_player_id: c.id });
        assert.equal(error, null);
      }
    }

    const opened = await openNextRound(admin, league.leagueId, new Date());
    assert.ok(opened.ok);
    if (!opened.ok) return;

    const { data: matchupRow } = await admin
      .from("matchups")
      .select("home_fantasy_team_id, away_fantasy_team_id")
      .eq("fantasy_round_id", opened.roundId)
      .single();
    const { data: round } = await admin.from("fantasy_rounds").select("starts_at, ends_at, number").eq("id", opened.roundId).single();

    const matchup: CurrentMatchup = {
      id: "test-matchup",
      roundId: opened.roundId,
      roundNumber: round!.number,
      roundStartsAt: round!.starts_at,
      roundEndsAt: round!.ends_at,
      roundStatus: "in_progress",
      status: "live",
      homeFantasyTeamId: matchupRow!.home_fantasy_team_id,
      awayFantasyTeamId: matchupRow!.away_fantasy_team_id,
      homeTeamName: "Home",
      awayTeamName: "Away",
      homeLivePoints: 0,
      awayLivePoints: 0,
      homeFinalPoints: null,
      awayFinalPoints: null,
      isUserHome: true,
      scoresUpdatedAt: null,
    };

    const squads = await queryMatchupSquads(admin, matchup);
    const team0Squad = matchup.homeFantasyTeamId === league.teamIds[0] ? squads.home : squads.away;

    assert.equal(team0Squad.starters.length + team0Squad.bench.length, 16);
    // Every starter/bench player's fantasyPoints must be a real number
    // (never undefined/NaN), since this field is always populated here
    // (unlike the Players market, where it's legitimately 0 by design).
    for (const slot of team0Squad.starters) {
      assert.equal(typeof slot.player.fantasyPoints, "number");
    }
    for (const player of team0Squad.bench) {
      assert.equal(typeof player.fantasyPoints, "number");
    }
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

test("getLeagueCompetitionSummary surfaces the real current-round matchup league-wide (not scoped to one manager), and reports no records before anything is final", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 16);
  try {
    const { data: gks } = await admin.from("players").select("id").eq("active", true).eq("position", "GK").order("name").limit(2);
    await league.clients[0].rpc("sign_player", { p_league_id: league.leagueId, p_player_id: gks![0]!.id });
    await league.clients[1].rpc("sign_player", { p_league_id: league.leagueId, p_player_id: gks![1]!.id });

    const opened = await openNextRound(admin, league.leagueId, new Date());
    assert.ok(opened.ok);
    if (!opened.ok) return;

    const summary = await queryLeagueCompetitionSummary(admin, league.leagueId);

    assert.equal(summary.currentRoundMatchups.length, 1, "the one real pairing between these two teams must appear, unscoped to either manager");
    const matchup = summary.currentRoundMatchups[0]!;
    assert.equal(matchup.roundNumber, 1);
    assert.equal(matchup.status, "scheduled");
    assert.ok([matchup.homeTeamId, matchup.awayTeamId].includes(league.teamIds[0]));
    assert.ok([matchup.homeTeamId, matchup.awayTeamId].includes(league.teamIds[1]));

    // Nothing has finished yet -- records must all be genuinely absent,
    // never a fabricated zero/placeholder.
    assert.equal(summary.recentResults.length, 0);
    assert.deepEqual(summary.records, {
      highestScore: null,
      lowestScore: null,
      largestMargin: null,
      closestMatchup: null,
      mostPointsFor: null,
      mostPointsAgainst: null,
    });
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

/**
 * Regression test for the production incident where `player_national_teams`
 * gave PostgREST two relationship paths between `players` and `clubs`,
 * making the nested `players(...clubs(...))` embed inside
 * `buildMatchupTeamSquad`'s `lineup_slots` query fail with `PGRST201` --
 * silently emptying the Matchup page's squads. The fix is the explicit
 * `clubs!players_club_id_fkey(...)` hint. This test proves the squad still
 * resolves, with the rostered player's REAL club, even while a
 * `player_national_teams` row exists for them.
 */
test("getMatchupSquads resolves the canonical club for a rostered player who also has a player_national_teams association", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 16);
  let nationalTeamId: string | null = null;
  try {
    const { data: gks } = await admin.from("players").select("id, club_id").eq("active", true).eq("position", "GK").order("name").limit(1);
    const playerId = gks![0]!.id;
    const { data: realClub } = await admin.from("clubs").select("id, short_name").eq("id", gks![0]!.club_id).single();

    const { data: anyCompetition } = await admin.from("competitions").select("id").limit(1).single();
    const { data: nationalTeam, error: nationalTeamError } = await admin
      .from("clubs")
      .insert({
        competition_id: anyCompetition!.id,
        code: `REGRESS-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: "Regression Test National Team",
        short_name: "RGT",
        is_national_team: true,
      })
      .select("id")
      .single();
    assert.equal(nationalTeamError, null);
    nationalTeamId = nationalTeam!.id;

    const { error: assocError } = await admin.from("player_national_teams").insert({ player_id: playerId, national_team_club_id: nationalTeamId });
    assert.equal(assocError, null);

    const { error: signError } = await league.clients[0].rpc("sign_player", { p_league_id: league.leagueId, p_player_id: playerId });
    assert.equal(signError, null);

    const opened = await openNextRound(admin, league.leagueId, new Date());
    assert.ok(opened.ok);
    if (!opened.ok) return;

    const { data: matchupRow } = await admin
      .from("matchups")
      .select("home_fantasy_team_id, away_fantasy_team_id")
      .eq("fantasy_round_id", opened.roundId)
      .single();
    const { data: round } = await admin.from("fantasy_rounds").select("starts_at, ends_at, number").eq("id", opened.roundId).single();

    const matchup: CurrentMatchup = {
      id: "test-matchup",
      roundId: opened.roundId,
      roundNumber: round!.number,
      roundStartsAt: round!.starts_at,
      roundEndsAt: round!.ends_at,
      roundStatus: "in_progress",
      status: "live",
      homeFantasyTeamId: matchupRow!.home_fantasy_team_id,
      awayFantasyTeamId: matchupRow!.away_fantasy_team_id,
      homeTeamName: "Home",
      awayTeamName: "Away",
      homeLivePoints: 0,
      awayLivePoints: 0,
      homeFinalPoints: null,
      awayFinalPoints: null,
      isUserHome: true,
      scoresUpdatedAt: null,
    };

    const squads = await queryMatchupSquads(admin, matchup);
    const team0Squad = matchup.homeFantasyTeamId === league.teamIds[0] ? squads.home : squads.away;
    const allPlayers = [...team0Squad.starters.map((s) => s.player), ...team0Squad.bench];

    assert.ok(allPlayers.length > 0, "the squad must not silently come back empty (the PGRST201 regression)");
    const found = allPlayers.find((p) => p.id === playerId);
    assert.ok(found, "the player with a national-team association must still appear in their fantasy squad");
    assert.equal(found!.club.id, realClub!.id, "the squad must show the player's REAL club, never the national team, and never fail to resolve it");

    await admin.from("player_national_teams").delete().eq("player_id", playerId).eq("national_team_club_id", nationalTeamId);
  } finally {
    if (nationalTeamId) await admin.from("clubs").delete().eq("id", nationalTeamId);
    await cleanupTestLeague(admin, league);
  }
});
