import { test } from "node:test";
import assert from "node:assert/strict";
import { queryLeagueCompetitionSummary, getStandingsForSeason } from "./matchups.ts";
import { filter, result, testClient } from "../lib/performance/test-client.ts";
const old = { id:"old",status:"scheduled",home_fantasy_team_id:"home",away_fantasy_team_id:"away",
  fantasy_rounds:{number:1,season_id:"s",starts_at:"2026-09-29T06:00:00Z",ends_at:"2026-10-06T06:00:00Z",status:"in_progress"},
  matchup_scores:[{fantasy_team_id:"home",live_points:150.85,final_points:null},{fantasy_team_id:"away",live_points:137.8,final_points:null}] };
const next = {...old,id:"next",fantasy_rounds:{...old.fantasy_rounds,number:2,starts_at:old.fantasy_rounds.ends_at,ends_at:"2026-10-13T06:00:00Z"},
  matchup_scores:old.matchup_scores.map(s=>({...s,live_points:0}))};
function database(final=false,missingSide=false) {
  return testClient(q=>{
    if(q.table==="seasons")return result({id:"s"});
    if(q.table==="fantasy_rounds")return result([{id:"old"},{id:"next"}]);
    if(q.table==="fantasy_teams")return result([{id:"home",name:"Kaka FC"},{id:"away",name:"Los Duros FC"}]);
    if(q.table==="matchups"){
      const row={...old,status:final?"final":"scheduled",matchup_scores:old.matchup_scores.slice(0,missingSide?1:2).map(s=>({...s,final_points:final?s.live_points:null}))};
      return result(filter(q,"status")==="final"?(final?[row]:[]):[row,next]);
    }
    throw new Error(q.table);
  });
}
test("06:00 and 06:30 show real prior scores PENDING alongside new active week, without official records/standings",async()=>{
  for(const time of ["06:00","06:30"]){const {client,calls}=database();const summary=await queryLeagueCompetitionSummary(client,"league",new Date(`2026-10-06T${time}:00Z`));
    assert.equal(summary.currentRoundMatchups[0].roundNumber,2);assert.equal(summary.currentRoundMatchups[0].resultState,"active");
    assert.deepEqual(summary.recentResults.map(s=>[s.roundNumber,s.resultState,s.homePoints,s.awayPoints]),[[1,"pending",150.85,137.8]]);
    assert.equal(summary.records.highestScore,null);assert.deepEqual(await getStandingsForSeason(client,"s"),[]);
    assert.ok(calls.every(q=>q.operation==="select"));
  }
});
test("FINAL results publish official W/L/PF/PA once; pending missing side remains null instead of fake zero",async()=>{
  const {client}=database(true);const summary=await queryLeagueCompetitionSummary(client,"league",new Date("2026-10-06T07:00Z"));
  assert.equal(summary.recentResults[0].resultState,"final");assert.equal(summary.records.highestScore?.value,150.85);
  assert.deepEqual((await getStandingsForSeason(client,"s")).map(r=>[r.teamName,r.played,r.wins,r.losses,r.pointsFor,r.pointsAgainst]),[["Kaka FC",1,1,0,150.85,137.8],["Los Duros FC",1,0,1,137.8,150.85]]);
  const missing=await queryLeagueCompetitionSummary(database(false,true).client,"league",new Date("2026-10-06T07:00Z"));assert.equal(missing.recentResults[0].awayPoints,null);
});
