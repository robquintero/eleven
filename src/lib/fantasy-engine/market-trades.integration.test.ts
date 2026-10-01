/**
 * COMMITTED integration regression tests for Pass 11 (free market + manager
 * trades) — real temporary Supabase Auth users, real temporary leagues,
 * real `sign_player`/`drop_player`/`propose_trade`/`accept_trade`/
 * `reject_trade`/`cancel_trade` RPC calls
 * (supabase/migrations/20261001000000_free_market_and_trades.sql), cleaned
 * up in a `finally` block. Same convention as
 * draft-engine.integration.test.ts: requires real Supabase credentials and
 * only ever touches the network under `npm run test:integration`; every
 * test here skips cleanly under plain `npm test`.
 *
 * Deliberately does NOT run a draft anywhere in this file: sign_player and
 * drop_player only require real league membership (a `fantasy_teams` row),
 * which `create_league`/`join_league_by_invite_code` already establish —
 * see the migration's own SQL, which never checks draft/league status.
 * Building rosters directly via `sign_player` instead of drafting them
 * keeps every test here both faithful to the real RPC path AND fast (no
 * multi-manager snake draft to drive to completion).
 *
 * The two lock-integrity tests force a lineup_slots row's `locked_at`
 * into the past/future directly via the admin client rather than waiting
 * on real fixture kickoff timing — this is still exercising the exact
 * same `locked_at <= now()` comparison `_release_current_round_slot` uses
 * in production, just with a deterministic precondition instead of a
 * flaky dependency on which real-world matches happen to have kicked off
 * at test-run time.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAdminClient, isSupabaseAdminConfigured } from "../supabase/admin.ts";
import { openNextRound } from "./rounds.ts";
import { createTestLeague, cleanupTestLeague, type TestLeague } from "./integration-test-helpers.ts";
import type { PlayerPosition } from "../../domain/football/types.ts";

const skip = !isSupabaseAdminConfigured();

/**
 * Real, currently-unowned-in-this-league players at `position`, excluding
 * anything in `excludeIds` (for building several disjoint pools — e.g.
 * 2 GKs + 6 DEFs — within the same test before any of them are actually
 * signed, since an unsigned candidate wouldn't yet show up as "owned").
 */
async function findFreeAgents(
  admin: ReturnType<typeof createAdminClient>,
  leagueId: string,
  position: PlayerPosition,
  count: number,
  excludeIds: Set<string> = new Set()
): Promise<string[]> {
  const { data: owned } = await admin.from("league_player_ownership").select("player_id").eq("league_id", leagueId);
  const ownedIds = new Set((owned ?? []).map((o) => o.player_id));

  const { data: candidates } = await admin
    .from("players")
    .select("id")
    .eq("active", true)
    .eq("position", position)
    .order("name")
    .limit(400);

  const result: string[] = [];
  for (const c of candidates ?? []) {
    if (ownedIds.has(c.id) || excludeIds.has(c.id)) continue;
    result.push(c.id);
    if (result.length === count) break;
  }
  if (result.length < count) {
    throw new Error(`not enough free ${position} players found in this league (wanted ${count}, got ${result.length})`);
  }
  return result;
}

async function signPlayers(
  client: TestLeague["clients"][number],
  leagueId: string,
  playerIds: string[]
): Promise<string[]> {
  const rosterEntryIds: string[] = [];
  for (const playerId of playerIds) {
    const { data, error } = await client.rpc("sign_player", { p_league_id: leagueId, p_player_id: playerId });
    if (error || !data?.[0]) throw new Error(`sign_player failed for ${playerId}: ${error?.message}`);
    rosterEntryIds.push(data[0].roster_entry_id);
  }
  return rosterEntryIds;
}

// ===========================================================================
// FREE MARKET
// ===========================================================================

