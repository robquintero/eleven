import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";

// All public migrations are unmodified. Only Supabase-owned Auth/platform
// prerequisites are shimmed. No HTTP, credentials, provider or native server.
const folder = new URL("../../../supabase/migrations/", import.meta.url);
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
async function snapshot(db: PGlite) {
  const tables = ["fantasy_player_scores", "matchup_scores", "roster_entries", "lineup_slots", "league_player_ownership", "matchups", "seasons", "transactions", "domain_events"];
  return Promise.all(tables.map(t => db.query(`select row_to_json(t) as row from public.${t} t order by row_to_json(t)::text`)));
}

test("all 34 actual migrations apply from clean schema; V4 stays dormant", async () => {
  const db = await bootstrap();
  try {
    assert.equal(await migrations(db, true), 34);
    assert.deepEqual((await db.query<{ version: string }>("select get_catalog_scoring_version() as version")).rows, [{ version: "ELEVEN_STANDARD_V3" }]);
    assert.equal((await db.query<{ n: number }>("select count(*)::int as n from fantasy_player_scores")).rows[0].n, 0);
  } finally { await db.close(); }
});

test("full-schema populated upgrade: atomic failure/retry, unchanged results, pins, grants, actual lineup writer and catalog policy", async () => {
  const db = await bootstrap();
  try {
    await migrations(db, false); await seed(db);
    const original = await snapshot(db);
    const sql = await readFile(new URL(candidate, folder), "utf8");
    // Fail after policy creation but before triggers, using one migration transaction.
    const split = sql.indexOf("create function public.guard_scoring_activation");
    await assert.rejects(db.transaction(tx => tx.exec(sql.slice(0, split) + "select 1/0;")), /division by zero/);
    assert.equal((await db.query<{ t: string | null }>("select to_regclass('public.scoring_version_activations') as t")).rows[0].t, null);
    assert.equal((await db.query<{ n: number }>("select count(*)::int as n from information_schema.columns where table_name='fantasy_rounds' and column_name='scoring_rule_version'")).rows[0].n, 0);
    assert.deepEqual(await snapshot(db), original);
    await db.transaction(tx => tx.exec(sql));
    assert.deepEqual(await snapshot(db), original, "no score, lineup, result, ownership or event rewrite");
    assert.deepEqual((await db.query<{ scoring_rule_version: string }>("select scoring_rule_version from fantasy_rounds order by number")).rows.map(r => r.scoring_rule_version), Array(3).fill("ELEVEN_STANDARD_V3"));
    await assert.rejects(db.transaction(tx => tx.exec(sql)), /already exists/);
    assert.deepEqual(await snapshot(db), original, "raw replay fails atomically; normal migration history skips it");

    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.exec(`set role ${role}`);
      try {
        if (role === "anon") await assert.rejects(db.exec("select get_catalog_scoring_version()"), /permission denied/);
        else assert.equal((await db.query<{ v: string }>("select get_catalog_scoring_version() as v")).rows[0].v, "ELEVEN_STANDARD_V3");
        if (role !== "service_role") await assert.rejects(db.exec("select * from scoring_version_activations"), /permission denied/);
        await assert.rejects(db.exec("update scoring_version_activations set scoring_rule_version='ELEVEN_STANDARD_V4'"), /permission denied/);
      } finally { await db.exec("reset role"); }
    }
    assert.equal((await db.query<{ v: boolean }>("select has_function_privilege('authenticated','guard_scoring_activation()','execute') as v")).rows[0].v, false);
    await db.exec(`set role service_role; select set_config('request.jwt.claim.role','service_role',false);
      update fantasy_rounds set status='completed' where id='${id(8)}';
      insert into scoring_version_activations values('2090-01-03','ELEVEN_STANDARD_V4');
      insert into fantasy_rounds(id,league_id,season_id,number,starts_at,ends_at,scoring_rule_version) values('${id(60)}','${id(3)}','${id(6)}',4,'2090-01-03','2090-01-10','ELEVEN_STANDARD_V1'); reset role;`);
    assert.equal((await db.query<{ scoring_rule_version: string }>(`select scoring_rule_version from fantasy_rounds where id='${id(60)}'`)).rows[0].scoring_rule_version, "ELEVEN_STANDARD_V4");
    assert.equal((await db.query<{ v: string }>("select get_catalog_scoring_version() as v")).rows[0].v, "ELEVEN_STANDARD_V3", "future activation must not affect current catalog");
    await assert.rejects(db.exec(`update fantasy_rounds set scoring_rule_version='ELEVEN_STANDARD_V4' where id='${id(7)}'`), /IMMUTABLE/);
    await assert.rejects(db.exec(`update fantasy_rounds set ends_at='2026-10-07' where id='${id(7)}'`), /IMMUTABLE/);
    await assert.rejects(db.exec("insert into scoring_version_activations values('2026-09-29','ELEVEN_STANDARD_V4')"), /ACTIVATION_REQUIRES/);
    // Remove only isolated test future round so the real writer targets round 3.
    await db.exec(`delete from fantasy_rounds where id='${id(60)}'; set role authenticated;
      select set_config('request.jwt.claim.role','authenticated',false), set_config('request.jwt.claim.sub','${id(1)}',false);`);
    const changes = [{ roster_entry_id: id(41), starter: false, position: "BENCH" }, { roster_entry_id: id(51), starter: true, position: "DEF" }];
    await db.query("select update_team_lineup($1,$2,$3::jsonb)", [id(4), id(9), JSON.stringify(changes)]);
    const slotsBeforeFailure = (await db.query("select id, starter, slot from lineup_slots order by id")).rows;
    await assert.rejects(db.query("select update_team_lineup($1,$2,$3::jsonb)", [id(4), id(9), JSON.stringify([
      { roster_entry_id: id(51), starter: false, position: "BENCH" },
      { roster_entry_id: id(41), starter: false, position: "BENCH" },
    ])]), /FORMATION/);
    assert.deepEqual((await db.query("select id, starter, slot from lineup_slots order by id")).rows, slotsBeforeFailure, "failed batch leaves both slots unchanged");
    await db.exec("reset role");
    assert.deepEqual((await db.query(`select starter from lineup_slots where roster_entry_id in('${id(41)}','${id(51)}') order by roster_entry_id`)).rows, [{ starter: false }, { starter: true }]);
    const saved = await snapshot(db);
    await db.exec("set role service_role");
    await db.query(`update player_match_stats set reported_stats=$1::jsonb,participation_club_id=$2,scoring_position='GK' where player_id=$3`, [JSON.stringify({ minutes: 90, saves: 0, goals: null }), id(11), id(20)]);
    await db.exec("reset role");
    assert.deepEqual(await snapshot(db), saved, "rich snapshot writer cannot rewrite existing fantasy results");
    // Isolated owner-only clock rehearsal: seed an already-effective policy
    // inside a rollback-only transaction. Never relax production triggers.
    try {
      await db.transaction(async tx => {
        await tx.exec("alter table scoring_version_activations disable trigger guard_scoring_activation; insert into scoring_version_activations values('2026-01-06','ELEVEN_STANDARD_V4'); alter table scoring_version_activations enable trigger guard_scoring_activation; set local role authenticated;");
        assert.equal((await tx.query<{ v: string }>("select get_catalog_scoring_version() as v")).rows[0].v, "ELEVEN_STANDARD_V4");
        throw new Error("TEST_ROLLBACK");
      });
    } catch (error) { assert.match(String(error), /TEST_ROLLBACK/); }
    assert.equal((await db.query<{ v: string }>("select get_catalog_scoring_version() as v")).rows[0].v, "ELEVEN_STANDARD_V3");
  } finally { await db.close(); }
});


