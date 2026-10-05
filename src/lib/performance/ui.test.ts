import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createElement, type ReactNode } from "react";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "../../..");
const { renderToReadableStream } = require("next/dist/compiled/react-server-dom-webpack/server.node.js");

// Transpile the actual TSX in memory; no build artifacts, Next server,
// credentials or network. Only data-access and client framework bindings
// are substituted. Unlisted data-access imports fail closed.
function load(file: string, mocks: Record<string, unknown> = {}): Record<string, unknown> {
  const filename = resolve(root, file);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const compiled = { exports: {} };
  const localRequire = (id: string): unknown => {
    if (id in mocks) return mocks[id];
    if (id.startsWith("@/data-access/")) throw new Error(`Unmocked data access: ${id}`);
    if (id.startsWith("@/components/") && !id.includes("workspace-loading") && !id.includes("matchup-command") && !id.includes("transition-link")) {
      return new Proxy({}, { get: (_target, name) => name === "__esModule" ? true : ({ children, title }: { children?: ReactNode; title?: string }) => createElement("div", {}, title ?? String(name), children) });
    }
    if (id.startsWith("@/") || id.startsWith(".")) {
      const path = id.startsWith("@/") ? resolve(root, "src", id.slice(2)) : resolve(dirname(filename), id);
      const target = /\.(tsx|ts)$/.test(path) ? path : [path + ".tsx", path + ".ts"].find(path => { try { readFileSync(path); return true; } catch { return false; } });
      if (target) return load(target, mocks);
    }
    return require(id);
  };
  new Function("require", "module", "exports", code)(localRequire, compiled, compiled.exports);
  return compiled.exports;
}
async function flight(element: ReactNode): Promise<string> {
  const stream = await renderToReadableStream(element, {});
  return new Response(stream).text();
}
const icon = () => createElement("svg");
const icons = new Proxy({}, { get: (_target, name) => name === "__esModule" ? true : icon });
const nextLink = { __esModule: true, default: ({ children, ...props }: { children?: ReactNode }) => createElement("a", props, children), useLinkStatus: () => ({ pending: false }) };

test("all destination loading boundaries render safely with destination geometry and accessible pending status", async () => {
  for (const route of ["home", "team", "matchup", "players", "league", "draft"]) {
    const { default: Loading } = load(`src/app/(app)/${route}/loading.tsx`);
    const result = await flight(createElement(Loading as () => ReactNode));
    assert.match(result, /LOADING/); assert.match(result, /aria-busy/); assert.match(result, /status/);
    if (route === "team") for (const section of ["FORWARDS", "MIDFIELD", "DEFENCE", "GOALKEEPER", "BENCH"]) assert.match(result, new RegExp(section));
    if (route === "matchup") assert.match(result, /MATCHUP_COMMAND/);
    assert.doesNotMatch(result, /animate-ping|animate-spin|inset-0/);
  }
});

test("desktop and touch navigation retain all six correct native destinations with automatic prefetch", async () => {
  const mocks = { "next/link": nextLink, "next/navigation": { usePathname: () => "/home" }, "lucide-react": icons };
  for (const name of ["desktop", "mobile"]) {
    const component = load(`src/components/shell/${name}-nav.tsx`, mocks)[name === "desktop" ? "DesktopNav" : "MobileNav"];
    const result = await flight(createElement(component as () => ReactNode));
    for (const route of ["home", "team", "matchup", "players", "league", "draft"]) assert.match(result, new RegExp(`"href":"/${route}"`));
    assert.match(result, /"aria-current":"page"/);
    assert.doesNotMatch(result, /"prefetch":true|"prefetch":false/);
  }
});

test("native pending link feedback has no layout-changing overlay and stops with Next pending state", async () => {
  let pending = true;
  const { TransitionLink } = load("src/components/shell/transition-link.tsx", {
    "next/link": { ...nextLink, useLinkStatus: () => ({ pending }) },
  });
  const element = () => createElement(TransitionLink as (props: { href: string; label: string }) => ReactNode, { href: "/team", label: "Team" }, "Team");
  assert.match(await flight(element()), /Opening Team/);
  pending = false;
  assert.doesNotMatch(await flight(element()), /Opening Team/);
});