test("sign_player: a manager can sign an available player -- it becomes owned by their team and appears on their active roster", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 16);
  try {
    const [playerId] = await findFreeAgents(admin, league.leagueId, "MID", 1);
    const { data, error } = await league.clients[0].rpc("sign_player", {
      p_league_id: league.leagueId,
      p_player_id: playerId,
    });
    assert.equal(error, null);
    assert.ok(data?.[0]?.roster_entry_id);

    const { data: ownership } = await admin
      .from("league_player_ownership")
      .select("fantasy_team_id")
      .eq("league_id", league.leagueId)
      .eq("player_id", playerId)
      .maybeSingle();
    assert.equal(ownership?.fantasy_team_id, league.teamIds[0]);

    const { data: roster } = await admin
      .from("roster_entries")
      .select("id")
      .eq("fantasy_team_id", league.teamIds[0])
      .eq("status", "active");
    assert.equal(roster?.length, 1);
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

test("sign_player: signing a player already owned by another team in the SAME league fails with PLAYER_ALREADY_OWNED", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 16);
  try {
    const [playerId] = await findFreeAgents(admin, league.leagueId, "FWD", 1);
    const first = await league.clients[0].rpc("sign_player", { p_league_id: league.leagueId, p_player_id: playerId });
    assert.equal(first.error, null);

    const second = await league.clients[1].rpc("sign_player", { p_league_id: league.leagueId, p_player_id: playerId });
    assert.equal(second.error?.message, "PLAYER_ALREADY_OWNED");
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

test("drop_player: a manager can drop their own player; the roster legitimately sits below 16 (no auto-fill), and the player becomes free again (and re-signable)", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 16);
  try {
    const [playerId] = await findFreeAgents(admin, league.leagueId, "DEF", 1);
    await signPlayers(league.clients[0], league.leagueId, [playerId]);

    const { error } = await league.clients[0].rpc("drop_player", { p_league_id: league.leagueId, p_player_id: playerId });
    assert.equal(error, null);

    const { data: ownership } = await admin
      .from("league_player_ownership")
      .select("player_id")
      .eq("league_id", league.leagueId)
      .eq("player_id", playerId)
      .maybeSingle();
    assert.equal(ownership, null, "a dropped player must no longer be owned by anyone in this league");

    const { data: rosterEntry } = await admin
      .from("roster_entries")
      .select("status")
      .eq("fantasy_team_id", league.teamIds[0])
      .eq("player_id", playerId)
      .single();
    assert.equal(rosterEntry!.status, "dropped", "drop is a soft-delete only -- the row survives for historical lineup_slots");

    const { count } = await admin
      .from("roster_entries")
      .select("*", { count: "exact", head: true })
      .eq("fantasy_team_id", league.teamIds[0])
      .eq("status", "active");
    assert.equal(count, 0, "a roster may legitimately sit below squadSize after a drop -- never auto-filled");

    const resign = await league.clients[0].rpc("sign_player", { p_league_id: league.leagueId, p_player_id: playerId });
    assert.equal(resign.error, null, "the same manager must be able to re-acquire the exact player they just dropped");
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

test("drop_player: a manager cannot drop a player nobody owns, or a player owned by another team", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 16);
  try {
    const [freeId, ownedByOtherId] = await findFreeAgents(admin, league.leagueId, "MID", 2);
    await signPlayers(league.clients[1], league.leagueId, [ownedByOtherId]);

    const attemptFree = await league.clients[0].rpc("drop_player", { p_league_id: league.leagueId, p_player_id: freeId });
    assert.equal(attemptFree.error?.message, "PLAYER_NOT_OWNED_BY_TEAM");

    const attemptOther = await league.clients[0].rpc("drop_player", {
      p_league_id: league.leagueId,
      p_player_id: ownedByOtherId,
    });
    assert.equal(
      attemptOther.error?.message,
      "PLAYER_NOT_OWNED_BY_TEAM",
      "a manager must never be able to drop another team's player"
    );
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

test("sign_player: ROSTER_FULL once a team already has 16 active players", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 16);
  try {
    const gks = await findFreeAgents(admin, league.leagueId, "GK", 2);
    const defs = await findFreeAgents(admin, league.leagueId, "DEF", 6, new Set(gks));
    const mids = await findFreeAgents(admin, league.leagueId, "MID", 6, new Set([...gks, ...defs]));
    const fwds = await findFreeAgents(admin, league.leagueId, "FWD", 2, new Set([...gks, ...defs, ...mids]));
    await signPlayers(league.clients[0], league.leagueId, [...gks, ...defs, ...mids, ...fwds]);

    const [extra] = await findFreeAgents(admin, league.leagueId, "FWD", 1, new Set([...gks, ...defs, ...mids, ...fwds]));
    const { error } = await league.clients[0].rpc("sign_player", { p_league_id: league.leagueId, p_player_id: extra });
    assert.equal(error?.message, "ROSTER_FULL");
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

test("sign_player: ROSTER_LIMIT_EXCEEDED once a position is at its maximum, even with roster room to spare", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 16);
  try {
    const gks = await findFreeAgents(admin, league.leagueId, "GK", 2);
    await signPlayers(league.clients[0], league.leagueId, gks);

    const [thirdGk] = await findFreeAgents(admin, league.leagueId, "GK", 1, new Set(gks));
    const { error } = await league.clients[0].rpc("sign_player", { p_league_id: league.leagueId, p_player_id: thirdGk });
    assert.equal(
      error?.message,
      "ROSTER_LIMIT_EXCEEDED",
      "GK is fixed at exactly 2 -- a 3rd must be rejected even with 14 empty roster slots remaining"
    );
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

test("ownership is league-scoped: a player owned in one league remains genuinely free in a completely independent league", { skip }, async () => {
  const admin = createAdminClient();
  const leagueA = await createTestLeague(admin, 2, 16);
  const leagueB = await createTestLeague(admin, 2, 16);
  try {
    const [playerId] = await findFreeAgents(admin, leagueA.leagueId, "MID", 1);
    await signPlayers(leagueA.clients[0], leagueA.leagueId, [playerId]);

    const { error } = await leagueB.clients[0].rpc("sign_player", {
      p_league_id: leagueB.leagueId,
      p_player_id: playerId,
    });
    assert.equal(error, null, "league A's ownership must never leak into league B's availability");

    const { data: ownershipA } = await admin
      .from("league_player_ownership")
      .select("fantasy_team_id")
      .eq("league_id", leagueA.leagueId)
      .eq("player_id", playerId)
      .single();
    const { data: ownershipB } = await admin
      .from("league_player_ownership")
      .select("fantasy_team_id")
      .eq("league_id", leagueB.leagueId)
      .eq("player_id", playerId)
      .single();
    assert.equal(ownershipA!.fantasy_team_id, leagueA.teamIds[0]);
    assert.equal(ownershipB!.fantasy_team_id, leagueB.teamIds[0]);
  } finally {
    await cleanupTestLeague(admin, leagueA);
    await cleanupTestLeague(admin, leagueB);
  }
});

// ===========================================================================
// CONCURRENCY
// ===========================================================================

test("concurrency: two teams racing to sign the same free agent -- exactly one succeeds, the other gets PLAYER_ALREADY_OWNED, and exactly one ownership row exists", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 16);
  try {
    const [playerId] = await findFreeAgents(admin, league.leagueId, "FWD", 1);
    const results = await Promise.all(
      league.clients.map((client) => client.rpc("sign_player", { p_league_id: league.leagueId, p_player_id: playerId }))
    );
    const successes = results.filter((r) => !r.error);
    const failures = results.filter((r) => r.error);
    assert.equal(successes.length, 1, "exactly one concurrent sign must succeed");
    assert.equal(failures.length, 1, "exactly one concurrent sign must fail");
    assert.equal(failures[0]!.error?.message, "PLAYER_ALREADY_OWNED");

    const { data: ownershipRows } = await admin
      .from("league_player_ownership")
      .select("fantasy_team_id")
      .eq("league_id", league.leagueId)
      .eq("player_id", playerId);
    assert.equal(ownershipRows?.length, 1, "the database must never end up with two ownership rows for one player in one league");
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

test("concurrency: double-clicking ADD on the same player by the same team -- the second call fails cleanly, never creating a duplicate roster_entry", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 16);
  try {
    const [playerId] = await findFreeAgents(admin, league.leagueId, "DEF", 1);
    const results = await Promise.all([
      league.clients[0].rpc("sign_player", { p_league_id: league.leagueId, p_player_id: playerId }),
      league.clients[0].rpc("sign_player", { p_league_id: league.leagueId, p_player_id: playerId }),
    ]);
    const successes = results.filter((r) => !r.error);
    assert.equal(successes.length, 1, "a double-click must never create two roster_entries for the same player");

    const { data: rosterEntries } = await admin
      .from("roster_entries")
      .select("id")
      .eq("fantasy_team_id", league.teamIds[0])
      .eq("player_id", playerId)
      .eq("status", "active");
    assert.equal(rosterEntries?.length, 1);
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

test("concurrency: double-clicking DROP on the same player -- the second call fails because the player is no longer owned by that team", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 16);
  try {
    const [playerId] = await findFreeAgents(admin, league.leagueId, "MID", 1);
    await signPlayers(league.clients[0], league.leagueId, [playerId]);

    const results = await Promise.all([
      league.clients[0].rpc("drop_player", { p_league_id: league.leagueId, p_player_id: playerId }),
      league.clients[0].rpc("drop_player", { p_league_id: league.leagueId, p_player_id: playerId }),
    ]);
    const successes = results.filter((r) => !r.error);
    const failures = results.filter((r) => r.error);
    assert.equal(successes.length, 1);
    assert.equal(failures.length, 1);
    assert.equal(failures[0]!.error?.message, "PLAYER_NOT_OWNED_BY_TEAM");
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

// ===========================================================================
// CURRENT-ROUND LOCK INTEGRITY
// ===========================================================================

test("lock integrity: dropping a LOCKED starter leaves their locked slot completely untouched -- a replacement signed afterward starts on the bench in a brand-new slot, never inheriting the locked points", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 16);
  try {
    const [playerA] = await findFreeAgents(admin, league.leagueId, "GK", 1);
    const [rosterEntryA] = await signPlayers(league.clients[0], league.leagueId, [playerA]);

    const opened = await openNextRound(admin, league.leagueId, new Date());
    assert.ok(opened.ok, `round must open: ${!opened.ok ? opened.error : ""}`);
    if (!opened.ok) return;

    // Force player A's slot into a LOCKED starter state -- simulating an
    // already-kicked-off fixture deterministically (see this file's own
    // header comment on why this is done directly rather than depending
    // on live fixture timing).
    const pastLock = new Date(Date.now() - 3_600_000).toISOString();
    await admin
      .from("lineup_slots")
      .update({ starter: true, slot: "GK", locked_at: pastLock })
      .eq("roster_entry_id", rosterEntryA)
      .eq("fantasy_round_id", opened.roundId);

    const { error: dropError } = await league.clients[0].rpc("drop_player", {
      p_league_id: league.leagueId,
      p_player_id: playerA,
    });
    assert.equal(dropError, null, "the drop itself is always allowed, even for a locked starter");

    const { data: slotA } = await admin
      .from("lineup_slots")
      .select("starter, locked_at")
      .eq("roster_entry_id", rosterEntryA)
      .eq("fantasy_round_id", opened.roundId)
      .single();
    assert.equal(
      slotA!.starter,
      true,
      "a LOCKED starter's slot must be left completely untouched by a drop -- it is the authoritative historical scoring record"
    );
    assert.equal(new Date(slotA!.locked_at!).toISOString(), pastLock);

    const [playerB] = await findFreeAgents(admin, league.leagueId, "GK", 1, new Set([playerA]));
    const [rosterEntryB] = await signPlayers(league.clients[0], league.leagueId, [playerB]);

    const { data: slotB } = await admin
      .from("lineup_slots")
      .select("starter")
      .eq("roster_entry_id", rosterEntryB)
      .eq("fantasy_round_id", opened.roundId)
      .maybeSingle();
    assert.ok(slotB, "a newly-signed player must get their own current-round lineup_slots row");
    assert.equal(
      slotB!.starter,
      false,
      "the replacement must start on the BENCH -- never inheriting the dropped player's starter status or points"
    );

    const { count } = await admin
      .from("lineup_slots")
      .select("*", { count: "exact", head: true })
      .eq("fantasy_round_id", opened.roundId)
      .in("roster_entry_id", [rosterEntryA, rosterEntryB]);
    assert.equal(count, 2, "the locked slot and the replacement's new slot must be two distinct, independent rows");
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

test("lock integrity: dropping an UNLOCKED starter demotes their current-round slot to the bench, exactly like a normal substitution", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 16);
  try {
    const [playerC] = await findFreeAgents(admin, league.leagueId, "MID", 1);
    const [rosterEntryC] = await signPlayers(league.clients[0], league.leagueId, [playerC]);

    const opened = await openNextRound(admin, league.leagueId, new Date());
    assert.ok(opened.ok);
    if (!opened.ok) return;

    const futureLock = new Date(Date.now() + 3_600_000).toISOString();
    await admin
      .from("lineup_slots")
      .update({ starter: true, slot: "MID", locked_at: futureLock })
      .eq("roster_entry_id", rosterEntryC)
      .eq("fantasy_round_id", opened.roundId);

    const { error } = await league.clients[0].rpc("drop_player", { p_league_id: league.leagueId, p_player_id: playerC });
    assert.equal(error, null);

    const { data: slotC } = await admin
      .from("lineup_slots")
      .select("starter, slot")
      .eq("roster_entry_id", rosterEntryC)
      .eq("fantasy_round_id", opened.roundId)
      .single();
    assert.equal(slotC!.starter, false, "an UNLOCKED departing starter must be demoted to the bench as part of the same atomic drop");
    assert.equal(slotC!.slot, "BENCH");
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

test("lock integrity: a trade that moves a LOCKED starter away leaves that locked slot untouched on the losing team's side, and the gaining team's new slot starts on the bench", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 16);
  try {
    const [playerD] = await findFreeAgents(admin, league.leagueId, "DEF", 1);
    const [rosterEntryD] = await signPlayers(league.clients[0], league.leagueId, [playerD]);

    const opened = await openNextRound(admin, league.leagueId, new Date());
    assert.ok(opened.ok);
    if (!opened.ok) return;

    const pastLock = new Date(Date.now() - 3_600_000).toISOString();
    await admin
      .from("lineup_slots")
      .update({ starter: true, slot: "DEF", locked_at: pastLock })
      .eq("roster_entry_id", rosterEntryD)
      .eq("fantasy_round_id", opened.roundId);

    const { data: proposed, error: proposeError } = await league.clients[0].rpc("propose_trade", {
      p_league_id: league.leagueId,
      p_receiving_team_id: league.teamIds[1],
      p_offered_player_ids: [playerD],
      p_requested_player_ids: [],
    });
    assert.equal(proposeError, null);

    const { error: acceptError } = await league.clients[1].rpc("accept_trade", { p_trade_id: proposed![0]!.trade_id });
    assert.equal(acceptError, null);

    const { data: oldSlot } = await admin
      .from("lineup_slots")
      .select("starter, locked_at")
      .eq("roster_entry_id", rosterEntryD)
      .eq("fantasy_round_id", opened.roundId)
      .single();
    assert.equal(oldSlot!.starter, true, "the losing team's locked slot must survive a trade untouched, exactly like a drop");
    assert.equal(new Date(oldSlot!.locked_at!).toISOString(), pastLock);

    const { data: newRosterEntry } = await admin
      .from("roster_entries")
      .select("id")
      .eq("fantasy_team_id", league.teamIds[1])
      .eq("player_id", playerD)
      .eq("status", "active")
      .single();
    const { data: newSlot } = await admin
      .from("lineup_slots")
      .select("starter")
      .eq("roster_entry_id", newRosterEntry!.id)
      .eq("fantasy_round_id", opened.roundId)
      .maybeSingle();
    assert.ok(newSlot, "the gaining team must get its own fresh lineup_slots row for the traded-in player");
    assert.equal(newSlot!.starter, false, "a player acquired via trade always starts on the bench, never inheriting starter status");
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

// ===========================================================================
// TRADES
// ===========================================================================

test("propose_trade + accept_trade: a valid 1-for-1 trade atomically transfers both players and is recorded as a transaction", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 16);
  try {
    const [playerFromA] = await findFreeAgents(admin, league.leagueId, "DEF", 1);
    const [playerFromB] = await findFreeAgents(admin, league.leagueId, "FWD", 1, new Set([playerFromA]));
    await signPlayers(league.clients[0], league.leagueId, [playerFromA]);
    await signPlayers(league.clients[1], league.leagueId, [playerFromB]);

    const { data: proposed, error: proposeError } = await league.clients[0].rpc("propose_trade", {
      p_league_id: league.leagueId,
      p_receiving_team_id: league.teamIds[1],
      p_offered_player_ids: [playerFromA],
      p_requested_player_ids: [playerFromB],
    });
    assert.equal(proposeError, null);
    const tradeId = proposed![0]!.trade_id;

    const { data: pendingRow } = await admin.from("trades").select("status").eq("id", tradeId).single();
    assert.equal(pendingRow!.status, "pending");

    const { error: acceptError } = await league.clients[1].rpc("accept_trade", { p_trade_id: tradeId });
    assert.equal(acceptError, null);

    const { data: finalTrade } = await admin.from("trades").select("status").eq("id", tradeId).single();
    assert.equal(finalTrade!.status, "accepted");

    const { data: ownershipA } = await admin
      .from("league_player_ownership")
      .select("fantasy_team_id")
      .eq("league_id", league.leagueId)
      .eq("player_id", playerFromA)
      .single();
    const { data: ownershipB } = await admin
      .from("league_player_ownership")
      .select("fantasy_team_id")
      .eq("league_id", league.leagueId)
      .eq("player_id", playerFromB)
      .single();
    assert.equal(ownershipA!.fantasy_team_id, league.teamIds[1], "team1 must now own the player team0 offered");
    assert.equal(ownershipB!.fantasy_team_id, league.teamIds[0], "team0 must now own the player team1 offered");

    const { data: txRow } = await admin
      .from("transactions")
      .select("type, metadata")
      .eq("league_id", league.leagueId)
      .eq("type", "trade")
      .maybeSingle();
    assert.ok(txRow, "an accepted trade must write a durable transactions row");
    assert.equal((txRow!.metadata as { tradeId: string }).tradeId, tradeId);
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

test("propose_trade: offering a player the proposer doesn't actually own fails with INVALID_TRADE_ASSET, and no trade is created", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 16);
  try {
    const [notOwned] = await findFreeAgents(admin, league.leagueId, "MID", 1);
    const { error } = await league.clients[0].rpc("propose_trade", {
      p_league_id: league.leagueId,
      p_receiving_team_id: league.teamIds[1],
      p_offered_player_ids: [notOwned],
      p_requested_player_ids: [],
    });
    assert.equal(error?.message, "INVALID_TRADE_ASSET");

    const { data: trades } = await admin.from("trades").select("id").eq("league_id", league.leagueId);
    assert.equal(trades?.length ?? 0, 0);
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

test("cancel_trade and reject_trade: the proposer can cancel their own pending trade, the receiver can reject an incoming one, and neither changes ownership", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 16);
  try {
    const [playerA] = await findFreeAgents(admin, league.leagueId, "DEF", 1);
    await signPlayers(league.clients[0], league.leagueId, [playerA]);

    const { data: proposed1 } = await league.clients[0].rpc("propose_trade", {
      p_league_id: league.leagueId,
      p_receiving_team_id: league.teamIds[1],
      p_offered_player_ids: [playerA],
      p_requested_player_ids: [],
    });
    const { error: cancelError } = await league.clients[0].rpc("cancel_trade", { p_trade_id: proposed1![0]!.trade_id });
    assert.equal(cancelError, null);
    const { data: cancelled } = await admin.from("trades").select("status").eq("id", proposed1![0]!.trade_id).single();
    assert.equal(cancelled!.status, "cancelled");

    const { data: proposed2 } = await league.clients[0].rpc("propose_trade", {
      p_league_id: league.leagueId,
      p_receiving_team_id: league.teamIds[1],
      p_offered_player_ids: [playerA],
      p_requested_player_ids: [],
    });
    const { error: rejectError } = await league.clients[1].rpc("reject_trade", { p_trade_id: proposed2![0]!.trade_id });
    assert.equal(rejectError, null);
    const { data: rejected } = await admin.from("trades").select("status").eq("id", proposed2![0]!.trade_id).single();
    assert.equal(rejected!.status, "rejected");

    const { data: ownership } = await admin
      .from("league_player_ownership")
      .select("fantasy_team_id")
      .eq("league_id", league.leagueId)
      .eq("player_id", playerA)
      .single();
    assert.equal(ownership!.fantasy_team_id, league.teamIds[0], "neither cancel nor reject may ever move ownership");
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

test("accept_trade: a stale trade whose offered player was dropped after proposal fails truthfully with TRADE_ASSET_NO_LONGER_OWNED, and nothing is transferred", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 16);
  try {
    const [playerA] = await findFreeAgents(admin, league.leagueId, "FWD", 1);
    const [playerB] = await findFreeAgents(admin, league.leagueId, "DEF", 1, new Set([playerA]));
    await signPlayers(league.clients[0], league.leagueId, [playerA]);
    await signPlayers(league.clients[1], league.leagueId, [playerB]);

    const { data: proposed } = await league.clients[0].rpc("propose_trade", {
      p_league_id: league.leagueId,
      p_receiving_team_id: league.teamIds[1],
      p_offered_player_ids: [playerA],
      p_requested_player_ids: [playerB],
    });
    const tradeId = proposed![0]!.trade_id;

    // Ownership changes AFTER proposal, before acceptance.
    const { error: dropError } = await league.clients[0].rpc("drop_player", {
      p_league_id: league.leagueId,
      p_player_id: playerA,
    });
    assert.equal(dropError, null);

    const { error: acceptError } = await league.clients[1].rpc("accept_trade", { p_trade_id: tradeId });
    assert.equal(acceptError?.message, "TRADE_ASSET_NO_LONGER_OWNED");

    const { data: tradeRow } = await admin.from("trades").select("status").eq("id", tradeId).single();
    assert.equal(tradeRow!.status, "pending", "a failed acceptance must never change the trade's own status");

    const { data: ownershipB } = await admin
      .from("league_player_ownership")
      .select("fantasy_team_id")
      .eq("league_id", league.leagueId)
      .eq("player_id", playerB)
      .single();
    assert.equal(
      ownershipB!.fantasy_team_id,
      league.teamIds[1],
      "a failed acceptance must leave the OTHER asset's ownership untouched too -- all or nothing"
    );
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

test("accept_trade: two trades offering the SAME player to two different teams -- accepting both concurrently yields exactly one success, one truthful failure, and consistent final ownership", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 3, 16);
  try {
    const [contested] = await findFreeAgents(admin, league.leagueId, "MID", 1);
    await signPlayers(league.clients[0], league.leagueId, [contested]);

    const { data: tradeToB } = await league.clients[0].rpc("propose_trade", {
      p_league_id: league.leagueId,
      p_receiving_team_id: league.teamIds[1],
      p_offered_player_ids: [contested],
      p_requested_player_ids: [],
    });
    const { data: tradeToC } = await league.clients[0].rpc("propose_trade", {
      p_league_id: league.leagueId,
      p_receiving_team_id: league.teamIds[2],
      p_offered_player_ids: [contested],
      p_requested_player_ids: [],
    });

    const [resultB, resultC] = await Promise.all([
      league.clients[1].rpc("accept_trade", { p_trade_id: tradeToB![0]!.trade_id }),
      league.clients[2].rpc("accept_trade", { p_trade_id: tradeToC![0]!.trade_id }),
    ]);

    const outcomes = [resultB, resultC];
    const successes = outcomes.filter((r) => !r.error);
    const failures = outcomes.filter((r) => r.error);
    assert.equal(successes.length, 1, "exactly one of the two conflicting trades may succeed");
    assert.equal(failures.length, 1);
    assert.equal(failures[0]!.error?.message, "TRADE_ASSET_NO_LONGER_OWNED");

    const { data: finalOwnership } = await admin
      .from("league_player_ownership")
      .select("fantasy_team_id")
      .eq("league_id", league.leagueId)
      .eq("player_id", contested);
    assert.equal(finalOwnership?.length, 1, "exactly one ownership row must exist for the contested player");
    assert.ok(
      [league.teamIds[1], league.teamIds[2]].includes(finalOwnership![0]!.fantasy_team_id),
      "the single winner must be one of the two competing recipients"
    );
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

test("accept_trade: an acceptance that would push the receiving team's position count over its maximum is rejected, and nothing is transferred", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 16);
  try {
    const gksForReceiver = await findFreeAgents(admin, league.leagueId, "GK", 2);
    await signPlayers(league.clients[1], league.leagueId, gksForReceiver);

    const [thirdGk] = await findFreeAgents(admin, league.leagueId, "GK", 1, new Set(gksForReceiver));
    await signPlayers(league.clients[0], league.leagueId, [thirdGk]);

    const { data: proposed } = await league.clients[0].rpc("propose_trade", {
      p_league_id: league.leagueId,
      p_receiving_team_id: league.teamIds[1],
      p_offered_player_ids: [thirdGk],
      p_requested_player_ids: [],
    });
    const { error } = await league.clients[1].rpc("accept_trade", { p_trade_id: proposed![0]!.trade_id });
    assert.equal(error?.message, "ROSTER_LIMIT_EXCEEDED");

    const { data: ownership } = await admin
      .from("league_player_ownership")
      .select("fantasy_team_id")
      .eq("league_id", league.leagueId)
      .eq("player_id", thirdGk)
      .single();
    assert.equal(
      ownership!.fantasy_team_id,
      league.teamIds[0],
      "a rejected acceptance must leave the offered player with its original owner"
    );
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

// ===========================================================================
// SECURITY
// ===========================================================================

test("security: a manager cannot accept, reject, or cancel a trade in a role they don't hold for it", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 16);
  try {
    const [playerA] = await findFreeAgents(admin, league.leagueId, "DEF", 1);
    await signPlayers(league.clients[0], league.leagueId, [playerA]);

    const { data: proposed } = await league.clients[0].rpc("propose_trade", {
      p_league_id: league.leagueId,
      p_receiving_team_id: league.teamIds[1],
      p_offered_player_ids: [playerA],
      p_requested_player_ids: [],
    });
    const tradeId = proposed![0]!.trade_id;

    const acceptOwn = await league.clients[0].rpc("accept_trade", { p_trade_id: tradeId });
    assert.equal(
      acceptOwn.error?.message,
      "NOT_AUTHORIZED",
      "the proposer must never be able to accept their own outgoing trade as if they were the recipient"
    );

    const cancelAsReceiver = await league.clients[1].rpc("cancel_trade", { p_trade_id: tradeId });
    assert.equal(cancelAsReceiver.error?.message, "NOT_AUTHORIZED", "only the proposer may cancel");

    const rejectAsProposer = await league.clients[0].rpc("reject_trade", { p_trade_id: tradeId });
    assert.equal(rejectAsProposer.error?.message, "NOT_AUTHORIZED", "only the receiving manager may reject");

    const { data: stillPending } = await admin.from("trades").select("status").eq("id", tradeId).single();
    assert.equal(stillPending!.status, "pending", "none of the unauthorized attempts may change the trade's state");
  } finally {
    await cleanupTestLeague(admin, league);
  }
});

test("security: a user with no team in the league cannot sign, drop, or propose a trade there", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 16);
  const outsider = await createTestLeague(admin, 1, 16);
  try {
    const [playerId] = await findFreeAgents(admin, league.leagueId, "MID", 1);

    const signAttempt = await outsider.clients[0].rpc("sign_player", {
      p_league_id: league.leagueId,
      p_player_id: playerId,
    });
    assert.equal(signAttempt.error?.message, "NOT_LEAGUE_MEMBER");

    await signPlayers(league.clients[0], league.leagueId, [playerId]);
    const dropAttempt = await outsider.clients[0].rpc("drop_player", {
      p_league_id: league.leagueId,
      p_player_id: playerId,
    });
    assert.equal(dropAttempt.error?.message, "NOT_LEAGUE_MEMBER");

    const tradeAttempt = await outsider.clients[0].rpc("propose_trade", {
      p_league_id: league.leagueId,
      p_receiving_team_id: league.teamIds[1],
      p_offered_player_ids: [],
      p_requested_player_ids: [],
    });
    assert.equal(tradeAttempt.error?.message, "NOT_LEAGUE_MEMBER");
  } finally {
    await cleanupTestLeague(admin, league);
    await cleanupTestLeague(admin, outsider);
  }
});

// ===========================================================================
// TRANSACTION HISTORY
// ===========================================================================

test("transaction history: sign/drop/re-sign each write a durable, correctly-ordered transactions row, independent of current ownership", { skip }, async () => {
  const admin = createAdminClient();
  const league = await createTestLeague(admin, 2, 16);
  try {
    const [playerA] = await findFreeAgents(admin, league.leagueId, "DEF", 1);
    await signPlayers(league.clients[0], league.leagueId, [playerA]);
    const { error: dropError } = await league.clients[0].rpc("drop_player", {
      p_league_id: league.leagueId,
      p_player_id: playerA,
    });
    assert.equal(dropError, null);
    await signPlayers(league.clients[0], league.leagueId, [playerA]);

    const { data: txs } = await admin
      .from("transactions")
      .select("type, fantasy_team_id, metadata, created_at")
      .eq("league_id", league.leagueId)
      .order("created_at", { ascending: true });

    const types = (txs ?? []).map((t) => t.type);
    assert.deepEqual(
      types,
      ["free_agent_add", "drop", "free_agent_add"],
      "history must record every sign/drop in order, and is never derived solely from current ownership"
    );
    for (const t of txs ?? []) {
      assert.equal(t.fantasy_team_id, league.teamIds[0]);
      assert.equal((t.metadata as { playerId: string }).playerId, playerA);
    }

    // Scoped to PLAYER_* only -- league/team creation legitimately logs its
    // own LEAGUE_CREATED/TEAM_CREATED events first, which isn't this
    // test's concern.
    const { data: events } = await admin
      .from("domain_events")
      .select("event_type")
      .eq("league_id", league.leagueId)
      .in("event_type", ["PLAYER_ADDED", "PLAYER_DROPPED"])
      .order("created_at", { ascending: true });
    assert.deepEqual((events ?? []).map((e) => e.event_type), ["PLAYER_ADDED", "PLAYER_DROPPED", "PLAYER_ADDED"]);
  } finally {
    await cleanupTestLeague(admin, league);
  }
});
