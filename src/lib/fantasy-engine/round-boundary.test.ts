import { test } from "node:test";
import assert from "node:assert/strict";
import { roundWindowContaining, nextRoundWindow } from "../../domain/fantasy/round-calendar.ts";
import { computeLockInstant, isLocked } from "../../domain/fantasy/lineup-lock.ts";
import { getEligibleFixtureIds, findNextEligibleWindow } from "./round-eligibility.ts";
import { getKickoffsByPlayer } from "./player-fixture-participation.ts";
import { reconcileFantasyStateForFixtures } from "./reconciliation.ts";
import { finalizeRoundIfReady, openNextRound } from "./rounds.ts";
import { progressSeason } from "./season.ts";
import { filter, result, testClient } from "../performance/test-client.ts";

const boundary = new Date("2026-10-06T06:00:00Z");
const oldWindow = roundWindowContaining(new Date("2026-10-06T05:45:00Z"));
const newWindow = nextRoundWindow(oldWindow);
const fixtures = [
  { id: "old", kickoff_at: "2026-10-06T05:45:00Z", status: "live", home_club_id: "club", away_club_id: "other", competitions: { code: "ENG" } },
  { id: "new", kickoff_at: "2026-10-06T06:00:00Z", status: "scheduled", home_club_id: "club", away_club_id: "other", competitions: { code: "ENG" } },
];
const round = { id: "old-round", number: 1, starts_at: oldWindow.startsAt.toISOString(), ends_at: oldWindow.endsAt.toISOString(), status: "in_progress", league_id: "league", scoring_rule_version: "ELEVEN_STANDARD_V4" };

test("fixture eligibility uses half-open kickoff bounds, never full time or provider arrival", async () => {
  for (const status of ["live", "ht", "final"]) {
    const { client, calls } = testClient(q => {
      assert.equal(q.table, "fixtures");
      return result(fixtures.map(f => ({ ...f, status, full_time: "2026-10-06T07:40:00Z", fetched_at: "2026-10-06T09:00:00Z" })).filter(f => f.kickoff_at >= String(filter(q, "kickoff_at")) && new Date(f.kickoff_at) < new Date(q.filters.find(f => f.method === "lt")!.value as string)));
    });
    assert.deepEqual(await getEligibleFixtureIds(client, oldWindow), ["old"]);
    assert.deepEqual(await getEligibleFixtureIds(client, newWindow), ["new"]);
    assert.ok(calls.every(q => q.filters.map(f => f.method).join() === "gte,lt"));
  }
});

test("the first eligible kickoff locks each player in its own week; rollover is not a global lock", async () => {
  const { client } = testClient(q => {
    if (q.table === "players") return result([{ id: "p", club_id: "club" }]);
    if (q.table === "player_national_teams") return result([]);
    if (q.table === "fixtures") return result(fixtures.filter(f => new Date(f.kickoff_at) >= new Date(filter(q, "kickoff_at") as string) && new Date(f.kickoff_at) < new Date(q.filters.find(f => f.method === "lt")!.value as string)));
    throw new Error(q.table);
  });
  const oldLock = computeLockInstant((await getKickoffsByPlayer(client, ["p"], oldWindow)).get("p")!);
  const newLock = computeLockInstant((await getKickoffsByPlayer(client, ["p"], newWindow)).get("p")!);
  assert.equal(oldLock?.toISOString(), "2026-10-06T05:45:00.000Z");
  assert.equal(newLock?.toISOString(), boundary.toISOString());
  assert.equal(isLocked(oldLock, boundary), true);
  assert.equal(isLocked(newLock, new Date("2026-10-06T05:59:59Z")), false);
  assert.equal(isLocked(null, boundary), false);
});

