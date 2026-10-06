import { SCORING_RULE_VERSION } from "../domain/fantasy/scoring.ts";
/**
 * Pass 14.5 regression coverage for `getRoundPlayerState` (the shared
 * "real round-scoped points + real fixture/lock display state" lookup
 * extracted from `queryMatchupSquads` and reused by `querySquad`,
 * src/data-access/roster.ts -- see that function's own doc comment).
 *
 * Before this pass, `querySquad` (Home's Starting XI, the Team page)
 * never called this lookup at all: every player always showed
 * `fantasyPoints: 0` and no `fixture`, regardless of real locked/live/
 * final state. These tests prove the fix end to end against the real
 * database, covering:
 *   - a STARTER's real round points + a FINAL fixture state (CASE C/G)
 *   - a BENCH player ALSO gets real fixture/lock state, not just starters
 *     (CASE B) -- `lineup_slots` rows exist for bench entries too
 *   - LIVE and FINAL are visually distinct states, both correctly
 *     "locked" per `isPlayerLocked` (CASE F)
 *   - a manually non-canonical (not Tuesday-aligned) round window still
 *     derives correctly, proving neither `querySquad` nor
 *     `getRoundPlayerState` special-cases the standard Tue-Mon calendar
 *     or any particular league (CASE I)
 *
 * Direct DB setup (season/round/matchup/lineup_slots), same lightweight
 * pattern `reconciliation.integration.test.ts` uses -- `querySquad`'s
 * contract only cares about real `fantasy_rounds`/`lineup_slots`/
 * `fantasy_player_scores` rows, never how they were created.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAdminClient, isSupabaseAdminConfigured } from "../lib/supabase/admin.ts";
import { createTestLeague, cleanupTestLeague } from "../lib/fantasy-engine/integration-test-helpers.ts";
import { backfillScores } from "../lib/scoring/backfill.ts";
import { querySquad } from "./roster.ts";
import { isPlayerLocked } from "../lib/team-fixture.ts";

const skip = !isSupabaseAdminConfigured();

test("querySquad: starter shows real round points + FINAL state, bench shows real LIVE lock state, under a manually non-canonical round window", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 4);
  try {
    const { data: comp } = await admin.from("competitions").select("id").eq("code", "ENG").limit(1).single();
    const competitionId = comp!.id;

    // Two real players on two real, distinct clubs -- a starter and a bench player.
    const { data: candidates } = await admin
      .from("players")
      .select("id, club_id")
      .eq("active", true)
      .not("club_id", "is", null)
      .limit(50);
    const byClub = new Map<string, string>(); // club_id -> player_id, first seen
    for (const p of candidates ?? []) {
      if (!byClub.has(p.club_id)) byClub.set(p.club_id, p.id);
      if (byClub.size >= 2) break;
    }
    const [[clubA, starterPlayerId], [clubB, benchPlayerId]] = Array.from(byClub.entries());
    assert.ok(starterPlayerId && benchPlayerId, "need two real players on two distinct real clubs");

    const { data: clubARow } = await admin.from("clubs").select("competition_id").eq("id", clubA).single();
    const { data: thirdClub } = await admin
      .from("clubs")
      .select("id")
      .eq("competition_id", clubARow!.competition_id)
      .not("id", "in", `(${clubA},${clubB})`)
      .limit(1)
      .single();
    const clubC = thirdClub!.id;

    // sign both real players onto team 0
    for (const playerId of [starterPlayerId, benchPlayerId]) {
      const { error } = await league.clients[0].rpc("sign_player", { p_league_id: league.leagueId, p_player_id: playerId });
      assert.equal(error, null);
    }

    // Pass 14.6: `sign_player` always sets `roster_entries.acquired_at` to
    // the REAL current time -- backdated here (a direct, after-the-fact
    // test-data adjustment, same convention as manually setting
    // `locked_at` elsewhere in this suite) so these 2015-windowed
    // synthetic performances aren't excluded by the new "no retroactive
    // point inheritance" acquisition cutoff this test isn't about.
    await admin
      .from("roster_entries")
      .update({ acquired_at: "2015-01-01T00:00:00Z" })
      .eq("fantasy_team_id", league.teamIds[0])
      .in("player_id", [starterPlayerId, benchPlayerId]);

    // Deliberately NON-canonical window: Wednesday noon -> Sunday noon,
    // nowhere near a Tuesday 06:00 UTC boundary -- proves no code here
    // assumes/relies on the standard calendar alignment. Set safely in
    // the real PAST (unlike this suite's usual isolatedWindow(2090+) --
    // the `locked`/`isPlayerLocked` booleans this test asserts on are
    // genuinely wall-clock-relative, unlike `fixture.state`, which is
    // read straight off the stored fixture status) and well before any
    // real seed fixture data (earliest real stored fixture is 2023-09),
    // so no real production fixture can ever collide with these synthetic ones.
    const windowStart = new Date("2015-03-04T12:00:00Z"); // a Wednesday
    const windowEnd = new Date("2015-03-08T12:00:00Z"); // the following Sunday

    const { data: season } = await admin
      .from("seasons")
      .insert({ league_id: league.leagueId, season_number: 1, status: "ACTIVE", schedule_cycles: 2 })
      .select("id")
      .single();
    const { data: round } = await admin
      .from("fantasy_rounds")
      .insert({
        league_id: league.leagueId,
        season_id: season!.id,
        number: 1,
        starts_at: windowStart.toISOString(),
        ends_at: windowEnd.toISOString(),
        status: "in_progress",
      })
      .select("id")
      .single();
    const roundId = round!.id;

    // Starter's fixture: clubA vs clubB, FINAL, inside the window.
    const { data: finalFixture } = await admin
      .from("fixtures")
      .insert({
        competition_id: competitionId,
        home_club_id: clubA,
        away_club_id: clubB,
        kickoff_at: new Date(windowStart.getTime() + 1 * 86_400_000).toISOString(),
        status: "final",
        season: 2026,
      })
      .select("id")
      .single();
    await admin.from("player_match_stats").insert({ player_id: starterPlayerId, fixture_id: finalFixture!.id, minutes: 90, goals: 1 });

    // Bench player's fixture: clubB vs clubC, LIVE, later in the same window.
    const { data: liveFixture } = await admin
      .from("fixtures")
      .insert({
        competition_id: competitionId,
        home_club_id: clubB,
        away_club_id: clubC,
        kickoff_at: new Date(windowStart.getTime() + 2 * 86_400_000).toISOString(),
        status: "live",
        season: 2026,
      })
      .select("id")
      .single();
    await admin.from("player_match_stats").insert({ player_id: benchPlayerId, fixture_id: liveFixture!.id, minutes: 45 });

    const backfillResult = await backfillScores(admin, { scoringRuleVersion: SCORING_RULE_VERSION, fixtureIds: [finalFixture!.id, liveFixture!.id] });
    assert.equal(backfillResult.failed, 0, backfillResult.errors.join("; "));

    const { data: starterRosterEntry } = await admin.from("roster_entries").select("id").eq("fantasy_team_id", league.teamIds[0]).eq("player_id", starterPlayerId).single();
    const { data: benchRosterEntry } = await admin.from("roster_entries").select("id").eq("fantasy_team_id", league.teamIds[0]).eq("player_id", benchPlayerId).single();

    const pastLock = new Date(windowStart.getTime() + 1 * 86_400_000).toISOString();
    await admin.from("lineup_slots").upsert(
      { roster_entry_id: starterRosterEntry!.id, fantasy_round_id: roundId, slot: "MID", starter: true, locked_at: pastLock },
      { onConflict: "roster_entry_id,fantasy_round_id" }
    );
    const benchLock = new Date(windowStart.getTime() + 2 * 86_400_000).toISOString();
    await admin.from("lineup_slots").upsert(
      { roster_entry_id: benchRosterEntry!.id, fantasy_round_id: roundId, slot: "BENCH", starter: false, locked_at: benchLock },
      { onConflict: "roster_entry_id,fantasy_round_id" }
    );

    const squad = await querySquad(admin, league.leagueId, league.teamIds[0]);

    // CASE C: the starter's real round points are populated (never 0 by default).
    const starterSlot = squad.starters.find((s) => s.player.id === starterPlayerId);
    assert.ok(starterSlot, "the starter must appear in squad.starters");
    assert.ok(starterSlot!.player.fantasyPoints > 0, "a real goal-scoring performance must produce real, nonzero round points");

    // CASE G/F: a FINAL fixture renders as "final", not "locked" or "upcoming" -- and is still correctly locked.
    assert.equal(starterSlot!.player.fixture?.state, "final");
    assert.equal(isPlayerLocked(starterSlot!.player), true);
    assert.equal(starterSlot!.locked, true);

    // CASE B: a BENCH player ALSO gets real fixture/lock state -- not just starters.
    const benchPlayer = squad.bench.find((p) => p.id === benchPlayerId);
    assert.ok(benchPlayer, "the bench player must appear in squad.bench");
    assert.equal(benchPlayer!.fixture?.state, "live", "a bench player's own real fixture state (LIVE) must be visible, never defaulted away");
    assert.equal(isPlayerLocked(benchPlayer!), true, "a bench player whose own fixture has kicked off is locked too, even though bench points never contribute to the matchup total");
    assert.ok(typeof benchPlayer!.fantasyPoints === "number", "bench fantasyPoints is always a real number, never undefined");

    // CASE I: all of the above worked under a deliberately non-canonical
    // (non-Tuesday-aligned) round window -- no special-casing of the
    // standard calendar or of any specific league was needed anywhere in
    // this path for it to derive correctly.

    // Pass 14.6: explicit cleanup of the two fixtures (+ their stats) this
    // test inserts directly into real clubs' fixture history -- the 2015
    // window already makes a collision with any real round impossible, but
    // leaving them in place with no cleanup is still real-table bloat on
    // every run (found live: a sibling file's own missing-window-isolation
    // version of this mistake leaked real "final" fixtures into a real
    // league's actual round, see international-scoring.integration.test.ts's
    // GATE 6 fix this same pass).
    await admin.from("fantasy_player_scores").delete().in("fixture_id", [finalFixture!.id, liveFixture!.id]);
    await admin.from("player_match_stats").delete().in("fixture_id", [finalFixture!.id, liveFixture!.id]);
    await admin.from("fixtures").delete().in("id", [finalFixture!.id, liveFixture!.id]);
  } finally {
    await cleanupTestLeague(admin, league);
  }
});