test("installed Next revalidation requests fresh current-route Flight even when another path is named", () => {
  // Exercise Next's real request-local invalidation flag, not a production
  // cache. This is the contract that makes Home's extra refresh redundant.
  if (!("AsyncLocalStorage" in globalThis)) Object.defineProperty(globalThis, "AsyncLocalStorage", { value: AsyncLocalStorage, configurable: true });
  const { workAsyncStorage } = require("next/dist/server/app-render/work-async-storage.external");
  const { revalidatePath } = require("next/cache");
  const { ActionDidRevalidateStaticAndDynamic } = require("next/dist/shared/lib/action-revalidation-kind");
  for (const path of ["/players", "/league", "/team"]) {
    const store: { route: string; incrementalCache: object; pathWasRevalidated?: number } = { route: "/home", incrementalCache: {} };
    workAsyncStorage.run(store, () => revalidatePath(path));
    assert.equal(store.pathWasRevalidated, ActionDidRevalidateStaticAndDynamic);
  }
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const league = { id: "league", name: "MY LEAGUE", status: "active", memberCount: 2, maxTeams: 2, role: "commissioner", inviteCode: "CODE" };
const squad = { formation: "4-4-2", starters: [], bench: [] };
const matchup = { id: "matchup", roundId: "round", roundNumber: 1, roundStartsAt: "2026-10-06T00:00:00Z", roundEndsAt: "2026-10-13T00:00:00Z", roundStatus: "upcoming", status: "scheduled", isUserHome: false, homeTeamName: "OPPONENT", awayTeamName: "MY TEAM", homeLivePoints: 0, awayLivePoints: 0, homeFinalPoints: null, awayFinalPoints: null, scoresUpdatedAt: null };

async function streamBeforeSecondary(file: string, data: Record<string, unknown>, primary: RegExp, secondary: RegExp) {
  const gate = deferred<void>();
  const reads: string[] = [];
  const mocks: Record<string, unknown> = { "lucide-react": icons, "next/link": nextLink };
  for (const [module, functions] of Object.entries(data)) {
    const mapped: Record<string, unknown> = {};
    for (const [name, result] of Object.entries(functions as Record<string, unknown>)) {
      mapped[name] = () => {
        reads.push(name);
        return typeof result === "function" ? (result as (gate: Promise<void>) => unknown)(gate.promise) : Promise.resolve(result);
      };
    }
    mocks[`@/data-access/${module}`] = mapped;
  }
  const { default: Page } = load(file, mocks);
  const stream = await renderToReadableStream(createElement(Page as () => ReactNode), {});
  let chunks = "";
  const consume = (async () => {
    const reader = stream.getReader(); const decoder = new TextDecoder();
    for (;;) { const item = await reader.read(); if (item.done) break; chunks += decoder.decode(item.value); }
  })();
  try {
    await new Promise(done => setTimeout(done, 60));
    assert.match(chunks, primary);
    assert.doesNotMatch(chunks, secondary);
  } finally { gate.resolve(); }
  await consume;
  assert.match(chunks, secondary);
  assert.equal(reads.length, new Set(reads).size, "no duplicate application data function calls in one streamed render");
}

test("Home first content streams while recommendations/activity/trades are gated", async () => {
  await streamBeforeSecondary("src/app/(app)/home/page.tsx", {
    profiles: { getCurrentProfile: { displayName: "Manager" } }, leagues: { getUserLeagues: [league] },
    "active-league": { getActiveLeagueId: "league" }, drafts: { getDraftStatus: "completed" },
    teams: { getUserTeamInLeague: { id: "mine", name: "MY TEAM" }, getLeagueTeams: async (gate: Promise<void>) => { await gate; return []; } },
    matchups: { getCurrentMatchup: null, getUserSquad: squad, getStandings: async (gate: Promise<void>) => { await gate; return []; } },
    roster: { getUserSquad: squad, getTeamRosterPlayers: [] },
    intelligence: { getHotFreeAgents: async (gate: Promise<void>) => { await gate; return []; } },
    transactions: { getRecentActivity: async (gate: Promise<void>) => { await gate; return []; } },
    trades: { getTeamTrades: async (gate: Promise<void>) => { await gate; return { incoming: [], outgoing: [] }; } },
  }, /StartingXI/, /FormIntelligence/);
});

test("Matchup teams and XI stream before next-kickoff intelligence with user's team left", async () => {
  await streamBeforeSecondary("src/app/(app)/matchup/page.tsx", {
    leagues: { getUserLeagues: [league] }, "active-league": { getActiveLeagueId: "league" }, drafts: { getDraftStatus: "completed" },
    teams: { getUserTeamInLeague: { id: "mine" } },
    matchups: { getCurrentMatchup: matchup, getMatchupSquads: { home: squad, away: squad, teamIdsByPlayerId: new Map() },
      getMatchupFixtureIntelligence: async (gate: Promise<void>) => { await gate; return null; } },
  }, /MY TEAM[\s\S]*OPPONENT/, /KICKOFF NOT YET SCHEDULED/);
});

test("League standings and identity stream before competition/history/transactions/trades", async () => {
  await streamBeforeSecondary("src/app/(app)/league/page.tsx", {
    profiles: { getCurrentProfile: { displayName: "Manager" } }, leagues: { getUserLeagues: [league], getLeagueDetail: { ...league, members: [] } },
    "active-league": { getActiveLeagueId: "league" }, drafts: { getDraftStatus: "completed" },
    teams: { getUserTeamInLeague: { id: "mine" }, getLeagueTeams: async (gate: Promise<void>) => { await gate; return []; } },
    matchups: { getStandings: [], getLeagueCompetitionSummary: async (gate: Promise<void>) => { await gate; return null; } },
    seasons: { getSeasonSummary: null, listSeasons: async (gate: Promise<void>) => { await gate; return []; } },
    transactions: { getRecentActivity: async (gate: Promise<void>) => { await gate; return []; } },
    trades: { getTeamTrades: async (gate: Promise<void>) => { await gate; return { incoming: [], outgoing: [] }; } },
  }, /STANDINGS/, /LeagueMatchups/);
});
