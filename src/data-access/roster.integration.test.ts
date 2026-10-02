/**
 * Regression test for the production incident where `player_national_teams`
 * (added by the international-scoring migration) gave PostgREST two
 * relationship paths between `players` and `clubs`, making the nested
 * `players(...clubs(...))` embed inside `getUserSquad`'s `roster_entries`
 * query fail with `PGRST201` -- silently emptying the Team page's roster.
 * The fix is the explicit `clubs!players_club_id_fkey(...)` hint. This
 * test proves the roster still resolves, with the real player's real
 * club, even while a `player_national_teams` row exists for them.
 *
 * Uses `querySquad` (the client-injectable core of `getUserSquad`) with
 * the real admin client, since `getUserSquad` itself requires a live
 * Next.js request's cookies and can't be called from a plain script/test.
 * No integration test file existed for roster.ts before this one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAdminClient, isSupabaseAdminConfigured } from "../lib/supabase/admin.ts";
import { createTestLeague, cleanupTestLeague } from "../lib/fantasy-engine/integration-test-helpers.ts";
import { querySquad } from "./roster.ts";

const skip = !isSupabaseAdminConfigured();

test("querySquad resolves the canonical club for a rostered player who also has a player_national_teams association", { skip }, async () => {
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

    const squad = await querySquad(admin, league.leagueId, league.teamIds[0]!);
    const allPlayers = [...squad.starters.map((s) => s.player), ...squad.bench];

    assert.ok(allPlayers.length > 0, "the squad must not silently come back empty (the PGRST201 regression)");
    const found = allPlayers.find((p) => p.id === playerId);
    assert.ok(found, "the signed player must still appear on the roster");
    assert.equal(found!.club.id, realClub!.id, "the roster must show the player's REAL club, never the national team, and never fail to resolve it");

    await admin.from("player_national_teams").delete().eq("player_id", playerId).eq("national_team_club_id", nationalTeamId);
  } finally {
    if (nationalTeamId) await admin.from("clubs").delete().eq("id", nationalTeamId);
    await cleanupTestLeague(admin, league);
  }
});
