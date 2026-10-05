import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { calculateFantasyScore, SCORING_RULE_VERSION, type ScoringInput } from "../../domain/fantasy/scoring.ts";

// Embedded, in-memory Postgres. No Supabase credentials, HTTP, Docker or
// persistent database; execute the exact proposed migration, not a mock RPC.
const db = new PGlite();
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const team = id(100), league = id(200), round = id(300), owner = id(400);
const now = "2090-01-05T12:00:00Z";
const migration = new URL("../../../supabase/migrations/20261007000000_performance_lineup_and_score_reads.sql", import.meta.url);
async function migrationSql(name: string) {
  return readFile(new URL(`../../../supabase/migrations/${name}`, import.meta.url), "utf8");
}
before(async () => {
  await db.exec(`
    create role authenticated; create role service_role bypassrls; create role anon;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.role() returns text language sql as $$ select current_setting('request.jwt.claim.role', true) $$;
    create table league_memberships(league_id uuid, user_id uuid);
    create function public.is_league_member(p_league_id uuid) returns boolean language sql security definer set search_path=public as $$
      select exists(select 1 from league_memberships where league_id=p_league_id and user_id=auth.uid()) $$;
    create table fantasy_leagues(id uuid primary key);
    create table fantasy_teams(id uuid primary key, league_id uuid not null references fantasy_leagues, owner_user_id uuid not null);
    create table players(id uuid primary key, position text not null);
    create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
    create table fixtures(id uuid primary key, season int not null);
    create table fantasy_player_scores(player_id uuid references players, fixture_id uuid references fixtures, scoring_rule_version text not null, points numeric(8,2) not null);
    create table transactions(league_id uuid, type text, actor_user_id uuid, fantasy_team_id uuid, reference text, metadata jsonb);
    create table domain_events(event_type text, league_id uuid, actor_user_id uuid, fantasy_team_id uuid, entity_type text, entity_id uuid, payload jsonb);
    grant usage on schema public, auth to authenticated, service_role, anon;
  `);
  // Real status, ownership composite FK, round columns and slot constraints.
  await db.exec(await migrationSql("20260929141131_roster_foundation.sql"));
  const market = await migrationSql("20261001000000_free_market_and_trades.sql");
  await db.exec(market.match(/create or replace function public\._current_round_id[\s\S]*?\$\$;/)![0]);
  await db.exec(market.match(/create or replace function public\._release_current_round_slot[\s\S]*?\$\$;/)![0]);
  await db.exec(await migrationSql("20261006000000_drop_lock_enforcement.sql"));
  await db.exec(`grant select on all tables in schema public to authenticated;
    grant all on all tables in schema public to service_role;
    alter table lineup_slots enable row level security;
    create policy "members can read lineup_slots in their league" on lineup_slots for select to authenticated
      using (exists(select 1 from roster_entries re where re.id=lineup_slots.roster_entry_id and public.is_league_member(re.league_id)));`);
  // Start with the exact legacy bypass, then prove the proposal closes it.
  await db.exec(await migrationSql("20260930050000_lineup_slots_owner_write_policy.sql"));
  await db.exec(await migrationSql("20260930060000_grant_lineup_slots_update.sql"));
  await db.exec(await readFile(migration, "utf8"));
});
beforeEach(async () => {
  await db.exec(`reset role; select set_config('request.jwt.claim.role','service_role',false);
    select set_config('request.jwt.claim.sub','',false);
    truncate transactions, domain_events, league_memberships, fantasy_player_scores, fixtures, lineup_slots, roster_entries, players, fantasy_rounds, fantasy_teams, fantasy_leagues cascade;
    insert into fantasy_leagues values ('${league}');
    insert into league_memberships values ('${league}','${owner}');
    insert into fantasy_teams values ('${team}','${league}','${owner}');
    insert into fantasy_rounds(id,league_id,number,starts_at,ends_at) values ('${round}','${league}',1,'2090-01-05','2090-01-12');`);
  const positions = ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD", "FWD", "GK", "DEF", "MID", "FWD", "FWD"];
  for (const [i, position] of positions.entries()) {
    await db.query("insert into players values ($1,$2)", [id(i + 1), position]);
    await db.query("insert into roster_entries(id,league_id,fantasy_team_id,player_id,acquisition_type) values ($1,$2,$3,$4,'draft')", [id(i + 501), league, team, id(i + 1)]);
    await db.query("insert into league_player_ownership(league_id,player_id,fantasy_team_id,roster_entry_id) values ($1,$2,$3,$4)", [league, id(i + 1), team, id(i + 501)]);
    await db.query("insert into lineup_slots(id,roster_entry_id,fantasy_round_id,starter,slot,locked_at) values ($1,$2,$3,$4,$5,null)", [id(i + 601), id(i + 501), round, i < 11, i < 11 ? position : "BENCH"]);
  }
});
after(async () => { await db.close(); });
const swap = [{ roster_entry_id: id(502), starter: false }, { roster_entry_id: id(513), starter: true, position: "DEF" }];
async function apply(changes: unknown = swap, teamId = team, roundId = round, clock = now) {
  return db.query("select update_team_lineup($1,$2,$3::jsonb,$4::timestamptz)", [teamId, roundId, JSON.stringify(changes), clock]);
}
async function states() { return (await db.query<{ roster_entry_id: string; fantasy_round_id: string; starter: boolean; slot: string; locked_at: Date | null; updated_at: Date }>("select roster_entry_id, fantasy_round_id, starter, slot, locked_at, updated_at from lineup_slots order by id")).rows; }

