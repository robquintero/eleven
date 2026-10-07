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
    if (id.endsWith(".css")) return {};
    if (id === "next/link") return nextLink;
    if (id === "next/navigation") return { notFound: () => { throw new Error("NOT_FOUND"); } };
    if (id.startsWith("@/data-access/")) throw new Error(`Unmocked data access: ${id}`);
    const componentPath = id.startsWith("@/components/") || (id.startsWith(".") && resolve(dirname(filename), id).includes("/components/"));
    const serverPresenters = ["home-overview", "app-frame", "status-bar", "workspace-loading", "matchup-command", "transition-link", "league-matchups", "matchup-status", "team-name", "matchup-page-view", "league-overview", "league-sections", "/ui/v2", "/ui/core-v2"];
    if (componentPath && !serverPresenters.some(name => id.includes(name))) {
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
    assert.match(result, route === "home" ? /Loading your matchweek/ : /Loading/i); assert.match(result, /aria-busy/); assert.match(result, /status/);
    if (route === "team") for (const section of ["Forwards", "Midfield", "Defence", "Goalkeeper", "Bench"]) assert.match(result, new RegExp(section));
    if (route === "matchup") assert.match(result, /Matchup/);
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
  const mocks: Record<string, unknown> = { "lucide-react": icons, "next/link": nextLink, "@/lib/scoring/catalog-version": { getCurrentCatalogScoringVersion: async () => "ELEVEN_STANDARD_V4" } };
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
  const exports = load(file, mocks);
  const Page = exports.default ?? exports.AppShell;
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
  }, /Standings/, /LeagueMatchups/);
});

test("League pending results render real scores/date range and restrained status, with no official winner or wrong current-matchup link",async()=>{
  const { LeagueMatchups }=load("src/components/league/league-matchups.tsx",{"next/link":nextLink});
  const matchup={id:"old",roundNumber:1,roundStartsAt:"2026-09-29T06:00:00Z",roundEndsAt:"2026-10-06T06:00:00Z",resultState:"pending",status:"scheduled",homeTeamId:"mine",homeTeamName:"Kaka FC",homePoints:150.85,awayTeamId:"other",awayTeamName:"Los Duros FC",awayPoints:137.8};
  const render=(m: typeof matchup)=>flight(createElement(LeagueMatchups as (props:Record<string,unknown>)=>ReactNode,{matchups:[m],myTeamId:"mine",emptyLabel:"NO RESULTS"}));
  const output=await render(matchup);
  for(const value of ["Kaka FC","Los Duros FC","150.85","137.8","PENDING","Finalizing result","Sep 29","Oct 6","UTC"])assert.ok(output.includes(value),value);
  assert.doesNotMatch(output,/WINNER|WON|UPCOMING|"href":"\/matchup"/);
  assert.match(await render({...matchup,awayPoints:null as unknown as number}),/—/);
});

test("Home/Matchup command shares closed-week PENDING semantics and shows scores, not a live or scheduled winner",async()=>{
  const { MatchupCommand }=load("src/components/dashboard/matchup-command.tsx");
  const result=await flight(createElement(MatchupCommand as (props:Record<string,unknown>)=>ReactNode,{matchup:{...matchup,roundStatus:"in_progress",roundStartsAt:"2026-09-29T06:00:00Z",roundEndsAt:"2026-10-06T06:00:00Z",homeLivePoints:150.85,awayLivePoints:137.8},hasLeague:true,now:new Date("2026-10-06T06:30Z")}));
  assert.match(result,/PENDING/);assert.match(result,/150.85/);assert.match(result,/137.8/);assert.doesNotMatch(result,/IN PROGRESS|"children":"FINAL"/);
});

