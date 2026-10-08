import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";

// Real migrations and authenticated RPCs in embedded PostgreSQL only.
// No Supabase credentials, HTTP, providers or persistent data.
const db = new PGlite({ extensions: { pgcrypto, unaccent } });
const folder = new URL("../../supabase/migrations/", import.meta.url);
const candidate = "20261013000000_pre_draft_acquisition_guard.sql";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const owner = id(1), other = id(2), league = id(3), team = id(4), otherTeam = id(5), season = id(6), draft = id(7);
const positions = ["GK", "GK", ...Array(6).fill("DEF"), ...Array(6).fill("MID"), "FWD", "FWD"];

test("migration preserves original RPC bodies except acquisition checks and the season boundary lock", async () => {
  const updated = await readFile(new URL(candidate, folder), "utf8");
  function definition(sql: string, name: string) {
    const start = sql.indexOf(`create or replace function public.${name}(`);
    assert.ok(start >= 0);
    const end = sql.indexOf("$$;", sql.indexOf("as $$", start));
    return sql.slice(start, end + 3).trim();
  }
  for (const [name, file] of [
    ["sign_player", "20261001000000_free_market_and_trades.sql"],
    ["propose_trade", "20261003000100_trade_equal_player_counts.sql"],
    ["accept_trade", "20261001000000_free_market_and_trades.sql"],
    ["start_next_season", "20261003000000_multi_season_lifecycle.sql"],
  ]) {
    const original = definition(await readFile(new URL(file, folder), "utf8"), name);
    const actual = definition(updated, name)
      .replace(/  perform public\._assert_player_acquisition_allowed\([^)]+\);\n\n/, "")
      .replace("where fl.id = p_league_id for update;", "where fl.id = p_league_id;");
    assert.equal(actual, original, `${name}: unrelated game rules must remain identical`);
  }
  assert.equal(updated.includes("function public.make_draft_pick("), false);
  assert.equal(updated.includes("function public._perform_draft_pick("), false);
});

