import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import ts from "typescript";
const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "../..");
type Element = { type: unknown; props: Record<string, unknown> };
// Inspect the actual presentation tree without a browser, credentials, or data access.
function load(file: string): Record<string, (props: Record<string, unknown>) => Element> {
  const filename = resolve(root, file);
  const compiledModule = { exports: {} };
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const localRequire = (id: string): unknown => {
    if (id.endsWith(".css")) return {};
    if (id.startsWith("@/data-access/") || id.includes("/actions")) throw new Error(`Unexpected server dependency: ${id}`);
    if (id === "@/components/shell/transition-link") return { TransitionLink: (props: Record<string, unknown>) => ({type:"a",props}) };
    if (id === "lucide-react") return new Proxy({}, { get: () => () => null });
    if (id === "@/components/players/player-avatar") return { PlayerAvatar: () => null };
    if (id.startsWith("@/") || id.startsWith(".")) {
      const path = id.startsWith("@/") ? resolve(root, "src", id.slice(2)) : resolve(dirname(filename), id);
      const target = [path, path + ".tsx", path + ".ts"].find(p => existsSync(p) && /\.(ts|tsx)$/.test(p));
      if (target) return load(target);
    }
    return require(id);
  };
  new Function("require", "module", "exports", code)(localRequire, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const element = value as Element;
  if (typeof element.type === "function") return nodes(element.type(element.props));
  return [element, ...nodes(element.props.children)];
}
function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).join("");
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (!value || typeof value !== "object" || !("props" in value)) return "";
  const element = value as Element;
  return text(typeof element.type === "function" ? element.type(element.props) : element.props.children);
}

const { HomeMatchup, HomeFixtureCard, HomeLeaguePosition, HomeIdentity, HomeLoading } = load("src/components/dashboard/home-overview.tsx");
const now = new Date("2026-10-07T12:00:00Z");
const base = { id: "m", roundNumber: 2, roundStartsAt: "2026-10-06T06:00:00Z", roundEndsAt: "2026-10-13T06:00:00Z", roundStatus: "in_progress", status: "live", isUserHome: false, homeTeamName: "Opponent", awayTeamName: "Kaka FC", homeLivePoints: 12.35, awayLivePoints: 0, homeFinalPoints: null, awayFinalPoints: null, scoresUpdatedAt: null };
const hero = (overrides = {}, clock = now) => HomeMatchup({ matchup: {...base,...overrides}, now: clock, squads: null, topPerformer: null });

test("Home scores keep user's side first, distinguish real zero/missing, and retain negative/hundredth precision", () => {
  assert.match(text(hero()), /Kaka FC0\.0OpponentOpponent12\.35/);
  assert.match(text(hero({awayScoreAvailable:false})), /Kaka FC—/);
  assert.match(text(hero({awayLivePoints:-10.25})), /Kaka FC-10\.25/);
  assert.match(text(hero({isUserHome:true})), /Opponent12\.35OpponentKaka FC0\.0/);
  assert.equal(nodes(hero()).filter(n=>n.props.className==='home-score').length,2);
});
test("Home upcoming/final/pending semantics match authoritative rules and never declare a pending winner", () => {
  const upcoming=text(hero({roundStatus:'upcoming',status:'scheduled'},new Date('2026-10-05')));
  assert.match(upcoming,/UPCOMING/);assert.match(upcoming,/Kaka FC—OpponentOpponent—/);assert.doesNotMatch(upcoming,/Winner/);
  const pending=text(hero({},new Date('2026-10-14')));assert.match(pending,/PENDING/);assert.match(pending,/Finalizing result/);assert.doesNotMatch(pending,/Winner/);
  const final=text(hero({status:'final',roundStatus:'completed',homeFinalPoints:9,awayFinalPoints:21}));assert.match(final,/Kaka FC21\.0OpponentOpponent9\.0/);assert.match(final,/Winner · Kaka FC/);
  assert.match(text(hero({status:'final',homeFinalPoints:9,awayFinalPoints:9})),/Draw/);
  assert.doesNotMatch(text(hero({status:'final'})),/Winner|Draw/);
});
test("Home exposes live freshness and preserves the existing 15-minute stale threshold", () => {
  assert.match(text(hero()),/Awaiting first score sync/);
  assert.match(text(hero({scoresUpdatedAt:'2026-10-07T11:45:00Z'})),/Scores updated 15m ago/);
  assert.match(text(hero({scoresUpdatedAt:'2026-10-07T11:44:00Z'})),/Score sync is stale/);
  assert.match(text(hero({scoresUpdatedAt:now.toISOString()})),/Scores updated just now/);
});
test("Home next-lock fixture participation uses national-team IDs and authoritative starter buckets", () => {
  const starters=[{player:{id:'p',club:{id:'club'},fixture:{state:'upcoming'}}},{player:{id:'q',club:{id:'club'},fixture:{state:'final'}}}];
  const fixtureIntel={hasAnyFixtureData:true,liveFixtureCount:2,nextFixture:{homeClubId:'national',awayClubId:'other',homeClubShortName:'FRA',awayClubShortName:'GER',kickoffAt:'2026-10-10T13:30:00Z'}};
  const result=HomeFixtureCard({fixtureIntel,starters,hasActiveRound:true,teamIdsByPlayerId:new Map([['p',['club','national']]])});
  assert.match(text(result),/FRA v GER/);assert.match(text(result),/1 of your starters involved/);assert.match(text(result),/1 starters remaining/);assert.match(text(result),/2 fixtures live now/);
  assert.ok(nodes(result).some(n=>n.props.href==='/team'));
});
test("Home standings retain actual ordering, record, league points and own row outside top six", () => {
  const standings=Array.from({length:8},(_,i)=>({fantasyTeamId:String(i),teamName:'Team '+i,wins:i,draws:1,losses:2,leaguePoints:3*i}));
  const result=HomeLeaguePosition({standings,myTeamId:'7'});
  assert.match(text(result),/8 \/ 87W · 1D · 2L21 league points/);assert.match(text(result),/Team 7You/);assert.doesNotMatch(text(result),/Team 6/);
  assert.equal(nodes(result).filter(n=>n.props.role==='row').length,8);
  assert.ok(nodes(result).some(n=>n.props.href==='/league'));
});
test("Home truthful empty/loading states invent no matchup and use persisted UTC window", () => {
  const empty=text(HomeMatchup({matchup:null,now,squads:null,topPerformer:null}));assert.match(empty,/No matchup has been scheduled/);assert.doesNotMatch(empty,/TBD|0\.0/);
  assert.match(text(HomeLeaguePosition({standings:[],myTeamId:null})),/No league results yet/);
  assert.match(text(HomeFixtureCard({fixtureIntel:null,starters:[],hasActiveRound:true})),/not available yet/);
  assert.match(text(HomeFixtureCard({fixtureIntel:null,starters:[],hasActiveRound:false})),/No active matchweek/);
  const loading=HomeLoading({});assert.match(text(loading),/Loading your matchweek/);assert.equal(String(loading.props['aria-busy']),'true');assert.doesNotMatch(text(loading),/TBD|Kaka/);
  const identity=text(HomeIdentity({teamName:'Kaka FC',leagueName:'Fantastic 4',matchup:base}));assert.match(identity,/Matchweek 2 · Fantastic 4/);assert.match(identity,/OCT 6, 6:00 AM UTC/);assert.match(identity,/OCT 13, 6:00 AM UTC/);
});
