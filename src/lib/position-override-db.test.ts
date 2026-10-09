import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";

// Real migrations (every file in supabase/migrations, in order -- this
// picks up 20261014000000_position_classification_overrides.sql,
// 20261015000000_canonical_position_resolution.sql and
// 20261015000100_formation_4_3_3_and_canonical_position_lineup.sql
// alongside everything that exists today) against embedded Postgres. No
// Supabase credentials, HTTP, or persistent data -- see
// src/lib/player-acquisition-db.test.ts for the same harness pattern.
const db = new PGlite({ extensions: { pgcrypto, unaccent } });
const folder = new URL("../../supabase/migrations/", import.meta.url);
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const owner = id(1), league = id(3), team = id(4), competition = id(20), club = id(21);
// Four real drafted players from "5 Men of Class" + their four approved
// overrides -- same UUIDs as docs/audits/5-men-of-class-draft-snapshot-2026-10-09.json,
// so this test is directly traceable to the actual Pass 3 brief.
const GUEHI = "28dd6e50-16dd-4328-a734-a443e8a50902";
const PORRO = "33eab8f1-b033-48f1-827f-612b7573e9ac";
const ROGERS = "7bff7448-34a8-45d5-afbd-d1586a0c86ba";
const AMAIMOUNI = "75b65172-5451-4341-94e5-58086e5a5792";
const season = id(6), draft = id(7);

before(async () => {
  await db.exec(`create schema extensions; create schema auth;
    create role anon; create role authenticated; create role service_role bypassrls;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant execute on all functions in schema auth to anon, authenticated, service_role;`);
  for (const file of (await readdir(folder)).filter((f) => f.endsWith(".sql")).sort()) {
    await db.transaction((tx) => readFile(new URL(file, folder), "utf8").then((sql) => tx.exec(sql)));
  }
});
after(() => db.close());

async function asUser(user = owner) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec("select set_config('request.jwt.claim.role','authenticated',false); set role authenticated;");
}
async function asService() {
  await db.exec("reset role; select set_config('request.jwt.claim.role','service_role',false);");
}

beforeEach(async () => {
  await asService();
  await db.exec(`truncate auth.users, competitions cascade;
    insert into auth.users values('${owner}','owner@example.invalid','{}');
    insert into fantasy_leagues(id,name,invite_code,created_by_user_id,status) values('${league}','Isolated','OVRTEST','${owner}','active');
    insert into league_memberships values('${league}','${owner}','commissioner',now());
    insert into fantasy_teams(id,league_id,owner_user_id,name,abbreviation) values('${team}','${league}','${owner}','Owner','OWN');
    insert into seasons(id,league_id,season_number,status) values('${season}','${league}',1,'ACTIVE');
    insert into drafts(id,league_id,season_id,status,created_at) values('${draft}','${league}','${season}','completed','2026-01-01');
    insert into competitions(id,name,code,country) values('${competition}','Embedded','OVR','Test');
    insert into clubs(id,competition_id,name,short_name,code) values('${club}','${competition}','Club','CLB','CLB');`);
  // Guehi and Porro start MID (raw provider), Rogers starts FWD, Amaimouni
  // starts MID -- exactly their real pre-correction classifications.
  for (const [pid, rawPosition] of [[GUEHI, "MID"], [PORRO, "MID"], [ROGERS, "FWD"], [AMAIMOUNI, "MID"]] as const) {
    await db.query(`insert into players(id,club_id,competition_id,name,short_name,position) values($1,$2,$3,$4,$4,$5)`, [pid, club, competition, pid.slice(-4), rawPosition]);
  }
});

test("a fresh player's canonical_position defaults to the provider's raw position (precedence tier 3)", async () => {
  const { rows } = await db.query<{ position: string; canonical_position: string }>("select position, canonical_position from players where id=$1", [GUEHI]);
  assert.equal(rows[0].position, "MID");
  assert.equal(rows[0].canonical_position, "MID");
});

