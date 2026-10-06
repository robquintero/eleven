import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
const folder=new URL("../../supabase/migrations/",import.meta.url);
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
test("spectator access: existing real RLS permits co-member reads, isolates private leagues and forbids other-team writes",async()=>{
  const db=new PGlite({extensions:{pgcrypto,unaccent}});
  try {
    await db.exec(`set timezone='UTC';create schema extensions;create schema auth;
      create role anon;create role authenticated;create role service_role bypassrls;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
      grant usage on schema auth,public to anon,authenticated,service_role;
      grant execute on all functions in schema auth to anon,authenticated,service_role;`);
    const files=(await readdir(folder)).filter(f=>f.endsWith('.sql')).sort();
    for(const file of files.filter(f=>f<='20261008000000_scoring_v4_foundation.sql'))await db.exec(await readFile(new URL(file,folder),'utf8'));
    await db.exec(`insert into auth.users values('${id(1)}','viewer@example.invalid','{}'),('${id(2)}','manager@example.invalid','{}'),('${id(3)}','outsider@example.invalid','{}');
      insert into competitions(id,name,code,country,season) values('${id(40)}','Isolated','ENG','England',2026);
      insert into clubs(id,competition_id,name,short_name,code) values('${id(41)}','${id(40)}','Club','CLB','CLB');
      insert into players(id,club_id,competition_id,name,short_name,position) values('${id(42)}','${id(41)}','${id(40)}','Player','P','DEF');`);
    for(const base of [0,100])await db.exec(`
      insert into fantasy_leagues(id,name,invite_code,created_by_user_id,status) values('${id(base+10)}','Private ${base}','ISOLATED${base}','${id(2)}','active');
      insert into league_memberships values('${id(base+10)}','${id(base===0?1:3)}','manager',now()),('${id(base+10)}','${id(2)}','commissioner',now());
      insert into fantasy_teams(id,league_id,owner_user_id,name,abbreviation) values('${id(base+11)}','${id(base+10)}','${id(2)}','Other','OTH'),('${id(base+12)}','${id(base+10)}','${id(base===0?1:3)}','Viewer','VIE');
      insert into seasons(id,league_id,season_number,status) values('${id(base+13)}','${id(base+10)}',1,'ACTIVE');
      insert into fantasy_rounds(id,league_id,season_id,number,starts_at,ends_at,status) values('${id(base+14)}','${id(base+10)}','${id(base+13)}',1,'2026-09-29T06:00Z','2026-10-06T06:00Z','completed');
      insert into roster_entries(id,league_id,fantasy_team_id,player_id,acquisition_type,acquired_at) values('${id(base+15)}','${id(base+10)}','${id(base+11)}','${id(42)}','draft','2026-09-28');
      insert into lineup_slots(roster_entry_id,fantasy_round_id,slot,starter,locked_at) values('${id(base+15)}','${id(base+14)}','DEF',true,'2026-09-30');
      insert into matchups(id,league_id,fantasy_round_id,home_fantasy_team_id,away_fantasy_team_id,status) values('${id(base+16)}','${id(base+10)}','${id(base+14)}','${id(base+11)}','${id(base+12)}','final');
      insert into matchup_scores(matchup_id,fantasy_team_id,live_points,final_points) values('${id(base+16)}','${id(base+11)}',12,12),('${id(base+16)}','${id(base+12)}',9,9);`);
    for(const file of files.filter(f=>f>'20261008000000_scoring_v4_foundation.sql'))await db.exec(await readFile(new URL(file,folder),'utf8'));
    const before=(await db.query("select jsonb_agg(to_jsonb(s) order by fantasy_team_id) data from matchup_scores s")).rows;
    await db.exec(`set role authenticated;select set_config('request.jwt.claim.role','authenticated',false),set_config('request.jwt.claim.sub','${id(1)}',false)`);
    for(const table of ['fantasy_teams','roster_entries','lineup_slots','matchups','matchup_scores']){
      const visible=(await db.query(`select * from ${table}`)).rows;
      assert.equal(visible.length,table==='fantasy_teams'||table==='matchup_scores'?2:1,table+" cannot leak private second league");
    }
    assert.equal((await db.query(`select * from fantasy_teams where id='${id(111)}'`)).rows.length,0);
    assert.equal((await db.query(`select * from matchups where id='${id(116)}'`)).rows.length,0);
    await assert.rejects(db.query(`update lineup_slots set starter=false where roster_entry_id='${id(15)}' returning *`),/permission denied/,"manager DML is revoked; only the owner-validated RPC can write");
    await assert.rejects(db.exec(`select update_team_lineup('${id(11)}','${id(14)}','[]'::jsonb)`),/ROSTER_ENTRY_NOT_ON_TEAM/);
    await db.exec(`reset role;set role anon`);await assert.rejects(db.query("select * from lineup_slots"),/permission denied/);
    await db.exec('reset role');assert.deepEqual((await db.query("select jsonb_agg(to_jsonb(s) order by fantasy_team_id) data from matchup_scores s")).rows,before);
    assert.equal((await db.query<{starter:boolean}>(`select starter from lineup_slots where roster_entry_id='${id(15)}'`)).rows[0].starter,true);
  } finally {await db.close();}
});