test("V2 matchup cards preserve real scores, UUID destinations, final-only winners and own-matchup priority", async () => {
  const { LeagueMatchups } = load("src/components/league/league-matchups.tsx", { "next/link": nextLink });
  const base = { id:"neutral", roundNumber:2, roundStartsAt:"2026-10-06T06:00:00Z", roundEndsAt:"2026-10-13T06:00:00Z", status:"live", resultState:"pending", homeTeamId:"a", awayTeamId:"b", homeTeamName:"Neutral home", awayTeamName:"Neutral away", homePoints:150.85, awayPoints:137.8 };
  const render = (matchups: Record<string, unknown>[]) => flight(createElement(LeagueMatchups as (props:Record<string,unknown>)=>ReactNode,{variant:"v2",matchups,myTeamId:"mine",emptyLabel:"No results yet"}));
  const pending = await render([base, {...base,id:"own",homeTeamId:"mine",homePoints:null}]);
  assert.ok(pending.indexOf('"href":"/matchup/own"') < pending.indexOf('"href":"/matchup/neutral"'));
  for(const value of ["150.85", "137.8", "—", "PENDING", "Finalizing result", "Your matchup"]) assert.ok(pending.includes(value),value);
  assert.doesNotMatch(pending,/Winner|Draw|"href":"\/matchup"/);
  assert.match(await render([{...base,resultState:"final",status:"final"}]),/Winner · Neutral home/);
  assert.match(await render([{...base,resultState:"final",status:"final",awayPoints:150.85}]),/Draw/);
  assert.doesNotMatch(await render([{...base,resultState:"final",status:"final",awayPoints:null}]),/Winner|Draw/);
  assert.match(await render([]),/No results yet/);
});

test("V2 tokens remain opt-in and all small-text colors meet AA on every surface state", () => {
  const css = readFileSync(resolve(root,"src/app/eleven-v2.css"),"utf8") + "\n" + readFileSync(resolve(root,"src/app/(app)/league/v2.css"),"utf8");
  const postcss = require("postcss");
  postcss.parse(css).walkRules((rule: {selectors: string[]}) => { for(const selector of rule.selectors) assert.ok(selector.trim().startsWith(".eleven-v2") || selector.trim().startsWith(".dark .eleven-v2"),selector); });
  const luminance = (hex:string) => hex.match(/\w\w/g)!.map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
  const contrast=(a:string,b:string)=>{const values=[luminance(a),luminance(b)].sort((a,b)=>b-a);return (values[0]+.05)/(values[1]+.05);};
  for(const block of css.matchAll(/(?:^|\n)(?:\.dark )?\.eleven-v2 \{([^}]+)\}/g)) {
    const tokens = Object.fromEntries([...block[1].matchAll(/--v2-([\w-]+):\s*(#[\da-f]+)/g)].map(m=>[m[1],m[2]]));
    for(const text of ["text","secondary","muted","accent","positive","negative"]) for(const background of ["canvas","surface","inset","hover","selected"]) assert.ok(contrast(tokens[text],tokens[background])>=4.5,`${text} on ${background}`);
    assert.ok(contrast("#ffffff",tokens.action)>=4.5,"primary action contrast");
  }
});


test("authenticated frame streams before the same gated lineup status reads without adding queries", async () => {
  await streamBeforeSecondary("src/components/shell/app-shell.tsx", {
    profiles: { getCurrentProfile: { displayName: "Manager" } },
    leagues: { getUserLeagues: [league] }, "active-league": { getActiveLeagueId: "league" },
    teams: { getUserTeamInLeague: { id: "mine" } },
    matchups: { getCurrentMatchup: { ...matchup, status: "live", roundStartsAt: "2026-10-06T06:00:00Z", roundEndsAt: "2099-10-13T06:00:00Z" },
      getMatchupStatusStarters: async (gate: Promise<void>) => { await gate; return [0,1].map(i => ({ id: String(i), player: { fixture: { state: "live" } } })); } },
  }, /main-content/, /2," live/);
});

test("shell status preserves authoritative values across result states, null state and next-lock formatting", async () => {
  const { StatusBar } = load("src/components/shell/status-bar.tsx");
  const render = (data: unknown) => flight(createElement(StatusBar as (props: {data: unknown}) => ReactNode, {data}));
  for (const state of ["upcoming", "active", "live", "pending", "final"]) {
    const result = await render({ roundNumber: 2, resultState: state, liveCount: 3, lockedCount: 4, remainingCount: 5, nextLockKickoff: null });
    for (const value of ["Matchweek ", "2", "3", " live · ", "4", " locked · ", "5", " remaining", "No remaining locks"]) assert.ok(result.includes(value), value);
    assert.doesNotMatch(result, /MATCHDAY|NEXT_LOCK/);
  }
  const empty = await render(null);assert.match(empty, /No active matchweek/);assert.match(empty, /Next lock not scheduled/);
  const next = await render({ roundNumber: 2, resultState: "active", liveCount: 0, lockedCount: 0, remainingCount: 11, nextLockKickoff: "2026-10-10T13:30:00Z" });
  assert.match(next, /Next lock /);assert.doesNotMatch(next, /No remaining locks/);
});
