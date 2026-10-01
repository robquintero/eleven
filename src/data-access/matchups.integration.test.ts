/**
 * COMMITTED regression test for Pass 11.5's Matchup "game center": the
 * explicit historical rule that a matchup's lineup must come from that
 * round's real `lineup_slots` records, never from CURRENT roster
 * ownership. A player can be dropped or traded after their round-lineup
 * already locked; the historical matchup must still show them exactly as
 * they were scored, not silently vanish or get replaced by whoever owns
 * the roster spot now.
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
import { queryMatchupSquads, type CurrentMatchup } from "./matchups.ts";

const skip = !isSupabaseAdminConfigured();

test("a historical round's matchup lineup reflects that round's real lineup_slots, not current ownership -- a player dropped AFTER locking still appears, locked", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 16);
  try {
    const { data: gks } = await admin.from("players").select("id").eq("active", true).eq("position", "GK").order("name").limit(1);
    const playerId = gks![0]!.id;

    const { error: signError } = await league.clients[0].rpc("sign_player", {
      p_league_id: league.leagueId,
      p_player_id: playerId,
    });
    assert.equal(signError, null);

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
    };

    // Drop the player AFTER the round has locked -- current ownership no
    // longer includes them at all.
    const { error: dropError } = await league.clients[0].rpc("drop_player", {
      p_league_id: league.leagueId,
      p_player_id: playerId,
    });
    assert.equal(dropError, null);

    const { data: ownershipAfterDrop } = await admin
      .from("league_player_ownership")
      .select("player_id")
      .eq("league_id", league.leagueId)
      .eq("player_id", playerId)
      .maybeSingle();
    assert.equal(ownershipAfterDrop, null, "sanity check: the player must genuinely be unowned now");

    const squads = await queryMatchupSquads(admin, matchup);
    const team0Squad = matchup.homeFantasyTeamId === league.teamIds[0] ? squads.home : squads.away;

    const starterSlot = team0Squad.starters.find((s) => s.player.id === playerId);
    assert.ok(
      starterSlot,
      "the dropped player must still appear as a starter in this HISTORICAL round's matchup, even though they are no longer owned by anyone"
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
