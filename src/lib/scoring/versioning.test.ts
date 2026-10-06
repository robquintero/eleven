import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { refreshMatchupScores, finalizeRoundIfReady } from "../fantasy-engine/rounds.ts";
import { reconcileFantasyRound } from "../fantasy-engine/reconciliation.ts";
import { backfillScores } from "./backfill.ts";
import { getAffectedScoringVersions } from "./affected-versions.ts";
import { filter, testClient, result } from "../performance/test-client.ts";

// Exact migration, embedded Postgres only. No credentials/HTTP/provider.
const db = new PGlite();
before(async () => {
  await db.exec(`set timezone = 'UTC'; create role authenticated; create role anon; create role service_role bypassrls;
    create table clubs(id uuid primary key); create table player_match_stats(id integer primary key);
    create table fantasy_rounds(id integer primary key, starts_at timestamptz not null, ends_at timestamptz not null, status text);
    create table fantasy_player_scores(points numeric(8,2)); insert into fantasy_player_scores values(102),(98);
    insert into fantasy_rounds values(1,'2026-09-29','2026-10-06','completed'),(2,'2026-10-06','2026-10-13','in_progress');
    grant select, insert, update on fantasy_rounds to service_role;`);
  await db.exec(await readFile(new URL("../../../supabase/migrations/20261008000000_scoring_v4_foundation.sql", import.meta.url), "utf8"));
});
after(() => db.close());
test("migration adds metadata only: existing official scores untouched; active/completed rounds pinned V3", async () => {
  assert.deepEqual((await db.query("select points::text from fantasy_player_scores")).rows, [{ points: "102.00" }, { points: "98.00" }]);
  assert.ok((await db.query<{ scoring_rule_version: string }>("select scoring_rule_version from fantasy_rounds")).rows.every(r => r.scoring_rule_version === "ELEVEN_STANDARD_V3"));
  await assert.rejects(db.exec("update fantasy_rounds set scoring_rule_version='ELEVEN_STANDARD_V4' where id=1"), /ROUND_SCORING_AND_WINDOW_IMMUTABLE/);
  await assert.rejects(db.exec("update fantasy_rounds set starts_at='2026-10-07' where id=2"), /ROUND_SCORING_AND_WINDOW_IMMUTABLE/);
});
test("activation cannot reinterpret already-created rounds, run retroactively or bypass a Tuesday boundary", async () => {
  for (const time of ["2026-09-29", "2026-10-06", "2090-01-04", "2090-01-03 01:00:00"]) await assert.rejects(db.query("insert into scoring_version_activations values($1,'ELEVEN_STANDARD_V4')", [time]), /ACTIVATION_REQUIRES_NEW_FUTURE_ROUND_BOUNDARY/);
});
test("explicit future activation assigns V4 only to newly-created rounds; caller cannot override pinned model", async () => {
  await db.exec("insert into fantasy_rounds values(3,'2089-12-27','2090-01-03','upcoming','ELEVEN_STANDARD_V4')");
  assert.equal((await db.query<{ scoring_rule_version: string }>("select scoring_rule_version from fantasy_rounds where id=3")).rows[0].scoring_rule_version, "ELEVEN_STANDARD_V3");
  await db.exec("set role service_role; insert into scoring_version_activations values('2090-01-03','ELEVEN_STANDARD_V4'); insert into fantasy_rounds values(4,'2090-01-03','2090-01-10','in_progress','ELEVEN_STANDARD_V3'); reset role;");
  assert.equal((await db.query<{ scoring_rule_version: string }>("select scoring_rule_version from fantasy_rounds where id=4")).rows[0].scoring_rule_version, "ELEVEN_STANDARD_V4");
  await db.exec("update fantasy_rounds set status='completed' where id=4");
  await assert.rejects(db.exec("update fantasy_rounds set scoring_rule_version='ELEVEN_STANDARD_V3' where id=4"), /IMMUTABLE/);
  await assert.rejects(db.exec("delete from scoring_version_activations"), /APPEND_ONLY/);
});
test("clients have no activation table or trigger-function authorization", async () => {
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    try { await assert.rejects(db.exec("select * from scoring_version_activations"), /permission denied/); }
    finally { await db.exec("reset role"); }
  }
  assert.deepEqual((await db.query("select has_function_privilege('authenticated','public.pin_round_scoring_version()','execute') as allowed")).rows, [{ allowed: false }]);
});