test("late reconciliation targets the old persisted window only, even with a new open round", async () => {
  const { client, calls } = testClient(q => {
    if (q.table === "fixtures") return result([fixtures[0]]);
    if (q.table === "fantasy_rounds") return result(q.limit ? round : q.filters.some(f => f.column === "id") ? round : [round, { id: "new-round", starts_at: newWindow.startsAt.toISOString(), ends_at: newWindow.endsAt.toISOString() }]);
    if (q.table === "lineup_slots" || q.table === "matchups") return result([]);
    throw new Error(q.table);
  });
  assert.deepEqual((await reconcileFantasyStateForFixtures(client, ["old"])).roundIds, ["old-round"]);
  assert.ok(calls.filter(q => q.table === "lineup_slots").every(q => filter(q, "fantasy_round_id") === "old-round"));
  assert.ok(calls.every(q => q.operation === "select" || q.table === "get_round_settlement_readiness"));
});

test("calendar boundary does not finalize evidence-blocked or completed rounds", async () => {
  for (const completed of [false, true]) {
    const { client, calls } = testClient(q => q.table === "fantasy_rounds" ? result({ ...round, status: completed ? "completed" : round.status }) : q.table === "get_round_settlement_readiness" ? result({ ready: false }) : (() => { throw new Error(q.table); })());
    assert.deepEqual(await finalizeRoundIfReady(client, "old-round", new Date("2026-10-06T07:00:00Z")), { finalized: false });
    assert.ok(calls.every(q => q.operation === "select" || q.table === "get_round_settlement_readiness"));
    if (completed) assert.equal(calls.length, 1);
  }
});

test("an active calendar window cannot finalize early even if all currently known fixtures are settled", async () => {
  const { client, calls } = testClient(q => { assert.equal(q.table, "fantasy_rounds"); return result(round); });
  assert.deepEqual(await finalizeRoundIfReady(client, "old-round", new Date("2026-10-05T23:00:00Z")), { finalized: false });
  assert.equal(calls.length, 1);
});

function opener(previous = round) {
  return testClient(q => {
    if (q.table === "fantasy_teams") return result([{ id: "t1", draft_orders: [{ position: 1 }] }, { id: "t2", draft_orders: [{ position: 2 }] }]);
    if (q.table === "get_round_settlement_readiness") return result({ ready: false });
    if (q.table === "seasons") return result({ id: "s", season_number: 1, schedule_cycles: 2, total_rounds: 2 });
    if (q.table === "fantasy_rounds") return result(q.operation === "insert" ? { id: "new-round" } : previous);
    if (q.table === "fixtures") return { ...result([]), count: 1 };
    if (q.table === "roster_entries") return result([{ id: `entry-${filter(q, "fantasy_team_id")}`, player_id: "p", players: { position: "GK", club_id: "club" } }]);
    if (q.table === "lineup_slots") return result(q.operation === "select" ? [{ roster_entry_id: (filter(q, "roster_entry_id") as string[])[0], starter: true, slot: "GK" }] : null);
    if (q.table === "players" || q.table === "player_national_teams") return result([]);
    if (q.table === "matchups" || q.table === "domain_events") return result(null);
    throw new Error(q.table);
  });
}

test("closed but unsettled old week opens the canonical next week with existing pairings and roster carry", async () => {
  const { client, calls } = opener();
  const opened = await openNextRound(client, "league", boundary);
  assert.ok(opened.ok);
  if (!opened.ok) return;
  assert.deepEqual(opened.window, newWindow);
  assert.equal(opened.roundNumber, 2);
  assert.deepEqual(calls.find(q => q.table === "matchups")?.payload, [{ league_id: "league", fantasy_round_id: "new-round", home_fantasy_team_id: "t2", away_fantasy_team_id: "t1", status: "scheduled" }]);
  const writes = calls.filter(q => q.table === "lineup_slots" && q.operation === "upsert");
  assert.equal(writes.length, 2);
  assert.ok(writes.every(q => (q.payload as Array<{ starter: boolean }>)[0].starter));
  assert.ok(calls.filter(q => q.table === "lineup_slots" && q.operation === "select").every(q => filter(q, "fantasy_round_id") === "old-round"));
  assert.ok(calls.every(q => q.table !== "roster_entries" || q.operation === "select"));
});

