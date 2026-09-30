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
import { openNextRound, refreshMatchupScores, finalizeRoundIfReady, ensureFirstRoundOpened } from "./rounds.ts";
import { updateLineup } from "./lineup.ts";
import { isRosterCompositionValid, type RosterCounts } from "../../domain/fantasy/roster-rules.ts";
import type { Database } from "../supabase/database.types.ts";
import type { PlayerPosition } from "../../domain/football/types.ts";

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

/**
 * Drafts the first still-eligible player at `position` on behalf of
 * `teamClient`'s team, auto-resolving any intervening OTHER team's turn
 * (via resolve_expired_pick with a far-future `p_as_of`, same trick as
 * draftToCompletion) until it's actually this team's turn. Returns the
 * RPC error from the team's own attempt (e.g. ROSTER_LIMIT_EXCEEDED), or
 * `null` on success — never throws for that outcome, only for
 * infrastructure failures (no eligible player left, too many auto-skips).
 */
async function draftFirstAvailableAtPosition(
  admin: ReturnType<typeof createAdminClient>,
  teamClient: SupabaseClient<Database>,
  draftId: string,
  leagueId: string,
  position: PlayerPosition
): Promise<{ message: string } | null> {
  const farFuture = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
  for (let i = 0; i < 20; i++) {
    const { data: owned } = await admin.from("league_player_ownership").select("player_id").eq("league_id", leagueId);
    const ownedIds = new Set((owned ?? []).map((o) => o.player_id));
    const { data: candidates } = await admin.from("players").select("id").eq("active", true).eq("position", position).order("name").limit(50);
    const playerId = candidates?.find((c) => !ownedIds.has(c.id))?.id;
    if (!playerId) throw new Error(`no eligible ${position} player left to test with`);

    const { error } = await teamClient.rpc("make_draft_pick", { p_draft_id: draftId, p_player_id: playerId });
    if (!error) return null;
    if (error.message !== "NOT_YOUR_TURN") return error;

    const { error: autoErr } = await admin.rpc("resolve_expired_pick", { p_draft_id: draftId, p_as_of: farFuture });
    if (autoErr) throw new Error(`auto-advance failed: ${autoErr.message}`);
  }
  throw new Error("too many auto-advances waiting for this team's turn");
}

