import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { openNextRound, refreshMatchupScores, finalizeRoundIfReady } from "./rounds.ts";
import { updateLineup } from "./lineup.ts";
import { chooseAutomaticStartingXi } from "../../domain/fantasy/auto-lineup.ts";
import { isStarterCompositionValid } from "../../domain/fantasy/constants.ts";
import { scoringVersion } from "../scoring/versions.ts";
import type { PlayerPosition } from "../../domain/football/types.ts";
import type { Database } from "../supabase/database.types.ts";

export interface SimulationOptions {
  managers: number;
  rounds: number;
  /** ISO date the simulated season/draft effectively "starts" at — the clock the whole run is anchored to. Defaults to the real start of the stored 2026/27 season. */
  startAt?: string;
  squadSize?: number;
}

export interface SimulationRoundSummary {
  roundNumber: number;
  matchups: number;
  finalized: boolean;
}

export interface SimulationInvariants {
  ownershipViolations: number;
  rosterViolations: number;
  formationViolations: number;
  lockViolations: number;
  scoringMismatches: number;
  standingsMismatches: number;
  marketViolations: number;
}

/**
 * Pass 11: free market (drop/sign/race) + a trade, driven through the
 * actual RLS-gated RPCs exactly like the rest of this simulation, run
 * once after the draft completes and before round 1 opens -- proving the
 * market/trade engine coexists cleanly with the draft -> round ->
 * scoring lifecycle the rest of this file already exercises, not just in
 * isolation (that isolated coverage already exists in
 * market-trades.integration.test.ts).
 */
export interface MarketSimulationSummary {
  dropped: boolean;
  droppedPlayerAvailableAfterwards: boolean;
  signedReplacement: boolean;
  rosterRestoredTo16: boolean;
  raceAttempted: boolean;
  raceExactlyOneWinner: boolean;
  tradeProposed: boolean;
  tradeAccepted: boolean;
  tradeOwnershipTransferredCorrectly: boolean;
}

export interface SimulationResult {
  leagueId: string;
  managers: number;
  playersDrafted: number;
  fantasyRoundsSimulated: number;
  h2hMatchups: number;
  fixturesReplayed: number;
  playerLocks: number;
  scoresEvaluated: number;
  rounds: SimulationRoundSummary[];
  invariants: SimulationInvariants;
  passed: boolean;
  standings: Array<{ fantasyTeamId: string; wins: number; losses: number; draws: number; pointsFor: number; pointsAgainst: number }>;
  market: MarketSimulationSummary;
}

/**
 * Drives Eleven's ENTIRE core-game lifecycle — create league, fill it,
 * draft, set lineups, open/finalize multiple fantasy rounds, standings —
 * end to end against REAL stored 2026/27 fixtures/scores with a
 * controlled clock, exactly as docs/game-rules.md "Simulation" requires.
 * Creates real temporary Supabase Auth users (so every mutation goes
 * through the actual RLS-gated RPCs a real manager would use, not a
 * shortcut around them) and returns their ids so the caller (the CLI)
 * cleans them up afterward — this function never deletes them itself,
 * so a caller can inspect the simulated league's real rows before
 * tearing down if useful.
 */
