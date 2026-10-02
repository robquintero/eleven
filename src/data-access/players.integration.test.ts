/**
 * COMMITTED regression test for a real production bug found during Pass
 * 11.5 manual QA: the Players page visibly showed "Points" as the
 * selected/default sort, but the returned rows were NOT actually globally
 * ordered by authoritative season fantasy points.
 *
 * Root cause: the Supabase project caps every unbounded `.select()` at
 * `max_rows` (`supabase/config.toml`, 1000) — PostgREST silently
 * truncates rather than erroring. `queryPlayerDatabase`'s points-sort path
 * fetches every active player's id (2767 at the time this was found,
 * comfortably over the cap) to compute a genuinely global order before
 * paginating; the original implementation ran that fetch as a single
 * unlimited `.select()`, which silently returned only ~1000 of 2767
 * players in effectively arbitrary order, so "sort by points" was only
 * ever correct within whatever arbitrary subset happened to survive the
 * cap. The fix pages through the cap explicitly (`fetchAllRows`, see
 * players.ts) for both the candidate-id query and the points-aggregate
 * query.
 *
 * Uses `queryPlayerDatabase` (the client-injectable core of
 * `getPlayerDatabase`) with the real admin client, since `getPlayerDatabase`
 * itself requires a live Next.js request's cookies and can't be called
 * from a plain script/test. Real data only — no mocked rows — so this
 * exercises the exact same tables/query shape production does. Skips
 * cleanly under plain `npm test` (no `.env.local`); only runs for real
 * under `npm run test:integration`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAdminClient, isSupabaseAdminConfigured } from "../lib/supabase/admin.ts";
import { queryPlayerDatabase } from "./players.ts";
import { SCORING_RULE_VERSION } from "../domain/fantasy/scoring.ts";

const skip = !isSupabaseAdminConfigured();

const CURRENT_SEASON = 2026;

/**
 * Independently computes the true global points ranking directly from the
 * real tables -- deliberately NOT reusing `queryPlayerDatabase`'s own
 * internals, so this test can't pass merely because it shares a bug with
 * the code under test.
 */
async function computeTrueGlobalRanking(admin: ReturnType<typeof createAdminClient>) {
  const idRows: { id: string; name: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await admin
      .from("players")
      .select("id, name")
      .eq("active", true)
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    idRows.push(...data);
    if (data.length < 1000) break;
  }

  const totals = new Map<string, number>();
  for (let from = 0; ; from += 1000) {
    const { data } = await admin
      .from("fantasy_player_scores")
      .select("id, player_id, points, fixtures!inner(season)")
      .eq("scoring_rule_version", SCORING_RULE_VERSION)
      .eq("fixtures.season", CURRENT_SEASON)
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    for (const row of data) totals.set(row.player_id, (totals.get(row.player_id) ?? 0) + row.points);
    if (data.length < 1000) break;
  }

  return [...idRows]
    .sort((a, b) => {
      const pointsA = Math.round((totals.get(a.id) ?? 0) * 100) / 100;
      const pointsB = Math.round((totals.get(b.id) ?? 0) * 100) / 100;
      if (pointsB !== pointsA) return pointsB - pointsA;
      return a.name.localeCompare(b.name);
    })
    .map((row) => ({ id: row.id, name: row.name, points: Math.round((totals.get(row.id) ?? 0) * 100) / 100 }));
}

test("points sort is globally correct across the entire active player set, not just the first max_rows-capped batch", { skip }, async () => {
  const admin = createAdminClient();
  const trueRanking = await computeTrueGlobalRanking(admin);
  assert.ok(trueRanking.length > 1000, "this regression test requires more active players than the max_rows cap to be meaningful");

  const page1 = await queryPlayerDatabase(admin, { sort: "points", page: 1, pageSize: 10 });
  assert.equal(page1.total, trueRanking.length);

  const expectedPage1Ids = trueRanking.slice(0, 10).map((r) => r.id);
  const actualPage1Ids = page1.players.map((p) => p.id);
  assert.deepEqual(
    actualPage1Ids,
    expectedPage1Ids,
    "page 1 must be the TRUE top 10 by points across all active players -- this is exactly the bug: a cap-truncated candidate set silently produced a different, wrong 'top 10'"
  );

  // The single highest scorer in the whole dataset must be exactly who
  // production shows first -- the most direct, human-checkable assertion
  // of "the control says Points and the list is actually ordered by it."
  assert.equal(page1.players[0]!.totalPoints, trueRanking[0]!.points);
});