test("canonical upgrade: immediate V4, frozen 102–98 result/winner/standings, active round switch, raw JSON natural key and client denial", async () => {
  const db = await bootstrap();
  try {
    await migrations(db, false); await seed(db);
    await db.exec(await readFile(new URL(candidate, folder), "utf8"));
    await db.exec("insert into scoring_version_activations values('2090-01-03','ELEVEN_STANDARD_V4')");
    const historical = async () => (await db.query(`select to_jsonb(m) as matchup, to_jsonb(s) as scores from matchups m join matchup_scores s on s.matchup_id=m.id where m.id='${id(14)}' order by s.fantasy_team_id`)).rows;
    const original = await historical();
    const upgrade = await readFile(new URL("20261009000000_scoring_v4_canonical_and_raw_evidence.sql", folder), "utf8");
    await db.transaction(tx => tx.exec(upgrade));
    assert.equal((await db.query<{v:string}>("select get_catalog_scoring_version() v")).rows[0].v, "ELEVEN_STANDARD_V3", "schema installation alone is dormant");
    await db.exec("set role service_role; select activate_scoring_v4_now(); reset role");
    assert.equal((await db.query<{v:string}>("select get_catalog_scoring_version() v")).rows[0].v, "ELEVEN_STANDARD_V4");
    assert.deepEqual((await db.query<{v:string}>("select scoring_rule_version v from fantasy_rounds order by number")).rows.map(r=>r.v), ["ELEVEN_STANDARD_V3","ELEVEN_STANDARD_V4","ELEVEN_STANDARD_V4"]);
    assert.deepEqual(await historical(), original);
    await db.exec(`insert into fantasy_player_scores(player_id,fixture_id,points,scoring_rule_version,breakdown) values('${id(20)}','${id(13)}',999,'ELEVEN_STANDARD_V4','{}');`);
    assert.deepEqual(await historical(), original, "revaluing a historical player performance cannot alter 102–98, its winner or W/L inputs");
    assert.equal((await db.query<{total_points:string}>("select total_points from get_player_score_totals(2026,'ELEVEN_STANDARD_V4')")).rows[0].total_points, "999.00");
    assert.equal((await db.query<{total_points:string}>("select total_points from get_player_score_totals(2026,'ELEVEN_STANDARD_V3')")).rows[0].total_points, "11.00");
    for (const sql of [
      "update matchup_scores set final_points=999", "update matchup_scores set live_points=999", "delete from matchup_scores",
      `update matchups set status='live' where id='${id(14)}'`, `delete from matchups where id='${id(14)}'`,
      `update fantasy_rounds set status='in_progress' where id='${id(7)}'`, `delete from fantasy_rounds where id='${id(7)}'`,
      `update fantasy_rounds set scoring_rule_version='ELEVEN_STANDARD_V4' where id='${id(7)}'`,
    ]) await assert.rejects(db.exec(sql), /IMMUTABLE/);
    assert.deepEqual(await historical(), original, "official winner and final-point inputs to standings remain exactly 102–98");
    await db.exec(`insert into fantasy_rounds(id,league_id,season_id,number,starts_at,ends_at,status,scoring_rule_version) values('${id(61)}','${id(3)}','${id(6)}',4,'2026-09-01','2026-09-08','in_progress','ELEVEN_STANDARD_V3')`);
    assert.equal((await db.query<{v:string}>(`select scoring_rule_version v from fantasy_rounds where id='${id(61)}'`)).rows[0].v, "ELEVEN_STANDARD_V4", "new round uses canonical V4 even if its start precedes activation");
    const payload = { response: [{ player: { id: 99 }, statistics: [{ games: { rating: "9.2", captain: true }, unused: { future: [0,null,"raw"] } }] }], extra: "retained" };
    for (let i=0;i<2;i++) await db.query(`insert into football_provider_snapshots(provider,endpoint,external_id,fixture_id,payload,fetched_at) values('api-football','/fixtures/players','99',$1,$2,now()) on conflict(provider,endpoint,external_id) do update set payload=excluded.payload,fetched_at=excluded.fetched_at`,[id(13),JSON.stringify(payload)]);
    assert.deepEqual((await db.query<{payload:unknown}>("select payload from football_provider_snapshots")).rows,[{payload}]);
    await assert.rejects(db.exec("insert into scoring_version_activations values('2026-01-06','ELEVEN_STANDARD_V4')"),/ACTIVATION_REQUIRES/);
    for (const role of ["anon","authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.exec("select activate_scoring_v4_now()"),/permission denied/);
      await assert.rejects(db.exec("select * from football_provider_snapshots"),/permission denied/);
      await db.exec("reset role");
    }
    await db.exec(`insert into competitions(id,name,code,country,season) values('${id(70)}','Current international','AFCON_Q','International',2027);
      insert into fixtures(id,competition_id,home_club_id,away_club_id,kickoff_at,status,season) values('${id(71)}','${id(70)}','${id(11)}','${id(12)}','2026-09-30','final',2027);
      insert into fantasy_player_scores(player_id,fixture_id,points,scoring_rule_version,breakdown) values('${id(20)}','${id(71)}',2,'ELEVEN_STANDARD_V4','{}');`);
    assert.equal((await db.query<{total_points:string}>("select total_points from get_player_score_totals(2026,'ELEVEN_STANDARD_V4')")).rows[0].total_points, "1001.00", "actual current-season international dates count despite provider season label");
    // One side settled in an unfinished round: switching policy must stop atomically.
    await db.exec(`insert into matchups(id,league_id,fantasy_round_id,home_fantasy_team_id,away_fantasy_team_id,status) values('${id(62)}','${id(3)}','${id(8)}','${id(4)}','${id(5)}','scheduled'); insert into matchup_scores(matchup_id,fantasy_team_id,live_points,final_points) values('${id(62)}','${id(4)}',0,0);`);
    await assert.rejects(db.exec("select activate_scoring_v4_now()"),/MIXED_SETTLEMENT_STOP/);
    await assert.rejects(db.exec(`update matchups set status='final' where id='${id(62)}'`),/SETTLEMENT_INCOMPLETE/);
    await assert.rejects(db.exec(`update fantasy_rounds set status='completed' where id='${id(8)}'`),/SETTLEMENT_INCOMPLETE/);
    assert.deepEqual(await historical(),original);
  } finally { await db.close(); }
});

test("complete 35-migration clean installation includes raw storage and immutable settlement without activating V4", async () => {
  const db = await bootstrap();
  try {
    const files=(await readdir(folder)).filter(f=>f.endsWith('.sql')).sort();
    for(const file of files){const sql=await readFile(new URL(file,folder),'utf8');await db.transaction(tx=>tx.exec(sql));}
    assert.equal(files.length,35);
    assert.equal((await db.query<{v:string}>('select get_catalog_scoring_version() v')).rows[0].v,'ELEVEN_STANDARD_V3');
    assert.equal((await db.query<{n:number}>('select count(*)::int n from football_provider_snapshots')).rows[0].n,0);
  } finally { await db.close(); }
});
