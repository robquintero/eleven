import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeFixturePlayerStats } from "../football-providers/api-football/adapter.ts";
import { fixtureStatPersistenceRow } from "../football-ingestion/sync-fixture-stats.ts";
import { backfillScores } from "./backfill.ts";
import { filter, result, testClient } from "../performance/test-client.ts";

function fixture() {
  const normalized = normalizeFixturePlayerStats([{ team: { id: 42 }, players: [{ player: { id: 99 }, statistics: [{
    games: { minutes: 90, substitute: false }, shots: { total: 4, on: 2 }, goals: { total: 1, assists: 1, saves: null },
    passes: { key: 3 }, duels: { won: 7 }, fouls: { committed: 3 }, cards: { yellow: 1, red: 0 },
  }] }] }], "external-fixture")[0];
  const row = fixtureStatPersistenceRow(normalized, "canonical-player", "canonical-fixture", "national", "MID");
  const scores = new Map<string, unknown>([["ELEVEN_STANDARD_V3", { points: 123, breakdown: { test: "preserve" } }]]);
  let code = "UEFA_NL";
  const { client, calls } = testClient(q => {
    if (q.table === "fixtures") return result([{ id: "canonical-fixture", home_club_id: "national", away_club_id: "opponent", home_score: 1, away_score: 2, competition_id: "comp", kickoff_at: "2026-10-07T10:00:00Z" }]);
    if (q.table === "competitions") return result([{ id: "comp", code }]);
    if (q.table === "player_match_stats") return result([row]);
    if (q.table === "players") return result([{ id: "canonical-player", position: "FWD", club_id: "permanent-club" }]);
    if (q.table === "player_national_teams") return result([{ player_id: "canonical-player", national_team_club_id: "national" }]);
    if (q.table === "fantasy_player_scores") {
      for (const score of q.payload as Array<{ scoring_rule_version: string }>) scores.set(score.scoring_rule_version, score);
      return result(null);
    }
    throw new Error(`Unexpected ${q.table} ${q.operation}`);
  });
  return { row, client, calls, scores, ineligible: () => { code = "FRIENDLY"; } };
}
test("actual adapter → production storage row → V4 backfill: canonical identities, null coverage, pinned position and exact persisted breakdown", async () => {
  const { row, client, scores } = fixture();
  assert.equal(row.fixture_id, "canonical-fixture"); assert.equal(row.player_id, "canonical-player");
  assert.equal(row.reported_stats?.saves, null); assert.equal(row.saves, 0);
  const result = await backfillScores(client, { scoringRuleVersion: "ELEVEN_STANDARD_V4", fixtureIds: ["canonical-fixture"] });
  assert.equal(result.scored, 1);
  assert.deepEqual(result.byPosition, { MID: 1 }, "summary follows captured scoring position, not the later catalog position");
  const saved = scores.get("ELEVEN_STANDARD_V4") as { points: number; breakdown: { totalUnits: number; position: string; entries: Array<{ units: number }> } };
  assert.equal(saved.points, 22.4); assert.equal(saved.breakdown.position, "MID");
  assert.equal(saved.breakdown.totalUnits, saved.breakdown.entries.reduce((n, e) => n + e.units, 0));
  assert.deepEqual(scores.get("ELEVEN_STANDARD_V3"), { points: 123, breakdown: { test: "preserve" } });
});
test("identical live/final snapshot replaces same canonical version key; a provider correction changes only the recomputed model", async () => {
  const { row, client, scores, calls } = fixture();
  const options = { scoringRuleVersion: "ELEVEN_STANDARD_V4" as const, fixtureIds: ["canonical-fixture"] };
  await backfillScores(client, options);
  const first = structuredClone(scores.get("ELEVEN_STANDARD_V4"));
  await backfillScores(client, options); assert.deepEqual(scores.get("ELEVEN_STANDARD_V4"), first);
  row.reported_stats!.goals = 0;
  await backfillScores(client, options);
  assert.equal((scores.get("ELEVEN_STANDARD_V4") as { points: number }).points, 15.4);
  assert.equal(scores.size, 2, "V3 plus one V4 row, no repeated accumulation");
  assert.ok(calls.filter(q => q.table === "player_match_stats").every(q => filter(q, "fixture_id") !== undefined));
});
test("ineligible competition and missing V4 provenance cannot write partial official V4 scores", async () => {
  const a = fixture(); a.ineligible();
  const result = await backfillScores(a.client, { scoringRuleVersion: "ELEVEN_STANDARD_V4", fixtureIds: ["canonical-fixture"] });
  assert.equal(result.scored, 0); assert.equal(a.scores.size, 1);
  const b = fixture(); b.row.reported_stats = null;
  await assert.rejects(backfillScores(b.client, { scoringRuleVersion: "ELEVEN_STANDARD_V4", fixtureIds: ["canonical-fixture"] }), /V4_REQUIRES_REPORTED_STATS/);
  assert.equal(b.scores.size, 1);
  const c = fixture(); c.row.scoring_position = null;
  await assert.rejects(backfillScores(c.client, { scoringRuleVersion: "ELEVEN_STANDARD_V4", fixtureIds: ["canonical-fixture"] }), /V4_REQUIRES_SCORING_POSITION/);
  assert.equal(c.scores.size, 1);
});
test("missing actual participating team never guesses a V4 clean sheet from current membership", async () => {
  const { row, client, scores } = fixture();
  row.participation_club_id = null;
  await backfillScores(client, { scoringRuleVersion: "ELEVEN_STANDARD_V4", fixtureIds: ["canonical-fixture"] });
  const saved = scores.get("ELEVEN_STANDARD_V4") as { breakdown: { unavailable: string[] } };
  assert.ok(saved.breakdown.unavailable.includes("cleanSheet"));
});