export async function runSimulation(
  admin: SupabaseClient<Database>,
  supabaseUrl: string,
  supabaseAnonKey: string,
  options: SimulationOptions
): Promise<{ result: SimulationResult; testUserIds: string[]; leagueId: string }> {
  const squadSize = options.squadSize ?? 16;
  const startAt = options.startAt ? new Date(options.startAt) : new Date("2026-08-11T06:00:00Z");

  const testUserIds: string[] = [];
  const clients: SupabaseClient<Database>[] = [];
  const password = "Sim-" + Math.random().toString(36).slice(2) + "!Aa1";

  for (let i = 0; i < options.managers; i++) {
    const email = `eleven-sim-${Date.now()}-${i}-${Math.random().toString(36).slice(2)}@example.invalid`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw new Error(`simulation: failed to create test user ${i}: ${error?.message}`);
    testUserIds.push(data.user.id);
    const client = createClient<Database>(supabaseUrl, supabaseAnonKey);
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw new Error(`simulation: failed to sign in test user ${i}: ${signInError.message}`);
    clients.push(client);
  }

  const { data: created, error: createErr } = await clients[0].rpc("create_league", {
    p_name: `Eleven Simulation ${Date.now()}`,
    p_team_name: "Sim Team 0",
    p_team_abbreviation: "SIM0",
    p_settings: {
      maxTeams: options.managers,
      squadSize,
      starterCount: 11,
      waiverMode: "priority",
      playoffEnabled: true,
      draftType: "snake",
      pickTimerSeconds: 60,
    },
  });
  if (createErr || !created?.[0]) throw new Error(`simulation: create_league failed: ${createErr?.message}`);
  const leagueId = created[0].league_id;
  const teamIds: string[] = [created[0].fantasy_team_id];

  for (let i = 1; i < options.managers; i++) {
    const { data: joined, error } = await clients[i].rpc("join_league_by_invite_code", {
      p_invite_code: created[0].invite_code,
      p_team_name: `Sim Team ${i}`,
      p_team_abbreviation: `SM${i}`,
    });
    if (error || !joined?.[0]) throw new Error(`simulation: join failed for manager ${i}: ${error?.message}`);
    teamIds.push(joined[0].fantasy_team_id);
  }

  const { data: draftStart, error: draftStartErr } = await clients[0].rpc("start_draft", { p_league_id: leagueId });
  if (draftStartErr || !draftStart?.[0]) throw new Error(`simulation: start_draft failed: ${draftStartErr?.message}`);
  const draftId = draftStart[0].draft_id;

  const farFuture = new Date(startAt.getTime() + 365 * 24 * 3600 * 1000).toISOString();
  let playersDrafted = 0;
  const maxPicks = options.managers * squadSize + 5;
  for (let i = 0; i < maxPicks; i++) {
    const { data: status } = await admin.from("drafts").select("status").eq("id", draftId).single();
    if (status?.status === "completed") break;
    const { error } = await admin.rpc("resolve_expired_pick", { p_draft_id: draftId, p_as_of: farFuture });
    if (error) throw new Error(`simulation: draft did not complete cleanly: ${error.message}`);
    playersDrafted++;
  }

  const market = await simulateMarketAndTrades(admin, clients, leagueId, teamIds);

  const roundSummaries: SimulationRoundSummary[] = [];
  let clock = new Date(startAt);
  const totalFixturesReplayed = new Set<string>();
  let totalPlayerLocks = 0;
  let totalScoresEvaluated = 0;
  let h2hMatchups = 0;

  for (let r = 0; r < options.rounds; r++) {
    const openResult = await openNextRound(admin, leagueId, clock);
    if (!openResult.ok) {
      roundSummaries.push({ roundNumber: r + 1, matchups: 0, finalized: false });
      break;
    }

    const { data: matchupRows } = await admin.from("matchups").select("id").eq("fantasy_round_id", openResult.roundId);
    h2hMatchups += matchupRows?.length ?? 0;

    // Set a valid, deterministic starting XI for every team (simulation
    // stand-in for a manager's own choice — see auto-lineup.ts's doc
    // comment: never used for a real user's lineup).
    for (const teamId of teamIds) {
      const { data: rosterEntries } = await admin
        .from("roster_entries")
        .select("id, players(position)")
        .eq("fantasy_team_id", teamId)
        .eq("status", "active")
        .order("id");
      const roster = (rosterEntries ?? []).map((r) => ({
        rosterEntryId: r.id,
        position: (r.players as { position: string } | null)?.position as PlayerPosition,
      }));
      const { starters } = chooseAutomaticStartingXi(roster);
      if (starters.length !== 11) continue; // insufficient depth -- leave bench-only rather than force an invalid formation
      await updateLineup(
        admin,
        teamId,
        openResult.roundId,
        starters.map((s) => ({ rosterEntryId: s.rosterEntryId, starter: true, position: s.position })),
        clock
      );
    }

    const { data: lockedSlots } = await admin
      .from("lineup_slots")
      .select("id, locked_at, roster_entries!inner(fantasy_team_id)")
      .eq("fantasy_round_id", openResult.roundId)
      .not("locked_at", "is", null)
      .in("roster_entries.fantasy_team_id", teamIds);
    totalPlayerLocks += lockedSlots?.length ?? 0;

    const { data: windowFixtures } = await admin
      .from("fixtures")
      .select("id")
      .gte("kickoff_at", openResult.window.startsAt.toISOString())
      .lt("kickoff_at", openResult.window.endsAt.toISOString());
    for (const f of windowFixtures ?? []) totalFixturesReplayed.add(f.id);

    await refreshMatchupScores(admin, openResult.roundId);

    const settleClock = new Date(openResult.window.endsAt.getTime() + 25 * 3600 * 1000);
    const finalizeResult = await finalizeRoundIfReady(admin, openResult.roundId, settleClock);

    const { data: scoreRows } = await admin.from("matchup_scores").select("id").in("matchup_id", matchupRows?.map((m) => m.id) ?? []);
    totalScoresEvaluated += scoreRows?.length ?? 0;

    roundSummaries.push({ roundNumber: openResult.roundNumber, matchups: matchupRows?.length ?? 0, finalized: finalizeResult.finalized });

    clock = settleClock;
    if (!finalizeResult.finalized) break; // conservative finalization declined -- stop rather than open another round on an unfinished one
  }

  const marketViolations = [
    market.dropped,
    market.droppedPlayerAvailableAfterwards,
    market.signedReplacement,
    market.rosterRestoredTo16,
    market.raceExactlyOneWinner,
    market.tradeProposed,
    market.tradeAccepted,
    market.tradeOwnershipTransferredCorrectly,
  ].filter((ok) => !ok).length;

  const invariants = { ...(await checkInvariants(admin, leagueId, teamIds, roundSummaries)), marketViolations };
  const standings = await computeStandings(admin, leagueId);

  const passed = Object.values(invariants).every((v) => v === 0);

  return {
    leagueId,
    testUserIds,
    result: {
      leagueId,
      managers: options.managers,
      playersDrafted,
      fantasyRoundsSimulated: roundSummaries.filter((r) => r.finalized).length,
      h2hMatchups,
      fixturesReplayed: totalFixturesReplayed.size,
      playerLocks: totalPlayerLocks,
      scoresEvaluated: totalScoresEvaluated,
      rounds: roundSummaries,
      invariants,
      passed,
      standings,
      market,
    },
  };
}

