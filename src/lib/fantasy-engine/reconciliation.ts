import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getKickoffsByPlayer } from "./player-fixture-participation.ts";
import { computeLockInstant } from "../../domain/fantasy/lineup-lock.ts";
import { refreshMatchupScores } from "./rounds.ts";
import type { RoundWindow } from "../../domain/fantasy/round-calendar.ts";
import type { Database } from "../supabase/database.types.ts";

/** Reconcile only unfinished competition. Player analytics may be recomputed
 * independently; settled matchup totals never follow later player valuations. */
export interface ReconcileRoundResult {
  roundId: string;
  /** How many lineup_slots rows got an earlier (or newly-known) locked_at this run. 0 on a stable re-run -- see the idempotency tests. */
  locksRepaired: number;
  /** A completed round was observed and skipped without any writes. */
  wasCompletedRound: boolean;
}

/** Repair locks (earlier only) and scores for unfinished rounds using the
 * same acquisition/starter/fixture rules as normal round processing. */
export async function reconcileFantasyRound(admin: SupabaseClient<Database>, roundId: string): Promise<ReconcileRoundResult | null> {
  const { data: round } = await admin.from("fantasy_rounds").select("id, starts_at, ends_at, status").eq("id", roundId).maybeSingle();
  if (!round) return null;
  if (round.status === "completed") return { roundId, locksRepaired: 0, wasCompletedRound: true };

  const window: RoundWindow = { startsAt: new Date(round.starts_at), endsAt: new Date(round.ends_at) };

  const { data: slots } = await admin
    .from("lineup_slots")
    .select("id, locked_at, roster_entries!inner(player_id)")
    .eq("fantasy_round_id", roundId);

  let locksRepaired = 0;
  if (slots && slots.length > 0) {
    const playerIds = Array.from(new Set(slots.map((s) => (s.roster_entries as unknown as { player_id: string }).player_id)));
    const kickoffsByPlayer = await getKickoffsByPlayer(admin, playerIds, window);

    for (const slot of slots) {
      const playerId = (slot.roster_entries as unknown as { player_id: string }).player_id;
      const derivedLock = computeLockInstant(kickoffsByPlayer.get(playerId) ?? []);
      if (!derivedLock) continue; // no eligible fixture known for this player this round -- nothing to repair

      const currentLockedAt = slot.locked_at ? new Date(slot.locked_at) : null;
      if (currentLockedAt && derivedLock.getTime() >= currentLockedAt.getTime()) continue; // never move later, never rewrite an identical value

      const { error } = await admin.from("lineup_slots").update({ locked_at: derivedLock.toISOString() }).eq("id", slot.id);
      if (!error) locksRepaired += 1;
    }
  }

  await refreshMatchupScores(admin, roundId);

  return { roundId, locksRepaired, wasCompletedRound: false };
}

export interface ReconcileForFixturesResult {
  roundIds: string[];
  rounds: ReconcileRoundResult[];
}

/**
 * Finds every fantasy round (any league) whose Tue-Mon window contains
 * at least one of `fixtureIds`'s real kickoff, and reconciles each —
 * "identify affected fixture/player/round, reconcile only affected
 * fantasy state" (Pass 14.1 brief), never a blind full-league/season
 * scan. Pure database work: two bounded reads (the fixtures themselves,
 * then candidate rounds via an interval-overlap filter) plus whatever
 * `reconcileFantasyRound` itself does — no provider calls, so calling
 * this does not multiply with user/league count the way a provider
 * request would.
 */
export async function reconcileFantasyStateForFixtures(
  admin: SupabaseClient<Database>,
  fixtureIds: string[]
): Promise<ReconcileForFixturesResult> {
  if (fixtureIds.length === 0) return { roundIds: [], rounds: [] };

  const { data: fixtures } = await admin.from("fixtures").select("id, kickoff_at").in("id", fixtureIds);
  if (!fixtures || fixtures.length === 0) return { roundIds: [], rounds: [] };

  const kickoffTimes = fixtures.map((f) => new Date(f.kickoff_at).getTime());
  const minKickoff = new Date(Math.min(...kickoffTimes)).toISOString();
  const maxKickoff = new Date(Math.max(...kickoffTimes)).toISOString();

  // Standard interval-overlap query (candidate rounds whose window could
  // possibly contain ANY of these kickoffs), refined precisely per-fixture
  // in JS below -- a round's own window never changes shape, so this is
  // exact, not an approximation needing a second pass against `fixtures`.
  const { data: candidateRounds } = await admin
    .from("fantasy_rounds")
    .select("id, starts_at, ends_at")
    .neq("status", "completed")
    .lte("starts_at", maxKickoff)
    .gt("ends_at", minKickoff);

  const affectedRoundIds = new Set<string>();
  for (const round of candidateRounds ?? []) {
    const windowStart = new Date(round.starts_at).getTime();
    const windowEnd = new Date(round.ends_at).getTime();
    if (kickoffTimes.some((k) => k >= windowStart && k < windowEnd)) {
      affectedRoundIds.add(round.id);
    }
  }

  const rounds: ReconcileRoundResult[] = [];
  for (const roundId of affectedRoundIds) {
    const result = await reconcileFantasyRound(admin, roundId);
    if (result) rounds.push(result);
  }

  return { roundIds: Array.from(affectedRoundIds), rounds };
}
