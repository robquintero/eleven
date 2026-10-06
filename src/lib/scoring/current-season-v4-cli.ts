/** Explicitly authorized current-season release tool. Never imported by the app.
 * Each phase prints its exact scope; provider calls only occur in metadata/enrich. */
import "server-only";
import { writeFile } from "node:fs/promises";
import { createAdminClient } from "../supabase/admin.ts";
import { currentSeasonV4Plan, type HistoricalFixture } from "./current-season-v4.ts";
import { syncFixtures } from "../football-ingestion/sync-fixtures.ts";
import { syncFixtureStats } from "../football-ingestion/sync-fixture-stats.ts";
import { backfillScores } from "./backfill.ts";
import { reconcileFantasyStateForFixtures } from "../fantasy-engine/reconciliation.ts";
import { shouldStopForQuota } from "../football-ingestion/quota.ts";
import { SCORING_V4_STATS } from "../../domain/fantasy/scoring-v4.ts";
import type { ProviderQuota } from "../football-providers/types.ts";
import type { getFixturePlayers } from "../football-providers/api-football/client.ts";

const flags=Object.fromEntries(process.argv.slice(2).map((a,i,all)=>a.startsWith('--')?[a.slice(2),all[i+1]?.startsWith('--')? 'true':all[i+1]??'true']:[]).filter(a=>a.length));
const phase=flags.phase??'plan',frontier=flags.frontier;
if(!frontier || !['plan','metadata','enrich','score','audit'].includes(phase))throw new Error('Specify --phase plan|metadata|enrich|score|audit --frontier <captured current UTC clock>');
if(new Date(frontier).getTime()>Date.now())throw new Error('FUTURE_FRONTIER_FORBIDDEN');
const admin=createAdminClient();
async function pages<T>(read:(offset:number)=>PromiseLike<{data:T[]|null;error:{message:string}|null}>):Promise<T[]> {
 const all:T[]=[];for(let offset=0;;offset+=1000){const {data,error}=await read(offset);if(error)throw new Error(error.message);all.push(...data??[]);if((data??[]).length<1000)return all;}
}
const [fixtures,mappings]=await Promise.all([
 pages(o=>admin.from('fixtures').select('id,season,kickoff_at,status,competitions(code)').order('id').range(o,o+999)),
 pages(o=>admin.from('provider_mappings').select('external_id,internal_entity_id').eq('provider','api-football').eq('internal_entity_type','fixture').order('external_id').range(o,o+999)),
]);
const externalById=new Map(mappings.map(m=>[m.internal_entity_id,m.external_id]));
const input:HistoricalFixture[]=fixtures.flatMap(f=>f.competitions&&f.season&&externalById.has(f.id)?[{id:f.id,code:f.competitions.code,season:f.season,kickoffAt:f.kickoff_at,status:f.status,externalId:externalById.get(f.id)!}]:[]);
const plan=currentSeasonV4Plan(input,frontier,flags['include-current-concacaf']==='true');
const selected=plan.flatMap(c=>c.fixtures),selectedIds=new Set(selected.map(f=>f.id));
const stats=await pages(o=>admin.from('player_match_stats').select('player_id,fixture_id,reported_stats,scoring_position').order('fixture_id').order('player_id').range(o,o+999));
let snapshots:Array<{external_id:string;fixture_id:string;fetched_at:string}>=[];
// Planning before the new migration is safe; only this exact missing-table
// case is allowed. Every other DB failure is fatal.
const snapshotTable=await admin.from('football_provider_snapshots').select('external_id,fixture_id,fetched_at').eq('endpoint','/fixtures/players').limit(1);
if(snapshotTable.error && phase!=='plan')throw new Error(snapshotTable.error.message);
if(snapshotTable.error && !['PGRST205','42P01'].includes(snapshotTable.error.code))throw new Error(snapshotTable.error.message);
if(!snapshotTable.error)snapshots=await pages(o=>admin.from('football_provider_snapshots').select('external_id,fixture_id,fetched_at').eq('provider','api-football').eq('endpoint','/fixtures/players').eq('observed_fixture_status','final').order('external_id').range(o,o+999));
const archived=new Map(snapshots.map(s=>[s.fixture_id,s]));
const scopedStats=stats.filter(s=>selectedIds.has(s.fixture_id));
const summary={phase,frontier,competitions:plan.map(c=>({code:c.code,providerSeason:c.providerSeason,seasonFirstFixture:c.seasonFirstFixture,from:c.from,through:c.through,fixtures:c.fixtures.length})),fixtures:selected.length,
 rawArchived:selected.filter(f=>archived.has(f.id)).length,richPerformances:scopedStats.filter(s=>s.reported_stats!=null&&s.scoring_position!=null).length,
 requiringRefetch:selected.filter(f=>!archived.has(f.id)).length,
 metadataRequests:plan.length, playerStatRequests:selected.filter(f=>!archived.has(f.id)).length,
 expectedProviderRequests:phase==='metadata'?plan.length:phase==='enrich'?selected.filter(f=>!archived.has(f.id)).length:0};