test("inserting an override immediately flips canonical_position (precedence tier 1 beats tier 3)", async () => {
  await db.query(
    `insert into player_position_overrides(player_id, provider_position_at_override, override_position, reason, evidence_source, confidence, created_by_user_id)
     values($1,'MID','DEF','9 of 10 logged match appearances as D','match_appearance_majority','LIKELY',$2)`,
    [GUEHI, owner]
  );
  const { rows } = await db.query<{ position: string; canonical_position: string }>("select position, canonical_position from players where id=$1", [GUEHI]);
  assert.equal(rows[0].position, "MID", "raw provider position must never be overwritten (requirement 3)");
  assert.equal(rows[0].canonical_position, "DEF");
});

test("a provider resync AFTER an override exists does not undo it -- the override survives synchronization (requirement 1)", async () => {
  await db.query(
    `insert into player_position_overrides(player_id, provider_position_at_override, override_position, reason, evidence_source, confidence, created_by_user_id)
     values($1,'MID','DEF','9 of 10 logged match appearances as D','match_appearance_majority','LIKELY',$2)`,
    [GUEHI, owner]
  );
  // Simulate API-Football re-syncing this player with a DIFFERENT raw
  // position than before (e.g. the provider itself changes its bucket).
  await db.query("update players set position='FWD' where id=$1", [GUEHI]);
  const { rows } = await db.query<{ position: string; canonical_position: string }>("select position, canonical_position from players where id=$1", [GUEHI]);
  assert.equal(rows[0].position, "FWD", "the raw provider value does update on resync");
  assert.equal(rows[0].canonical_position, "DEF", "but canonical_position stays on the approved override, not the new raw value");
});

test("removing an override reverts canonical_position to the current raw provider position", async () => {
  await db.query(
    `insert into player_position_overrides(player_id, provider_position_at_override, override_position, reason, evidence_source, confidence, created_by_user_id)
     values($1,'MID','FWD','3 of 4 logged match appearances as F','match_appearance_majority','AMBIGUOUS',$2)`,
    [AMAIMOUNI, owner]
  );
  await db.query("delete from player_position_overrides where player_id=$1", [AMAIMOUNI]);
  const { rows } = await db.query<{ canonical_position: string }>("select canonical_position from players where id=$1", [AMAIMOUNI]);
  assert.equal(rows[0].canonical_position, "MID");
});

test("sign_player's roster position-limit check counts by canonical_position, not raw position", async () => {
  await asUser();
  // Fill the team's DEF slots to the max (6) using canonical_position =
  // DEF for all, achieved here via four more real DEF players plus
  // Guehi's override -- then prove a 6th/7th DEF-by-override signing is
  // correctly rejected as ROSTER_LIMIT_EXCEEDED, which only happens if
  // the count query is reading canonical_position.
  await asService();
  for (let i = 0; i < 6; i++) {
    const pid = id(200 + i);
    await db.query(`insert into players(id,club_id,competition_id,name,short_name,position) values($1,$2,$3,$4,$4,'DEF')`, [pid, club, competition, pid.slice(-4)]);
  }
  await db.query(
    `insert into player_position_overrides(player_id, provider_position_at_override, override_position, reason, evidence_source, confidence, created_by_user_id)
     values($1,'MID','DEF','approved','manual_review','CONFIRMED',$2)`,
    [GUEHI, owner]
  );
  await asUser();
  for (let i = 0; i < 5; i++) await db.query("select * from sign_player($1,$2)", [league, id(200 + i)]);
  await db.query("select * from sign_player($1,$2)", [league, GUEHI]); // 6th DEF, via override -- exactly at max
  await assert.rejects(
    db.query("select * from sign_player($1,$2)", [league, id(205)]),
    /ROSTER_LIMIT_EXCEEDED/,
    "a 7th DEF (5 raw-DEF + Guehi's override-DEF, all already signed, plus this real 6th raw-DEF candidate) must be rejected -- proves the count used canonical_position, since without the override Guehi wouldn't count toward DEF at all"
  );
});

