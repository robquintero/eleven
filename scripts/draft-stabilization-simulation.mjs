// Local PostgreSQL only. Never accepts a database URL, Supabase keys or a real
// league id. Runtime installed outside the repo; all databases are temporary.
// Run with --conditions=react-server --experimental-strip-types.
import assert from 'node:assert/strict';
import {mkdtemp,readdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import net from 'node:net';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {draftablePositions,isRosterCompositionValid} from '../src/domain/fantasy/roster-rules.ts';
import {ensureFirstRoundOpened} from '../src/lib/fantasy-engine/rounds.ts';
import {provisionMissingLineupSlots} from '../src/lib/fantasy-engine/lineup.ts';
const runtime=process.env.ELEVEN_EMBEDDED_POSTGRES_MODULE;
assert.ok(runtime,'Set ELEVEN_EMBEDDED_POSTGRES_MODULE to an externally installed embedded-postgres module. No production URL is accepted.');
const {default:EmbeddedPostgres}=await import(pathToFileURL(resolve(runtime)).href);
const folder=await mkdtemp(join(tmpdir(),'eleven-five-manager-'));
const port=await new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const cluster=new EmbeddedPostgres({databaseDir:join(folder,'db'),port,user:'postgres',password:'isolated-only',persistent:false,createPostgresUser:false,postgresFlags:['-h','127.0.0.1','-c','wal_level=logical'],onLog:()=>{},onError:()=>{}});
let admin;const clients=[];const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const users=Array.from({length:5},(_,i)=>id(i+1)),teams=users.map((_,i)=>id(i+11));
const league=id(30),season=id(31),competition=id(32),club=id(33),away=id(34);
const metric={manual:0,autopicks:0,raceLosers:0,lateRequestsRejected:0,searches:0,reconnections:0,refreshes:0,latencies:[]};
try{
 await cluster.initialise();await cluster.start();admin=cluster.getPgClient('postgres','127.0.0.1');await admin.connect();
 await admin.query(`create schema extensions;create schema auth;create role anon;create role authenticated;create role service_role bypassrls;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
 grant usage on schema auth,public to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;
 create publication supabase_realtime;`);
 const migrations=(await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort();
 for(const name of migrations)await admin.query(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 for(let i=0;i<5;i++)await admin.query('insert into auth.users values($1,$2,\'{}\')',[users[i],`manager${i}@example.invalid`]);
 await admin.query("insert into fantasy_leagues(id,name,invite_code,created_by_user_id,status,settings) values($1,'Isolated Five','ISOFIVE',$2,'draft',$3)",[league,users[0],JSON.stringify({maxTeams:5,squadSize:16,pickTimerSeconds:300})]);
 for(let i=0;i<5;i++){
  await admin.query('insert into league_memberships(league_id,user_id,role) values($1,$2,$3)',[league,users[i],i===0?'commissioner':'manager']);
  await admin.query('insert into fantasy_teams(id,league_id,owner_user_id,name,abbreviation) values($1,$2,$3,$4,$5)',[teams[i],league,users[i],`Manager ${i}`,`M${i}`]);
 }
 await admin.query("insert into seasons(id,league_id,season_number,status) values($1,$2,1,'SETUP')",[season,league]);
 await admin.query("insert into competitions(id,name,code,country) values($1,'Isolated League','ENG','Test')",[competition]);
 for(const c of [club,away])await admin.query("insert into clubs(id,competition_id,name,short_name,code) values($1,$2,$3,$3,$3)",[c,competition,c===club?'ISO':'OPP']);
 let number=100;
 for(const position of ['GK','DEF','MID','FWD'])for(let i=0;i<50;i++)await admin.query('insert into players(id,club_id,competition_id,name,short_name,position) values($1,$2,$3,$4,$4,$5)',[id(number++),club,competition,`${position} Player ${String(i).padStart(3,'0')}`,position]);
 await admin.query("insert into fixtures(competition_id,home_club_id,away_club_id,season,kickoff_at,status) values($1,$2,$3,2026,now()+interval '1 hour','scheduled')",[competition,club,away]);
 async function connect(i){const c=cluster.getPgClient('postgres','127.0.0.1');await c.connect();await c.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)",[users[i]]);await c.query('set role authenticated');return c;}
 for(let i=0;i<5;i++)clients.push(await connect(i));
 const resolver=await connect(0);clients.push(resolver);
 const {rows:[started]}=await clients[0].query('select * from start_draft($1)',[league]);const draft=started.draft_id;
 const orders=(await admin.query('select * from draft_orders where draft_id=$1 order by position',[draft])).rows;
 async function state(c){const {rows:[d]}=await c.query('select * from get_draft_clock($1)',[league]);const picks=(await c.query('select * from draft_picks where draft_id=$1 order by pick_number',[draft])).rows;return {d,picks};}
 async function candidate(team){
  const counts=Object.fromEntries((await admin.query("select p.canonical_position position,count(*)::int n from roster_entries re join players p on p.id=re.player_id where re.fantasy_team_id=$1 and re.status='active' group by 1",[team])).rows.map(r=>[r.position,r.n]));
  const total=Object.values(counts).reduce((a,b)=>a+b,0),legal=draftablePositions(counts,16-total);
  // Realistic managers secure three forwards early, then fill the squad.
  const plan=['FWD','FWD','FWD','GK','GK','DEF','DEF','DEF','DEF','MID','MID','MID','MID','DEF','MID','FWD'];
  const pos=legal.includes(plan[total])?plan[total]:legal[0];
  return (await admin.query('select id from players p where canonical_position=$1 and not exists(select 1 from league_player_ownership o where o.league_id=$2 and o.player_id=p.id) order by name limit 2',[pos,league])).rows;
 }
 async function pick(c,player,expected){const start=performance.now();try{return await c.query('select * from submit_draft_turn($1,$2,$3)',[draft,player,expected]);}finally{metric.latencies.push(performance.now()-start);}}
 for(let expected=1;expected<=80;expected++){
  const {d,picks}=await state(admin);assert.equal(picks.length,expected-1);metric.refreshes++;
  const position=d.current_round%2===1?d.current_pick:6-d.current_pick;
  const team=orders.find(o=>o.position===position).fantasy_team_id,manager=teams.indexOf(team),available=await candidate(team);
  if(expected%9===0){await clients[manager].end();clients[manager]=await connect(manager);const restored=await state(clients[manager]);assert.deepEqual(restored.picks,picks);metric.reconnections++;}
  // Search on a separate manager connection while another manager is picking.
  const searching=clients[(manager+1)%5].query("select id from players where name_unaccented ilike '%player%' and active=true order by name limit 30").then(r=>{assert.equal(r.rows.length,30);metric.searches++;});
  if(expected%7===0 && d.current_round>=4){
   await admin.query("update drafts set current_pick_started_at=now()-interval '301 seconds' where id=$1",[draft]);
   const attempts=[pick(clients[manager],available[0].id,expected),resolver.query('select * from resolve_draft_turn($1,$2)',[draft,expected])];
   const outcomes=await Promise.allSettled(attempts);assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1,'exactly one race winner');
   const loser=outcomes.find(o=>o.status==='rejected');assert.match(loser.reason.message,/STALE_DRAFT_TURN|DRAFT_NOT_ACTIVE/);metric.raceLosers++;
   if(outcomes[0].status==='fulfilled')metric.manual++;else metric.autopicks++;
  }else if(expected%11===0 && d.current_round>=4){
   await admin.query("update drafts set current_pick_started_at=now()-interval '301 seconds' where id=$1",[draft]);
   await resolver.query('select * from resolve_draft_turn($1,$2)',[draft,expected]);metric.autopicks++;
   await assert.rejects(pick(clients[manager],available[0].id,expected),/STALE_DRAFT_TURN|DRAFT_NOT_ACTIVE/);metric.lateRequestsRejected++;
  }else if(expected%5===0 && expected<80){
   // Hold a real row lock until both independent sessions have queued behind it.
   await admin.query('begin');await admin.query('select id from drafts where id=$1 for update',[draft]);
   const other=await connect(manager);clients.push(other);
   const a=pick(clients[manager],available[0].id,expected),b=pick(other,available[1].id,expected);
   const settle=Promise.allSettled([a,b]);await new Promise(r=>setTimeout(r,20));await admin.query('commit');
   const outcomes=await settle;assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);assert.match(outcomes.find(o=>o.status==='rejected').reason.message,/STALE_DRAFT_TURN/);metric.manual++;metric.raceLosers++;
  }else{
   // A forged fast clock must not autopick a not-yet-expired turn.
   if(expected===1)await assert.rejects(resolver.query("select * from resolve_expired_pick($1,now()+interval '1 day')",[draft]),/TIMER_NOT_EXPIRED/);
   await pick(clients[manager],available[0].id,expected);metric.manual++;
  }
  await searching;
  const updated=await state(admin);assert.equal(updated.picks.length,expected);assert.equal(new Set(updated.picks.map(p=>p.player_id)).size,expected);
  const ownership=await admin.query('select count(*)::int n from league_player_ownership where league_id=$1',[league]);assert.equal(ownership.rows[0].n,expected);
 }
 assert.equal((await state(admin)).d.status,'completed');
 // SQL-backed adapter: actual production round/lineup functions write only
 // this isolated cluster. No fake lineup selection or fake persistence.
 function from(table){let filters=[],order=null,limit=null,range=null,operation='select',payload,selection='*',single=false,ignore=false,conflict;
  const chain={select(s){selection=s;return chain;},eq(c,v){filters.push([c,'=',v]);return chain;},is(c,v){filters.push([c,'is',v]);return chain;},in(c,v){filters.push([c,'in',v]);return chain;},gte(c,v){filters.push([c,'>=',v]);return chain;},lt(c,v){filters.push([c,'<',v]);return chain;},or(){return chain;},order(c,o){order=[c,o?.ascending===false?'desc':'asc'];return chain;},limit(n){limit=n;return chain;},range(a,b){range=[a,b];return chain;},maybeSingle(){single=true;return chain;},single(){single=true;return chain;},insert(v){operation='insert';payload=v;return chain;},update(v){operation='update';payload=v;return chain;},upsert(v,o){operation='insert';payload=v;ignore=o?.ignoreDuplicates;conflict=o?.onConflict;return chain;},then(resolve,reject){return run().then(resolve,reject);}};
  async function run(){
   try{
    const args=[];const val=v=>{args.push(v);return '$'+args.length;};
    const where=filters.filter(([c])=>!c.includes('.')).map(([c,op,v])=>op==='in'?`t.${c}=any(${val(v)}::uuid[])`:op==='is'&&v===null?`t.${c} is null`:`t.${c}${op}${val(v)}`).join(' and ');
    if(operation==='select'){
     let columns='t.*';
     if(table==='roster_entries'&&selection.includes('players('))columns+=",(select jsonb_build_object('club_id',p.club_id,'canonical_position',p.canonical_position) from players p where p.id=t.player_id) players";
     if(table==='roster_entries'&&selection.includes('lineup_slots!left')){const round=filters.find(([c])=>c==='lineup_slots.fantasy_round_id')?.[2];columns+=`,(select coalesce(jsonb_agg(jsonb_build_object('id',s.id)),'[]'::jsonb) from lineup_slots s where s.roster_entry_id=t.id and s.fantasy_round_id=${val(round)}) lineup_slots`;}
     if(table==='fantasy_teams'&&selection.includes('draft_orders'))columns+=",(select jsonb_agg(jsonb_build_object('position',o.position)) from draft_orders o where o.fantasy_team_id=t.id) draft_orders";
     if(table==='fixtures')columns+=",(select jsonb_build_object('code',c.code) from competitions c where c.id=t.competition_id) competitions";
     const rows=(await admin.query(`select ${columns} from public.${table} t${where?' where '+where:''}${order?' order by t.'+order[0]+' '+order[1]:''}${limit?' limit '+limit:range?' limit '+(range[1]-range[0]+1)+' offset '+range[0]:''}`,args)).rows;
     return {data:single?rows[0]??null:rows,count:rows.length,error:null};
    }
    if(operation==='update'){const pairs=Object.entries(payload).map(([c,v])=>c+'='+val(v));const rows=(await admin.query(`update public.${table} t set ${pairs.join(',')}${where?' where '+where:''} returning *`,args)).rows;return {data:single?rows[0]??null:rows,error:null};}
    const rows=[];for(const row of Array.isArray(payload)?payload:[payload]){const keys=Object.keys(row);const values=keys.map(k=>val(row[k]));const result=await admin.query(`insert into public.${table}(${keys.join(',')}) values(${values.join(',')})${conflict?' on conflict('+conflict+') '+(ignore?'do nothing':'do update set '+keys.map(k=>k+'=excluded.'+k).join(',')):''} returning *`,args);rows.push(...result.rows);args.length=0;}
    return {data:single?rows[0]??null:rows,error:null};
   }catch(error){return {data:null,error:{message:error.message,code:error.code}};}
  }return chain;
 }
 const localAdmin={from};await ensureFirstRoundOpened(localAdmin,league);
 const {rows:[round]}=await admin.query('select * from fantasy_rounds where league_id=$1',[league]);assert.ok(round,'actual final-pick completion path opens round one');
 const window={startsAt:new Date(round.starts_at),endsAt:new Date(round.ends_at)};
 const lineups=[];
 for(const team of teams){
  const roster=(await admin.query("select re.id,p.canonical_position position from roster_entries re join players p on p.id=re.player_id where fantasy_team_id=$1 and re.status='active'",[team])).rows;
  const counts=Object.fromEntries(['GK','DEF','MID','FWD'].map(p=>[p,roster.filter(r=>r.position===p).length]));assert.ok(isRosterCompositionValid(counts));
  const slots=(await admin.query('select s.*,p.canonical_position position from lineup_slots s join roster_entries re on re.id=s.roster_entry_id join players p on p.id=re.player_id where re.fantasy_team_id=$1 and s.fantasy_round_id=$2 order by s.id',[team,round.id])).rows;
  assert.equal(slots.length,16);assert.equal(slots.filter(s=>s.starter).length,11);assert.deepEqual(['GK','DEF','MID','FWD'].map(p=>slots.filter(s=>s.starter&&s.position===p).length),[1,4,3,3]);
  const manualSlot=slots.find(s=>s.starter&&s.position==='GK');
  await admin.query('delete from lineup_slots where fantasy_round_id=$1 and roster_entry_id in(select id from roster_entries where fantasy_team_id=$2) and id<>$3',[round.id,team,manualSlot.id]);
  const repaired=await provisionMissingLineupSlots(localAdmin,team,round.id,window);assert.equal(repaired.status,'provisioned');assert.equal(repaired.createdCount,15);
  assert.deepEqual((await admin.query('select * from lineup_slots where id=$1',[manualSlot.id])).rows[0],Object.fromEntries(Object.entries(manualSlot).filter(([k])=>k!=='position')));
  const before=(await admin.query('select * from lineup_slots where fantasy_round_id=$1 order by id',[round.id])).rows;
  assert.equal((await provisionMissingLineupSlots(localAdmin,team,round.id,window)).status,'already_complete');
  assert.deepEqual((await admin.query('select * from lineup_slots where fantasy_round_id=$1 order by id',[round.id])).rows,before);
  lineups.push({team,roster:16,starters:11,bench:5,formation:'4-3-3',existingManualSlotPreserved:true,idempotentRepair:true});
 }
 const after=(await state(admin)).picks;assert.equal(after.length,80);
 // Second isolated five-manager draft: every timer expires, all 80 picks auto.
 const autoLeague=id(40),autoSeason=id(41),autoTeams=users.map((_,i)=>id(50+i));
 await admin.query("insert into fantasy_leagues(id,name,invite_code,created_by_user_id,status,settings) values($1,'Isolated All Auto','ISOAUTO',$2,'draft',$3)",[autoLeague,users[0],JSON.stringify({maxTeams:5,squadSize:16,pickTimerSeconds:300})]);
 for(let i=0;i<5;i++){
  await admin.query('insert into league_memberships(league_id,user_id,role) values($1,$2,$3)',[autoLeague,users[i],i===0?'commissioner':'manager']);
  await admin.query('insert into fantasy_teams(id,league_id,owner_user_id,name,abbreviation) values($1,$2,$3,$4,$5)',[autoTeams[i],autoLeague,users[i],`Automatic ${i}`,`A${i}`]);
 }
 await admin.query("insert into seasons(id,league_id,season_number,status) values($1,$2,1,'SETUP')",[autoSeason,autoLeague]);
 const {rows:[autoDraft]}=await clients[0].query('select * from start_draft($1)',[autoLeague]);
 for(let expected=1;expected<=80;expected++){
  await admin.query("update drafts set current_pick_started_at=now()-interval '301 seconds' where id=$1",[autoDraft.draft_id]);
  const outcomes=await Promise.allSettled([resolver.query('select * from resolve_draft_turn($1,$2)',[autoDraft.draft_id,expected]),clients[1].query('select * from resolve_draft_turn($1,$2)',[autoDraft.draft_id,expected])]);
  assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);assert.match(outcomes.find(o=>o.status==='rejected').reason.message,/STALE_DRAFT_TURN|DRAFT_NOT_ACTIVE/);
 }
 await ensureFirstRoundOpened(localAdmin,autoLeague);
 const autoLineups=(await admin.query(`select re.fantasy_team_id,count(*)::int slots,count(*) filter(where s.starter)::int starters,count(*) filter(where s.starter and p.canonical_position='FWD')::int forwards from lineup_slots s join roster_entries re on re.id=s.roster_entry_id join players p on p.id=re.player_id where re.league_id=$1 group by re.fantasy_team_id`,[autoLeague])).rows;
 assert.equal(autoLineups.length,5);assert.ok(autoLineups.every(r=>r.slots===16&&r.starters===11&&r.forwards===3));
 assert.equal((await admin.query('select count(distinct player_id)::int n from draft_picks where draft_id=$1',[autoDraft.draft_id])).rows[0].n,80);
 const outsider=await connect(0);clients.push(outsider);
 await outsider.query("select set_config('request.jwt.claim.sub',$1,false)",[id(999)]);
 assert.equal((await outsider.query('select * from get_draft_clock($1)',[league])).rows.length,0,'clock read respects membership RLS');
 await assert.rejects(outsider.query('select * from submit_draft_turn($1,$2,1)',[draft,id(100)]),/NOT_LEAGUE_MEMBER/);
 const immutable=await admin.query("select jsonb_agg(to_jsonb(p) order by pick_number) rows from draft_picks p where draft_id=$1",[draft]);
 await admin.query(await readFile(new URL('../supabase/migrations/20261016000000_draft_synchronization.sql',import.meta.url),'utf8'));
 assert.deepEqual((await admin.query("select jsonb_agg(to_jsonb(p) order by pick_number) rows from draft_picks p where draft_id=$1",[draft])).rows,immutable.rows,'reapplying function/publication migration preserves picks');
 const sorted=metric.latencies.sort((a,b)=>a-b),result={environment:'temporary loopback PostgreSQL 17; independent manager connections',migrations:migrations.length,allAutopickScenario:{picks:80,duplicateResolverRaces:80,validLineups:5},picks:80,uniqueOwnership:80,status:'completed',manual:metric.manual,autopicks:metric.autopicks,raceLosers:metric.raceLosers,lateRequestsRejected:metric.lateRequestsRejected,searches:metric.searches,reconnections:metric.reconnections,refreshes:metric.refreshes,lineups,pickLatencyMs:{p50:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)]},productionWrites:0,providerCalls:0};
 await writeFile('/tmp/eleven-stabilization-simulation-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await Promise.allSettled(clients.map(c=>c.end()));if(admin)await admin.end();await cluster.stop().catch(()=>{});await rm(folder,{recursive:true,force:true});}
