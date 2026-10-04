/**
 * Pass 14.7 Phase 12 — ONE deterministic golden-path lifecycle test, never
 * a giant simulation suite. Exercises, against the real engine/RPCs with
 * real Supabase writes, in a single isolated league:
 *
 *   create league -> managers join -> draft -> valid 16-player rosters ->
 *   valid 4-4-2 XI -> bench -> substitution -> locked substitution
 *   rejection + friendly rule explanation -> free-agent add/drop ->
 *   locked drop rejection + friendly rule explanation -> trade ->
 *   acquisition cutoff -> fixture/stat scoring -> matchup aggregation ->
 *   reconciliation -> round transition.
 *
 * Isolation (Pass 14.6.1/14.7 Phase 8's own hard lesson): the round itself
 * is opened with a fully SYNTHETIC `now` (year 2098, never used by any
 * other test in this repo), never the real current date -- the draft
 * itself uses `draftToCompletion` (auto-picks only, no automatic
 * `maybeOpenFirstRound` side effect, which always uses the REAL current
 * date and would have defeated this isolation). `openNextRound` requires
 * at least one real stored fixture inside the target window to find it at
 * all (`findNextEligibleWindow`), so one synthetic fixture is inserted
 * FIRST, before opening the round. No new player/club rows are created --
 * every synthetic fixture reuses a REAL existing player's REAL club, so
 * only `fixtures`/`player_match_stats`/`fantasy_player_scores` rows need
 * explicit cleanup, all deleted by their exact ids in `finally`.
 *
 * Provider calls: 0.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAdminClient, isSupabaseAdminConfigured } from "../supabase/admin.ts";
import { assertMutationTestsAllowedAgainstThisProject } from "../supabase/test-production-guard.ts";
import { createTestLeague, cleanupTestLeague, draftToCompletion } from "./integration-test-helpers.ts";
import { openNextRound, refreshMatchupScores, finalizeRoundIfReady } from "./rounds.ts";
import { reconcileFantasyStateForFixtures } from "./reconciliation.ts";
import { updateLineup, LINEUP_ERROR_KIND } from "./lineup.ts";
import { backfillScores } from "../scoring/backfill.ts";
import { getRoundPlayerState } from "../../data-access/matchups.ts";
import { MARKET_ACTION_ERROR_KIND } from "../errors/market-action-error-copy.ts";
import { toMarketActionError } from "../errors/market-action-error.ts";

const skip = !isSupabaseAdminConfigured();
assertMutationTestsAllowedAgainstThisProject();

const SYNTHETIC_YEAR = 2098;

test("golden path: draft -> XI/bench -> substitution (+ locked rejection) -> free agency (+ locked rejection) -> trade -> acquisition cutoff -> scoring -> matchup aggregation -> reconciliation -> round transition", { skip, timeout: 60_000 }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 16);
  const insertedFixtureIds: string[] = [];

  try {
    // ---------------------------------------------------------------
    // 1. Draft to completion -- real draft-engine RPCs, real position/
    //    count validation, so a complete 16-player roster per team
    //    (GK 2, DEF 4-6, MID 4-6, FWD 2-4) is already PROVEN here, not
    //    assumed.
    // ---------------------------------------------------------------
    const { data: draft, error: startDraftError } = await league.clients[0].rpc("start_draft", { p_league_id: league.leagueId });
    assert.equal(startDraftError, null);
    const draftId = draft![0]!.draft_id;
    await draftToCompletion(admin, draftId, 2, 16);

    const { data: finalDraft } = await admin.from("drafts").select("status").eq("id", draftId).single();
    assert.equal(finalDraft!.status, "completed");

    for (const teamId of league.teamIds) {
      const { count } = await admin.from("roster_entries").select("id", { count: "exact", head: true }).eq("fantasy_team_id", teamId).eq("status", "active");
      assert.equal(count, 16, "each team must have a complete, valid 16-player roster after the draft");
    }

    // ---------------------------------------------------------------
    // 2. Open round 1 on a fully SYNTHETIC clock -- insert one real
    //    enabling fixture first (findNextEligibleWindow requires at
    //    least one stored fixture inside the target window to find it).
    // ---------------------------------------------------------------
    const syntheticNow = new Date(Date.UTC(SYNTHETIC_YEAR, 0, 7));
    const { data: team0Entries } = await admin
      .from("roster_entries")
      .select("id, player_id, players(id, position, club_id)")
      .eq("fantasy_team_id", league.teamIds[0])
      .eq("status", "active");
    const scoringSubject = team0Entries!.find((e) => e.players)!;
    const scoringSubjectClubId = (scoringSubject.players as unknown as { club_id: string }).club_id;
    const { data: scoringSubjectOpponent } = await admin.from("clubs").select("id").neq("id", scoringSubjectClubId).limit(1).single();

    async function insertFixture(kickoff: Date, status: "final" | "scheduled") {
      const { data, error } = await admin
        .from("fixtures")
        .insert({
          competition_id: (await admin.from("clubs").select("competition_id").eq("id", scoringSubjectClubId).single()).data!.competition_id,
          home_club_id: scoringSubjectClubId,
          away_club_id: scoringSubjectOpponent!.id,
          kickoff_at: kickoff.toISOString(),
          status,
          season: SYNTHETIC_YEAR,
          home_score: status === "final" ? 2 : null,
          away_score: status === "final" ? 0 : null,
        })
        .select("id")
        .single();
      assert.equal(error, null, `fixture insert failed: ${error?.message}`);
      insertedFixtureIds.push(data!.id);
      return data!.id;
    }

    const preAcquisitionKickoff = new Date(Date.UTC(SYNTHETIC_YEAR, 0, 8)); // day 2 of the window
    const fixtureA = await insertFixture(preAcquisitionKickoff, "final");

    const opened = await openNextRound(admin, league.leagueId, syntheticNow);
    assert.ok(opened.ok, `round must open: ${!opened.ok ? opened.error : ""}`);
    if (!opened.ok) return;
    const roundId = opened.roundId;
    assert.equal(opened.roundNumber, 1);

    // ---------------------------------------------------------------
    // 3. Valid 4-4-2 starting XI + bench already auto-initialized by
    //    openNextRound (createRoundLineupSlots).
    // ---------------------------------------------------------------
    const { data: team0Slots } = await admin
      .from("lineup_slots")
      .select("id, roster_entry_id, starter, slot, locked_at, roster_entries!inner(player_id, players(position))")
      .eq("fantasy_round_id", roundId)
      .eq("roster_entries.fantasy_team_id", league.teamIds[0]);
    const starters = team0Slots!.filter((s) => s.starter);
    const bench = team0Slots!.filter((s) => !s.starter);
    assert.equal(starters.length, 11, "exactly 11 starters");
    assert.equal(bench.length, 5, "exactly 5 bench");
    const starterPositionCounts: Record<string, number> = {};
    for (const s of starters) {
      const pos = (s.roster_entries as unknown as { players: { position: string } }).players.position;
      starterPositionCounts[pos] = (starterPositionCounts[pos] ?? 0) + 1;
    }
    assert.deepEqual(starterPositionCounts, { GK: 1, DEF: 4, MID: 4, FWD: 2 }, "a valid 4-4-2 starting XI");

    // ---------------------------------------------------------------
    // 4. Substitution: swap an unlocked starter for a same-position,
    //    unlocked bench player via the real updateLineup() path.
    //
    // Pairs are found programmatically (never hardcoded indices) since
    // the real auto-draft's exact position distribution across 5 bench
    // slots isn't guaranteed in advance -- only that AT LEAST two
    // independent (starter, same-position bench) pairs exist somewhere
    // across the roster, which a valid 16-player squad (deeper than the
    // 11-player XI at every position) guarantees.
    // ---------------------------------------------------------------
    function playerPosition(row: NonNullable<typeof team0Slots>[number]) {
      return (row.roster_entries as unknown as { players: { position: string } }).players.position;
    }
    const claimedBenchIds = new Set<string>();
    function claimPair(excludeStarterIds: Set<string>) {
      for (const starter of starters) {
        if (excludeStarterIds.has(starter.id)) continue;
        const benchMatch = bench.find((b) => !claimedBenchIds.has(b.id) && playerPosition(b) === playerPosition(starter));
        if (benchMatch) {
          claimedBenchIds.add(benchMatch.id);
          return { starter, benchMatch };
        }
      }
      return null;
    }

    const firstPair = claimPair(new Set());
    assert.ok(firstPair, "at least one (starter, same-position bench) pair must exist on a valid 16-player roster");
    const { starter: starterToBench, benchMatch: benchToPromote } = firstPair!;

    const swapResult = await updateLineup(
      league.clients[0],
      league.teamIds[0],
      roundId,
      [
        { rosterEntryId: starterToBench.roster_entry_id, starter: false },
        { rosterEntryId: benchToPromote.roster_entry_id, starter: true, position: playerPosition(starterToBench) as "GK" | "DEF" | "MID" | "FWD" },
      ],
      syntheticNow
    );
    assert.ok(swapResult.ok, `substitution must succeed: ${!swapResult.ok ? swapResult.error : ""}`);

    const { data: afterSwap } = await admin.from("lineup_slots").select("starter").eq("roster_entry_id", benchToPromote.roster_entry_id).eq("fantasy_round_id", roundId).single();
    assert.equal(afterSwap!.starter, true, "the promoted bench player is now a starter");

    // ---------------------------------------------------------------
    // 5. Locked substitution rejection + friendly (non-error) rule
    //    classification.
    // ---------------------------------------------------------------
    const secondPair = claimPair(new Set([starterToBench.id]));
    assert.ok(secondPair, "a second independent (starter, same-position bench) pair must exist");
    const { starter: lockedStarter, benchMatch: lockedBenchCandidate } = secondPair!;
    await admin.from("lineup_slots").update({ locked_at: new Date(syntheticNow.getTime() - 3_600_000).toISOString() }).eq("id", lockedStarter.id);

    const lockedSwapResult = await updateLineup(
      league.clients[0],
      league.teamIds[0],
      roundId,
      [
        { rosterEntryId: lockedStarter.roster_entry_id, starter: false },
        { rosterEntryId: lockedBenchCandidate.roster_entry_id, starter: true, position: playerPosition(lockedStarter) as "GK" | "DEF" | "MID" | "FWD" },
      ],
      syntheticNow
    );
    assert.equal(lockedSwapResult.ok, false);
    assert.equal(!lockedSwapResult.ok && lockedSwapResult.error, "SLOT_LOCKED");
    assert.equal(LINEUP_ERROR_KIND.SLOT_LOCKED, "rule", "a locked-slot rejection is an expected game-rule outcome, never a red error");

    // ---------------------------------------------------------------
    // 6. Free-agent add/drop (unlocked -> allowed). Drops an existing
    //    unlocked bench player FIRST to free a roster slot (the roster
    //    is already a complete, valid 16 -- see step 1 -- so "add" alone
    //    would correctly fail ROSTER_FULL without this).
    // ---------------------------------------------------------------
    const spareBench = bench.find((b) => b.id !== benchToPromote.id && b.id !== lockedBenchCandidate.id)!;
    const { error: dropExistingError } = await league.clients[0].rpc("drop_player", {
      p_league_id: league.leagueId,
      p_player_id: spareBench.roster_entries.player_id as unknown as string,
    });
    assert.equal(dropExistingError, null, "an unlocked roster player must be droppable");

    const { data: freeAgent } = await admin
      .from("players")
      .select("id")
      .eq("active", true)
      .eq("position", playerPosition(spareBench))
      .not("id", "in", `(${team0Entries!.map((e) => e.player_id).join(",")})`)
      .limit(1)
      .single();
    const { error: signError } = await league.clients[0].rpc("sign_player", { p_league_id: league.leagueId, p_player_id: freeAgent!.id });
    assert.equal(signError, null, "an unowned, active player must be signable once a roster slot is free");
    const { error: dropFreeAgentError } = await league.clients[0].rpc("drop_player", { p_league_id: league.leagueId, p_player_id: freeAgent!.id });
    assert.equal(dropFreeAgentError, null, "an unlocked roster player must be droppable");

    // ---------------------------------------------------------------
    // 7. Locked drop rejection + friendly (non-error) rule
    //    classification. Unlike `updateLineup` (an app-layer function
    //    that respects the explicit synthetic `now` passed to it),
    //    `drop_player` is a raw SQL RPC that checks `locked_at <= now()`
    //    against Postgres's REAL wall-clock time -- so the lock instant
    //    here must be in the real past, not the synthetic 2098 window.
    // ---------------------------------------------------------------
    await admin.from("lineup_slots").update({ locked_at: new Date(Date.now() - 3_600_000).toISOString() }).eq("roster_entry_id", starterToBench.roster_entry_id).eq("fantasy_round_id", roundId);
    const { error: lockedDropError } = await league.clients[0].rpc("drop_player", { p_league_id: league.leagueId, p_player_id: starterToBench.roster_entries.player_id as unknown as string });
    assert.equal(lockedDropError?.message, "PLAYER_LOCKED");
    const lockedDropCode = toMarketActionError(lockedDropError?.message).code;
    assert.equal(MARKET_ACTION_ERROR_KIND[lockedDropCode], "rule", "a locked-player drop rejection is an expected game-rule outcome, never a red error");

    // ---------------------------------------------------------------
    // 8. Trade: team[1] receives `scoringSubject` from team[0] in
    //    exchange for a SAME-POSITION player of team[1]'s -- a like-for-
    //    like swap can never push either side's position count over its
    //    max, keeping this step independent of the real auto-draft's
    //    exact position distribution.
    // ---------------------------------------------------------------
    const scoringSubjectPosition = (scoringSubject.players as unknown as { position: string }).position;
    const { data: team1EntriesWithPosition } = await admin
      .from("roster_entries")
      .select("id, player_id, players(position)")
      .eq("fantasy_team_id", league.teamIds[1])
      .eq("status", "active");
    const returnEntry = team1EntriesWithPosition!.find((e) => (e.players as unknown as { position: string }).position === scoringSubjectPosition)!;
    assert.ok(returnEntry, "team 1 must have at least one same-position player to trade back");
    const returnPlayerId = returnEntry.player_id;

    const { data: proposed, error: proposeError } = await league.clients[0].rpc("propose_trade", {
      p_league_id: league.leagueId,
      p_receiving_team_id: league.teamIds[1],
      p_offered_player_ids: [scoringSubject.player_id],
      p_requested_player_ids: [returnPlayerId],
    });
    assert.equal(proposeError, null);
    const { error: acceptError } = await league.clients[1].rpc("accept_trade", { p_trade_id: proposed![0]!.trade_id });
    assert.equal(acceptError, null);

    const { data: newEntry } = await admin
      .from("roster_entries")
      .select("id")
      .eq("fantasy_team_id", league.teamIds[1])
      .eq("player_id", scoringSubject.player_id)
      .eq("status", "active")
      .single();

    // ---------------------------------------------------------------
    // 9. Acquisition cutoff: backdate the real acquisition instant to
    //    sit strictly BETWEEN fixture A (pre-acquisition, already
    //    played before the trade) and a new fixture B (post-
    //    acquisition) -- same technique
    //    acquisition-cutoff.integration.test.ts already established.
    //
    //    Note: because fixture A already occurred for this player's
    //    club within the round window, EVERY roster_entry for this
    //    player this round (old or new owner) locks at that same
    //    earliest-in-window kickoff -- `_init_current_round_slot`
    //    always derives from the EARLIEST eligible fixture in the
    //    window, not "earliest after acquisition." So the newly-traded
    //    roster_entry is correctly un-startable for the rest of this
    //    round regardless of who owns it (an intentional anti-gaming
    //    property: trading in a player who already played doesn't let
    //    a new manager retroactively start them). This step therefore
    //    verifies the real points-accounting split directly
    //    (`getRoundPlayerState`, the exact function `refreshMatchupScores`
    //    itself calls), not a live-starter promotion.
    // ---------------------------------------------------------------
    const acquiredAt = new Date(Date.UTC(SYNTHETIC_YEAR, 0, 10));
    await admin.from("roster_entries").update({ acquired_at: acquiredAt.toISOString() }).eq("id", newEntry!.id);

    const postAcquisitionKickoff = new Date(Date.UTC(SYNTHETIC_YEAR, 0, 12));
    const fixtureB = await insertFixture(postAcquisitionKickoff, "final");

    for (const fixtureId of [fixtureA, fixtureB]) {
      const { error: statsError } = await admin.from("player_match_stats").insert({
        player_id: scoringSubject.player_id,
        fixture_id: fixtureId,
        minutes: 90,
        goals: 1,
        assists: 0,
        shots_on_target: 1,
        chances_created: 0,
        tackles: 0,
        interceptions: 0,
        blocks: 0,
        saves: 0,
        yellow_cards: 0,
        red_cards: 0,
        started: true,
      });
      assert.equal(statsError, null, `player_match_stats insert failed: ${statsError?.message}`);
    }
    const subjectBackfill = await backfillScores(admin, { fixtureIds: [fixtureA, fixtureB] });
    assert.equal(subjectBackfill.failed, 0, `scoring must succeed cleanly: ${JSON.stringify(subjectBackfill.errors)}`);
    assert.equal(subjectBackfill.scored, 2);

    const acquiredAtByPlayerId = new Map([[scoringSubject.player_id, acquiredAt.toISOString()]]);
    const roundState = await getRoundPlayerState(
      admin as unknown as Parameters<typeof getRoundPlayerState>[0],
      [scoringSubject.player_id],
      { startsAt: opened.window.startsAt, endsAt: opened.window.endsAt },
      acquiredAtByPlayerId
    );
    assert.ok((roundState.pointsByPlayerId.get(scoringSubject.player_id) ?? 0) > 0, "the post-acquisition performance must count");
    assert.ok((roundState.preAcquisitionPointsByPlayerId.get(scoringSubject.player_id) ?? 0) > 0, "the pre-acquisition performance must remain visible, just excluded");

    // ---------------------------------------------------------------
    // 10. Fixture/stat scoring -> live matchup aggregation, demonstrated
    //     on a real, untouched team-1 starter (unaffected by the trade/
    //     lock nuance above) -- real player_match_stats -> real V3
    //     fantasy_player_scores (backfillScores) -> real
    //     matchup_scores.live_points (refreshMatchupScores).
    // ---------------------------------------------------------------
    const { data: team1RemainingStarters } = await admin
      .from("lineup_slots")
      .select("roster_entry_id, roster_entries!inner(fantasy_team_id, player_id, players(club_id))")
      .eq("fantasy_round_id", roundId)
      .eq("roster_entries.fantasy_team_id", league.teamIds[1])
      .eq("starter", true);
    const team1Starter = team1RemainingStarters![0]!;
    const team1StarterClubId = (team1Starter.roster_entries as unknown as { players: { club_id: string } }).players.club_id;
    const { data: team1StarterOpponent } = await admin.from("clubs").select("id").neq("id", team1StarterClubId).limit(1).single();
    const { data: team1Fixture, error: team1FixtureError } = await admin
      .from("fixtures")
      .insert({
        competition_id: (await admin.from("clubs").select("competition_id").eq("id", team1StarterClubId).single()).data!.competition_id,
        home_club_id: team1StarterClubId,
        away_club_id: team1StarterOpponent!.id,
        kickoff_at: new Date(Date.UTC(SYNTHETIC_YEAR, 0, 9)).toISOString(),
        status: "final",
        season: SYNTHETIC_YEAR,
        home_score: 3,
        away_score: 1,
      })
      .select("id")
      .single();
    assert.equal(team1FixtureError, null);
    insertedFixtureIds.push(team1Fixture!.id);

    const { error: team1StatsError } = await admin.from("player_match_stats").insert({
      player_id: (team1Starter.roster_entries as unknown as { player_id: string }).player_id,
      fixture_id: team1Fixture!.id,
      minutes: 90,
      goals: 2,
      assists: 1,
      shots_on_target: 3,
      chances_created: 1,
      tackles: 0,
      interceptions: 0,
      blocks: 0,
      saves: 0,
      yellow_cards: 0,
      red_cards: 0,
      started: true,
    });
    assert.equal(team1StatsError, null);
    const team1Backfill = await backfillScores(admin, { fixtureIds: [team1Fixture!.id] });
    assert.equal(team1Backfill.failed, 0, `scoring must succeed cleanly: ${JSON.stringify(team1Backfill.errors)}`);

    await refreshMatchupScores(admin, roundId);

    const { data: team1Matchup } = await admin.from("matchups").select("id").eq("fantasy_round_id", roundId).or(`home_fantasy_team_id.eq.${league.teamIds[1]},away_fantasy_team_id.eq.${league.teamIds[1]}`).single();
    const { data: team1Score } = await admin.from("matchup_scores").select("live_points").eq("matchup_id", team1Matchup!.id).eq("fantasy_team_id", league.teamIds[1]).single();
    assert.ok(team1Score!.live_points > 0, "team 1's live matchup total must reflect its starter's real scored performance");

    // ---------------------------------------------------------------
    // 12. Reconciliation: bounded to exactly the fixtures just touched,
    //     never a blind full-league scan, and must not error.
    // ---------------------------------------------------------------
    const reconcileResult = await reconcileFantasyStateForFixtures(admin, [fixtureA, fixtureB, team1Fixture!.id]);
    assert.ok(reconcileResult.roundIds.includes(roundId), "reconciliation must recognize this round as affected");

    // ---------------------------------------------------------------
    // 13. Round transition: both fixtures are final and well past the
    //     post-final reconciliation window, so the round finalizes and
    //     round 2 opens cleanly (a 2-team league's schedule has exactly
    //     2 total rounds).
    // ---------------------------------------------------------------
    const finalizeNow = new Date(Date.UTC(SYNTHETIC_YEAR, 0, 20));
    const finalizeResult = await finalizeRoundIfReady(admin, roundId, finalizeNow);
    assert.equal(finalizeResult.finalized, true, "the round must finalize once every fixture in its window is final and settled");

    const { data: completedRound } = await admin.from("fantasy_rounds").select("status").eq("id", roundId).single();
    assert.equal(completedRound!.status, "completed");

    const { data: finalizedScore } = await admin.from("matchup_scores").select("final_points, live_points").eq("matchup_id", team1Matchup!.id).eq("fantasy_team_id", league.teamIds[1]).single();
    assert.equal(finalizedScore!.final_points, finalizedScore!.live_points, "final_points must be copied from the last-known live_points");

    const round2EnablingKickoff = new Date(Date.UTC(SYNTHETIC_YEAR, 0, 15));
    await insertFixture(round2EnablingKickoff, "scheduled");
    const round2 = await openNextRound(admin, league.leagueId, new Date(Date.UTC(SYNTHETIC_YEAR, 0, 14)));
    assert.ok(round2.ok, `round 2 must open: ${!round2.ok ? round2.error : ""}`);
    if (round2.ok) assert.equal(round2.roundNumber, 2);
  } finally {
    if (insertedFixtureIds.length > 0) {
      await admin.from("fantasy_player_scores").delete().in("fixture_id", insertedFixtureIds);
      await admin.from("player_match_stats").delete().in("fixture_id", insertedFixtureIds);
      await admin.from("fixtures").delete().in("id", insertedFixtureIds);
    }
    await cleanupTestLeague(admin, league);
  }
});