test("opening again within the new week cannot duplicate or advance the round", async () => {
  const { client, calls } = opener({ ...round, id: "new-round", number: 2, starts_at: newWindow.startsAt.toISOString(), ends_at: newWindow.endsAt.toISOString() });
  assert.deepEqual(await openNextRound(client, "league", boundary), { ok: false, error: "PREVIOUS_ROUND_STILL_OPEN" });
  assert.ok(calls.every(q => q.operation === "select" || q.table === "get_round_settlement_readiness"));
});

test("one lifecycle tick opens the fresh week while preserving the prior week for late settlement", async () => {
  const { client, calls } = testClient(q => {
    if (q.table === "get_round_settlement_readiness") return result({ ready: false });
    if (q.table === "seasons") return result({ id: "s", total_rounds: 2, season_number: 1, schedule_cycles: 2 });
    if (q.table === "fantasy_rounds" && !q.limit && q.operation === "select" && filter(q, "season_id")) return result([{ id: round.id, number: 1, ends_at: round.ends_at }]);
    if (q.table === "fantasy_rounds" && filter(q, "id")) return result(round);
    if (q.table === "matchups" && q.operation === "select") return result([]);
    if (q.table === "fixtures" && q.selection !== "*") return result([fixtures[0]]);
    // The old fixture is still inside its post-FT reconciliation window.
    if (q.table === "fixtures") return { ...result([fixtures[0]]), count: 1 };
    if (q.table === "fantasy_rounds") return result(q.operation === "insert" ? { id: "new-round" } : round);
    if (q.table === "fantasy_teams") return result([{ id: "t1", draft_orders: [] }, { id: "t2", draft_orders: [] }]);
    if (q.table === "roster_entries" || q.table === "players" || q.table === "player_national_teams" || q.table === "lineup_slots") return result([]);
    if (q.table === "matchups" || q.table === "domain_events") return result(null);
    throw new Error(q.table);
  });
  assert.deepEqual(await progressSeason(client, "league", boundary), { action: "round_opened", roundId: "new-round", roundNumber: 2 });
  assert.ok(!calls.some(q => q.table === "fantasy_rounds" && q.operation === "update"));
  assert.deepEqual(calls.find(q => q.table === "fantasy_rounds" && q.operation === "insert")?.payload, {
    league_id: "league", season_id: "s", number: 2, starts_at: newWindow.startsAt.toISOString(), ends_at: newWindow.endsAt.toISOString(), status: "in_progress",
  });
});

test("blank-week search advances using Tuesday 06:00 only", async () => {
  let reads = 0;
  const { client, calls } = testClient(() => ({ ...result([]), count: ++reads === 2 ? 1 : 0 }));
  assert.deepEqual(await findNextEligibleWindow(client, oldWindow, boundary), nextRoundWindow(newWindow));
  assert.ok(calls.every(q => new Date(filter(q, "kickoff_at") as string).getUTCHours() === 6));
});

test("season progression keeps processing the old week and cannot crown a winner while it is unsettled", async () => {
  const { client, calls } = testClient(q => {
    if (q.table === "get_round_settlement_readiness") return result({ ready: false });
    if (q.table === "seasons") return result({ id: "s", total_rounds: 2 });
    if (q.table === "fantasy_rounds") {
      if (filter(q, "id") === "old-round") return result(round);
      if (filter(q, "id") === "new-round") return result({ ...round, id: "new-round", status: "completed" });
      if (q.limit) return result({ id: "new-round", number: 2, status: "completed" });
      return result([{ id: "old-round", number: 1, ends_at: round.ends_at }]);
    }
    if (q.table === "fixtures") return result([fixtures[0]]);
    if (q.table === "matchups") return result([]);
    throw new Error(q.table);
  });
  assert.deepEqual(await progressSeason(client, "league", boundary), { action: "waiting_on_fixtures", roundId: "new-round" });
  assert.ok(calls.some(q => q.table === "fantasy_rounds" && filter(q, "id") === "old-round"));
  assert.ok(calls.every(q => q.operation === "select" || q.table === "get_round_settlement_readiness"));
});