test("a commissioner cannot start the draft with only 1 manager", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 1, 4);
  try {
    const { error } = await league.clients[0].rpc("start_draft", { p_league_id: league.leagueId });
    assert.equal(error?.message, "LEAGUE_NOT_FULL");

    const { data: draftRow } = await admin.from("drafts").select("id").eq("league_id", league.leagueId).maybeSingle();
    assert.equal(draftRow, null, "no draft should have been created");
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

test("a commissioner can start the draft with only 2 managers, even when the league is configured for far more", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 4);
  try {
    const { data, error } = await league.clients[0].rpc("start_draft", { p_league_id: league.leagueId });
    assert.equal(error, null, "starting with exactly 2 managers must succeed");
    assert.ok(data?.[0]?.draft_id);

    const { data: draftRow } = await admin.from("drafts").select("status").eq("id", data![0].draft_id).single();
    assert.equal(draftRow!.status, "in_progress");
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

test("a non-commissioner cannot start the draft, even with enough managers", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 4);
  try {
    const { error } = await league.clients[1].rpc("start_draft", { p_league_id: league.leagueId });
    assert.equal(error?.message, "NOT_COMMISSIONER");

    const { data: draftRow } = await admin.from("drafts").select("id").eq("league_id", league.leagueId).maybeSingle();
    assert.equal(draftRow, null, "no draft should have been created");
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

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
  // Must be 16, not some arbitrary smaller squadSize as before Pass 10.5 --
  // the canonical ROSTER_RULES (GK exactly 2, DEF/MID 4-6, FWD 2-4) require
  // a total of exactly 16 and can never be satisfied by a smaller squad.
  const squadSize = 16;
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

    // Scoped to THIS team's own roster entries -- since Pass 10.5, every
    // team's round 1 gets an automatic starting XI (not just this one
    // that explicitly called updateLineup), so an unscoped query could
    // just as easily find some OTHER team's locked starter instead.
    const { data: lockedSlot } = await admin
      .from("lineup_slots")
      .select("id, starter, roster_entry_id")
      .eq("fantasy_round_id", openResult.roundId)
      .eq("starter", true)
      .not("locked_at", "is", null)
      .in("roster_entry_id", roster!.map((r) => r.id))
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

test("matchup scoring excludes bench points entirely -- a manually-set XI and an automatically-initialized one (Pass 10.5) both show real, sane points", { skip }, async () => {
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
    // Renamed from the pre-Pass-10.5 "teamWithoutLineup" -- since this
    // pass, EVERY team's round 1 gets an automatic starting XI the moment
    // it opens (createRoundLineupSlots), so there is no longer a
    // completed-draft team that truly has zero starters. This team is
    // exercised here specifically to prove that auto-initialized (not
    // manually set) starters also score correctly, never negative/NaN.
    const teamWithAutoLineup = league.teamIds[1];

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
      .in("fantasy_team_id", [teamWithLineup, teamWithAutoLineup]);

    const withLineupScore = scores!.find((s) => s.fantasy_team_id === teamWithLineup)!;
    const withAutoLineupScore = scores!.find((s) => s.fantasy_team_id === teamWithAutoLineup);

    // Neither team is ever truly lineup-less post-Pass-10.5 -- both a
    // manually-set XI and an automatically-initialized one must produce a
    // real, sane (non-negative, non-fabricated) score.
    assert.ok(withLineupScore.live_points >= 0, "a real starting XI against real historical fixtures never produces a negative or nonsensical aggregate");
    assert.ok(withAutoLineupScore, "the auto-initialized team must have a real matchup_scores row too, not an absent one");
    assert.ok(withAutoLineupScore!.live_points >= 0, "an automatically-initialized starting XI (Pass 10.5) must also score sanely, never negative or NaN");

    const finalizeResult = await finalizeRoundIfReady(admin, openResult.roundId, new Date(openResult.window.endsAt.getTime() + 25 * 3600 * 1000));
    assert.equal(finalizeResult.finalized, true, "this historical window's fixtures should already be fully settled");
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

// ---------------------------------------------------------------------
// Pass 10.5: canonical 16-player roster composition rules (GK exactly 2,
// DEF/MID 4-6, FWD 2-4), authoritatively enforced in _perform_draft_pick.
// squadSize must stay 16 (the true canonical total) here, NOT some
// arbitrary larger number -- the max achievable total across all four
// positions' own maximums is 2+6+6+4=18, so any squadSize above 18 makes
// the completability check reject EVERY pick from the very first one
// (there would never be enough total room to reach that target).
// ---------------------------------------------------------------------

test("a team cannot draft a 3rd GK or a 7th DEF -- both are rejected with ROSTER_LIMIT_EXCEEDED, and legal picks keep working afterward", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 16);
  try {
    const { data: draft } = await league.clients[0].rpc("start_draft", { p_league_id: league.leagueId });
    const draftId = draft![0].draft_id;
    const teamClient = league.clients[0];

    for (let i = 0; i < 2; i++) {
      const err = await draftFirstAvailableAtPosition(admin, teamClient, draftId, league.leagueId, "GK");
      assert.equal(err, null, `GK pick ${i + 1} of 2 should succeed`);
    }
    const thirdGk = await draftFirstAvailableAtPosition(admin, teamClient, draftId, league.leagueId, "GK");
    assert.equal(thirdGk?.message, "ROSTER_LIMIT_EXCEEDED", "a 3rd GK must be rejected -- GK is fixed at exactly 2");

    for (let i = 0; i < 6; i++) {
      const err = await draftFirstAvailableAtPosition(admin, teamClient, draftId, league.leagueId, "DEF");
      assert.equal(err, null, `DEF pick ${i + 1} of 6 should succeed`);
    }
    const seventhDef = await draftFirstAvailableAtPosition(admin, teamClient, draftId, league.leagueId, "DEF");
    assert.equal(seventhDef?.message, "ROSTER_LIMIT_EXCEEDED", "a 7th DEF must exceed the DEF maximum of 6");

    // A legal, different-position pick right after two rejections must
    // still succeed -- rejecting an illegal pick never wedges the draft.
    const legalFollowUp = await draftFirstAvailableAtPosition(admin, teamClient, draftId, league.leagueId, "MID");
    assert.equal(legalFollowUp, null, "a legal MID pick immediately after two rejections should still succeed");
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

test("a team cannot draft a 7th MID or a 5th FWD -- both are rejected with ROSTER_LIMIT_EXCEEDED", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 16);
  try {
    const { data: draft } = await league.clients[0].rpc("start_draft", { p_league_id: league.leagueId });
    const draftId = draft![0].draft_id;
    const teamClient = league.clients[0];

    for (let i = 0; i < 6; i++) {
      const err = await draftFirstAvailableAtPosition(admin, teamClient, draftId, league.leagueId, "MID");
      assert.equal(err, null, `MID pick ${i + 1} of 6 should succeed`);
    }
    const seventhMid = await draftFirstAvailableAtPosition(admin, teamClient, draftId, league.leagueId, "MID");
    assert.equal(seventhMid?.message, "ROSTER_LIMIT_EXCEEDED", "a 7th MID must exceed the MID maximum of 6");

    for (let i = 0; i < 4; i++) {
      const err = await draftFirstAvailableAtPosition(admin, teamClient, draftId, league.leagueId, "FWD");
      assert.equal(err, null, `FWD pick ${i + 1} of 4 should succeed`);
    }
    const fifthFwd = await draftFirstAvailableAtPosition(admin, teamClient, draftId, league.leagueId, "FWD");
    assert.equal(fifthFwd?.message, "ROSTER_LIMIT_EXCEEDED", "a 5th FWD must exceed the FWD maximum of 4");
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

test("a pick that would make a position's minimum mathematically unreachable is rejected, even though that position itself isn't maxed", { skip }, async () => {
  const admin = createAdminClient();
  // squadSize=12 -- the TRUE minimum total (GK2+DEF4+MID4+FWD2=12), not
  // an arbitrary small number. This is deliberately the tightest possible
  // valid league: every pick from the very first one has zero slack, so
  // "only 2 picks left" arises naturally after exactly 10 picks, without
  // playing out a full 16-round draft. (A squadSize below 12 is invalid
  // for the same reason a squadSize above 18 is -- see the comment above
  // the position-max tests below.)
  const league = await createTestLeague(admin, 2, 12);
  try {
    const { data: draft } = await league.clients[0].rpc("start_draft", { p_league_id: league.leagueId });
    const draftId = draft![0].draft_id;
    const teamClient = league.clients[0];

    // Build up to: GK 1 (needs 1 more), DEF 3 (needs 1 more), MID 4 (met,
    // no room left under squadSize=12's zero slack), FWD 2 (met) -- 10
    // picks made, exactly 2 remain.
    const sequence: PlayerPosition[] = ["GK", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD", "FWD"];
    for (const position of sequence) {
      const err = await draftFirstAvailableAtPosition(admin, teamClient, draftId, league.leagueId, position);
      assert.equal(err, null, `building up to the tight spot: ${position} pick should succeed`);
    }

    const illegalMid = await draftFirstAvailableAtPosition(admin, teamClient, draftId, league.leagueId, "MID");
    assert.equal(
      illegalMid?.message,
      "ROSTER_LIMIT_EXCEEDED",
      "with 2 picks left and GK+DEF each still needing 1 more, a MID pick would leave GK's minimum unreachable"
    );

    const legalGk = await draftFirstAvailableAtPosition(admin, teamClient, draftId, league.leagueId, "GK");
    assert.equal(legalGk, null, "GK still has an unmet minimum with picks remaining -- legal");
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

test("a full 2-manager auto-drafted simulation: both teams end with legal 16-player rosters, valid auto-generated starting XIs, and zero ownership violations", { skip }, async () => {
  const admin = createAdminClient();
  const managers = 2;
  const squadSize = 16;
  const league = await createTestLeague(admin, managers, squadSize);
  try {
    const { data: draft } = await league.clients[0].rpc("start_draft", { p_league_id: league.leagueId });
    const draftId = draft![0].draft_id;
    await draftToCompletion(admin, draftId, managers, squadSize);

    const { data: ownershipRows } = await admin.from("league_player_ownership").select("fantasy_team_id, player_id").eq("league_id", league.leagueId);
    assert.equal(ownershipRows!.length, managers * squadSize);
    assert.equal(new Set(ownershipRows!.map((r) => r.player_id)).size, ownershipRows!.length, "zero ownership violations -- no player drafted twice");

    const openResult = await openNextRound(admin, league.leagueId, new Date("2026-09-08T00:00:00Z"));
    assert.ok(openResult.ok, "round 1 must open, so the auto-generated starting XI is queryable");
    if (!openResult.ok) return;

    for (const teamId of league.teamIds) {
      // Complete 16-player roster satisfies every canonical minimum --
      // proven directly from auto-pick's own output (draftToCompletion
      // uses resolve_expired_pick exclusively, so this also demonstrates
      // auto-pick alone produces a fully legal roster).
      const { data: roster } = await admin.from("roster_entries").select("id, players(position)").eq("fantasy_team_id", teamId).eq("status", "active");
      const positionByRosterEntryId = new Map<string, PlayerPosition>();
      const rosterCounts: RosterCounts = {};
      for (const r of roster!) {
        const position = (r.players as { position: PlayerPosition }).position;
        positionByRosterEntryId.set(r.id, position);
        rosterCounts[position] = (rosterCounts[position] ?? 0) + 1;
      }
      assert.equal(roster!.length, squadSize);
      assert.ok(isRosterCompositionValid(rosterCounts), `team ${teamId}'s full roster must satisfy the canonical ROSTER_RULES: ${JSON.stringify(rosterCounts)}`);

      // Post-draft lineup initialization: exactly 11 starters, exactly 5
      // bench, and the starting XI itself satisfies FORMATION_RULES.
      // Joined against `positionByRosterEntryId` in JS rather than via a
      // nested `roster_entries!inner(...players(position))` select --
      // that shape hits a postgrest-js type-inference limit here
      // (implicit-any), unlike the simpler flat select used below.
      const slotsResult: { data: { starter: boolean; roster_entry_id: string }[] | null } = await admin
        .from("lineup_slots")
        .select("starter, roster_entry_id")
        .eq("fantasy_round_id", openResult.roundId)
        .in("roster_entry_id", Array.from(positionByRosterEntryId.keys()));
      const slots = slotsResult.data;

      const starters = (slots ?? []).filter((s) => s.starter);
      const bench = (slots ?? []).filter((s) => !s.starter);
      assert.equal(starters.length, 11, `team ${teamId} must have exactly 11 auto-initialized starters`);
      assert.equal(bench.length, 5, `team ${teamId} must have exactly 5 players on the bench`);

      const starterCounts: Record<string, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
      for (const s of starters) {
        const position = positionByRosterEntryId.get(s.roster_entry_id)!;
        starterCounts[position] += 1;
      }
      assert.equal(starterCounts.GK, 1, "exactly 1 starting GK");
      assert.ok(starterCounts.DEF >= 3 && starterCounts.DEF <= 5, `DEF starters must be 3-5, got ${starterCounts.DEF}`);
      assert.ok(starterCounts.MID >= 3 && starterCounts.MID <= 5, `MID starters must be 3-5, got ${starterCounts.MID}`);
      assert.ok(starterCounts.FWD >= 1 && starterCounts.FWD <= 3, `FWD starters must be 1-3, got ${starterCounts.FWD}`);
    }

    // H2H matchup generation still works: round 1 opening must have
    // scheduled a real matchup pairing both teams (round-robin, see
    // "H2H schedule & scoring" in docs/game-rules.md) -- not just lineup
    // slots. And the scoring/lock pipeline remains intact end to end:
    // refreshMatchupScores and finalizeRoundIfReady must both run clean
    // against the auto-initialized (not manually set) starting XIs.
    const { data: matchups } = await admin.from("matchups").select("id, home_fantasy_team_id, away_fantasy_team_id").eq("fantasy_round_id", openResult.roundId);
    assert.equal(matchups!.length, 1, "2 teams must produce exactly 1 H2H matchup for round 1");
    const pairedTeamIds = [matchups![0].home_fantasy_team_id, matchups![0].away_fantasy_team_id].sort();
    assert.deepEqual(pairedTeamIds, [...league.teamIds].sort(), "the matchup must pair exactly these 2 teams, no fabricated or missing side");

    await refreshMatchupScores(admin, openResult.roundId);
    const { data: scores } = await admin.from("matchup_scores").select("fantasy_team_id, live_points").eq("matchup_id", matchups![0].id);
    assert.equal(scores!.length, 2, "both teams must get a real matchup_scores row from their auto-initialized starting XIs");
    for (const s of scores!) {
      assert.ok(Number.isFinite(s.live_points) && s.live_points >= 0, `team ${s.fantasy_team_id}'s live_points must be a sane non-negative number, got ${s.live_points}`);
    }
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

// ---------------------------------------------------------------------
// Pass 10.5C: the "all 16 players stuck on the bench" regression fix.
// `ensureFirstRoundOpened` is the self-healing check that now runs both
// right after the pick that completes a draft AND from the Team page's
// own read path -- these tests exercise it directly (the same function
// both call), proving it reliably produces the auto-generated 11/5 split
// even when called well after the draft completed, with no round having
// been opened yet by anything else.
// ---------------------------------------------------------------------

test("ensureFirstRoundOpened: a completed draft with no round yet self-heals into a real round with the auto-generated 11/5 split", { skip }, async () => {
  const admin = createAdminClient();
  const managers = 2;
  const squadSize = 16;
  const league = await createTestLeague(admin, managers, squadSize);
  try {
    const { data: draft } = await league.clients[0].rpc("start_draft", { p_league_id: league.leagueId });
    const draftId = draft![0].draft_id;
    await draftToCompletion(admin, draftId, managers, squadSize);

    // Deliberately never call openNextRound/maybeOpenFirstRound at all --
    // this simulates the exact regression (draft completed, round-1
    // never got opened for whatever reason) and proves the self-heal
    // recovers it on its own, using the real current clock exactly like
    // the Team page's own call does.
    const { data: roundBefore } = await admin.from("fantasy_rounds").select("id").eq("league_id", league.leagueId).maybeSingle();
    assert.equal(roundBefore, null, "test setup: no round should exist yet");

    await ensureFirstRoundOpened(admin, league.leagueId);

    const { data: roundAfter } = await admin.from("fantasy_rounds").select("id").eq("league_id", league.leagueId).maybeSingle();
    assert.ok(roundAfter, "ensureFirstRoundOpened must create round 1");

    for (const teamId of league.teamIds) {
      const { data: roster } = await admin.from("roster_entries").select("id").eq("fantasy_team_id", teamId).eq("status", "active");
      const rosterIds = (roster ?? []).map((r) => r.id);
      const slotsResult: { data: { starter: boolean }[] | null } = await admin
        .from("lineup_slots")
        .select("starter")
        .eq("fantasy_round_id", roundAfter!.id)
        .in("roster_entry_id", rosterIds);
      const slots = slotsResult.data;
      const starters = (slots ?? []).filter((s) => s.starter).length;
      const bench = (slots ?? []).filter((s) => !s.starter).length;
      assert.equal(starters, 11, `team ${teamId} must have exactly 11 starters after self-heal, not stuck all-bench`);
      assert.equal(bench, 5, `team ${teamId} must have exactly 5 bench players after self-heal`);
    }
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

test("ensureFirstRoundOpened is a safe no-op once a round already exists -- never creates a second one", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 16);
  try {
    const { data: draft } = await league.clients[0].rpc("start_draft", { p_league_id: league.leagueId });
    const draftId = draft![0].draft_id;
    await draftToCompletion(admin, draftId, 2, 16);

    const openResult = await openNextRound(admin, league.leagueId, new Date("2026-09-08T00:00:00Z"));
    assert.ok(openResult.ok);

    await ensureFirstRoundOpened(admin, league.leagueId);

    const { data: rounds } = await admin.from("fantasy_rounds").select("id").eq("league_id", league.leagueId);
    assert.equal(rounds!.length, 1, "calling ensureFirstRoundOpened again must not create a duplicate round");
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

// ---------------------------------------------------------------------
// Pass 10.5C: manual empty-slot recovery. `fillEmptySlotsAction` itself
// is a thin Server Action wrapper (ownership check, then a batch of pure
// promotions through the SAME updateLineup() primitive already exercised
// above) that can't be called directly outside a real Next.js request
// (it isn't -- only revalidatePath needs that, updateLineup doesn't), so
// these exercise updateLineup() directly with the exact shape
// fillEmptySlotsAction constructs, proving the underlying persistence
// layer that action delegates to behaves correctly for this new flow.
// ---------------------------------------------------------------------

test("updateLineup: promoting bench players to fill every empty slot (building an XI from scratch) succeeds and reaches exactly 11/5", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 16);
  try {
    const { data: draft } = await league.clients[0].rpc("start_draft", { p_league_id: league.leagueId });
    const draftId = draft![0].draft_id;
    await draftToCompletion(admin, draftId, 2, 16);

    const openResult = await openNextRound(admin, league.leagueId, new Date("2026-09-08T00:00:00Z"));
    assert.ok(openResult.ok);
    if (!openResult.ok) return;

    const teamId = league.teamIds[0];
    // Simulate the all-bench regression for this one team specifically --
    // directly, via a raw update, deliberately bypassing updateLineup()
    // itself. This is the correct way to set it up: updateLineup() always
    // requires the RESULTING count to be exactly 11, so it can never be
    // used to reach 0 (that would itself violate the very invariant this
    // test exists to prove) -- the real bug's all-bench state arises from
    // createRoundLineupSlots's own raw upsert, which isn't bound by that
    // rule either, exactly like this.
    const { data: roster } = await admin.from("roster_entries").select("id, players(position)").eq("fantasy_team_id", teamId).eq("status", "active");
    const rosterIds = roster!.map((r) => r.id);
    await admin.from("lineup_slots").update({ starter: false, slot: "BENCH" }).eq("fantasy_round_id", openResult.roundId).in("roster_entry_id", rosterIds);

    const { data: allBench } = await admin.from("lineup_slots").select("starter").eq("fantasy_round_id", openResult.roundId).in("roster_entry_id", rosterIds);
    assert.equal((allBench ?? []).filter((s) => s.starter).length, 0, "test setup: team must now have 0 starters, all 16 on the bench");

    // Manually build a legal 4-4-2 from scratch: 1 GK, 4 DEF, 4 MID, 2 FWD.
    const byPosition: Record<string, string[]> = { GK: [], DEF: [], MID: [], FWD: [] };
    for (const r of roster!) byPosition[(r.players as { position: string }).position].push(r.id);
    const fills = [
      ...byPosition.GK.slice(0, 1).map((id) => ({ rosterEntryId: id, starter: true as const, position: "GK" as const })),
      ...byPosition.DEF.slice(0, 4).map((id) => ({ rosterEntryId: id, starter: true as const, position: "DEF" as const })),
      ...byPosition.MID.slice(0, 4).map((id) => ({ rosterEntryId: id, starter: true as const, position: "MID" as const })),
      ...byPosition.FWD.slice(0, 2).map((id) => ({ rosterEntryId: id, starter: true as const, position: "FWD" as const })),
    ];
    assert.equal(fills.length, 11, "test setup: exactly 11 fills queued, matching 4-4-2");

    const fillResult = await updateLineup(admin, teamId, openResult.roundId, fills, new Date("2026-09-08T00:00:00Z"));
    assert.deepEqual(fillResult, { ok: true });

    const { data: finalSlots } = await admin.from("lineup_slots").select("starter").eq("fantasy_round_id", openResult.roundId).in("roster_entry_id", rosterIds);
    assert.equal((finalSlots ?? []).filter((s) => s.starter).length, 11, "exactly 11 starters after filling every empty slot");
    assert.equal((finalSlots ?? []).filter((s) => !s.starter).length, 5, "exactly 5 bench remain");
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

test("updateLineup: an incomplete fill (fewer than 11) is rejected -- an in-progress editing state is never itself a valid persisted lineup", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 16);
  try {
    const { data: draft } = await league.clients[0].rpc("start_draft", { p_league_id: league.leagueId });
    const draftId = draft![0].draft_id;
    await draftToCompletion(admin, draftId, 2, 16);

    const openResult = await openNextRound(admin, league.leagueId, new Date("2026-09-08T00:00:00Z"));
    assert.ok(openResult.ok);
    if (!openResult.ok) return;

    const teamId = league.teamIds[0];
    const { data: roster } = await admin.from("roster_entries").select("id, players(position)").eq("fantasy_team_id", teamId).eq("status", "active");
    const rosterIds = roster!.map((r) => r.id);
    // Same raw-bypass setup as the test above -- see its comment for why
    // updateLineup() itself can never be used to reach 0 starters.
    await admin.from("lineup_slots").update({ starter: false, slot: "BENCH" }).eq("fantasy_round_id", openResult.roundId).in("roster_entry_id", rosterIds);

    const byPosition: Record<string, string[]> = { GK: [], DEF: [], MID: [], FWD: [] };
    for (const r of roster!) byPosition[(r.players as { position: string }).position].push(r.id);
    // Only 5 of the 11 needed fills -- a genuine "still editing" state.
    const partialFills = [
      ...byPosition.GK.slice(0, 1).map((id) => ({ rosterEntryId: id, starter: true as const, position: "GK" as const })),
      ...byPosition.DEF.slice(0, 4).map((id) => ({ rosterEntryId: id, starter: true as const, position: "DEF" as const })),
    ];
    assert.equal(partialFills.length, 5);

    const result = await updateLineup(admin, teamId, openResult.roundId, partialFills, new Date("2026-09-08T00:00:00Z"));
    assert.deepEqual(result, { ok: false, error: "INVALID_FORMATION" }, "5 starters is never a valid persisted lineup, even mid-edit");

    const { data: stillBench } = await admin.from("lineup_slots").select("starter").eq("fantasy_round_id", openResult.roundId).in("roster_entry_id", rosterIds);
    assert.equal((stillBench ?? []).filter((s) => s.starter).length, 0, "the rejected write must not have partially applied anything");
  } finally {
    await cleanupTestLeague(admin, league);
  }
});