before(async () => {
  await db.exec(`create schema extensions; create schema auth;
    create role anon; create role authenticated; create role service_role bypassrls;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant execute on all functions in schema auth to anon, authenticated, service_role;`);
  for (const file of (await readdir(folder)).filter(f => f.endsWith(".sql")).sort()) {
    await db.transaction(tx => readFile(new URL(file, folder), "utf8").then(sql => tx.exec(sql)));
  }
});
after(() => db.close());
beforeEach(async () => {
  await db.exec(`reset role; truncate auth.users, competitions cascade;
    insert into auth.users values('${owner}','owner@example.invalid','{}'),('${other}','other@example.invalid','{}');
    insert into fantasy_leagues(id,name,invite_code,created_by_user_id,status) values('${league}','Isolated','ACQTEST','${owner}','draft');
    insert into league_memberships values('${league}','${owner}','commissioner',now()),('${league}','${other}','manager',now());
    insert into fantasy_teams(id,league_id,owner_user_id,name,abbreviation) values('${team}','${league}','${owner}','Owner','OWN'),('${otherTeam}','${league}','${other}','Other','OTH');
    insert into seasons(id,league_id,season_number,status) values('${season}','${league}',1,'SETUP');
    insert into competitions(id,name,code,country) values('${id(20)}','Embedded','ACQ','Test');
    insert into clubs(id,competition_id,name,short_name,code) values('${id(21)}','${id(20)}','Club','CLB','CLB');`);
  for (let i = 0; i < 34; i++) await db.query(`insert into players(id,club_id,competition_id,name,short_name,position)
    values($1,$2,$3,$4,$4,$5)`, [id(100 + i), id(21), id(20), `Player ${i}`, positions[i % 16]]);
});
async function asUser(user = owner) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec("select set_config('request.jwt.claim.role','authenticated',false); set role authenticated;");
}
async function completedDraft() {
  await db.exec(`reset role; update fantasy_leagues set status='active' where id='${league}';
    insert into drafts(id,league_id,season_id,status,created_at) values('${draft}','${league}','${season}','completed','2026-01-01');`);
}
const sign = (player = id(100)) => db.query("select * from sign_player($1,$2)", [league, player]);
async function gameRows() {
  await db.exec("reset role");
  const result: Record<string, unknown> = {};
  for (const table of ["roster_entries", "league_player_ownership", "lineup_slots", "trades", "trade_assets", "transactions", "domain_events", "fantasy_rounds", "matchups", "seasons", "drafts"]) {
    result[table] = (await db.query(`select to_jsonb(t) as row from public.${table} t order by to_jsonb(t)::text`)).rows;
  }
  return result;
}
for (const status of [null, "scheduled", "in_progress"] as const) {
  test(`direct signing rejects ${status ?? "missing"} draft with no partial writes`, async () => {
    if (status) await db.query("insert into drafts(id,league_id,season_id,status) values($1,$2,$3,$4)", [draft, league, season, status]);
    const before = await gameRows(); await asUser();
    await assert.rejects(sign(), /DRAFT_NOT_COMPLETED/);
    assert.deepEqual(await gameRows(), before);
  });
}
test("active league status or an older completed draft cannot bypass a redraft", async () => {
  await completedDraft();
  await db.exec(`update seasons set status='COMPLETED' where id='${season}';`);
  await asUser();
  await db.query("select * from start_next_season($1,'REDRAFT',1::smallint)", [league]);
  const before = await gameRows(); await asUser();
  await assert.rejects(sign(), /DRAFT_NOT_COMPLETED/);
  assert.deepEqual(await gameRows(), before);
});
test("post-draft signing works and ownership uniqueness remains authoritative", async () => {
  await completedDraft(); await asUser(); await sign();
  const before = await gameRows(); await asUser(other);
  await assert.rejects(sign(), /PLAYER_ALREADY_OWNED/);
  assert.deepEqual(await gameRows(), before);
  assert.equal((await db.query("select * from league_player_ownership where player_id=$1", [id(100)])).rows.length, 1);
});
test("completed/archived league cannot acquire even with completed draft", async () => {
  await completedDraft();
  for (const status of ["completed", "archived"]) {
    await db.exec("reset role"); await db.query("update fantasy_leagues set status=$1", [status]);
    const before = await gameRows(); await asUser();
    await assert.rejects(sign(), /LEAGUE_NOT_ACTIVE/);
    assert.deepEqual(await gameRows(), before);
  }
});
test("KEEP_ROSTERS preserves post-draft market access without inventing a new draft", async () => {
  await completedDraft(); await db.exec(`update seasons set status='COMPLETED';`); await asUser();
  await db.query("select * from start_next_season($1,'KEEP_ROSTERS',1::smallint)", [league]);
  await sign();
  assert.equal((await db.query("select * from drafts")).rows.length, 1);
});
test("all 32 legitimate draft picks assemble two 16-player squads; free agency is blocked throughout", async () => {
  await asUser();
  const { rows: [started] } = await db.query<{ draft_id: string }>("select * from start_draft($1)", [league]);
  const orders = (await db.query<{ position: number; fantasy_team_id: string }>("select position,fantasy_team_id from draft_orders order by position")).rows;
  for (let pick = 0; pick < 32; pick++) {
    const round = Math.floor(pick / 2), position = round % 2 === 0 ? pick % 2 + 1 : 2 - pick % 2;
    const pickingTeam = orders.find(row => row.position === position)!.fantasy_team_id;
    await asUser(pickingTeam === team ? owner : other);
    await assert.rejects(sign(id(132)), /DRAFT_NOT_COMPLETED/);
    await db.query("select * from make_draft_pick($1,$2)", [started.draft_id, id(100 + (pickingTeam === team ? 0 : 16) + round)]);
  }
  await db.exec("reset role");
  assert.deepEqual((await db.query("select count(*)::int as count from roster_entries where acquisition_type='draft' group by fantasy_team_id")).rows, [{ count: 16 }, { count: 16 }]);
  assert.equal((await db.query<{ status: string }>("select status from drafts")).rows[0].status, "completed");
  assert.equal((await db.query<{ status: string }>("select status from fantasy_leagues")).rows[0].status, "draft");
  await asUser(); await db.query("select drop_player($1,$2)", [league, id(100)]); await sign(id(132));
});
test("trade proposal and acceptance recheck draft state; rejection leaves all assets and history unchanged", async () => {
  await completedDraft(); await asUser(); await sign(id(100)); await asUser(other); await sign(id(116));
  await asUser();
  const { rows: [proposed] } = await db.query<{ trade_id: string }>("select * from propose_trade($1,$2,$3::uuid[],$4::uuid[])", [league, otherTeam, [id(100)], [id(116)]]);
  await db.exec("reset role"); await db.query("update drafts set status='in_progress'");
  const before = await gameRows(); await asUser(other);
  await assert.rejects(db.query("select accept_trade($1)", [proposed.trade_id]), /DRAFT_NOT_COMPLETED/);
  assert.deepEqual(await gameRows(), before); await asUser();
  await assert.rejects(db.query("select * from propose_trade($1,$2,$3::uuid[],$4::uuid[])", [league, otherTeam, [id(100)], [id(116)]]), /DRAFT_NOT_COMPLETED/);
  assert.deepEqual(await gameRows(), before);
  await db.exec("update drafts set status='completed'"); await asUser(other); await db.query("select accept_trade($1)", [proposed.trade_id]);
  assert.equal((await db.query<{ status: string }>("select status from trades")).rows[0].status, "accepted");
});
test("clients cannot insert rosters directly, call internal helpers, or sign as another league member", async () => {
  await asUser();
  await assert.rejects(db.query("insert into roster_entries(league_id,fantasy_team_id,player_id,acquisition_type) values($1,$2,$3,'draft')", [league, team, id(100)]), /permission denied|row-level security/);
  await assert.rejects(db.query("select _assert_player_acquisition_allowed($1)", [league]), /permission denied/);
  await db.exec("reset role"); await db.query("delete from fantasy_teams where id=$1", [otherTeam]); await asUser(other);
  await assert.rejects(sign(), /NOT_LEAGUE_MEMBER/);
});
test("migration redeploy changes no existing game rows and preserves narrow function permissions", async () => {
  await completedDraft(); await asUser(); await sign(); const before = await gameRows();
  await db.exec(await readFile(new URL(candidate, folder), "utf8"));
  assert.deepEqual(await gameRows(), before);
  const { rows: [permissions] } = await db.query("select has_function_privilege('authenticated','public.sign_player(uuid,uuid)','execute') as signing, has_function_privilege('anon','public.sign_player(uuid,uuid)','execute') as anon, has_function_privilege('authenticated','public._assert_player_acquisition_allowed(uuid)','execute') as helper");
  assert.deepEqual(permissions, { signing: true, anon: false, helper: false });
});
