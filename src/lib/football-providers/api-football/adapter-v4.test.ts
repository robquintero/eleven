import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeFixturePlayerStats } from "./adapter.ts";
import type { ApiFootballFixturePlayersItem } from "./types.ts";
const payload = (stats: ApiFootballFixturePlayersItem["players"][number]["statistics"][number]): ApiFootballFixturePlayersItem[] => [{ team: { id: 42 }, players: [{ player: { id: 1 }, statistics: [stats] }] }];
test("V4 normalization preserves all reported rich counts, explicit zero, nullable coverage and team provenance", () => {
  const [row] = normalizeFixturePlayerStats(payload({ shots: { total: 4, on: 2 }, duels: { total: 9, won: 7 },
    dribbles: { success: 0 }, fouls: { drawn: 3, committed: 1 }, penalty: { won: null, missed: 1, saved: 0 }, passes: { key: 2, total: 40, accuracy: "85%" } }), "fixture");
  assert.equal(row.reportedStats?.duelsWon, 7); assert.equal(row.reportedStats?.shots, 4);
  assert.equal(row.reportedStats?.successfulDribbles, 0); assert.equal(row.reportedStats?.penaltiesWon, null);
  assert.equal(row.reportedStats?.passAccuracyRaw, "85%"); assert.equal(row.reportedStats?.minutes, null);
  assert.equal(row.participationTeamExternalId, "42"); assert.equal(row.minutes, 0, "V3 legacy column keeps its existing behavior");
});
test("V4 absent stat object skips a player; missing groups produce null, never fabricated counts", () => {
  assert.deepEqual(normalizeFixturePlayerStats([{ team: { id: 42 }, players: [{ player: { id: 1 }, statistics: [] }] }], "fixture"), []);
  assert.deepEqual(normalizeFixturePlayerStats([{ team: { id: 42 }, players: [{ player: { id: 1 } } as ApiFootballFixturePlayersItem["players"][number]] }], "fixture"), []);
  const [row] = normalizeFixturePlayerStats(payload({}), "fixture");
  assert.ok(Object.values(row.reportedStats!).every(v => v === null));
});
