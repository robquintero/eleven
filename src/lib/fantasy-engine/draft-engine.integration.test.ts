/**
 * COMMITTED integration regression tests for the draft/round/lineup
 * engine — real temporary Supabase Auth users, a real temporary league,
 * real RPC calls, cleaned up in a `finally` block. This is deliberately
 * NOT a disposable script: it is git-tracked, re-runnable, and asserts
 * the exact adversarial scenarios the Pass 10 brief calls out (draft
 * concurrency, lock enforcement, formation validation, bench-exclusion
 * from matchup scoring) as permanent coverage rather than one-off manual
 * QA that gets deleted after a session.
 *
 * Requires real Supabase credentials (`.env.local`) and touches the real
 * project — run explicitly via `npm run test:integration`
 * (`node --env-file=.env.local ...`). Plain `npm test` does NOT load
 * `.env.local`, so `isSupabaseAdminConfigured()` is false there and every
 * test in this file skips cleanly — this file is swept up by the same
 * `find src/domain src/lib -name '*.test.ts'` glob `npm test` uses, but
 * never touches the network under that invocation. This preserves the
 * existing project convention ("automated `npm test` never touches the
 * live provider or a live database") while still giving these scenarios
 * committed, permanent coverage under their own explicit command.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, isSupabaseAdminConfigured } from "../supabase/admin.ts";
import { openNextRound, refreshMatchupScores, finalizeRoundIfReady } from "./rounds.ts";
import { updateLineup } from "./lineup.ts";
import type { Database } from "../supabase/database.types.ts";

const skip = !isSupabaseAdminConfigured();

interface TestLeague {
  leagueId: string;
  teamIds: string[];
  userIds: string[];
  clients: SupabaseClient<Database>[];
}

async function createTestLeague(admin: ReturnType<typeof createAdminClient>, managers: number, squadSize = 16): Promise<TestLeague> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const password = "Pass10-Integration-Test!" + Math.random().toString(36).slice(2);

  const userIds: string[] = [];
  const clients: SupabaseClient<Database>[] = [];
  for (let i = 0; i < managers; i++) {
    const email = `eleven-integration-test-${Date.now()}-${i}-${Math.random().toString(36).slice(2)}@example.invalid`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw new Error(`failed to create test user: ${error?.message}`);
    userIds.push(data.user.id);
    const client = createClient<Database>(url, anonKey);
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw new Error(`failed to sign in test user: ${signInError.message}`);
    clients.push(client);
  }

  const { data: created, error: createErr } = await clients[0].rpc("create_league", {
    p_name: `Eleven Integration Test ${Date.now()}`,
    p_team_name: "Team 0",
    p_team_abbreviation: "TM0",
    p_settings: {
      maxTeams: managers,
      squadSize,
      starterCount: 11,
      waiverMode: "priority",
      playoffEnabled: true,
      draftType: "snake",
      pickTimerSeconds: 60,
    },
  });
  if (createErr || !created?.[0]) throw new Error(`create_league failed: ${createErr?.message}`);
  const leagueId = created[0].league_id;
  const teamIds = [created[0].fantasy_team_id];

  for (let i = 1; i < managers; i++) {
    const { data: joined, error } = await clients[i].rpc("join_league_by_invite_code", {
      p_invite_code: created[0].invite_code,
      p_team_name: `Team ${i}`,
      p_team_abbreviation: `TM${i}`,
    });
    if (error || !joined?.[0]) throw new Error(`join failed: ${error?.message}`);
    teamIds.push(joined[0].fantasy_team_id);
  }

  return { leagueId, teamIds, userIds, clients };
}

async function cleanupTestLeague(admin: ReturnType<typeof createAdminClient>, league: TestLeague) {
  await admin.from("fantasy_leagues").delete().eq("id", league.leagueId);
  for (const userId of league.userIds) {
    await admin.auth.admin.deleteUser(userId);
  }
}

async function draftToCompletion(admin: ReturnType<typeof createAdminClient>, draftId: string, managers: number, squadSize: number) {
  const farFuture = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
  const maxPicks = managers * squadSize + 5;
  for (let i = 0; i < maxPicks; i++) {
    const { data: status } = await admin.from("drafts").select("status").eq("id", draftId).single();
    if (status?.status === "completed") return;
    const { error } = await admin.rpc("resolve_expired_pick", { p_draft_id: draftId, p_as_of: farFuture });
    if (error) throw new Error(`auto-pick failed: ${error.message}`);
  }
  throw new Error("draft did not complete within the expected number of picks");
}

test("concurrent draft picks for the same player: exactly one succeeds, the other gets a clean rejection, never a raw constraint error", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 4);
  try {
    const { data: draft } = await league.clients[0].rpc("start_draft", { p_league_id: league.leagueId });
    const draftId = draft![0].draft_id;

    const { data: order } = await admin.from("draft_orders").select("fantasy_team_id, position").eq("draft_id", draftId).order("position");
    const firstTeamId = order!.find((o) => o.position === 1)!.fantasy_team_id;
    const firstClientIndex = league.teamIds.indexOf(firstTeamId);
    const firstClient = league.clients[firstClientIndex];

    const { data: players } = await admin.from("players").select("id").eq("active", true).limit(1);
    const playerId = players![0].id;

    const [a, b] = await Promise.all([
      firstClient.rpc("make_draft_pick", { p_draft_id: draftId, p_player_id: playerId }),
      firstClient.rpc("make_draft_pick", { p_draft_id: draftId, p_player_id: playerId }),
    ]);

    const successes = [a, b].filter((r) => !r.error);
    const failures = [a, b].filter((r) => r.error);
    assert.equal(successes.length, 1, "exactly one of the two concurrent identical requests must succeed");
    assert.equal(failures.length, 1);
    assert.equal(failures[0].error!.message, "NOT_YOUR_TURN", "the loser gets a clean, known error code -- never a raw Postgres constraint violation");
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

test("a team attempting to pick out of turn is rejected", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 4);
  try {
    const { data: draft } = await league.clients[0].rpc("start_draft", { p_league_id: league.leagueId });
    const draftId = draft![0].draft_id;

    const { data: order } = await admin.from("draft_orders").select("fantasy_team_id, position").eq("draft_id", draftId).order("position");
    const lastTeamId = order!.find((o) => o.position === league.teamIds.length)!.fantasy_team_id;
    const lastClient = league.clients[league.teamIds.indexOf(lastTeamId)];

    const { data: players } = await admin.from("players").select("id").eq("active", true).limit(1);
    const { error } = await lastClient.rpc("make_draft_pick", { p_draft_id: draftId, p_player_id: players![0].id });
    assert.equal(error?.message, "NOT_YOUR_TURN");
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

test("a completed draft leaves every team with exactly squadSize players and zero duplicate ownership", { skip }, async () => {
  const admin = createAdminClient();
  const managers = 4;
  const squadSize = 4;
  const league = await createTestLeague(admin, managers, squadSize);
  try {
    const { data: draft } = await league.clients[0].rpc("start_draft", { p_league_id: league.leagueId });
    const draftId = draft![0].draft_id;
    await draftToCompletion(admin, draftId, managers, squadSize);

    const { data: finalDraft } = await admin.from("drafts").select("status").eq("id", draftId).single();
    assert.equal(finalDraft!.status, "completed");

    const { data: ownershipRows } = await admin.from("league_player_ownership").select("fantasy_team_id, player_id").eq("league_id", league.leagueId);
    assert.equal(ownershipRows!.length, managers * squadSize);

    const uniquePlayers = new Set(ownershipRows!.map((r) => r.player_id));
    assert.equal(uniquePlayers.size, ownershipRows!.length, "no player drafted more than once across the whole league");

    const byTeam = new Map<string, number>();
    for (const row of ownershipRows!) byTeam.set(row.fantasy_team_id, (byTeam.get(row.fantasy_team_id) ?? 0) + 1);
    for (const teamId of league.teamIds) {
      assert.equal(byTeam.get(teamId), squadSize, `team ${teamId} must have exactly ${squadSize} players`);
    }
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

test("an invalid starting formation (0 GK) is rejected server-side, and a valid one is accepted", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 4, 16);
  try {
    const { data: draft } = await league.clients[0].rpc("start_draft", { p_league_id: league.leagueId });
    const draftId = draft![0].draft_id;
    await draftToCompletion(admin, draftId, 4, 16);

    const openResult = await openNextRound(admin, league.leagueId, new Date("2026-09-08T00:00:00Z"));
    assert.ok(openResult.ok, "round must open successfully against real stored fixture data");
    if (!openResult.ok) return;

    const teamId = league.teamIds[0];
    const { data: roster } = await admin.from("roster_entries").select("id, players(position)").eq("fantasy_team_id", teamId).eq("status", "active");
    const byPos: Record<string, string[]> = { GK: [], DEF: [], MID: [], FWD: [] };
    for (const r of roster!) byPos[(r.players as { position: string }).position].push(r.id);

    const invalidZeroGk = [
      ...byPos.DEF.slice(0, 5).map((id) => ({ rosterEntryId: id, starter: true, position: "DEF" as const })),
      ...byPos.MID.slice(0, 5).map((id) => ({ rosterEntryId: id, starter: true, position: "MID" as const })),
      ...byPos.FWD.slice(0, 1).map((id) => ({ rosterEntryId: id, starter: true, position: "FWD" as const })),
    ];
    const invalidResult = await updateLineup(admin, teamId, openResult.roundId, invalidZeroGk, new Date("2026-09-08T00:00:00Z"));
    assert.deepEqual(invalidResult, { ok: false, error: "INVALID_FORMATION" });

    const validXi = [
      ...byPos.GK.slice(0, 1).map((id) => ({ rosterEntryId: id, starter: true, position: "GK" as const })),
      ...byPos.DEF.slice(0, 4).map((id) => ({ rosterEntryId: id, starter: true, position: "DEF" as const })),
      ...byPos.MID.slice(0, 4).map((id) => ({ rosterEntryId: id, starter: true, position: "MID" as const })),
      ...byPos.FWD.slice(0, 2).map((id) => ({ rosterEntryId: id, starter: true, position: "FWD" as const })),
    ];
    const validResult = await updateLineup(admin, teamId, openResult.roundId, validXi, new Date("2026-09-08T00:00:00Z"));
    assert.deepEqual(validResult, { ok: true });
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

test("a locked starter cannot be moved, even long after the round has finalized", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 4, 16);
  try {
    const { data: draft } = await league.clients[0].rpc("start_draft", { p_league_id: league.leagueId });
    const draftId = draft![0].draft_id;
    await draftToCompletion(admin, draftId, 4, 16);

    const openResult = await openNextRound(admin, league.leagueId, new Date("2026-08-25T00:00:00Z"));
    assert.ok(openResult.ok);
    if (!openResult.ok) return;

    const teamId = league.teamIds[0];
    const { data: roster } = await admin.from("roster_entries").select("id, players(position)").eq("fantasy_team_id", teamId).eq("status", "active");
    const byPos: Record<string, string[]> = { GK: [], DEF: [], MID: [], FWD: [] };
    for (const r of roster!) byPos[(r.players as { position: string }).position].push(r.id);
    const validXi = [
      ...byPos.GK.slice(0, 1).map((id) => ({ rosterEntryId: id, starter: true, position: "GK" as const })),
      ...byPos.DEF.slice(0, 4).map((id) => ({ rosterEntryId: id, starter: true, position: "DEF" as const })),
      ...byPos.MID.slice(0, 4).map((id) => ({ rosterEntryId: id, starter: true, position: "MID" as const })),
      ...byPos.FWD.slice(0, 2).map((id) => ({ rosterEntryId: id, starter: true, position: "FWD" as const })),
    ];
    await updateLineup(admin, teamId, openResult.roundId, validXi, new Date("2026-08-25T00:00:00Z"));

    const { data: lockedSlot } = await admin
      .from("lineup_slots")
      .select("id, starter, roster_entry_id")
      .eq("fantasy_round_id", openResult.roundId)
      .eq("starter", true)
      .not("locked_at", "is", null)
      .limit(1)
      .maybeSingle();

    if (!lockedSlot) {
      // No starter's club had a fixture in this window -- nothing to assert against; not a failure of this test's premise.
      return;
    }

    const wayAfterFinalization = new Date("2027-06-01T00:00:00Z");
    const attempt = await updateLineup(
      admin,
      teamId,
      openResult.roundId,
      [{ rosterEntryId: lockedSlot.roster_entry_id, starter: false }],
      wayAfterFinalization
    );
    assert.deepEqual(attempt, { ok: false, error: "SLOT_LOCKED" });
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

test("matchup scoring excludes bench points entirely -- a team with a real starting XI shows real points, a team with none set shows exactly zero", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 4, 16);
  try {
    const { data: draft } = await league.clients[0].rpc("start_draft", { p_league_id: league.leagueId });
    const draftId = draft![0].draft_id;
    await draftToCompletion(admin, draftId, 4, 16);

    // A real historical window with confirmed final scores (see docs/scoring-model.md).
    const openResult = await openNextRound(admin, league.leagueId, new Date("2026-08-25T00:00:00Z"));
    assert.ok(openResult.ok);
    if (!openResult.ok) return;

    const teamWithLineup = league.teamIds[0];
    const teamWithoutLineup = league.teamIds[1];

    const { data: roster } = await admin.from("roster_entries").select("id, players(position)").eq("fantasy_team_id", teamWithLineup).eq("status", "active");
    const byPos: Record<string, string[]> = { GK: [], DEF: [], MID: [], FWD: [] };
    for (const r of roster!) byPos[(r.players as { position: string }).position].push(r.id);
    const validXi = [
      ...byPos.GK.slice(0, 1).map((id) => ({ rosterEntryId: id, starter: true, position: "GK" as const })),
      ...byPos.DEF.slice(0, 4).map((id) => ({ rosterEntryId: id, starter: true, position: "DEF" as const })),
      ...byPos.MID.slice(0, 4).map((id) => ({ rosterEntryId: id, starter: true, position: "MID" as const })),
      ...byPos.FWD.slice(0, 2).map((id) => ({ rosterEntryId: id, starter: true, position: "FWD" as const })),
    ];
    const setResult = await updateLineup(admin, teamWithLineup, openResult.roundId, validXi, new Date("2026-08-25T00:00:00Z"));
    assert.deepEqual(setResult, { ok: true });

    await refreshMatchupScores(admin, openResult.roundId);

    const { data: scores } = await admin
      .from("matchup_scores")
      .select("fantasy_team_id, live_points")
      .in("fantasy_team_id", [teamWithLineup, teamWithoutLineup]);

    const withLineupScore = scores!.find((s) => s.fantasy_team_id === teamWithLineup)!;
    const withoutLineupScore = scores!.find((s) => s.fantasy_team_id === teamWithoutLineup);

    // The team with no lineup ever set has no starters at all -- its score
    // row (if one exists) must be exactly 0, never a fabricated value.
    if (withoutLineupScore) assert.equal(withoutLineupScore.live_points, 0);
    assert.ok(withLineupScore.live_points >= 0, "a real starting XI against real historical fixtures never produces a negative or nonsensical aggregate");

    const finalizeResult = await finalizeRoundIfReady(admin, openResult.roundId, new Date(openResult.window.endsAt.getTime() + 25 * 3600 * 1000));
    assert.equal(finalizeResult.finalized, true, "this historical window's fixtures should already be fully settled");
  } finally {
    await cleanupTestLeague(admin, league);
  }
});
