/**
 * Regression test for the production incident where `player_national_teams`
 * (added by the international-scoring migration) gave PostgREST two
 * relationship paths between `players` and `clubs`, making the nested
 * `players(...clubs(...))` embed inside `getDraftState`'s `draft_picks`
 * query fail with `PGRST201` -- silently emptying the Draft Room's pick
 * history. The fix is the explicit `clubs!players_club_id_fkey(...)`
 * hint. This test proves draft pick history still resolves, with the
 * real picked player's real club, even while a `player_national_teams`
 * row exists for them.
 *
 * Uses `queryDraftState` (the client-injectable core of `getDraftState`)
 * with the real admin client, since `getDraftState` itself requires a
 * live Next.js request's cookies and can't be called from a plain
 * script/test. No integration test file existed for drafts.ts before
 * this one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAdminClient, isSupabaseAdminConfigured } from "../lib/supabase/admin.ts";
import { createTestLeague, cleanupTestLeague, draftToCompletion } from "../lib/fantasy-engine/integration-test-helpers.ts";
import { queryDraftState } from "./drafts.ts";

const skip = !isSupabaseAdminConfigured();

test("queryDraftState resolves the canonical club for every pick, including a player who also has a player_national_teams association", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 16);
  let nationalTeamId: string | null = null;
  try {
    const { data: started, error: startError } = await league.clients[0].rpc("start_draft", { p_league_id: league.leagueId });
    assert.equal(startError, null);
    const draftId = started![0]!.draft_id;

    await draftToCompletion(admin, draftId, 2, 16);

    const { data: firstPick } = await admin
      .from("draft_picks")
      .select("player_id, players(club_id)")
      .eq("draft_id", draftId)
      .order("pick_number", { ascending: true })
      .limit(1)
      .single();
    const pickedPlayerId = firstPick!.player_id;
    const realClubId = (firstPick!.players as unknown as { club_id: string }).club_id;
    const { data: realClub } = await admin.from("clubs").select("short_name").eq("id", realClubId).single();

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

    const { error: assocError } = await admin
      .from("player_national_teams")
      .insert({ player_id: pickedPlayerId, national_team_club_id: nationalTeamId });
    assert.equal(assocError, null);

    const state = await queryDraftState(admin, league.leagueId);
    assert.ok(state, "draft state must exist for a league with a completed draft");
    assert.ok(state!.picks.length > 0, "pick history must not silently come back empty (the PGRST201 regression)");

    const found = state!.picks.find((p) => p.playerId === pickedPlayerId);
    assert.ok(found, "the picked player with a national-team association must still appear in pick history");
    assert.equal(found!.clubShortName, realClub!.short_name, "pick history must show the player's REAL club, never the national team, and never fall back to the placeholder");
    assert.notEqual(found!.clubShortName, "—", "a resolved club must never silently fall back to the placeholder");

    await admin.from("player_national_teams").delete().eq("player_id", pickedPlayerId).eq("national_team_club_id", nationalTeamId);
  } finally {
    if (nationalTeamId) await admin.from("clubs").delete().eq("id", nationalTeamId);
    await cleanupTestLeague(admin, league);
  }
});
