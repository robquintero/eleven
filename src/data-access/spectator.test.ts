import { test } from "node:test";
import assert from "node:assert/strict";
import { querySpectatorMatchup, querySpectatorTeam, querySpectatorRound } from "./spectator.ts";
import { queryLeagueCompetitionSummary, queryTeamRoundSquad, queryMatchupSquads, type CurrentMatchup } from "./matchups.ts";
import { testClient, result, filter } from "../lib/performance/test-client.ts";
import { eligibleByeTeams, isUuid, teamViewHref } from "../lib/spectator-navigation.ts";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const start="2026-09-29T06:00:00Z", end="2026-10-06T06:00:00Z";
const round={id:id(7),number:1,status:"completed",starts_at:start,ends_at:end,scoring_rule_version:"ELEVEN_STANDARD_V3"};
const match={id:id(8),status:"final",home_fantasy_team_id:id(3),away_fantasy_team_id:id(4),fantasy_rounds:round,home_team:{name:"Home",league_id:id(1)},away_team:{name:"Away",league_id:id(1)},matchup_scores:[{fantasy_team_id:id(3),live_points:99,final_points:12,updated_at:end},{fantasy_team_id:id(4),live_points:88,final_points:9,updated_at:end}]};
test("spectator UUID validation and selected-league filters fail closed; direct reload is deterministic",async()=>{
  const {client,calls}=testClient(q=> {
    assert.equal(filter(q,"league_id"),id(1));
    if(q.table==="fantasy_teams") return result(filter(q,"id")===id(3)?{id:id(3),league_id:id(1),owner_user_id:id(2),name:"Home",abbreviation:"HOM"}:null);
    assert.equal(filter(q,"fantasy_rounds.league_id"),id(1));
    return result(filter(q,"id")===id(8)?match:null);
  });
  assert.equal(await querySpectatorTeam(client,id(1),"bad"),null);assert.equal(await querySpectatorMatchup(client,id(1),"bad",null),null);assert.equal(calls.length,0);
  assert.equal((await querySpectatorTeam(client,id(1),id(3)))?.ownerUserId,id(2));
  assert.equal(await querySpectatorTeam(client,id(1),id(99)),null);
  assert.equal(await querySpectatorMatchup(client,id(1),id(99),null),null);
  const neutral=await querySpectatorMatchup(client,id(1),id(8),id(10));
  assert.equal(neutral?.isSpectator,true);assert.equal(neutral?.isUserHome,true);assert.equal(neutral?.homeFinalPoints,12);
  assert.deepEqual(await querySpectatorMatchup(client,id(1),id(8),id(10)),neutral);
  const ownAway=await querySpectatorMatchup(client,id(1),id(8),id(4));assert.equal(ownAway?.isSpectator,false);assert.equal(ownAway?.isUserHome,false);
  assert.equal(isUuid(id(8)),true);assert.equal(teamViewHref(id(3),id(7)),`/team/${id(3)}?round=${id(7)}`);
});
test("missing score rows are unavailable, not synthetic zero; explicit round rejects a foreign UUID",async()=>{
  const {client}=testClient(q=>result(q.table==="matchups"?{...match,matchup_scores:[]}:[]));
  const value=await querySpectatorMatchup(client,id(1),id(8),null);
  assert.equal(value?.homeScoreAvailable,false);assert.equal(value?.awayScoreAvailable,false);assert.equal(value?.homeFinalPoints,null);
  assert.equal(await querySpectatorRound(client,id(1),id(99)),null);
});
test("normal team reads prefer the active stored round over future rounds and pin explicit history",async()=>{
  const active={...round,id:id(9),number:2,status:"in_progress"};const future={...round,id:id(10),number:3,status:"upcoming"};
  const {client,calls}=testClient(q=>result(q.table==="seasons"?{id:id(6)}:filter(q,"id")?[round]:[round,active,future]));
  assert.equal((await querySpectatorRound(client,id(1)))?.id,id(9));
  assert.equal((await querySpectatorRound(client,id(1),id(7)))?.scoringRuleVersion,"ELEVEN_STANDARD_V3");
  assert.equal(calls.filter(q=>q.table==="seasons").length,1,"explicit historical read never resolves latest season");
  assert.ok(calls.filter(q=>q.table==="fantasy_rounds").every(q=>filter(q,"league_id")===id(1)));
});
test("round selection spans real seasons while official current records remain current-season only",async()=>{
  const old={...round,season_id:id(5),seasons:{season_number:1}};const current={...round,id:id(9),number:1,status:"in_progress",starts_at:end,ends_at:"2026-10-13T06:00:00Z",season_id:id(6),seasons:{season_number:2}};
  const {client,calls}=testClient(q=>{
    if(q.table==="seasons")return result({id:id(6)});
    if(q.table==="fantasy_rounds")return result([old,current]);
    if(q.table==="fantasy_teams")return result([{id:id(3),name:"Home"},{id:id(4),name:"Away"}]);
    if(q.table==="matchups")return result(filter(q,"fantasy_round_id")?[match]:[{...match,id:id(11),status:"live",fantasy_rounds:current,matchup_scores:[]}]);
    throw new Error(q.table);
  });
  const summary=await queryLeagueCompetitionSummary(client,id(1),new Date("2026-10-07"),id(7));
  assert.equal(summary.rounds?.length,2);assert.equal(summary.currentRoundId,id(9));assert.equal(summary.allRoundMatchups?.filter(m=>m.roundId===id(7))[0].homePoints,12);
  assert.equal(summary.records.highestScore,null,"old-season scores never leak into current records");
  assert.equal(calls.length,5,"four normal bounded queries plus one selected old round query");
});
test("BYE requires a complete odd-team pairing; incomplete and empty rounds never invent a bye",()=>{
  const teams=[1,2,3,4,5].map(n=>({id:id(n),name:String(n)}));const pairs=[{homeTeamId:id(1),awayTeamId:id(2)},{homeTeamId:id(3),awayTeamId:id(4)}];
  assert.deepEqual(eligibleByeTeams(teams,pairs),[teams[4]]);assert.deepEqual(eligibleByeTeams(teams,[]),[]);assert.deepEqual(eligibleByeTeams(teams,pairs.slice(0,1)),[]);assert.deepEqual(eligibleByeTeams(teams.slice(0,4),pairs),[]);
});
const catalog={id:id(20),name:"Historical player",short_name:"Historic",position:"DEF",club_id:id(30),clubs:{id:id(30),name:"Club",short_name:"CLB",competition_id:id(31),competitions:{code:"ENG"}}};
function historyClient(empty=false){return testClient(q=>{
  if(q.table==="lineup_slots")return result(empty?[]:[{roster_entry_id:filter(q,"roster_entries.fantasy_team_id")===id(4)?id(42):id(40),starter:true,locked_at:start,roster_entries:{id:id(40),player_id:id(20),status:"dropped",acquired_at:filter(q,"roster_entries.fantasy_team_id")===id(4)?"2026-10-01T06:00:00Z":"2026-09-28",players:catalog}},{roster_entry_id:id(41),starter:false,locked_at:start,roster_entries:{id:id(41),player_id:id(21),status:"active",acquired_at:start,players:{...catalog,id:id(21),name:"Bench"}}}]);
  if(q.table==="roster_entries")return result([]);
  if(q.table==="players")return result((filter(q,"id") as string[]).map(pid=>({id:pid,club_id:id(30)})));
  if(q.table==="player_national_teams")return result([]);
  if(q.table==="clubs")return result([{id:id(30),short_name:"CLB"},{id:id(32),short_name:"OPP"}]);
  if(q.table==="fixtures")return result([{id:id(50),kickoff_at:"2026-09-30T06:00:00Z",home_club_id:id(30),away_club_id:id(32),status:"final",competitions:{code:"ENG"}},{id:id(51),kickoff_at:"2026-10-02T06:00:00Z",home_club_id:id(30),away_club_id:id(32),status:"final",competitions:{code:"ENG"}}]);
  if(q.table==="fantasy_player_scores"){assert.equal(filter(q,"scoring_rule_version"),"ELEVEN_STANDARD_V3");return result([{player_id:id(20),fixture_id:id(50),points:3},{player_id:id(20),fixture_id:id(51),points:5}]);}
  throw new Error(q.table);
});}
test("stored historical starters and bench survive roster moves, with no today's-roster fallback and bounded enrichment",async()=>{
  const {client,calls}=historyClient();const squad=await queryTeamRoundSquad(client,id(3),{id:id(7),startsAt:start,endsAt:end,scoringRuleVersion:"ELEVEN_STANDARD_V3"},false,"Home");
  assert.equal(squad.starters[0].player.name,"Historical player");assert.equal(squad.starters[0].player.fantasyPoints,8);assert.equal(squad.starters[0].player.ownership,"owned");assert.equal(squad.bench[0].name,"Bench");
  assert.equal(calls.length,7);assert.equal(calls.filter(q=>q.table==="fantasy_player_scores").length,1);assert.equal(calls.some(q=>q.table==="roster_entries"),false);
  const absent=historyClient(true);const missing=await queryTeamRoundSquad(absent.client,id(3),{id:id(7),startsAt:start,endsAt:end,scoringRuleVersion:"ELEVEN_STANDARD_V3"},false,"Home");assert.equal(missing.starters.length,0);assert.equal(missing.bench.length,0);assert.equal(absent.calls.length,1);
});
test("a traded historical player uses each team's own acquisition cutoff in one score batch",async()=>{
  const {client,calls}=historyClient();const m:CurrentMatchup={...(await querySpectatorMatchup(testClient(()=>result(match)).client,id(1),id(8),null))!};
  const squads=await queryMatchupSquads(client,m);assert.equal(squads.home.starters[0].player.fantasyPoints,8);assert.equal(squads.away.starters[0].player.fantasyPoints,5);assert.equal(squads.away.starters[0].player.preAcquisitionPoints,3);
  assert.equal(squads.home.starters[0].player.ownership,"owned");assert.equal(squads.away.starters[0].player.ownership,"owned");assert.equal(calls.filter(q=>q.table==="fantasy_player_scores").length,1);assert.equal(calls.length,9);
});

test("an inconsistent cross-league team pairing fails closed even when the matchup itself is selected-league scoped",async()=>{
  const {client}=testClient(()=>result({...match,home_team:{name:"Private",league_id:id(99)}}));
  assert.equal(await querySpectatorMatchup(client,id(1),id(8),null),null);
});