test("points sort pagination is globally monotonic -- no player on a later page ever outscores one on an earlier page", { skip }, async () => {
  const admin = createAdminClient();
  const page1 = await queryPlayerDatabase(admin, { sort: "points", page: 1, pageSize: 25 });
  const page2 = await queryPlayerDatabase(admin, { sort: "points", page: 2, pageSize: 25 });

  assert.equal(page1.total, page2.total);
  const page1Ids = new Set(page1.players.map((p) => p.id));
  for (const player of page2.players) {
    assert.ok(!page1Ids.has(player.id), "pages must never overlap");
  }

  const lastOfPage1 = page1.players.at(-1)?.totalPoints ?? 0;
  const firstOfPage2 = page2.players[0]?.totalPoints ?? 0;
  assert.ok(
    firstOfPage2 <= lastOfPage1,
    `page 2's first player (${firstOfPage2} pts) must never outscore page 1's last player (${lastOfPage1} pts)`
  );

  // Within each page, points must be non-increasing (descending order).
  for (const page of [page1, page2]) {
    for (let i = 1; i < page.players.length; i++) {
      const prev = page.players[i - 1]!.totalPoints ?? 0;
      const curr = page.players[i]!.totalPoints ?? 0;
      assert.ok(curr <= prev, `row ${i} (${curr} pts) must not outscore row ${i - 1} (${prev} pts)`);
    }
  }
});

test("points sort composes correctly with a position filter -- every returned player matches the filter and the subset is still points-descending", { skip }, async () => {
  const admin = createAdminClient();
  const result = await queryPlayerDatabase(admin, { sort: "points", position: "GK", page: 1, pageSize: 15 });

  assert.ok(result.players.length > 0, "expected at least one goalkeeper in real data");
  for (const player of result.players) {
    assert.equal(player.position, "GK");
  }
  for (let i = 1; i < result.players.length; i++) {
    const prev = result.players[i - 1]!.totalPoints ?? 0;
    const curr = result.players[i]!.totalPoints ?? 0;
    assert.ok(curr <= prev, "goalkeeper subset must still be points-descending");
  }
});

test("name sort (A-Z) and club sort still work unchanged", { skip }, async () => {
  const admin = createAdminClient();

  const byName = await queryPlayerDatabase(admin, { sort: "name", page: 1, pageSize: 10 });
  for (let i = 1; i < byName.players.length; i++) {
    assert.ok(
      byName.players[i - 1]!.name.localeCompare(byName.players[i]!.name) <= 0,
      "name sort must be ascending"
    );
  }

  const byClub = await queryPlayerDatabase(admin, { sort: "club", page: 1, pageSize: 10 });
  for (let i = 1; i < byClub.players.length; i++) {
    assert.ok(
      byClub.players[i - 1]!.club.shortName.localeCompare(byClub.players[i]!.club.shortName) <= 0,
      "club sort must be ascending by club short name"
    );
  }
});

/**
 * Regression test for the production incident where `player_national_teams`
 * (added by the international-scoring migration) gave PostgREST two
 * relationship paths between `players` and `clubs` (the direct
 * `players.club_id` FK, and the new many-to-many via
 * `player_national_teams`), which made every unqualified `clubs(...)`
 * embed under `players` fail with `PGRST201` -- silently turning the
 * entire 2,767-player catalog into "0 PLAYERS" for every caller, logged
 * in or not. The fix is the explicit `clubs!players_club_id_fkey(...)`
 * hint in `queryPlayerDatabase`'s two select strings. This test exists so
 * that if that hint is ever removed (or a future relationship introduces
 * the same ambiguity again), this test fails loudly instead of the
 * catalog silently going empty in production.
 */
test("queryPlayerDatabase resolves the canonical (players.club_id) club, never ambiguously, even when the player also has a player_national_teams association", { skip }, async () => {
  const admin = createAdminClient();
  const { data: realPlayer } = await admin.from("players").select("id, name, club_id").eq("active", true).limit(1).single();
  assert.ok(realPlayer, "a real active player must exist to test with");
  const { data: realClub } = await admin.from("clubs").select("id, short_name").eq("id", realPlayer!.club_id).single();

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

  try {
    const { error: assocError } = await admin
      .from("player_national_teams")
      .insert({ player_id: realPlayer!.id, national_team_club_id: nationalTeam!.id });
    assert.equal(assocError, null);

    const result = await queryPlayerDatabase(admin, { query: realPlayer!.name, page: 1, pageSize: 10 });
    assert.ok(result.players.length > 0, "the player search must not silently return empty (the PGRST201 regression)");

    const found = result.players.find((p) => p.id === realPlayer!.id);
    assert.ok(found, "the player must still be found by name search");
    assert.equal(found!.club.id, realClub!.id, "the resolved club must be the player's REAL club (players.club_id), never the national team");
    assert.equal(found!.club.shortName, realClub!.short_name);

    await admin.from("player_national_teams").delete().eq("player_id", realPlayer!.id).eq("national_team_club_id", nationalTeam!.id);
  } finally {
    await admin.from("clubs").delete().eq("id", nationalTeam!.id);
  }
});