test("RPC persists both halves in one transaction, preserving stored kickoff locks", async () => {
  await db.query("update lineup_slots set locked_at=$1", ["2090-01-06T12:00:00Z"]);
  const before = await states();
  await apply();
  const after = await states();
  assert.equal(after[1].starter, false);
  assert.equal(after[12].starter, true);
  assert.equal(after.filter((s) => s.starter).length, 11);
  assert.deepEqual(after.map((s) => s.locked_at), before.map((s) => s.locked_at));
});
test("a trigger failure on promotion rolls back demotion too", async () => {
  const before = await states();
  await db.exec(`create function reject_promotion() returns trigger language plpgsql as $$ begin
    if new.roster_entry_id='${id(513)}' and new.starter then raise exception 'injected failure'; end if;
    return new; end $$;
    create trigger fail_promotion before update on lineup_slots for each row execute function reject_promotion();`);
  try {
    await assert.rejects(apply(), /injected failure/);
    assert.deepEqual(await states(), before);
  } finally { await db.exec("drop trigger fail_promotion on lineup_slots; drop function reject_promotion();"); }
});
test("locked starter AND locked bench reject the whole batch at the exact kickoff boundary", async () => {
  for (const entry of [id(502), id(513)]) {
    await db.exec("update lineup_slots set locked_at=null");
    await db.query("update lineup_slots set locked_at=$1 where roster_entry_id=$2", [now, entry]);
    const before = await states();
    await assert.rejects(apply(), /SLOT_LOCKED/);
    assert.deepEqual(await states(), before);
  }
});
test("formation, canonical position, stale roster, missing round and duplicate errors never partially write", async () => {
  const cases: Array<[unknown, string]> = [
    [[swap[0]], "INVALID_FORMATION"],
    [[swap[0], { ...swap[1], position: "FWD" }], "INVALID_FORMATION"],
    [[swap[0], { ...swap[1], roster_entry_id: id(999) }], "ROSTER_ENTRY_NOT_ON_TEAM"],
    [[...swap, swap[0]], "WRITE_FAILED"],
  ];
  const before = await states();
  for (const [changes, error] of cases) {
    await assert.rejects(apply(changes), new RegExp(error));
    assert.deepEqual(await states(), before);
  }
  await assert.rejects(apply(swap, team, id(999)), /ROUND_NOT_FOUND/);
});
test("authenticated owner may save, another user cannot, and historic clock cannot bypass locks", async () => {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  await db.exec("select set_config('request.jwt.claim.role','authenticated',false); set role authenticated;");
  await apply();
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(999)]);
  await db.exec("set role authenticated");
  await assert.rejects(apply(), /ROSTER_ENTRY_NOT_ON_TEAM/);
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  await db.exec("update lineup_slots set locked_at='2000-01-01T00:00:00Z'; set role authenticated;");
  await assert.rejects(apply(swap, team, round, "1999-01-01T00:00:00Z"), /SLOT_LOCKED/);
  await db.exec("reset role; delete from league_memberships; set role authenticated;");
  await assert.rejects(apply(), /ROSTER_ENTRY_NOT_ON_TEAM/);
});
test("batch fill of an incomplete XI retains the exact 4-4-2 validation", async () => {
  await db.query("update lineup_slots set starter=false,slot='BENCH' where roster_entry_id=$1", [id(502)]);
  await apply([swap[1]]);
  assert.equal((await states()).filter((s) => s.starter).length, 11);
});
test("direct RPC cannot promote dropped or traded historical bench entries; the complete batch stays unchanged", async () => {
  for (const departure of ["drop", "trade"] as const) {
    // The old team association and historical slot survive both operations.
    if (departure === "drop") {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
      await db.exec("select set_config('request.jwt.claim.role','authenticated',false); set role authenticated");
      await db.query("select drop_player($1,$2)", [league, id(13)]);
      await db.exec("reset role");
    } else {
      await db.exec(`delete from league_player_ownership where roster_entry_id='${id(513)}';
        update roster_entries set status='dropped' where id='${id(513)}';`);
    }
    if (departure === "trade") {
      await db.exec(`insert into fantasy_teams values ('${id(101)}','${league}','${id(401)}');
        insert into roster_entries(id,league_id,fantasy_team_id,player_id,acquisition_type)
          values ('${id(999)}','${league}','${id(101)}','${id(13)}','trade');
        insert into league_player_ownership(league_id,player_id,fantasy_team_id,roster_entry_id)
          values ('${league}','${id(13)}','${id(101)}','${id(999)}');`);
    }
    const before = await states();
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    await db.exec("select set_config('request.jwt.claim.role','authenticated',false); set role authenticated");
    await assert.rejects(apply(), /ROSTER_ENTRY_NOT_ON_TEAM/);
    assert.deepEqual(await states(), before);
    await db.exec("reset role; select set_config('request.jwt.claim.role','service_role',false)");
    await assert.rejects(apply(), /ROSTER_ENTRY_NOT_ON_TEAM/, "service-role RPC also enforces eligibility");
    assert.deepEqual(await states(), before);
  }
});
test("active status alone, ownership alone, and a re-acquired stint do not authorize a historical entry", async () => {
  const before = await states();
  // Still active, but ownership has vanished.
  await db.exec(`delete from league_player_ownership where roster_entry_id='${id(513)}'`);
  await assert.rejects(apply(), /ROSTER_ENTRY_NOT_ON_TEAM/);
  // Re-acquired by the SAME team under a NEW stint, old active data stale.
  await db.exec(`insert into roster_entries(id,league_id,fantasy_team_id,player_id,acquisition_type)
    values ('${id(999)}','${league}','${team}','${id(13)}','free_agent');
    insert into league_player_ownership(league_id,player_id,fantasy_team_id,roster_entry_id)
    values ('${league}','${id(13)}','${team}','${id(999)}');`);
  await assert.rejects(apply(), /ROSTER_ENTRY_NOT_ON_TEAM/);
  await db.exec(`delete from league_player_ownership where roster_entry_id='${id(999)}';
    insert into league_player_ownership(league_id,player_id,fantasy_team_id,roster_entry_id)
    values ('${league}','${id(13)}','${team}','${id(513)}');
    update roster_entries set status='dropped' where id='${id(513)}';`);
  await assert.rejects(apply(), /ROSTER_ENTRY_NOT_ON_TEAM/);
  assert.deepEqual(await states(), before);
});
test("ownership appearing after lock acquisition is rejected rather than validated without its lock", async () => {
  await db.exec(`delete from league_player_ownership where roster_entry_id='${id(513)}';
    create temporary table selector_calls(n int); insert into selector_calls values (0);
    create or replace function public._current_round_id(p_league_id uuid) returns uuid
    language plpgsql volatile set search_path=public as $$ declare result uuid; begin
      update pg_temp.selector_calls set n=n+1;
      if (select n from pg_temp.selector_calls)=2 then
        insert into public.league_player_ownership(league_id,player_id,fantasy_team_id,roster_entry_id)
          values ('${league}','${id(13)}','${team}','${id(513)}');
      end if;
      select id into result from public.fantasy_rounds where league_id=p_league_id order by number desc limit 1;
      return result;
    end $$;`);
  // A controlled in-transaction hook simulates the interleaving between
  // ownership acquisition and validation; this is not a multi-session test.
  const before = await states();
  try {
    await assert.rejects(apply(), /ROSTER_ENTRY_NOT_ON_TEAM/);
    assert.deepEqual(await states(), before);
  } finally {
    const market = await migrationSql("20261001000000_free_market_and_trades.sql");
    await db.exec(market.match(/create or replace function public\._current_round_id[\s\S]*?\$\$;/)![0]);
    await db.exec("drop table pg_temp.selector_calls");
  }
});
test("a foreign team's currently owned entry cannot be supplied in a direct RPC", async () => {
  await db.exec(`insert into fantasy_teams values ('${id(101)}','${league}','${id(401)}');
    delete from league_player_ownership where roster_entry_id='${id(513)}';
    update roster_entries set fantasy_team_id='${id(101)}' where id='${id(513)}';
    insert into league_player_ownership(league_id,player_id,fantasy_team_id,roster_entry_id)
    values ('${league}','${id(13)}','${id(101)}','${id(513)}');`);
  const before = await states();
  await assert.rejects(apply(), /ROSTER_ENTRY_NOT_ON_TEAM/);
  assert.deepEqual(await states(), before);
});
test("locked historical starter remains intact and counts toward XI while eligible active players may swap", async () => {
  // A prior trade retains this locked scoring snapshot on the old team.
  await db.exec(`delete from league_player_ownership where roster_entry_id='${id(503)}';
    update roster_entries set status='dropped' where id='${id(503)}';
    update lineup_slots set locked_at='2000-01-01' where roster_entry_id='${id(503)}';`);
  const historical = (await states())[2];
  await apply();
  assert.deepEqual((await states())[2], historical);
  assert.equal((await states()).filter((s) => s.starter).length, 11);
});
test("client-supplied lock fields are ignored; canonical slots and stored kickoff locks remain authoritative", async () => {
  await db.exec("update lineup_slots set locked_at='2090-01-06'");
  const before = await states();
  await apply(swap.map((change) => ({ ...change, locked_at: null, slot: "FWD" })));
  const after = await states();
  assert.deepEqual(after.map((s) => s.locked_at), before.map((s) => s.locked_at));
  assert.equal(after[1].slot, "BENCH");
  assert.equal(after[12].slot, "DEF");
});
test("latest stored round is authoritative; historical and nonexistent future targets fail, pre-kickoff latest remains editable", async () => {
  await db.exec(`insert into fantasy_rounds(id,league_id,number,starts_at,ends_at,status)
    values ('${id(301)}','${league}',2,'2090-01-12','2090-01-19','upcoming');
    insert into lineup_slots(roster_entry_id,fantasy_round_id,starter,slot,locked_at)
    select roster_entry_id,'${id(301)}',starter,slot,locked_at from lineup_slots where fantasy_round_id='${round}';`);
  const before = await states();
  await assert.rejects(apply(), /ROUND_NOT_FOUND/);
  await assert.rejects(apply(swap, team, id(302)), /ROUND_NOT_FOUND/);
  assert.deepEqual(await states(), before);
  await apply(swap, team, id(301), "2090-01-05T12:00:00Z");
  const changed = (await db.query<{ starter: boolean }>("select starter from lineup_slots where fantasy_round_id=$1 and roster_entry_id=$2", [id(301), id(513)])).rows;
  assert.equal(changed[0].starter, true, "future fixture window is intentionally not a time gate");
  assert.deepEqual((await states()).filter((s) => s.fantasy_round_id === round), before.filter((s) => s.fantasy_round_id === round), "historical round slots are untouched");
});
test("manager direct DML is denied even on own slots/locked_at; league SELECT and trusted service DML remain authorized", async () => {
  const before = await states();
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  await db.exec("select set_config('request.jwt.claim.role','authenticated',false); set role authenticated");
  assert.equal((await states()).length, 16, "existing member read policy still works");
  for (const sql of [
    "update lineup_slots set starter=false",
    "update lineup_slots set slot='FWD'",
    "update lineup_slots set locked_at=null",
    "delete from lineup_slots",
    `insert into lineup_slots(roster_entry_id,fantasy_round_id,slot) values ('${id(513)}','${round}','BENCH')`,
  ]) await assert.rejects(db.exec(sql), /permission denied/);
  await assert.rejects(db.query("select _release_current_round_slot($1,$2)", [id(502), league]), /permission denied/,
    "publicly executable INVOKER helper is not a direct DML escape hatch");
  assert.deepEqual(await states(), before);
  await apply(); // No direct UPDATE privilege needed by the owner RPC.
  await db.exec("reset role; set role service_role");
  await db.exec(`update lineup_slots set locked_at='2090-01-06' where roster_entry_id='${id(513)}'`);
  await db.exec("reset role");
  assert.ok((await states())[12].locked_at);
  await db.exec("delete from league_memberships; set role authenticated");
  assert.equal((await states()).length, 0, "nonmembers still cannot read slots");
  await db.exec("reset role");
});
test("trusted drop still demotes an unlocked starter after DML revocation, preserves history, and allows a valid fill", async () => {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  await db.exec("select set_config('request.jwt.claim.role','authenticated',false); set role authenticated");
  await db.query("select drop_player($1,$2)", [league, id(2)]);
  const afterDrop = await states();
  assert.equal(afterDrop.length, 16, "no historical slots deleted");
  assert.equal(afterDrop[1].starter, false);
  await apply([swap[1]]);
  assert.equal((await states()).filter((s) => s.starter).length, 11);
  await db.exec("reset role");
});
test("anonymous callers lack RPC execution; security metadata and redeployment preserve rows and ACLs", async () => {
  await db.exec("set role anon");
  await assert.rejects(apply(), /permission denied for function/);
  await assert.rejects(db.query("select * from get_player_score_totals(2026,'ELEVEN_STANDARD_V3')"), /permission denied for function/);
  await db.exec("reset role");
  const before = await states();
  await db.exec(await readFile(migration, "utf8"));
  assert.deepEqual(await states(), before, "creating/replacing functions never executes their bodies");
  const functions = await db.query<{ proname: string; prosecdef: boolean; proconfig: string[] }>("select proname,prosecdef,proconfig from pg_proc where proname in ('update_team_lineup','get_player_score_totals') order by proname");
  assert.deepEqual(functions.rows.map((f) => [f.proname, f.prosecdef, f.proconfig]), [
    ["get_player_score_totals", false, ["search_path=public"]],
    ["update_team_lineup", true, ["search_path=public"]],
  ]);
  assert.equal((await db.query<{ allowed: boolean }>("select has_table_privilege('authenticated','lineup_slots','UPDATE') as allowed")).rows[0].allowed, false);
  assert.equal((await db.query<{ count: number }>("select count(*)::int from pg_policies where tablename='lineup_slots' and cmd='UPDATE'")).rows[0].count, 0);
});
test("score RPC sums only requested season/version, supports IDs and preserves score RLS", async () => {
  await db.exec(`insert into fixtures values ('${id(701)}',2026),('${id(702)}',2026),('${id(703)}',2025);
    insert into fantasy_player_scores values
      ('${id(1)}','${id(701)}','ELEVEN_STANDARD_V3',-1.25),
      ('${id(1)}','${id(702)}','ELEVEN_STANDARD_V3',0.50),
      ('${id(1)}','${id(701)}','ELEVEN_STANDARD_V2',100),
      ('${id(1)}','${id(703)}','ELEVEN_STANDARD_V3',200),
      ('${id(2)}','${id(701)}','ELEVEN_STANDARD_V3',3.50);`);
  const scores = await db.query<{ player_id: string; total_points: string; appearances: number }>("select * from get_player_score_totals(2026,'ELEVEN_STANDARD_V3')");
  assert.equal(scores.rows.length, 2);
  assert.equal(Number(scores.rows[0].total_points), -0.75);
  assert.equal(Number(scores.rows[0].appearances), 2);
  assert.equal((await db.query("select * from get_player_score_totals(2026,'ELEVEN_STANDARD_V3',$1::uuid[])", [[id(2)]])).rows.length, 1);
  assert.equal((await db.query("select * from get_player_score_totals(2026,'ELEVEN_STANDARD_V3','{}')")).rows.length, 0);
  await db.exec(`alter table fantasy_player_scores enable row level security;
    create policy visible_score on fantasy_player_scores for select to authenticated using (player_id='${id(2)}');
    set role authenticated;`);
  try {
    const visible = await db.query<{ player_id: string }>("select * from get_player_score_totals(2026,'ELEVEN_STANDARD_V3')");
    assert.deepEqual(visible.rows.map((r) => r.player_id), [id(2)]);
  } finally { await db.exec("reset role; drop policy visible_score on fantasy_player_scores; alter table fantasy_player_scores disable row level security;"); }
});
test("actual V3-generated integer-stat scores give equivalent SQL/JS totals and rounded averages", async () => {
  const input: ScoringInput = { position: "MID", minutes: 90, goals: 0, assists: 0, shotsOnTarget: 0,
    chancesCreated: 0, tackles: 0, interceptions: 0, blocks: 0, saves: 0,
    yellowCards: 0, redCards: 0, concededByOwnClub: 0 };
  const points: number[] = [];
  for (let i = 0; i < 128; i++) {
    const score = calculateFantasyScore({ ...input, position: (["GK", "DEF", "MID", "FWD"] as const)[i % 4],
      minutes: [0, 20, 60, 90][i % 4], shotsOnTarget: i % 5, goals: i % 3, assists: i % 2,
      chancesCreated: i % 4, tackles: i % 7, interceptions: i % 3, blocks: i % 2, saves: i % 6,
      yellowCards: i % 2, redCards: i % 3, concededByOwnClub: i % 5 }).total;
    assert.equal(Number.isInteger(score * 4), true, "current V3 integer inputs produce binary-exact quarter points");
    points.push(score);
    await db.query("insert into fixtures values ($1,2026)", [id(1000 + i)]);
    await db.query("insert into fantasy_player_scores values ($1,$2,$3,$4)", [id(1), id(1000 + i), SCORING_RULE_VERSION, score]);
  }
  const row = (await db.query<{ total_points: string; appearances: number }>("select * from get_player_score_totals(2026,$1)", [SCORING_RULE_VERSION])).rows[0];
  const oldSum = points.reduce((sum, value) => sum + value, 0);
  assert.equal(Number(row.total_points), oldSum);
  assert.equal(Number(row.appearances), points.length);
  assert.equal(Math.round(Number(row.total_points) / Number(row.appearances) * 100) / 100,
    Math.round(oldSum / points.length * 100) / 100);
});
test("score zero remains a scored appearance; no-score is absent; pagination order is deterministic", async () => {
  await db.exec(`insert into fixtures values ('${id(701)}',2026);
    insert into fantasy_player_scores values ('${id(2)}','${id(701)}','ELEVEN_STANDARD_V3',0),
      ('${id(1)}','${id(701)}','ELEVEN_STANDARD_V3',-0.25);`);
  const rows = (await db.query<{ player_id: string; total_points: string; appearances: number }>("select * from get_player_score_totals(2026,'ELEVEN_STANDARD_V3')")).rows;
  assert.deepEqual(rows.map((r) => r.player_id), [id(1), id(2)]);
  assert.equal(Number(rows[1].total_points), 0);
  assert.equal(Number(rows[1].appearances), 1);
  assert.equal((await db.query("select * from get_player_score_totals(2026,'ELEVEN_STANDARD_V3',$1::uuid[])", [[id(3)]])).rows.length, 0);
  assert.deepEqual((await db.query("select * from get_player_score_totals(2026,'ELEVEN_STANDARD_V3') limit 1 offset 1")).rows, [rows[1]]);
});
