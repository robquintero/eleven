import { test } from "node:test";
import assert from "node:assert/strict";
import { syncFixtureStats } from "./sync-fixture-stats.ts";
import { result, testClient } from "../performance/test-client.ts";
import type { getFixturePlayers } from "../football-providers/api-football/client.ts";

test("real snapshot ingestion retains full unused JSON, unmapped players, nulls/zeros and pinned position across rerun/correction", async () => {
  const snapshots = new Map<string, unknown>(), stats = new Map<string, unknown>();
  const response = { response: [{ team: { id: 10 }, players: [
    { player: { id: 1, name: "Mapped" }, statistics: [{ games: { minutes: 90, position: "D", captain: true, number: 17, rating: "9.1" }, shots: { total: 0, on: null }, goals: { total: 0 }, passes: { key: 0, accuracy: "84%" }, unusedFutureField: { nested: [0,null,"retain"] } }] },
    { player: { id: 2, name: "Unmapped" }, statistics: [{ games: { minutes: 1 } }] },
  ] }], parameters: { fixture: "42" }, errors: [], paging: { current: 1, total: 1 }, results: 2 } as unknown as Awaited<ReturnType<typeof getFixturePlayers>>["data"];
  const { client } = testClient(q => {
    if (q.table === "provider_mappings") return result(q.filters.some(f=>f.value==="fixture") ? {internal_entity_id:"f"} : q.filters.some(f=>f.value==="club") ? [{external_id:"10",internal_entity_id:"club"}] : [{external_id:"1",internal_entity_id:"p"}]);
    if (q.table === "football_provider_snapshots") { for(const row of q.payload as Array<{external_id:string}>) snapshots.set(row.external_id,structuredClone(row)); return result(null); }
    if (q.table === "fixtures") return result({status:"final"});
    if (q.table === "players") return result([{id:"p",position:"FWD"}]);
    if (q.table === "player_match_stats") {
      if(q.operation==="select")return result([{player_id:"p",scoring_position:"DEF"}]);
      for(const row of q.payload as Array<{player_id:string}>) stats.set(row.player_id,structuredClone(row));return result(null);
    }
    throw new Error(`Unexpected ${q.table}`);
  });
  const ingest=()=>syncFixtureStats(client,"42",{data:response,fetchedAt:"2026-10-05T23:00:00Z"});
  const first=await ingest();assert.equal(first.requestsUsed,0);assert.equal(first.counts.updated,1);assert.equal(first.counts.skipped,1);
  const saved=structuredClone([...snapshots.values()]);await ingest();assert.deepEqual([...snapshots.values()],saved);assert.equal(stats.size,1);
  const row=stats.get("p") as {scoring_position:string;reported_stats:{shots:number;shotsOnTarget:null}};
  assert.equal(row.scoring_position,"DEF");assert.equal(row.reported_stats.shots,0);assert.equal(row.reported_stats.shotsOnTarget,null);
  assert.deepEqual((snapshots.get("42") as {payload:unknown}).payload,response,"complete envelope including unused fields and unmapped players");
  response.response[0].players[0].statistics[0].goals!.total=2;
  await ingest();assert.equal((stats.get("p") as {goals:number}).goals,2);assert.equal(snapshots.size,1);
});

test("completed-only fixture refresh archives received unused fixture evidence and rejects an older provider season before writes", async () => {
  const { syncFixtures } = await import('./sync-fixtures.ts');
  const previousFetch=globalThis.fetch, previousKey=process.env.API_FOOTBALL_KEY;
  process.env.API_FOOTBALL_KEY='offline-unit-key';
  const item={fixture:{id:42,date:'2026-08-21T19:00:00Z',status:{short:'FT',elapsed:90}},league:{id:39,season:2026,round:'Regular Season - 1'},teams:{home:{id:10},away:{id:20}},goals:{home:1,away:0},unusedEvidence:{periods:{second:123},events:[{detail:'retained'}]}};
  globalThis.fetch=async url=>{
    const query=new URL(String(url)).searchParams;
    assert.equal(query.get('status'),'FT-AET-PEN');assert.equal(query.get('season'),'2026');assert.equal(query.get('from'),'2026-08-21');
    return new Response(JSON.stringify({get:'fixtures',parameters:{},errors:[],paging:{current:1,total:1},response:[item]}),{status:200});
  };
  try {
    const {client,calls}=testClient(q=>{
      if(q.table==='competitions')return result({id:'comp',season:2026});
      if(q.table==='provider_mappings')return result(q.filters.some(f=>f.value==='club')?[{external_id:'10',internal_entity_id:'home'},{external_id:'20',internal_entity_id:'away'}]:[{external_id:'42',internal_entity_id:'fixture'}]);
      if(['fixtures','football_provider_snapshots'].includes(q.table))return result(null);
      throw new Error(`Unexpected ${q.table}`);
    });
    const options={from:'2026-08-21',to:'2026-10-06',completedBefore:'2026-10-06T03:00:00Z'};
    assert.equal((await syncFixtures(client,{code:'ENG',providerLeagueId:39,providerSeason:2026},options)).counts.updated,1);
    const saved=calls.find(q=>q.table==='football_provider_snapshots')!.payload as Array<{payload:unknown}>;
    assert.deepEqual(saved[0].payload,item);
    const before=calls.length;item.league.season=2025;
    const rejected=await syncFixtures(client,{code:'ENG',providerLeagueId:39,providerSeason:2026},options);
    assert.equal(rejected.counts.failed,1);assert.match(rejected.errors.join(' '),/OUT_OF_SCOPE/);
    assert.ok(calls.slice(before).every(q=>q.operation==='select'),'no out-of-season fixture or raw writes');
  } finally {globalThis.fetch=previousFetch;if(previousKey===undefined)delete process.env.API_FOOTBALL_KEY;else process.env.API_FOOTBALL_KEY=previousKey;}
});
