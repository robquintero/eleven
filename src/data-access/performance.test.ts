import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { createRequire } from "node:module";
import { testClient, result, filter, type RecordedQuery } from "../lib/performance/test-client.ts";
import { getFantasyScoreAggregates, queryPlayerDatabase, queryPlayerIdentityMatches } from "./players.ts";
import { getRoundPlayerState, queryMatchupSquads, queryMatchupStatusStarters, type CurrentMatchup } from "./matchups.ts";
import { querySquad, queryLeagueRosterPlayersByTeam } from "./roster.ts";
import { queryDraftUpdate } from "./drafts.ts";
import { currentDraftUpdate } from "../lib/draft-snapshot.ts";
import { updateLineup, LINEUP_ERROR_KIND } from "../lib/fantasy-engine/lineup.ts";
import { queryHotFreeAgents } from "./intelligence.ts";

const start = "2026-10-06T00:00:00Z", end = "2026-10-13T00:00:00Z";
const window = { startsAt: new Date(start), endsAt: new Date(end) };
const player = { id: "p", name: "Player", short_name: "P", position: "DEF", club_id: "club", clubs: { id: "club", name: "Club", short_name: "CLB", competition_id: "comp", competitions: { code: "ENG" } } };
const matchup: CurrentMatchup = { id: "matchup", roundId: "round", roundNumber: 1, roundStartsAt: start, roundEndsAt: end, roundStatus: "in_progress", status: "live", homeFantasyTeamId: "mine", awayFantasyTeamId: "other", homeTeamName: "Mine", awayTeamName: "Other", homeLivePoints: 2, awayLivePoints: 0, homeFinalPoints: null, awayFinalPoints: null, scoresUpdatedAt: null, isUserHome: true };
const fixtures = [
  { id: "f1", kickoff_at: "2026-10-07T12:00:00Z", home_club_id: "national", away_club_id: "opponent", status: "final", competitions: { code: "UEFA_NL" } },
  { id: "f2", kickoff_at: "2026-10-08T12:00:00Z", home_club_id: "club", away_club_id: "opponent", status: "live", competitions: { code: "ENG" } },
];
function roundResponder(q: RecordedQuery) {
  if (q.table === "fixtures") {
    assert.equal(filter(q, "kickoff_at"), window.startsAt.toISOString());
    assert.equal(q.filters.find((f) => f.method === "lt")?.value, window.endsAt.toISOString());
    return result(fixtures);
  }
  if (q.table === "players") return result((filter(q, "id") as string[]).map((id) => ({ id, club_id: id === "p" ? "club" : "oldClub" })));
  if (q.table === "player_national_teams") return result((filter(q, "player_id") as string[]).map((player_id) => ({ player_id, national_team_club_id: player_id === "p" ? "national" : "oldNational" })));
  if (q.table === "clubs") return result([{ id: "club", short_name: "CLB" }, { id: "national", short_name: "NAT" }, { id: "opponent", short_name: "OPP" }]);
  if (q.table === "fantasy_player_scores") return result([{ player_id: "p", fixture_id: "f1", points: 9 }, { player_id: "p", fixture_id: "f2", points: 2 }]);
  throw new Error(`Unexpected ${q.table}`);
}

