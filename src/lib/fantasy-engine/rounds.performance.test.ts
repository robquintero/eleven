import { test } from "node:test";
import assert from "node:assert/strict";
import { ensureFirstRoundOpened } from "./rounds.ts";
import { filter, result, testClient, type RecordedQuery } from "../performance/test-client.ts";

const startsAt = "2090-01-03T00:00:00Z";
const endsAt = "2090-01-10T00:00:00Z";
const positions = ["GK", ...Array(4).fill("DEF"), ...Array(4).fill("MID"), "FWD", "FWD", "GK", "DEF", "MID", "FWD", "FWD"];
function roster(team: string) {
  return positions.map((position, i) => ({ id: `${team}-${i}`, player_id: `${team}-p${i}`, players: { position, canonical_position: position, club_id: "club" } }));
}
function fixture(options: { teams?: number; missing?: string[]; partial?: string[]; round?: number; completed?: boolean; failedCheck?: boolean; many?: boolean } = {}) {
  const teams = Array.from({ length: options.teams ?? 10 }, (_, i) => `team${i}`);
  const missing = new Set(options.missing ?? []);
  const batched = teams.flatMap((team) => roster(team).map((r, i) => ({ id: r.id, fantasy_team_id: team,
    lineup_slots: missing.has(team) || (options.partial?.includes(team) && i > 0) ? [] : [{ id: `${r.id}-slot` }],
  })));
  if (options.many) for (let i = batched.length; i < 1100; i++) batched.push({ id: `extra${i}`, fantasy_team_id: "team0", lineup_slots: [{ id: `s${i}` }] });
  return testClient((q: RecordedQuery) => {
    if (q.table === "seasons") return result({ id: "season", status: options.completed ? "COMPLETED" : "ACTIVE" });
    if (q.table === "drafts") return result({ status: "completed" });
    if (q.table === "fantasy_rounds") return result({ id: "round", number: options.round ?? 1, starts_at: startsAt, ends_at: endsAt });
    if (q.table === "roster_entries" && q.selection?.includes("!left")) {
      assert.equal(filter(q, "lineup_slots.fantasy_round_id"), "round");
      assert.equal(filter(q, "league_id"), "league");
      assert.equal(filter(q, "status"), "active");
      if (options.failedCheck) return { data: null, error: { message: "read failed" } };
      return result(batched.slice(q.range![0], q.range![1] + 1));
    }
    if (q.table === "roster_entries") return result(roster(String(filter(q, "fantasy_team_id"))));
    if (q.table === "players") return result(teams.flatMap((t) => roster(t).map((r) => ({ id: r.player_id, club_id: "club" }))));
    if (q.table === "player_national_teams" || q.table === "fixtures") return result([]);
    if (q.table === "lineup_slots" && q.operation === "upsert") return result(null);
    throw new Error(`Unexpected ${q.table} ${q.operation}`);
  });
}

test("healthy ten-team Round 1 needs four reads and no writes", async () => {
  const { client, calls } = fixture();
  await ensureFirstRoundOpened(client, "league");
  assert.equal(calls.length, 4);
  assert.ok(calls.every((q) => q.operation === "select"));
});
test("incomplete Round 1 initializes only the missing teams with unchanged automatic 4-4-2", async () => {
  const { client, calls } = fixture({ missing: ["team2", "team7"] });
  await ensureFirstRoundOpened(client, "league");
  const writes = calls.filter((q) => q.operation === "upsert");
  assert.equal(writes.length, 2);
  for (const [index, team] of ["team2", "team7"].entries()) {
    const rows = writes[index].payload as Array<{ roster_entry_id: string; starter: boolean; slot: string; locked_at: string | null }>;
    assert.equal(rows.length, 16);
    assert.ok(rows.every((r) => r.roster_entry_id.startsWith(team)));
    assert.equal(rows.filter((r) => r.starter).length, 11);
    assert.deepEqual(["GK", "DEF", "MID", "FWD"].map((p) => rows.filter((r) => r.starter && r.slot === p).length), [1, 4, 4, 2]);
  }
});
test("missing lineup initialization recovers; even one existing slot protects manager edits", async () => {
  const { client, calls } = fixture({ teams: 2, missing: ["team1"], partial: ["team0"] });
  await ensureFirstRoundOpened(client, "league");
  assert.equal(calls.filter((q) => q.operation === "upsert").length, 1);
  assert.ok(!(calls.filter((q) => q.table === "roster_entries" && !q.selection?.includes("!left"))).some((q) => filter(q, "fantasy_team_id") === "team0"));
});
test("progressed season skips historical Round 1 entirely; completed season never opens another", async () => {
  for (const options of [{ round: 2 }, { completed: true }]) {
    const { client, calls } = fixture(options);
    await ensureFirstRoundOpened(client, "league");
    assert.equal(calls.length, options.completed ? 1 : 3);
    assert.ok(calls.every((q) => !["roster_entries", "lineup_slots"].includes(q.table)));
  }
});
test("batched completeness read pages past the row cap and fails closed on a read error", async (t) => {
  const paged = fixture({ many: true });
  await ensureFirstRoundOpened(paged.client, "league");
  assert.equal(paged.calls.length, 5);
  t.mock.method(console, "error", () => {});
  const failed = fixture({ failedCheck: true });
  await ensureFirstRoundOpened(failed.client, "league");
  assert.ok(failed.calls.every((q) => q.operation === "select"));
});
test("an unopened round retains its recovery attempt and does not manufacture an empty league", async (t) => {
  t.mock.method(console, "error", () => {});
  const { client, calls } = testClient((q) => {
    if (q.table === "seasons") return result(null);
    if (q.table === "drafts") return result({ status: "completed" });
    if (q.table === "fantasy_rounds") return result(null);
    if (q.table === "fantasy_teams") return result([]);
    throw new Error(`Unexpected ${q.table}`);
  });
  await ensureFirstRoundOpened(client, "league");
  assert.equal(calls.at(-1)?.table, "fantasy_teams", "openNextRound still attempted");
  assert.ok(calls.every((q) => q.operation === "select"));
});

test("completed draft with no round recovers through the real opener, including both lineups and the event", async () => {
  const { client, calls } = testClient((q) => {
    if (q.table === "seasons") return result({ id: "season", status: "ACTIVE", season_number: 1, schedule_cycles: 2, total_rounds: 2 });
    if (q.table === "drafts") return result({ status: "completed" });
    if (q.table === "fantasy_teams") return result([{ id: "team0", draft_orders: [{ position: 1 }] }, { id: "team1", draft_orders: [{ position: 2 }] }]);
    if (q.table === "fantasy_rounds") return result(q.operation === "insert" ? { id: "round" } : null);
    if (q.table === "fixtures") return { data: [], count: 1, error: null };
    if (q.table === "roster_entries") return result(roster(String(filter(q, "fantasy_team_id"))));
    if (q.table === "players" || q.table === "player_national_teams") return result([]);
    if (["lineup_slots", "matchups", "domain_events"].includes(q.table)) return result(null);
    throw new Error(`Unexpected ${q.table}`);
  });
  await ensureFirstRoundOpened(client, "league");
  assert.equal(calls.filter((q) => q.table === "fantasy_rounds" && q.operation === "insert").length, 1);
  assert.equal(calls.filter((q) => q.table === "lineup_slots" && q.operation === "upsert").length, 2);
  assert.equal(calls.filter((q) => q.table === "matchups" && q.operation === "insert").length, 1);
  assert.equal(calls.filter((q) => q.table === "domain_events" && q.operation === "insert").length, 1);
});