function aggregation(version: string, completed = false) {
  let correction = false;
  const { client, calls } = testClient(q => {
    if (q.table === "get_round_settlement_readiness") return result({ ready: true, version, evidence_digest: "pinned-score-evidence", performances: [] });
    if (q.table === "settle_fantasy_round") return result({ finalized: true });
    if (q.table === "fantasy_rounds") return result({ id: "r", starts_at: "2026-10-06T00:00:00Z", ends_at: "2026-10-13T00:00:00Z", scoring_rule_version: version, status: completed ? "completed" : "in_progress" });
    if (q.table === "lineup_slots") return result(q.selection?.includes("acquired_at") ? [{ roster_entries: { fantasy_team_id: "t1", player_id: "p", acquired_at: "2026-10-07T10:00:00Z" } }] : []);
    if (q.table === "matchups") return result(q.operation === "select" ? [{ id: "m", home_fantasy_team_id: "t1", away_fantasy_team_id: "t2" }] : null);
    if (q.table === "domain_events") return result(null);
    if (q.table === "fixtures") return { ...result([{ id: "pre", kickoff_at: "2026-10-07T09:00:00Z" }, { id: "a", kickoff_at: "2026-10-07T10:00:00Z" }, { id: "b", kickoff_at: "2026-10-08T10:00:00Z" }, { id: "c", kickoff_at: "2026-10-09T10:00:00Z" }].map(f => ({ ...f, status: "final" }))), count: 0 };
    if (q.table === "fantasy_player_scores") {
      assert.equal(filter(q, "scoring_rule_version"), version);
      return result([{ player_id: "p", fixture_id: "pre", points: 100 }, { player_id: "p", fixture_id: "a", points: correction ? 7.1 : 10.1 }, { player_id: "p", fixture_id: "b", points: 0.2 }, { player_id: "p", fixture_id: "c", points: 0.15 }]);
    }
    if (q.table === "matchup_scores") return result(q.operation === "select" ? [{ id: "score", live_points: correction ? 7.45 : 10.45, final_points: completed ? 10.45 : null }] : null);
    throw new Error(`Unexpected query ${q.table}`);
  });
  return { client, calls, correct: () => { correction = true; } };
}
test("real round aggregator sums three fixtures in hundredths, excludes pre-acquisition and benches, reads pinned V3/V4", async () => {
  for (const v of ["ELEVEN_STANDARD_V3", "ELEVEN_STANDARD_V4"]) {
    const { client, calls } = aggregation(v);
    await refreshMatchupScores(client, "r");
    assert.ok(calls.some(q => q.table === "lineup_slots" && filter(q, "starter") === true));
    const writes = calls.find(q => q.table === "matchup_scores" && q.operation === "upsert")!.payload as Array<{ live_points: number }>;
    assert.deepEqual(writes.map(w => w.live_points), [10.45, 0]);
  }
});
test("completed round provider correction leaves official scores and locks frozen", async () => {
  const { client, calls, correct } = aggregation("ELEVEN_STANDARD_V3", true);
  correct(); await reconcileFantasyRound(client, "r");
  assert.equal(calls.length, 1, "completed reconciliation is a single read, no score/lock writes");
  assert.ok(calls.every(q => q.table !== "fantasy_rounds" || q.operation === "select"));
});
test("backfill without explicit model fails before any query or write", async () => {
  const { client, calls } = testClient(() => { throw new Error("Database must not be reached"); });
  await assert.rejects(backfillScores(client, {} as Parameters<typeof backfillScores>[1]), /Unknown scoring version/);
  assert.equal(calls.length, 0);
});
test("live correction discovers unfinished pinned models and retains catalog V3 without duplication", async () => {
  const { client } = testClient(q => q.table === "get_catalog_scoring_version" ? result("ELEVEN_STANDARD_V3") : q.table === "fixtures" ? result([{ kickoff_at: "2026-10-07T00:00:00Z" }]) : result([
    { id: "one", starts_at: "2026-10-06T00:00:00Z", ends_at: "2026-10-13T00:00:00Z", scoring_rule_version: "ELEVEN_STANDARD_V3" },
    { id: "two", starts_at: "2026-10-06T00:00:00Z", ends_at: "2026-10-13T00:00:00Z", scoring_rule_version: "ELEVEN_STANDARD_V4" },
  ]));
  assert.deepEqual(await getAffectedScoringVersions(client, ["fixture"]), ["ELEVEN_STANDARD_V3", "ELEVEN_STANDARD_V4"]);
});

test("V4 completion delegates verified pinned evidence to atomic publication, without client-supplied totals or version changes", async () => {
  const { client, calls } = aggregation("ELEVEN_STANDARD_V4");
  await refreshMatchupScores(client, "r");
  const live = calls.find(q => q.table === "matchup_scores" && q.operation === "upsert")!.payload as Array<{ live_points: number }>;
  assert.deepEqual(live.map(s => s.live_points), [10.45, 0]);
  assert.deepEqual(await finalizeRoundIfReady(client, "r", new Date("2026-10-16T00:00:00Z")), { finalized: true, roundId: "r" });
  assert.deepEqual(calls.find(q => q.table === "settle_fantasy_round")?.payload, { p_round_id: "r", p_evidence_digest: "pinned-score-evidence" });
  assert.ok(!calls.some(q => (q.table === "fantasy_rounds" || q.table === "matchup_scores") && q.operation === "update"));
});