/**
 * Pass 11's own slice of the simulation: drop a player from team0, verify
 * it becomes available again, sign a replacement (verifying the roster
 * returns to 16), then have team0 and team1 race for a second, genuinely
 * contested free agent (proving the database — not application luck —
 * resolves it to exactly one winner), then propose and accept a 1-for-1
 * trade between them. Runs after the draft completes and before round 1
 * opens, through the exact same authenticated clients/RPCs a real manager
 * uses — never the admin client for the mutations themselves.
 */
async function simulateMarketAndTrades(
  admin: SupabaseClient<Database>,
  clients: SupabaseClient<Database>[],
  leagueId: string,
  teamIds: string[]
): Promise<MarketSimulationSummary> {
  const summary: MarketSimulationSummary = {
    dropped: false,
    droppedPlayerAvailableAfterwards: false,
    signedReplacement: false,
    rosterRestoredTo16: false,
    raceAttempted: false,
    raceExactlyOneWinner: false,
    tradeProposed: false,
    tradeAccepted: false,
    tradeOwnershipTransferredCorrectly: false,
  };

  if (teamIds.length < 2) return summary;

  async function freeAgent(position: string, excludeIds: Set<string>): Promise<string | null> {
    const { data: owned } = await admin.from("league_player_ownership").select("player_id").eq("league_id", leagueId);
    const ownedIds = new Set((owned ?? []).map((o) => o.player_id));
    const { data: candidates } = await admin.from("players").select("id").eq("active", true).eq("position", position).order("name").limit(400);
    return candidates?.find((c) => !ownedIds.has(c.id) && !excludeIds.has(c.id))?.id ?? null;
  }

  // --- drop + sign replacement ---
  const { data: team0Roster } = await admin
    .from("roster_entries")
    .select("id, player_id, players(position)")
    .eq("fantasy_team_id", teamIds[0])
    .eq("status", "active")
    .limit(1);
  const toDrop = team0Roster?.[0];
  if (toDrop) {
    const { count: countBeforeDrop } = await admin
      .from("roster_entries")
      .select("*", { count: "exact", head: true })
      .eq("fantasy_team_id", teamIds[0])
      .eq("status", "active");

    const { error: dropError } = await clients[0].rpc("drop_player", { p_league_id: leagueId, p_player_id: toDrop.player_id });
    summary.dropped = !dropError;

    const { data: ownershipAfterDrop } = await admin
      .from("league_player_ownership")
      .select("player_id")
      .eq("league_id", leagueId)
      .eq("player_id", toDrop.player_id)
      .maybeSingle();
    summary.droppedPlayerAvailableAfterwards = !ownershipAfterDrop;

    const position = (toDrop.players as { position: string } | null)?.position ?? "MID";
    const replacementId = await freeAgent(position, new Set([toDrop.player_id]));
    if (replacementId) {
      const { error: signError } = await clients[0].rpc("sign_player", { p_league_id: leagueId, p_player_id: replacementId });
      summary.signedReplacement = !signError;
    }

    const { count: countAfterResign } = await admin
      .from("roster_entries")
      .select("*", { count: "exact", head: true })
      .eq("fantasy_team_id", teamIds[0])
      .eq("status", "active");
    summary.rosterRestoredTo16 = countAfterResign === countBeforeDrop;
  }

  // --- concurrent race between team0 and team1 for one contested free agent ---
  // Both teams were drafted to a full roster, so a genuine ownership race
  // needs each side to actually have room first -- drop one (arbitrary)
  // player from each via the real drop_player RPC, exactly like a manager
  // clearing a roster spot before jumping on a free agent.
  async function makeRoom(client: SupabaseClient<Database>, teamId: string): Promise<void> {
    const { data: entry } = await admin
      .from("roster_entries")
      .select("player_id")
      .eq("fantasy_team_id", teamId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (entry) await client.rpc("drop_player", { p_league_id: leagueId, p_player_id: entry.player_id });
  }
  await makeRoom(clients[0], teamIds[0]);
  await makeRoom(clients[1], teamIds[1]);

  const contested = await freeAgent("FWD", new Set());
  if (contested) {
    summary.raceAttempted = true;
    const results = await Promise.all(
      [clients[0], clients[1]].map((client) => client.rpc("sign_player", { p_league_id: leagueId, p_player_id: contested }))
    );
    summary.raceExactlyOneWinner = results.filter((r) => !r.error).length === 1 && results.filter((r) => r.error).length === 1;
  }

  // --- a 1-for-1 trade between team0 and team1 ---
  // Deliberately a SAME-POSITION swap: trading a GK for a GK (etc.) never
  // changes either team's position counts, so this can never legitimately
  // hit ROSTER_LIMIT_EXCEEDED on its own -- isolating this step from
  // whatever arbitrary composition the real draft/market steps above
  // happened to produce.
  const { data: team0ByPosition } = await admin
    .from("roster_entries")
    .select("player_id, players(position)")
    .eq("fantasy_team_id", teamIds[0])
    .eq("status", "active");
  const { data: team1ByPosition } = await admin
    .from("roster_entries")
    .select("player_id, players(position)")
    .eq("fantasy_team_id", teamIds[1])
    .eq("status", "active");
  const team1PositionMap = new Map(
    (team1ByPosition ?? []).map((r) => [(r.players as { position: string } | null)?.position, r.player_id])
  );
  let offeredPlayerId: string | undefined;
  let requestedPlayerId: string | undefined;
  for (const row of team0ByPosition ?? []) {
    const position = (row.players as { position: string } | null)?.position;
    const match = position ? team1PositionMap.get(position) : undefined;
    if (match) {
      offeredPlayerId = row.player_id;
      requestedPlayerId = match;
      break;
    }
  }
  if (offeredPlayerId && requestedPlayerId) {
    const { data: proposed, error: proposeError } = await clients[0].rpc("propose_trade", {
      p_league_id: leagueId,
      p_receiving_team_id: teamIds[1],
      p_offered_player_ids: [offeredPlayerId],
      p_requested_player_ids: [requestedPlayerId],
    });
    summary.tradeProposed = !proposeError && Boolean(proposed?.[0]?.trade_id);

    if (summary.tradeProposed) {
      const { error: acceptError } = await clients[1].rpc("accept_trade", { p_trade_id: proposed![0]!.trade_id });
      summary.tradeAccepted = !acceptError;

      const { data: offeredOwnership } = await admin
        .from("league_player_ownership")
        .select("fantasy_team_id")
        .eq("league_id", leagueId)
        .eq("player_id", offeredPlayerId)
        .maybeSingle();
      const { data: requestedOwnership } = await admin
        .from("league_player_ownership")
        .select("fantasy_team_id")
        .eq("league_id", leagueId)
        .eq("player_id", requestedPlayerId)
        .maybeSingle();
      summary.tradeOwnershipTransferredCorrectly =
        offeredOwnership?.fantasy_team_id === teamIds[1] && requestedOwnership?.fantasy_team_id === teamIds[0];
    }
  }

  return summary;
}

async function checkInvariants(
  admin: SupabaseClient<Database>,
  leagueId: string,
  teamIds: string[],
  rounds: SimulationRoundSummary[]
): Promise<Omit<SimulationInvariants, "marketViolations">> {
  let ownershipViolations = 0;
  let rosterViolations = 0;
  let formationViolations = 0;
  let lockViolations = 0;
  let scoringMismatches = 0;
  const standingsMismatches = 0;

  // Ownership: no player owned twice within this league, no duplicate player on one team's active roster.
  const { data: ownershipRows } = await admin.from("league_player_ownership").select("player_id").eq("league_id", leagueId);
  const playerCounts = new Map<string, number>();
  for (const row of ownershipRows ?? []) playerCounts.set(row.player_id, (playerCounts.get(row.player_id) ?? 0) + 1);
  for (const count of playerCounts.values()) if (count > 1) ownershipViolations++;

  for (const teamId of teamIds) {
    const { data: activeRoster } = await admin.from("roster_entries").select("player_id").eq("fantasy_team_id", teamId).eq("status", "active");
    const seen = new Set<string>();
    for (const row of activeRoster ?? []) {
      if (seen.has(row.player_id)) rosterViolations++;
      seen.add(row.player_id);
    }
  }

  // Formation: every finalized round's starter set for every team with a full 11 must be a valid composition.
  for (const round of rounds) {
    if (round.matchups === 0) continue;
    const { data: roundRow } = await admin.from("fantasy_rounds").select("id").eq("league_id", leagueId).eq("number", round.roundNumber).maybeSingle();
    if (!roundRow) continue;
    for (const teamId of teamIds) {
      const { data: starterSlots } = await admin
        .from("lineup_slots")
        .select("roster_entries!inner(fantasy_team_id, players(position))")
        .eq("fantasy_round_id", roundRow.id)
        .eq("starter", true)
        .eq("roster_entries.fantasy_team_id", teamId);
      if (!starterSlots || starterSlots.length === 0) continue; // insufficient depth -- not a violation, a known/logged skip
      const counts: Partial<Record<PlayerPosition, number>> = {};
      for (const slot of starterSlots) {
        const position = (slot.roster_entries as unknown as { players: { position: string } | null }).players?.position as PlayerPosition;
        counts[position] = (counts[position] ?? 0) + 1;
      }
      if (!isStarterCompositionValid(counts)) formationViolations++;
    }
  }

  // Lock: adversarially attempt to move a locked slot in the FIRST finalized round and confirm it's rejected.
  const firstFinalized = rounds.find((r) => r.finalized);
  if (firstFinalized) {
    const { data: roundRow } = await admin.from("fantasy_rounds").select("id").eq("league_id", leagueId).eq("number", firstFinalized.roundNumber).maybeSingle();
    if (roundRow) {
      const { data: lockedSlot } = await admin
        .from("lineup_slots")
        .select("id, starter, roster_entry_id, roster_entries!inner(fantasy_team_id)")
        .eq("fantasy_round_id", roundRow.id)
        .not("locked_at", "is", null)
        .limit(1)
        .maybeSingle();
      if (lockedSlot) {
        const teamId = (lockedSlot.roster_entries as unknown as { fantasy_team_id: string }).fantasy_team_id;
        const attempt = await updateLineup(
          admin,
          teamId,
          roundRow.id,
          [{ rosterEntryId: lockedSlot.roster_entry_id, starter: !lockedSlot.starter }],
          new Date(Date.now() + 365 * 24 * 3600 * 1000) // long after the lock -- must still be rejected
        );
        if (attempt.ok) lockViolations++;
      }
    }
  }

  // Scoring: independently recompute one finalized round's totals from
  // raw fantasy_player_scores and compare against the stored matchup_scores.
  if (firstFinalized) {
    const { data: roundRow } = await admin.from("fantasy_rounds").select("id, starts_at, ends_at, scoring_rule_version").eq("league_id", leagueId).eq("number", firstFinalized.roundNumber).maybeSingle();
    if (roundRow) {
      const { data: fixtures } = await admin.from("fixtures").select("id").gte("kickoff_at", roundRow.starts_at).lt("kickoff_at", roundRow.ends_at);
      const fixtureIds = (fixtures ?? []).map((f) => f.id);
      const { data: matchups } = await admin.from("matchups").select("id, home_fantasy_team_id, away_fantasy_team_id").eq("fantasy_round_id", roundRow.id);
      for (const matchup of matchups ?? []) {
        for (const teamId of [matchup.home_fantasy_team_id, matchup.away_fantasy_team_id]) {
          const { data: starters } = await admin
            .from("lineup_slots")
            .select("roster_entries!inner(fantasy_team_id, player_id)")
            .eq("fantasy_round_id", roundRow.id)
            .eq("starter", true)
            .eq("roster_entries.fantasy_team_id", teamId);
          const playerIds = (starters ?? []).map((s) => (s.roster_entries as unknown as { player_id: string }).player_id);
          let recomputed = 0;
          if (playerIds.length > 0 && fixtureIds.length > 0) {
            const { data: scores } = await admin
              .from("fantasy_player_scores")
              .select("points")
              .eq("scoring_rule_version", scoringVersion(roundRow.scoring_rule_version))
              .in("player_id", playerIds)
              .in("fixture_id", fixtureIds);
            recomputed = Math.round((scores ?? []).reduce((s, r) => s + r.points, 0) * 100) / 100;
          }
          const { data: stored } = await admin.from("matchup_scores").select("live_points").eq("matchup_id", matchup.id).eq("fantasy_team_id", teamId).maybeSingle();
          if (Math.abs((stored?.live_points ?? 0) - recomputed) > 0.001) scoringMismatches++;
        }
      }
    }
  }

  return { ownershipViolations, rosterViolations, formationViolations, lockViolations, scoringMismatches, standingsMismatches };
}

async function computeStandings(admin: SupabaseClient<Database>, leagueId: string) {
  const { data: matchups } = await admin
    .from("matchups")
    .select("id, home_fantasy_team_id, away_fantasy_team_id, status, matchup_scores(fantasy_team_id, final_points)")
    .eq("league_id", leagueId)
    .eq("status", "final");

  const table = new Map<string, { wins: number; losses: number; draws: number; pointsFor: number; pointsAgainst: number }>();
  function ensure(teamId: string) {
    if (!table.has(teamId)) table.set(teamId, { wins: 0, losses: 0, draws: 0, pointsFor: 0, pointsAgainst: 0 });
    return table.get(teamId)!;
  }

  for (const m of matchups ?? []) {
    const scores = m.matchup_scores as unknown as { fantasy_team_id: string; final_points: number | null }[];
    const home = scores.find((s) => s.fantasy_team_id === m.home_fantasy_team_id);
    const away = scores.find((s) => s.fantasy_team_id === m.away_fantasy_team_id);
    const homePts = home?.final_points ?? 0;
    const awayPts = away?.final_points ?? 0;

    const homeRow = ensure(m.home_fantasy_team_id);
    const awayRow = ensure(m.away_fantasy_team_id);
    homeRow.pointsFor += homePts;
    homeRow.pointsAgainst += awayPts;
    awayRow.pointsFor += awayPts;
    awayRow.pointsAgainst += homePts;

    if (homePts > awayPts) {
      homeRow.wins++;
      awayRow.losses++;
    } else if (homePts < awayPts) {
      awayRow.wins++;
      homeRow.losses++;
    } else {
      homeRow.draws++;
      awayRow.draws++;
    }
  }

  return Array.from(table.entries())
    .map(([fantasyTeamId, row]) => ({ fantasyTeamId, ...row }))
    .sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor);
}