console.log(JSON.stringify({scope:summary}));
let attempted=0,succeeded=0,failed=0,reused=0,empty=0,scored=0,skipped=0,lastQuota:ProviderQuota={};
const results:unknown[]=[];
if(phase==='metadata')for(const c of plan){
 attempted++;
 const result=await syncFixtures(admin,c,{from:c.from.slice(0,10),to:frontier.slice(0,10),completedBefore:frontier,excludeQualifying:c.code==='UCL'||c.code==='UEL'});
 lastQuota=result.quota;results.push({code:c.code,...result});
 console.log(JSON.stringify({competition:c.code,counts:result.counts,quota:lastQuota}));
 if(result.counts.failed)throw new Error(`Fixture metadata persistence failed for ${c.code}: ${result.errors.join('; ')}`);
 if(c.fixtures.length && !result.counts.created && !result.counts.updated)throw new Error(`HISTORICAL_MANIFEST_NOT_VERIFIED: provider returned no usable fixtures for ${c.code}`);
 if(result.pagination && result.pagination.totalPages>1)throw new Error('UNEXPECTED_PAGINATION_STOP: report expanded scope before another page');
 succeeded++;if(shouldStopForQuota(lastQuota))throw new Error('QUOTA_SAFETY_STOP');
}
if(phase==='enrich')for(const [index,f]of selected.entries()){
 const existing=archived.get(f.id);let stored:Parameters<typeof syncFixtureStats>[2];
 if(existing){
  const {data,error}=await admin.from('football_provider_snapshots').select('payload,fetched_at').eq('provider','api-football').eq('endpoint','/fixtures/players').eq('external_id',f.externalId).single();
  if(error)throw new Error(error.message);
  stored={data:data.payload as unknown as Awaited<ReturnType<typeof getFixturePlayers>>['data'],fetchedAt:data.fetched_at};reused++;
 }else attempted++;
 const result=await syncFixtureStats(admin,f.externalId,stored);results.push({fixtureId:f.id,...result});
 if(!stored){lastQuota=result.quota;if(result.counts.failed)failed++;else succeeded++;}
 if(result.counts.failed)throw new Error(`Fixture enrichment failed for ${f.externalId}: ${result.errors.join('; ')}`);
 if(result.scope.providerPerformances===0)empty++;
 if(index%20===0||index===selected.length-1)console.log(JSON.stringify({progress:index+1,total:selected.length,attempted,succeeded,reused,empty,quota:lastQuota}));
 if(!stored&&shouldStopForQuota(lastQuota))throw new Error('QUOTA_SAFETY_STOP');
 if(!stored)await new Promise(resolve=>setTimeout(resolve,700));
}
if(phase==='score'){
 for(let i=0;i<selected.length;i+=100){
  const ids=selected.slice(i,i+100).map(f=>f.id);
  const r=await backfillScores(admin,{scoringRuleVersion:'ELEVEN_STANDARD_V4',fixtureIds:ids,skipUnavailableV4:true});
  results.push(r);scored+=r.scored;skipped+=r.skipped;if(r.failed)throw new Error(r.errors.join('; '));
 }
 for(let i=0;i<selected.length;i+=100)results.push(await reconcileFantasyStateForFixtures(admin,selected.slice(i,i+100).map(f=>f.id)));
}
if(phase==='audit'){
 const nullCounts:Record<string,number>={};let complete=0,incomplete=0;
 for(const s of scopedStats){const snapshot=s.reported_stats as Record<string,unknown>|null;
  let missing=!snapshot||!s.scoring_position;
  for(const rule of SCORING_V4_STATS){if(snapshot?.[rule.key]==null){nullCounts[rule.key]=(nullCounts[rule.key]??0)+1;missing=true;}}
  if(missing)incomplete++;else complete++;
 }
 const byCompetition=plan.map(c=>{const ids=new Set(c.fixtures.map(f=>f.id));return {code:c.code,fixtures:c.fixtures.length,rawSnapshots:c.fixtures.filter(f=>archived.has(f.id)).length,performances:scopedStats.filter(s=>ids.has(s.fixture_id)).length,richSnapshots:scopedStats.filter(s=>ids.has(s.fixture_id)&&s.reported_stats!=null&&s.scoring_position!=null).length};});
 results.push({performances:scopedStats.length,complete,incomplete,nullCounts,byCompetition,uniqueMappedPlayers:new Set(scopedStats.map(s=>s.player_id)).size});
}
const report={...summary,manifest:selected,attempted,succeeded,failed,reused,empty,scored,skipped,quota:lastQuota,results};
if(flags.output)await writeFile(flags.output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({done:{phase,attempted,succeeded,failed,reused,empty,scored,skipped,quota:lastQuota}}));