test("round enrichment preserves international membership, acquisition cutoff, live priority and version; six reads", async () => {
  const { client, calls } = testClient(roundResponder);
  const state = await getRoundPlayerState(client, ["p"], window, new Map([["p", "2026-10-08T12:00:00Z"]]));
  assert.equal(state.pointsByPlayerId.get("p"), 2);
  assert.equal(state.preAcquisitionPointsByPlayerId.get("p"), 9);
  assert.deepEqual(state.teamIdsByPlayerId.get("p"), ["club", "national"]);
  assert.equal(state.fixtureByPlayerId.get("p")?.state, "live");
  assert.equal(calls.length, 6);
  assert.equal(filter(calls.find((q) => q.table === "fantasy_player_scores")!, "scoring_rule_version"), "ELEVEN_STANDARD_V3");
});
test("squad slots start while score enrichment is still pending", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const { client, calls } = testClient(async (q) => {
    if (q.table === "roster_entries") return result([{ id: "entry", player_id: "p", acquired_at: start, players: player }]);
    if (q.table === "fantasy_rounds") return result({ id: "round", starts_at: start, ends_at: end });
    if (q.table === "lineup_slots") return result([{ roster_entry_id: "entry", starter: true, locked_at: null }]);
    if (q.table === "fantasy_player_scores") await gate;
    return roundResponder(q);
  });
  const read = querySquad(client, "league", "mine");
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.ok(calls.some((q) => q.table === "fantasy_player_scores"));
  assert.ok(calls.some((q) => q.table === "lineup_slots"), "slots cannot wait for the score branch");
  release();
  const squad = await read;
  assert.equal(squad.starters[0].player.fantasyPoints, 11);
  assert.equal(calls.length, 9);
});
test("shell summary agrees with matchup starters and omits scores and opponent reads", async () => {
  const responder = (q: RecordedQuery) => {
    if (q.table === "roster_entries") return result([{ player_id: "p", acquired_at: start }]);
    if (q.table === "lineup_slots") return result(filter(q, "roster_entries.fantasy_team_id") === "mine" ? [
      { roster_entry_id: "entry", starter: true, locked_at: null, roster_entries: { id: "entry", player_id: "p", status: "active", players: player } },
      { roster_entry_id: "old", starter: true, locked_at: "2000-01-01T00:00:00Z", roster_entries: { id: "old", player_id: "old", status: "dropped", players: { ...player, id: "old" } } },
      { roster_entry_id: "stale", starter: true, locked_at: "2090-01-01T00:00:00Z", roster_entries: { id: "stale", player_id: "stale", status: "dropped", players: { ...player, id: "stale" } } },
    ] : []);
    return roundResponder(q);
  };
  const full = testClient(responder), summary = testClient(responder);
  const squads = await queryMatchupSquads(full.client, matchup);
  const starters = await queryMatchupStatusStarters(summary.client, matchup);
  assert.equal(starters.length, 2, "retain locked historical starters, omit stale unlocked entries");
  assert.deepEqual(squads.teamIdsByPlayerId.get("old"), ["oldClub", "oldNational"], "historical international participation must remain correct");
  assert.deepEqual(starters.map((s) => ({ id: s.id, locked: s.locked, fixture: s.player.fixture })), squads.home.starters.map((s) => ({ id: s.id, locked: s.locked, fixture: s.player.fixture })));
  assert.equal(summary.calls.length, 5);
  assert.ok(summary.calls.every((q) => q.table !== "fantasy_player_scores" && filter(q, "roster_entries.fantasy_team_id") !== "other"));
});
test("aggregate pagination is complete, keeps JS negative-half rounding, and fails closed", async () => {
  const rows = Array.from({ length: 1001 }, (_, i) => ({ player_id: `p${i}`, total_points: -0.75, appearances: 2 }));
  const { client, calls } = testClient((q) => {
    assert.equal(q.table, "get_player_score_totals");
    assert.deepEqual(q.payload, { p_season: 2026, p_version: "ELEVEN_STANDARD_V3" });
    return result(rows.slice(q.range![0], q.range![1] + 1));
  });
  const scores = await getFantasyScoreAggregates(client);
  assert.equal(scores.size, 1001);
  assert.equal(scores.get("p1000")?.averagePoints, -0.37);
  assert.equal(calls.length, 2);
  const failed = testClient(() => ({ data: null, error: { message: "RPC unavailable" } }));
  await assert.rejects(getFantasyScoreAggregates(failed.client), /RPC unavailable/);
});
test("Home season-total ties use immutable identity regardless of raw-score or RPC traversal order", async () => {
  for (const ids of [["b", "a", "owned"], ["owned", "a", "b"]]) {
    const { client } = testClient((q) => {
      if (q.table === "league_player_ownership") return result([{ player_id: "owned" }]);
      if (q.table === "fixtures") return result([]);
      if (q.table === "get_player_score_totals") return result(ids.map((player_id) => ({ player_id, total_points: 10, appearances: 2 })));
      if (q.table === "players") return result((filter(q, "id") as string[]).map((id) => ({ ...player, id, active: true })));
      throw new Error(`Unexpected ${q.table}`);
    });
    const chosen = await queryHotFreeAgents(client, "league", 1);
    assert.equal(chosen[0].player.id, "a");
    assert.equal(chosen[0].basis, "season-total");
  }
});
test("points order spans the row cap, keeps tied-name ordering, pagination and league ownership", async () => {
  const candidates = Array.from({ length: 1001 }, (_, i) => ({ ...player, id: `p${i}`, name: i === 999 ? "Zulu" : i === 1000 ? "Alpha" : `Player ${i}` }));
  const { client, calls } = testClient((q) => {
    if (q.table === "league_player_ownership") return result(filter(q, "league_id") === "a" ? [{ player_id: "p1000", fantasy_team_id: "mine" }] : [{ player_id: "p999", fantasy_team_id: "other" }]);
    if (q.table === "fantasy_teams") return result({ id: "mine" });
    if (q.table === "get_player_score_totals") return result([{ player_id: "p999", total_points: 20, appearances: 2 }, { player_id: "p1000", total_points: 20, appearances: 2 }, { player_id: "p2", total_points: -0.75, appearances: 2 }]);
    if (q.table === "players" && q.selection === "id, name, club_id") return result(candidates.slice(q.range![0], q.range![1] + 1));
    if (q.table === "players" && q.selection?.includes("clubs")) return result(candidates.filter((p) => (filter(q, "id") as string[]).includes(p.id)).reverse());
    if (["player_match_stats", "players", "player_national_teams"].includes(q.table)) return result([]);
    throw new Error(`Unexpected ${q.table}`);
  });
  const first = await queryPlayerDatabase(client, { sort: "points", pageSize: 1, activeLeagueId: "a" }, { id: "user-a" });
  const second = await queryPlayerDatabase(client, { sort: "points", pageSize: 1, page: 2, activeLeagueId: "b" }, { id: "user-b" });
  assert.equal(first.total, 1001);
  assert.equal(first.players[0].id, "p1000");
  assert.equal(first.players[0].ownership, "mine");
  assert.equal(second.players[0].id, "p999");
  assert.equal(second.players[0].ownership, "owned");
  assert.equal(calls.filter((q) => q.table === "get_player_score_totals").length, 2, "one global aggregate per call; page enrichment must reuse it");
  const last = await queryPlayerDatabase(client, { sort: "points", pageSize: 1, page: 1001 }, null);
  assert.equal(last.players[0].id, "p2", "negative points sort below the unchanged zero/no-score key");
  assert.equal(last.players[0].ownership, undefined, "catalog ownership must not survive leaving league context");
  assert.ok(calls.every((q) => q.table !== "fantasy_player_scores"));
});
test("command identity search uses two compact reads, normalized club/name matching, no ranking", async () => {
  const { client, calls } = testClient((q) => result(q.table === "clubs" ? [{ id: "club" }] : [{ ...player, clubs: { short_name: "CLB" } }]));
  const hits = await queryPlayerIdentityMatches(client, "München");
  assert.equal(calls.length, 2);
  assert.match(String(calls[1].filters.find((f) => f.method === "or")?.value), /munchen/i);
  assert.deepEqual(calls[1].orders, ["name", "id"]);
  assert.equal(calls[1].limit, 6);
  assert.equal(hits[0].clubShortName, "CLB");
});
test("draft polling reads only changing state, keeps timer/turn, isolates league ownership and rejects stale snapshots", async () => {
  const { client, calls } = testClient((q) => {
    if (q.table === "drafts") return result({ id: "draft", status: "in_progress", current_round: 1, current_pick: 1, current_pick_started_at: start });
    if (q.table === "fantasy_leagues") return result({ settings: { squadSize: 16, pickTimerSeconds: 30 } });
    if (q.table === "draft_orders") return result([{ position: 1, fantasy_teams: { id: "mine", name: "Mine", abbreviation: "M" } }, { position: 2, fantasy_teams: { id: "other", name: "Other", abbreviation: "O" } }]);
    if (q.table === "draft_picks") return result([]);
    if (q.table === "fantasy_teams") return result({ id: "mine" });
    if (q.table === "league_player_ownership") { assert.equal(filter(q, "league_id"), "league"); return result([{ player_id: "p", fantasy_team_id: "mine" }]); }
    throw new Error(`Static catalog must not load during a poll: ${q.table}`);
  });
  const update = await queryDraftUpdate(client, "league", { id: "user" });
  assert.equal(calls.length, 6);
  assert.equal(update.draft?.isMyTurn, true);
  assert.equal(update.draft?.pickDeadline, "2026-10-06T00:00:30.000Z");
  assert.deepEqual(update.ownership, { p: "mine" });
  assert.equal(currentDraftUpdate(update.draft!, update), update);
  assert.equal(currentDraftUpdate({ ...update.draft!, draftId: "new-draft" }, update), null);
  assert.equal(currentDraftUpdate({ ...update.draft!, status: "completed" }, update), null);
  assert.equal(currentDraftUpdate(update.draft!, { ...update, draft: { ...update.draft!, status: "scheduled" } }), null);
  const failed = testClient((q) => q.table === "drafts" ? result(null) : { data: null, error: { message: "ownership failed" } });
  await assert.rejects(queryDraftUpdate(failed.client, "league", null), /ownership failed/);
  const incomplete = testClient((q) => {
    if (q.table === "drafts") return result({ id: "draft", status: "in_progress", current_round: 1, current_pick: 2 });
    if (q.table === "draft_picks") return { data: null, error: { message: "picks unavailable" } };
    return result(q.table === "fantasy_leagues" ? { settings: {} } : []);
  });
  await assert.rejects(queryDraftUpdate(incomplete.client, "league", null), /picks unavailable/);
});
test("trade composition batches all teams, respects league and pages without dropping choices", async () => {
  const rows = Array.from({ length: 1001 }, (_, i) => ({ fantasy_team_id: i < 500 ? "mine" : "other", players: { id: `p${i}`, name: `P${i}`, position: "MID" } }));
  const { client, calls } = testClient((q) => {
    assert.equal(q.table, "roster_entries");
    assert.equal(filter(q, "league_id"), "league");
    assert.equal(filter(q, "status"), "active");
    return result(rows.slice(q.range![0], q.range![1] + 1));
  });
  const rosters = await queryLeagueRosterPlayersByTeam(client, "league");
  assert.equal(rosters.mine.length, 500);
  assert.equal(rosters.other.length, 501);
  assert.equal(calls.length, 2);
});
test("lineup persistence issues exactly one RPC and retains stable engine error codes", async () => {
  for (const code of [null, ...Object.keys(LINEUP_ERROR_KIND), "unexpected database failure"]) {
    const { client, calls } = testClient(() => ({ data: null, error: code ? { message: code } : null }));
    const saved = await updateLineup(client, "mine", "round", [{ rosterEntryId: "entry", starter: true, position: "DEF" }], window.startsAt);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].table, "update_team_lineup");
    assert.deepEqual(saved, code ? { ok: false, error: Object.hasOwn(LINEUP_ERROR_KIND, code) ? code : "WRITE_FAILED" } : { ok: true });
  }
});
test("actual React server rendering deduplicates aggregate reads only within a request, never between clients or requests", async () => {
  const require = createRequire(import.meta.url);
  const { renderToReadableStream } = require("next/dist/compiled/react-server-dom-webpack/server.node.js") as {
    renderToReadableStream: (model: unknown, manifest: object) => Promise<ReadableStream<Uint8Array>>;
  };
  let points = 1;
  const first = testClient(() => result([{ player_id: "p", total_points: points, appearances: 1 }]));
  const other = testClient(() => result([{ player_id: "p", total_points: 99, appearances: 1 }]));
  async function Probe() {
    const [a, duplicate, b] = await Promise.all([getFantasyScoreAggregates(first.client), getFantasyScoreAggregates(first.client), getFantasyScoreAggregates(other.client)]);
    assert.equal(a, duplicate);
    assert.equal(a.get("p")?.totalPoints, points);
    assert.equal(b.get("p")?.totalPoints, 99);
    return createElement("div", null, "verified");
  }
  for (const value of [1, 2]) {
    points = value;
    const stream = await renderToReadableStream(createElement(Probe), {});
    assert.match(await new Response(stream).text(), /verified/, "the server component's assertions must complete successfully");
  }
  assert.equal(first.calls.length, 2);
  assert.equal(other.calls.length, 2);
});