test("update_team_lineup's 4-3-3 shape check and slot label both use canonical_position", async () => {
  await asService();
  await db.exec(`insert into fantasy_rounds(id,league_id,season_id,number,starts_at,ends_at) values('${id(300)}','${league}','${season}',1,'2090-01-05','2090-01-12')`);
  // A single pivot player (Amaimouni, raw MID / approved override FWD)
  // is the ONLY thing separating a legal 4-3-3 XI from the old 4-4-2
  // shape here: GK1/DEF4 fixed, 3 raw MID + 3 raw FWD + Amaimouni. WITH
  // the override Amaimouni counts as a 4th FWD alongside 3 real FWD...
  // no -- deliberately sized so WITH the override the 11 is exactly
  // GK1/DEF4/MID3/FWD3 (3 raw MID, 2 raw FWD + Amaimouni-as-FWD), and
  // WITHOUT it the SAME 11 players becomes GK1/DEF4/MID4/FWD2 (Amaimouni
  // reverts to MID) -- the old 4-4-2 shape, which the new 4-3-3 check
  // must reject.
  const rosterSpec: [string, string][] = [
    [id(900), "GK"],
    [id(901), "DEF"], [id(902), "DEF"], [id(903), "DEF"], [id(904), "DEF"],
    [id(905), "MID"], [id(906), "MID"], [id(907), "MID"],
    [id(908), "FWD"], [id(909), "FWD"],
    [AMAIMOUNI, "MID"], // raw MID, overridden to FWD below
    [id(910), "GK"], [id(911), "DEF"], [id(912), "MID"], [id(913), "FWD"], [id(914), "DEF"],
  ];
  for (const [pid, pos] of rosterSpec) {
    if (pid !== AMAIMOUNI) {
      await db.query(`insert into players(id,club_id,competition_id,name,short_name,position) values($1,$2,$3,$4,$4,$5) on conflict (id) do nothing`, [pid, club, competition, pid.slice(-4), pos]);
    }
    const reId = `00000000-0000-4000-9000-${pid.slice(-12)}`;
    await db.query("insert into roster_entries(id,league_id,fantasy_team_id,player_id,acquisition_type) values($1,$2,$3,$4,'draft')", [reId, league, team, pid]);
    await db.query("insert into league_player_ownership(league_id,player_id,fantasy_team_id,roster_entry_id) values($1,$2,$3,$4)", [league, pid, team, reId]);
    await db.query("insert into lineup_slots(id,roster_entry_id,fantasy_round_id,starter,slot) values($1,$2,$3,false,'BENCH')", [`00000000-0000-4000-a000-${pid.slice(-12)}`, reId, id(300)]);
  }
  await db.query(
    `insert into player_position_overrides(player_id, provider_position_at_override, override_position, reason, evidence_source, confidence, created_by_user_id)
     values($1,'MID','FWD','approved','manual_review','CONFIRMED',$2)`,
    [AMAIMOUNI, owner]
  );

  const reIdOf = (pid: string) => `00000000-0000-4000-9000-${pid.slice(-12)}`;
  const starterIds = [id(900), id(901), id(902), id(903), id(904), id(905), id(906), id(907), id(908), id(909), AMAIMOUNI];
  const starters433 = starterIds.map((pid) => ({ roster_entry_id: reIdOf(pid), starter: true, position: null }));

  await asUser();
  await db.query("select update_team_lineup($1,$2,$3::jsonb)", [team, id(300), JSON.stringify(starters433)]);
  const { rows: slots } = await db.query<{ starter: boolean; slot: string; roster_entry_id: string }>(
    "select roster_entry_id, starter, slot from lineup_slots where fantasy_round_id=$1 and starter=true order by roster_entry_id",
    [id(300)]
  );
  assert.equal(slots.length, 11, "exactly 11 starters accepted -- the 4-3-3 shape check (GK1/DEF4/MID3/FWD3) passed using canonical_position");
  const amaimouniSlot = slots.find((s) => s.roster_entry_id === reIdOf(AMAIMOUNI));
  assert.equal(amaimouniSlot?.slot, "FWD", "Amaimouni's written slot label reflects his override (FWD), not his raw provider position (MID)");

  // The exact same 11 players, without the override, is GK1/DEF4/MID4/FWD2
  // -- the OLD 4-4-2 shape. The transitional dual-shape RPC
  // (20261015000200_formation_dual_shape_transition.sql, superseding
  // 20261015000100's 4-3-3-only check for the duration of the rollout)
  // must still ACCEPT this -- an old, not-yet-redeployed client must
  // keep working while the DB migration and the app deploy aren't
  // atomic. Prove it by removing the override and replaying the
  // identical selection against a fresh round.
  await asService();
  await db.query("delete from player_position_overrides where player_id=$1", [AMAIMOUNI]);
  await db.exec(`insert into fantasy_rounds(id,league_id,season_id,number,starts_at,ends_at) values('${id(301)}','${league}','${season}',2,'2090-01-12','2090-01-19')`);
  for (const [pid] of rosterSpec) {
    await db.query("insert into lineup_slots(id,roster_entry_id,fantasy_round_id,starter,slot) values($1,$2,$3,false,'BENCH')", [`00000000-0000-4000-b000-${pid.slice(-12)}`, reIdOf(pid), id(301)]);
  }
  const sameElevenRound2 = starterIds.map((pid) => ({ roster_entry_id: reIdOf(pid), starter: true, position: null }));
  await asUser();
  await db.query("select update_team_lineup($1,$2,$3::jsonb)", [team, id(301), JSON.stringify(sameElevenRound2)]);
  const { rows: round2Starters } = await db.query<{ count: string }>(
    "select count(*)::text as count from lineup_slots where fantasy_round_id=$1 and starter=true",
    [id(301)]
  );
  assert.equal(round2Starters[0].count, "11", "the old 4-4-2 shape must still be accepted during the transition window, without the override");
});

