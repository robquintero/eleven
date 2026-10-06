import { test } from "node:test";
import assert from "node:assert/strict";
import { getCatalogScoringVersion } from "./catalog-version.ts";
import { getAffectedScoringVersions } from "./affected-versions.ts";
import { getFantasyScoreAggregates, queryPlayerDatabase } from "../../data-access/players.ts";
import { queryHotFreeAgents } from "../../data-access/intelligence.ts";
import { testClient, result, filter } from "../performance/test-client.ts";

test("catalog selector reads one no-argument authoritative policy; unknown/missing/error fails closed", async () => {
  for (const version of ["ELEVEN_STANDARD_V1", "ELEVEN_STANDARD_V2", "ELEVEN_STANDARD_V3", "ELEVEN_STANDARD_V4"] as const) {
    const { client, calls } = testClient(q => { assert.equal(q.table, "get_catalog_scoring_version"); assert.equal(q.payload, undefined); return result(version); });
    assert.equal(await getCatalogScoringVersion(client), version);
    assert.equal(calls.length, 1);
  }
  for (const bad of [null, "ELEVEN_STANDARD_V5", ["ELEVEN_STANDARD_V4"]]) {
    await assert.rejects(getCatalogScoringVersion(testClient(() => result(bad)).client), /Unknown scoring version/);
  }
  await assert.rejects(getCatalogScoringVersion(testClient(() => ({ data: null, error: { message: "unavailable" } })).client), /Cannot resolve catalog/);
});

test("Players and free-agent ranking/Inspector context follow V3 then V4; zero/negative points and no-score stay distinct", async () => {
  for (const version of ["ELEVEN_STANDARD_V3", "ELEVEN_STANDARD_V4"] as const) {
    const p = { id: "p", name: "Player", position: "MID", club_id: "club", active: true, clubs: { id: "club", name: "Club", short_name: "CLB", competitions: { code: "ENG" } } };
    const { client, calls } = testClient(q => {
      if (q.table === "get_catalog_scoring_version") return result(version);
      if (q.table === "get_player_score_totals") { assert.equal((q.payload as { p_version: string }).p_version, version); return result([{ player_id: "p", total_points: version === "ELEVEN_STANDARD_V4" ? 0 : -0.75, appearances: 2 }]); }
      if (q.table === "players") return result(q.selection === "id, name, club_id" ? [p] : q.selection?.includes("clubs") ? [p] : []);
      if (["league_player_ownership", "fixtures", "player_match_stats", "player_national_teams"].includes(q.table)) return result([]);
      throw new Error(`Unexpected ${q.table}`);
    });
    const catalog = await queryPlayerDatabase(client, { sort: "points" }, null);
    assert.equal(catalog.players[0].scoringRuleVersion, version);
    assert.equal(catalog.players[0].totalPoints, version === "ELEVEN_STANDARD_V4" ? 0 : -0.75);
    const free = await queryHotFreeAgents(client, "league", 1);
    assert.equal(free[0].player.scoringRuleVersion, version);
    assert.equal(free[0].player.averagePoints, version === "ELEVEN_STANDARD_V4" ? 0 : -0.37);
    assert.equal(calls.filter(q => q.table === "get_catalog_scoring_version").length, 2, "one selector per core call outside RSC cache");
    assert.equal(calls.filter(q => q.table === "get_player_score_totals").length, 3, "page enrichment reuses ranking map");
  }
});

test("active V4 catalog corrections respect unfinished pins; explicit historical reads never query catalog", async () => {
  const { client, calls } = testClient(q => {
    if (q.table === "get_catalog_scoring_version") return result("ELEVEN_STANDARD_V4");
    if (q.table === "fixtures") return result([{ kickoff_at: "2026-10-07T00:00:00Z" }]);
    if (q.table === "fantasy_rounds") return result([{ starts_at: "2026-10-06T00:00:00Z", ends_at: "2026-10-13T00:00:00Z", scoring_rule_version: "ELEVEN_STANDARD_V3" }]);
    if (q.table === "get_player_score_totals") { assert.equal((q.payload as { p_version: string }).p_version, "ELEVEN_STANDARD_V3"); return result([]); }
    throw new Error(`Unexpected ${q.table}`);
  });
  assert.deepEqual(await getAffectedScoringVersions(client, ["fixture"]), ["ELEVEN_STANDARD_V4", "ELEVEN_STANDARD_V3"]);
  const before = calls.length;
  await getFantasyScoreAggregates(client, ["p"], "ELEVEN_STANDARD_V3");
  assert.equal(calls.length, before + 1);
  assert.equal(filter(calls[before], "scoring_rule_version"), undefined); // RPC carries explicit version in arguments.
});

test("recent-form recommendations use the same active policy as their displayed season totals", async () => {
  for (const version of ["ELEVEN_STANDARD_V3", "ELEVEN_STANDARD_V4"] as const) {
    const { client } = testClient(q => {
      if (q.table === "get_catalog_scoring_version") return result(version);
      if (q.table === "league_player_ownership") return result([]);
      if (q.table === "fixtures") return result([{ id: "a", kickoff_at: new Date(Date.now()-86400000).toISOString() }, { id: "b", kickoff_at: new Date(Date.now()-2*86400000).toISOString() }]);
      if (q.table === "fantasy_player_scores") { assert.equal(filter(q,"scoring_rule_version"),version); return result([{ player_id:"p",fixture_id:"a",points:7 },{ player_id:"p",fixture_id:"b",points:3 }]); }
      if (q.table === "get_player_score_totals") { assert.equal((q.payload as {p_version:string}).p_version,version); return result([{player_id:"p",total_points:10,appearances:2}]); }
      if (q.table === "players") return result([{id:"p",name:"Player",position:"MID",active:true,club_id:"club",clubs:null}]);
      throw new Error(`Unexpected ${q.table}`);
    });
    const [candidate] = await queryHotFreeAgents(client,"league",1);
    assert.equal(candidate.basis,"recent-form");
    assert.equal(candidate.recentAveragePoints,5);
    assert.equal(candidate.player.scoringRuleVersion,version);
    assert.deepEqual(candidate.player.recentForm,[3,7]);
  }
});
