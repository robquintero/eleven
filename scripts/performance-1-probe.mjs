/** Run: node --conditions=react-server --experimental-strip-types scripts/performance-1-probe.mjs
 * Executes the original and current self-heal against the same fake league.
 * Never loads env files, constructs a real client, or makes a network call.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { stripTypeScriptTypes } from "node:module";
import { ensureFirstRoundOpened as after } from "../src/lib/fantasy-engine/rounds.ts";
import { filter, result, testClient } from "../src/lib/performance/test-client.ts";

globalThis.fetch = () => { throw new Error("Network disabled for performance probe"); };
const baseline = "26404e16261d2ac2aa839565fe6cfb84e6dfdc89";
const source = execFileSync("git", ["show", `${baseline}:src/lib/fantasy-engine/rounds.ts`], { encoding: "utf8" });
const slice = source.slice(source.indexOf("export async function ensureFirstRoundOpened"), source.indexOf("interface StarterRow"));
const original = stripTypeScriptTypes(`
  function openNextRound() { throw new Error('Unexpected recovery in healthy baseline'); }
  function createRoundLineupSlots() { throw new Error('Unexpected write in healthy baseline'); }
  ${slice}
`);
const { ensureFirstRoundOpened: before } = await import(`data:text/javascript;base64,${Buffer.from(original).toString("base64")}`);

function leagueFixture(progressed) {
  const teams = Array.from({ length: 10 }, (_, i) => ({ id: `team${i}` }));
  return testClient((q) => {
    assert.equal(q.operation, "select", "Healthy probes must never write");
    if (q.table === "seasons") return result({ id: "season", status: "ACTIVE" });
    if (q.table === "drafts") return result({ status: "completed" });
    if (q.table === "fantasy_rounds") return result({ id: "round", number: progressed && q.selection.includes("starts_at") && !q.selection.startsWith("starts_at") ? 2 : 1,
      starts_at: "2090-01-03T00:00:00Z", ends_at: "2090-01-10T00:00:00Z" });
    if (q.table === "fantasy_teams") return result(teams);
    if (q.table === "roster_entries") return result(q.selection.includes("!left")
      ? teams.flatMap((t) => Array.from({ length: 16 }, (_, i) => ({ fantasy_team_id: t.id, lineup_slots: [{ id: `${t.id}-${i}` }] })))
      : Array.from({ length: 16 }, (_, i) => ({ id: `${filter(q, "fantasy_team_id")}-${i}` })));
    if (q.table === "lineup_slots") return { data: null, count: 16, error: null };
    throw new Error(`Unexpected query: ${q.table}`);
  });
}
for (const progressed of [false, true]) {
  const old = leagueFixture(progressed), current = leagueFixture(progressed);
  await before(old.client, "league");
  await after(current.client, "league");
  assert.equal(old.calls.length, 25);
  assert.equal(current.calls.length, progressed ? 3 : 4);
  console.log(JSON.stringify({ scenario: progressed ? "progressed season" : "healthy ten-team Round 1", baseline, beforeReads: old.calls.length, afterReads: current.calls.length, writes: 0, network: "disabled" }));
}