test("a genuinely invalid shape (neither old 4-4-2 nor new 4-3-3) is rejected by the transitional dual-shape check", async () => {
  await asService();
  await db.exec(`insert into fantasy_rounds(id,league_id,season_id,number,starts_at,ends_at) values('${id(400)}','${league}','${season}',1,'2090-01-05','2090-01-12')`);
  // 1 GK, 4 DEF, 2 MID, 5 FWD -- a real count that is neither accepted shape.
  const invalidRosterSpec: [string, string][] = [
    [id(950), "GK"],
    [id(951), "DEF"], [id(952), "DEF"], [id(953), "DEF"], [id(954), "DEF"],
    [id(955), "MID"], [id(956), "MID"],
    [id(957), "FWD"], [id(958), "FWD"], [id(959), "FWD"], [id(960), "FWD"], [id(961), "FWD"],
  ];
  for (const [pid, pos] of invalidRosterSpec) {
    await db.query(`insert into players(id,club_id,competition_id,name,short_name,position) values($1,$2,$3,$4,$4,$5) on conflict (id) do nothing`, [pid, club, competition, pid.slice(-4), pos]);
    const reId = `00000000-0000-4000-9000-${pid.slice(-12)}`;
    await db.query("insert into roster_entries(id,league_id,fantasy_team_id,player_id,acquisition_type) values($1,$2,$3,$4,'draft')", [reId, league, team, pid]);
    await db.query("insert into league_player_ownership(league_id,player_id,fantasy_team_id,roster_entry_id) values($1,$2,$3,$4)", [league, pid, team, reId]);
    await db.query("insert into lineup_slots(id,roster_entry_id,fantasy_round_id,starter,slot) values($1,$2,$3,true,$4)", [`00000000-0000-4000-a000-${pid.slice(-12)}`, reId, id(400), pos]);
  }
  const noChange = invalidRosterSpec.map(([pid]) => ({ roster_entry_id: `00000000-0000-4000-9000-${pid.slice(-12)}`, starter: true, position: null }));
  await asUser();
  await assert.rejects(
    db.query("select update_team_lineup($1,$2,$3::jsonb)", [team, id(400), JSON.stringify(noChange)]),
    /INVALID_FORMATION/,
    "MID2/FWD5 is neither the old nor the new formation and must still be rejected"
  );
});
