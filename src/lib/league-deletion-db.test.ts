import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";

// Isolated embedded PostgreSQL only: no credentials, HTTP or production.
const folder = new URL("../../supabase/migrations/", import.meta.url);
const candidate = "20261008000000_scoring_v4_foundation.sql";
const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
async function bootstrap() {
  const db = new PGlite({ extensions: { pgcrypto, unaccent } });
  await db.exec(`set timezone = 'UTC'; create schema extensions; create schema auth;
    create role anon; create role authenticated; create role service_role bypassrls;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant execute on all functions in schema auth to anon, authenticated, service_role;`);
  return db;
}
async function migrations(db: PGlite, includeCandidate: boolean) {
  const files = (await readdir(folder)).filter(f => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (file > candidate || (!includeCandidate && file === candidate)) continue;
    const sql = await readFile(new URL(file, folder), "utf8");
    await db.transaction(tx => tx.exec(sql));
  }
  return files.filter(f => f <= candidate && (includeCandidate || f !== candidate)).length;
}
async function seed(db: PGlite) {
  await db.exec(`insert into auth.users values('${id(1)}','owner@example.invalid','{}'),('${id(2)}','other@example.invalid','{}');
    insert into fantasy_leagues(id,name,invite_code,created_by_user_id,status) values('${id(3)}','Rehearsal','ISOLATED','${id(1)}','active');
    insert into league_memberships values('${id(3)}','${id(1)}','commissioner',now()),('${id(3)}','${id(2)}','manager',now());
    insert into fantasy_teams(id,league_id,owner_user_id,name,abbreviation) values('${id(4)}','${id(3)}','${id(1)}','Owner','OWN'),('${id(5)}','${id(3)}','${id(2)}','Other','OTH');
    insert into seasons(id,league_id,season_number,status) values('${id(6)}','${id(3)}',1,'ACTIVE');
    insert into fantasy_rounds(id,league_id,season_id,number,starts_at,ends_at,status) values
      ('${id(7)}','${id(3)}','${id(6)}',1,'2026-09-29','2026-10-06','completed'),
      ('${id(8)}','${id(3)}','${id(6)}',2,'2026-10-06','2026-10-13','in_progress'),
      ('${id(9)}','${id(3)}','${id(6)}',3,'2026-10-13','2026-10-20','upcoming');
    insert into competitions(id,name,code,country,season) values('${id(10)}','Embedded','ENG','England',2026);
    insert into clubs(id,competition_id,name,short_name,code) values('${id(11)}','${id(10)}','A','A','A'),('${id(12)}','${id(10)}','B','B','B');
    insert into fixtures(id,competition_id,home_club_id,away_club_id,kickoff_at,status,season) values('${id(13)}','${id(10)}','${id(11)}','${id(12)}','2026-09-30','final',2026);
    insert into matchups(id,league_id,fantasy_round_id,home_fantasy_team_id,away_fantasy_team_id,status) values('${id(14)}','${id(3)}','${id(7)}','${id(4)}','${id(5)}','final');
    insert into matchup_scores(matchup_id,fantasy_team_id,live_points,final_points) values('${id(14)}','${id(4)}',102,102),('${id(14)}','${id(5)}',98,98);`);
  for (let n = 0; n < 12; n++) {
    const pos = n === 0 ? "GK" : n < 5 || n === 11 ? "DEF" : n < 9 ? "MID" : "FWD";
    await db.exec(`insert into players(id,club_id,competition_id,name,short_name,position) values('${id(20+n)}','${id(11)}','${id(10)}','P${n}','P${n}','${pos}');
      insert into roster_entries(id,league_id,fantasy_team_id,player_id,acquisition_type,acquired_at) values('${id(40+n)}','${id(3)}','${id(4)}','${id(20+n)}','draft','2026-09-29');
      insert into league_player_ownership(league_id,player_id,fantasy_team_id,roster_entry_id) values('${id(3)}','${id(20+n)}','${id(4)}','${id(40+n)}');
      insert into lineup_slots(roster_entry_id,fantasy_round_id,slot,starter) values('${id(40+n)}','${id(9)}','${n===11?"BENCH":pos}',${n!==11});`);
  }
  await db.exec(`insert into player_match_stats(player_id,fixture_id,minutes,goals) values('${id(20)}','${id(13)}',90,1);
    insert into fantasy_player_scores(player_id,fixture_id,points,scoring_rule_version,breakdown) values('${id(20)}','${id(13)}',11,'ELEVEN_STANDARD_V3','{"goals":7}');`);
}
const owned = ["fantasy_leagues","league_memberships","fantasy_teams","seasons","roster_entries","league_player_ownership","fantasy_rounds","lineup_slots","matchups","matchup_scores","drafts","draft_orders","draft_picks","waiver_claims","trades","trade_assets","transactions","domain_events","scoring_rules"];
async function snapshotAll(db: PGlite) {
  const tables = (await db.query<{name:string}>("select tablename name from pg_tables where schemaname in ('public','auth') order by schemaname,tablename")).rows;
  return Promise.all(tables.map(async ({name}) => ({name, rows:(await db.query(`select to_jsonb(t) r from ${name==='users'?'auth':'public'}.${name} t order by to_jsonb(t)::text`)).rows})));
}
let inTransaction=false;
async function asUser(db:PGlite, n:number, action:()=>Promise<unknown>) {
  if(inTransaction) await db.exec("savepoint test_user");
  await db.exec(`set role authenticated;select set_config('request.jwt.claim.role','authenticated',false),set_config('request.jwt.claim.sub','${id(n)}',false)`);
  try {return await action();} finally {
    if(inTransaction) await db.exec("rollback to savepoint test_user;release savepoint test_user");
    await db.exec("reset role");
  }
}
async function isolated(db:PGlite, action:()=>Promise<void>) {
  await db.exec("begin"); inTransaction=true; try {await action();} finally {await db.exec("rollback;reset role");inTransaction=false;}
}

