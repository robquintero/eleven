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
/**
 * `partial` teams get exactly one existing slot, on roster entry index 0
 * (a GK, `starter: true`) -- modeling the real "5 Men of Class" incident
 * this fixture is named after: a manager clicked one starter mid-draft,
 * leaving every other roster entry with no slot at all. The autonomous
 * stabilization pass's fix (`provisionMissingLineupSlots`) must repair
 * exactly the missing 15, preserving that one existing slot untouched.
 */
function fixture(options: { teams?: number; missing?: string[]; partial?: string[]; round?: number; completed?: boolean; failedCheck?: boolean; many?: boolean } = {}) {
  const teams = Array.from({ length: options.teams ?? 10 }, (_, i) => `team${i}`);
  const missing = new Set(options.missing ?? []);
  const partial = new Set(options.partial ?? []);
  const batched = teams.flatMap((team) => roster(team).map((r, i) => ({ id: r.id, fantasy_team_id: team,
    lineup_slots: missing.has(team) || (partial.has(team) && i > 0) ? [] : [{ id: `${r.id}-slot` }],
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
    // provisionMissingLineupSlots' own existing-slots check -- the team's
    // index-0 entry has a slot (starter GK) when it's in `partial`, else none.
    if (q.table === "lineup_slots" && q.operation === "select") {
      const ids = filter(q, "roster_entry_id") as string[] | undefined;
      const team = String(ids?.[0] ?? "").split("-")[0];
      return result(partial.has(team) ? [{ roster_entry_id: `${team}-0`, starter: true }] : []);
    }
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
test("incomplete Round 1 initializes only the missing teams with unchanged automatic 4-3-3", async () => {
  const { client, calls } = fixture({ missing: ["team2", "team7"] });
  await ensureFirstRoundOpened(client, "league");
  const writes = calls.filter((q) => q.operation === "upsert");
  assert.equal(writes.length, 2);
  for (const [index, team] of ["team2", "team7"].entries()) {
    const rows = writes[index].payload as Array<{ roster_entry_id: string; starter: boolean; slot: string; locked_at: string | null }>;
    assert.equal(rows.length, 16);
    assert.ok(rows.every((r) => r.roster_entry_id.startsWith(team)));
    assert.equal(rows.filter((r) => r.starter).length, 11);
    assert.deepEqual(["GK", "DEF", "MID", "FWD"].map((p) => rows.filter((r) => r.starter && r.slot === p).length), [1, 4, 3, 3]);
  }
});
test("a partially-initialized team (one existing manual slot, 15 missing) is now repaired, not skipped -- the actual production bug this pass fixes", async () => {
  const { client, calls } = fixture({ teams: 2, missing: ["team1"], partial: ["team0"] });
  await ensureFirstRoundOpened(client, "league");
  const writes = calls.filter((q) => q.operation === "upsert");
  // Both team0 (partial) and team1 (fully missing) get a write now --
  // team0 is NO LONGER silently skipped just because it had one slot.
  assert.equal(writes.length, 2);
  const team0Write = writes.find((w) => (w.payload as Array<{ roster_entry_id: string }>).every((r) => r.roster_entry_id.startsWith("team0")));
  assert.ok(team0Write, "team0 must receive a repair write for its 15 missing roster entries");
  const rows = team0Write!.payload as Array<{ roster_entry_id: string; starter: boolean; slot: string }>;
  assert.equal(rows.length, 15, "exactly the 15 missing entries -- the pre-existing GK starter slot (index 0) is never re-written");
  assert.ok(!rows.some((r) => r.roster_entry_id === "team0-0"), "the existing slot's own roster entry must never appear in the repair write");
  assert.equal(rows.filter((r) => r.starter).length, 10, "11 total starters minus the 1 pre-existing GK starter");
  assert.deepEqual(
    ["GK", "DEF", "MID", "FWD"].map((p) => rows.filter((r) => r.starter && r.slot === p).length),
    [0, 4, 3, 3],
    "GK's remaining need is 0 (already satisfied by the pre-existing starter); DEF/MID/FWD fill their full formation need from the missing pool"
  );
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
