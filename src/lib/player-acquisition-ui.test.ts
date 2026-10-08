import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import ts from "typescript";
import { playerAcquisitionState, PRE_DRAFT_ACQUISITION_COPY } from "../domain/fantasy/player-acquisition.ts";

const require = createRequire(import.meta.url), root = resolve(import.meta.dirname, "../..");
type Element = { type: unknown; props: Record<string, unknown> };
type Presenter = (props: Record<string, unknown>) => Element | Promise<Element>;
// Execute the actual server pages/actions in memory, substituting only reads,
// Next infrastructure and client components. Unlisted server reads fail closed.
function load(file: string, mocks: Record<string, unknown> = {}): Record<string, Presenter> {
  const filename = resolve(root, file), compiled = { exports: {} };
  const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const localRequire = (name: string): unknown => {
    if (name in mocks) return mocks[name];
    if (name.endsWith(".css")) return {};
    if (name.startsWith("@/data-access/") || name.includes("/actions") || name === "@/lib/supabase/server") throw Error(`Unmocked server import: ${name}`);
    if (name === "@/components/shell/transition-link") return { TransitionLink: (props: Record<string, unknown>) => ({ type: "a", props }) };
    if (name.startsWith("@/components/") && !name.endsWith("player-acquisition-notice") && !name.endsWith("team-page-view")) return new Proxy({}, { get: (_target, key) => key === "__esModule" ? true : (props: Record<string, unknown>) => ({ type: String(key), props }) });
    if (name.startsWith("@/") || name.startsWith(".")) {
      const path = name.startsWith("@/") ? resolve(root, "src", name.slice(2)) : resolve(dirname(filename), name);
      const target = [path, path + ".ts", path + ".tsx"].find(p => existsSync(p) && /\.tsx?$/.test(p));
      if (target) return load(target, mocks);
    }
    return require(name);
  };
  new Function("require", "module", "exports", code)(localRequire, compiled, compiled.exports);
  return compiled.exports;
}
async function nodes(value: unknown): Promise<Element[]> {
  if (Array.isArray(value)) return (await Promise.all(value.map(nodes))).flat();
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  if (typeof node.type === "function") return nodes(await node.type(node.props));
  return [node, ...await nodes(node.props.children)];
}
const league = { id: "league", name: "League", status: "draft", memberCount: 2, maxTeams: 4, role: "manager" };
const team = { id: "team", name: "Team" }, squad = { formation: "—", starters: [], bench: [] };
function reads(status: string | null, leagueStatus = "draft") {
  return {
    "@/data-access/active-league": { getActiveLeagueId: async () => "league" },
    "@/data-access/leagues": { getUserLeagues: async () => [{ ...league, status: leagueStatus }] },
    "@/data-access/teams": { getUserTeamInLeague: async () => team, getLeagueTeams: async () => [] },
    "@/data-access/drafts": { getDraftStatus: async () => status },
    "@/data-access/profiles": { getCurrentProfile: async () => ({ id: "user" }) },
    "@/data-access/roster": { getUserSquad: async () => squad, getTeamRosterPlayers: async () => [] },
    "@/data-access/players": { getCompetitionFilters: async () => [], getClubFilters: async () => [], getPlayerDatabase: async () => ({ players: [], total: 0, pageSize: 50 }) },
    "@/data-access/matchups": { getCurrentMatchup: async () => null, getStandings: async () => [], getMatchupSquads: async () => null, getMatchupFixtureIntelligence: async () => null },
    "@/data-access/intelligence": { getHotFreeAgents: async () => [{ player: { id: "player" } }] },
    "@/data-access/transactions": { getRecentActivity: async () => [] },
    "@/data-access/trades": { getTeamTrades: async () => ({ incoming: [], outgoing: [] }) },
    "@/app/(app)/team/actions": { ensureFirstRoundOpenedAction: async () => {} },
  };
}
test("eligibility mirrors derived ACTIVE, blocks all pre-draft states and preserves keep-roster eligibility", () => {
  for (const leagueStatus of ["draft", "active"]) {
    for (const draftStatus of [null, "scheduled", "in_progress"]) assert.equal(playerAcquisitionState(leagueStatus, draftStatus), "draft_pending");
    assert.equal(playerAcquisitionState(leagueStatus, "completed"), "allowed");
  }
  for (const leagueStatus of ["completed", "archived"]) {
    for (const draftStatus of [null, "in_progress", "completed"]) assert.equal(playerAcquisitionState(leagueStatus, draftStatus), "league_closed");
  }
  assert.equal(playerAcquisitionState(null, null), "unavailable");
});
test("Players server page supplies a fail-closed draft gate while retaining catalog reads", async () => {
  for (const status of [null, "scheduled", "in_progress", "completed"]) {
    const tree = await load("src/app/(app)/players/page.tsx", reads(status)).default({ searchParams: Promise.resolve({ q: "Salah" }) });
    const workspace = (await nodes(tree)).find(n => n.type === "PlayersWorkspace")!;
    assert.equal(workspace.props.acquisitionState, status === "completed" ? "allowed" : "draft_pending");
    assert.equal(workspace.props.leagueId, "league"); assert.equal(workspace.props.fantasyTeamId, "team");
    assert.equal((workspace.props.filters as { query: string }).query, "Salah");
  }
});
test("Home recommendations and trades cannot acquire before completion; post-draft controls retain access", async () => {
  for (const status of [null, "in_progress", "completed"]) {
    const tree = await load("src/app/(app)/home/page.tsx", reads(status)).default({});
    const rendered = await nodes(tree), allowed = status === "completed";
    assert.equal(rendered.find(n => n.type === "FormIntelligence")!.props.canTransact, allowed);
    assert.equal(rendered.find(n => n.type === "TradeDesk")!.props.canAcquire, allowed);
    assert.equal(rendered.some(n => n.props["aria-label"] === "Roster vacancy"), allowed);
  }
});
test("Team pre-draft empty squad leads to Draft instead of free-market replacement guidance", async () => {
  for (const status of [null, "in_progress", "completed"]) {
    const tree = await load("src/app/(app)/team/page.tsx", reads(status)).default({});
    const rendered = await nodes(tree), links = rendered.filter(n => n.type === "a");
    assert.equal(links.some(n => n.props.href === "/draft"), status !== "completed");
    assert.equal(links.some(n => n.props.href === "/players"), status === "completed");
  }
});
test("pre-draft notice uses the exact contextual copy and a useful Draft destination", async () => {
  const { PlayerAcquisitionNotice } = load("src/components/players/player-acquisition-notice.tsx");
  const rendered = await nodes(await PlayerAcquisitionNotice({ state: "draft_pending" }));
  assert.ok(rendered.some(n => n.props.children === PRE_DRAFT_ACQUISITION_COPY));
  assert.ok(rendered.some(n => n.type === "a" && n.props.href === "/draft"));
});
test("direct signing/trade server actions surface the authoritative RPC rejection without revalidation", async () => {
  const calls: unknown[] = [], invalidations: string[] = [];
  const mocks = { ...reads(null), "next/cache": { revalidatePath: (path: string) => invalidations.push(path) },
    "@/lib/supabase/server": { createClient: async () => ({ rpc: async (...args: unknown[]) => { calls.push(args); return { error: { message: "DRAFT_NOT_COMPLETED" } }; } }) },
    "@/data-access/roster": { getLeagueRosterPlayersByTeam: async () => [] } };
  const market = load("src/app/(app)/players/actions.ts", mocks), trades = load("src/app/(app)/league/trade-actions.ts", mocks);
  for (const [action, args] of [[market.signPlayerAction, ["league", "player"]], [trades.proposeTradeAction, ["league", "other", ["player"], ["other-player"]]], [trades.acceptTradeAction, ["trade"]]] as const) {
    const result = await (action as unknown as (...args: unknown[]) => Promise<unknown>)(...args);
    assert.deepEqual(result, { error: PRE_DRAFT_ACQUISITION_COPY, kind: "rule" });
  }
  assert.equal(calls.length, 3); assert.deepEqual(invalidations, []);
});