test("commissioner deletion: real migration, full ownership graph, authorization, rollback and unchanged shared/other-league history",async(t)=>{
  const db=await bootstrap();
  try {
    await migrations(db,true);await seed(db);
    await db.exec(`insert into fantasy_leagues(id,name,invite_code,created_by_user_id,status) values('${id(103)}','League B','ISOLATEDB','${id(2)}','active');
      insert into league_memberships values('${id(103)}','${id(2)}','commissioner',now()),('${id(103)}','${id(1)}','manager',now());
      insert into fantasy_teams(id,league_id,owner_user_id,name,abbreviation) values('${id(104)}','${id(103)}','${id(2)}','B Owner','BO'),('${id(105)}','${id(103)}','${id(1)}','B Other','BT');
      insert into seasons(id,league_id,season_number,status,champion_fantasy_team_id) values('${id(106)}','${id(103)}',1,'COMPLETED','${id(104)}');
      insert into fantasy_rounds(id,league_id,season_id,number,starts_at,ends_at,status) values('${id(107)}','${id(103)}','${id(106)}',1,'2026-09-29','2026-10-06','completed');
      insert into matchups(id,league_id,fantasy_round_id,home_fantasy_team_id,away_fantasy_team_id,status) values('${id(114)}','${id(103)}','${id(107)}','${id(104)}','${id(105)}','final');
      insert into matchup_scores(matchup_id,fantasy_team_id,live_points,final_points) values('${id(114)}','${id(104)}',33,33),('${id(114)}','${id(105)}',22,22);
      insert into roster_entries(id,league_id,fantasy_team_id,player_id,acquisition_type) values('${id(140)}','${id(103)}','${id(104)}','${id(20)}','draft');
      insert into league_player_ownership(league_id,player_id,fantasy_team_id,roster_entry_id) values('${id(103)}','${id(20)}','${id(104)}','${id(140)}');
      insert into lineup_slots(roster_entry_id,fantasy_round_id,slot,starter) values('${id(140)}','${id(107)}','GK',true);`);
    for(const base of [0,100]) await db.exec(`
      insert into drafts(id,league_id,season_id,status) values('${id(base+60)}','${id(base+3)}','${id(base+6)}','completed');
      insert into draft_orders(draft_id,fantasy_team_id,position) values('${id(base+60)}','${id(base+4)}',1);
      insert into draft_picks(draft_id,round,pick_number,fantasy_team_id,player_id) values('${id(base+60)}',1,1,'${id(base+4)}','${id(20)}');
      insert into trades(id,league_id,proposing_team_id,receiving_team_id,status) values('${id(base+61)}','${id(base+3)}','${id(base+4)}','${id(base+5)}','completed');
      insert into trade_assets(trade_id,from_team_id,to_team_id,player_id) values('${id(base+61)}','${id(base+4)}','${id(base+5)}','${id(20)}');
      insert into waiver_claims(league_id,fantasy_team_id,target_player_id,priority) values('${id(base+3)}','${id(base+4)}','${id(21)}',1);
      insert into transactions(league_id,type,actor_user_id,fantasy_team_id) values('${id(base+3)}','trade','${id(1)}','${id(base+4)}');
      insert into domain_events(league_id,event_type,fantasy_team_id) values('${id(base+3)}','TEST','${id(base+4)}');
      insert into scoring_rules(league_id,stat,multiplier) values('${id(base+3)}','goals',1);`);
    const files=(await readdir(folder)).filter(f=>f.endsWith('.sql') && f>candidate).sort();
    for(const file of files.filter(f=>!f.includes('commissioner_delete'))) await db.transaction(async tx=>tx.exec(await readFile(new URL(file,folder),'utf8')));

    await db.exec(`insert into provider_mappings(provider,internal_entity_type,external_id,internal_entity_id) values('api-football','player','20','${id(20)}');
      insert into football_provider_snapshots(provider,endpoint,external_id,fixture_id,payload,fetched_at,observed_fixture_status) values('api-football','/fixtures/players','13','${id(13)}','{"response":[]}',now(),'final');
      insert into domain_events(event_type,payload) values('SHARED','{}');
      insert into fantasy_player_scores(player_id,fixture_id,fantasy_round_id,points,scoring_rule_version) values('${id(21)}','${id(13)}','${id(7)}',3,'ELEVEN_STANDARD_V3');`);
    const migration=await readFile(new URL('20261012000000_commissioner_delete_league.sql',folder),'utf8');
    // Catalog-driven FK audit detects any newly introduced owned table that
    // this pass has not explicitly covered (canonical scores have a round FK).
    const graph=(await db.query<{name:string}>(`with recursive owned(oid) as (
      select 'public.fantasy_leagues'::regclass::oid union
      select c.conrelid from pg_constraint c join owned o on c.confrelid=o.oid where c.contype='f'
    ) select oid::regclass::text name from owned order by name`)).rows.map(r=>r.name);
    assert.deepEqual(graph,[...owned,'fantasy_player_scores'].sort());
    const before=await snapshotAll(db);
    await db.transaction(tx=>tx.exec(migration));
    assert.deepEqual(await snapshotAll(db),before,'migration creates capability without changing any public/auth row');
    const rpc=(target=id(3),text='DELETE')=>db.query('select delete_fantasy_league($1,$2) id',[target,text]);
    await t.test('unauthenticated, noncommissioner, owner without commissioner, wrong phrase, service role, direct DELETE all denied',async()=>{
      await assert.rejects(rpc(),/NOT_AUTHENTICATED/);
      await asUser(db,2,()=>assert.rejects(rpc(),/FORBIDDEN/));
      for(const phrase of ['', 'delete',' DELETE','DELETE ','DELETE\n']) await asUser(db,1,()=>assert.rejects(rpc(id(3),phrase),/CONFIRMATION_REQUIRED/));
      await isolated(db,async()=>{await db.exec(`update league_memberships set role='manager' where league_id='${id(3)}' and user_id='${id(1)}'`);await asUser(db,1,()=>assert.rejects(rpc(),/FORBIDDEN/));});
      await db.exec('set role service_role');await assert.rejects(rpc(),/permission denied/);await db.exec('reset role');
      await db.exec('set role anon');await assert.rejects(rpc(),/permission denied/);await db.exec('reset role');
      await asUser(db,1,async()=>{await assert.rejects(db.exec('select * from eleven_private.league_deletion_context'),/permission denied/);await assert.rejects(db.exec("select eleven_private.authorized_league_delete('round',null)"),/permission denied/);});
      // Supabase's default table privileges are shimmed only for this direct-RLS proof.
      await db.exec('grant delete on fantasy_leagues to authenticated');
      await asUser(db,1,async()=>{assert.equal((await db.query(`delete from fantasy_leagues where id='${id(3)}' returning id`)).rows.length,0);});
      assert.deepEqual(await snapshotAll(db),before);
    });
    await t.test('ordinary history DELETE/UPDATE still blocked; fake client GUC cannot authorize',async()=>{
      await db.exec("select set_config('eleven.league_delete','true',false)");
      for(const table of ['fantasy_rounds','matchups','matchup_scores']) for(const command of ['delete from','update']) {
        const sql=command==='update'?`update ${table} set ${table==='matchup_scores'?'final_points=999':table==='matchups'?"status='scheduled'":"status='in_progress'"}`:`delete from ${table}`;
        await assert.rejects(db.exec(sql),/IMMUTABLE/);
      }
      assert.deepEqual(await snapshotAll(db),before);
    });
    await t.test('cross-league references fail closed before cascade',async()=>{
      await isolated(db,async()=>{
        await db.exec(`insert into domain_events(event_type,league_id,fantasy_team_id) values('BAD','${id(103)}','${id(4)}')`);
        const original=await snapshotAll(db);await asUser(db,1,()=>assert.rejects(rpc(),/CROSS_LEAGUE_REFERENCE/));assert.deepEqual(await snapshotAll(db),original);
      });
      await isolated(db,async()=>{
        await db.exec(`insert into domain_events(event_type,fantasy_team_id) values('BAD_SHARED','${id(4)}')`);
        await asUser(db,1,()=>assert.rejects(rpc(),/CROSS_LEAGUE_REFERENCE/));
      });
    });
    await t.test('mid-cascade failure rolls back every owned row and private authorization',async()=>{
      await db.exec(`create function fail_test_delete() returns trigger language plpgsql as $$begin raise exception 'TEST_CASCADE_FAILURE';end$$;create trigger zz_fail_delete before delete on trades for each row execute function fail_test_delete();`);
      const original=await snapshotAll(db);await asUser(db,1,()=>assert.rejects(rpc(),/TEST_CASCADE_FAILURE/));assert.deepEqual(await snapshotAll(db),original);
      assert.equal((await db.query<{n:number}>('select count(*)::int n from eleven_private.league_deletion_context')).rows[0].n,0);
      await db.exec('drop trigger zz_fail_delete on trades;drop function fail_test_delete()');
    });
    await t.test('active league with completed history deletes all owned records, leaves B and all shared data byte-for-byte unchanged; duplicate/post-delete mutations fail',async()=>{
      const result=await asUser(db,1,()=>rpc()) as {rows:{id:string}[]};assert.equal(result.rows[0].id,id(3));
      const after=await snapshotAll(db);
      const removed:Record<string,number>={fantasy_leagues:1,league_memberships:2,fantasy_teams:2,seasons:1,roster_entries:12,league_player_ownership:12,fantasy_rounds:3,lineup_slots:12,matchups:1,matchup_scores:2,drafts:1,draft_orders:1,draft_picks:1,waiver_claims:1,trades:1,trade_assets:1,transactions:1,domain_events:1,scoring_rules:1};
      for(const table of owned) assert.equal(after.find(t=>t.name===table)!.rows.length,before.find(t=>t.name===table)!.rows.length-removed[table],`${table}: only league B/global event survives`);
      for(const table of after) {
        const old=before.find(t=>t.name===table.name)!;
        if(owned.includes(table.name)) for(const row of table.rows) assert.ok(old.rows.some(r=>JSON.stringify(r)===JSON.stringify(row)),`${table.name}: surviving rows unchanged`);
        else if(table.name==='fantasy_player_scores') assert.equal(table.rows.length,old.rows.length-1,'only round-owned legacy score removed');
        else assert.deepEqual(table.rows,old.rows,`${table.name}: shared rows unchanged`);
      }
      assert.equal((await db.query<{n:number}>('select count(*)::int n from eleven_private.league_deletion_context')).rows[0].n,0);
      await asUser(db,1,()=>assert.rejects(rpc(),/NOT_FOUND/));
      await assert.rejects(db.exec(`insert into trades(league_id,proposing_team_id,receiving_team_id) values('${id(3)}','${id(4)}','${id(5)}')`),/foreign key/);
      await asUser(db,1,()=>assert.rejects(db.query('select update_team_lineup($1,$2,$3)',[id(4),id(8),'[]']),/ROSTER_ENTRY_NOT_ON_TEAM|TEAM_NOT_FOUND|NOT_FOUND|NOT_AUTHORIZED|TEAM_NOT_OWNED/));
    });
  } finally {await db.close();}
});
