import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getKickoffsByPlayer } from "./player-fixture-participation.ts";
import { computeLockInstant } from "../../domain/fantasy/lineup-lock.ts";
import { refreshMatchupScores } from "./rounds.ts";
import type { RoundWindow } from "../../domain/fantasy/round-calendar.ts";
import type { Database } from "../supabase/database.types.ts";

/**
 * Pass 14.1: the fantasy round calendar is the source of truth for which
 * eligible football performances count — never "whatever Eleven happened
 * to know at the moment a one-time event (round-opening, a live-sync
 * tick) ran." `createRoundLineupSlots` (lineup.ts) and `refreshMatchupScores`
 * (rounds.ts) already derive `locked_at`/`live_points` correctly FROM
 * CURRENT DATA whenever they run — the gap was that nothing ever re-ran
 * them after new football data arrived. This module is that re-run,
 * scoped to exactly the rounds a changed fixture could affect.
 *
 * Deliberately reuses the existing primitives rather than reimplementing
 * their logic: `getKickoffsByPlayer`/`computeLockInstant` are the EXACT
 * same functions `createRoundLineupSlots` already calls at round-open
 * time (so a reconciled lock and a freshly-opened lock can never
 * disagree), and `refreshMatchupScores` is the EXACT same function
 * `finalizeRoundIfReady` already calls (so a reconciled live_points and a
 * normal progression live_points can never disagree). Nothing here
 * changes V2 scoring, captain rules, or the Tue-Mon calendar.
 */

export interface ReconcileRoundResult {
  roundId: string;
  /** How many lineup_slots rows got an earlier (or newly-known) locked_at this run. 0 on a stable re-run -- see the idempotency tests. */
  locksRepaired: number;
  /** Whether this round was already `completed` when reconciled, in which case `matchup_scores.final_points` was also re-synced to the freshly recomputed `live_points` (the one case live_points alone isn't user-visible). */
  wasCompletedRound: boolean;
}

/**
 * Reconciles ONE fantasy round's locks and scores against current
 * persisted data. Idempotent: running it any number of times with
 * unchanged underlying fixtures/stats/lineup produces identical
 * `locked_at` values, identical `matchup_scores` rows (upserted on their
 * existing natural key, never duplicated), and `locksRepaired: 0` after
 * the first run.
 *
 * LOCKING policy: a slot's `locked_at` is only ever moved EARLIER (or
 * filled in from null) — never later. A later sync with incomplete data
 * (e.g. a fixture that's temporarily disappeared from a provider
 * response) must never relax an already-correct historical lock; see
 * this function's own "never later" check below. Uses
 * `getKickoffsByPlayer` — the same club+national-team-aware, epoch-aware
 * primitive locking has always used — never `player_match_stats` (a
 * zero-minute starter still locks; see CASE F's own test).
 *
 * SCORING policy: `refreshMatchupScores` always recomputes `live_points`
 * from current `fantasy_player_scores`, regardless of round status — it
 * never reopens an already-`final` matchup's status. For a round whose
 * `fantasy_rounds.status` is already `completed`, this function ALSO
 * re-syncs `matchup_scores.final_points` to match — the smallest safe
 * policy that lets a late correction reach an already-closed round's
 * result without reopening the round, re-finalizing it, re-emitting
 * `ROUND_FINALIZED`, or touching season/standings machinery at all.
 *
 * Never creates a new `lineup_slots` row — a roster entry with no slot
 * for this round (signed after the round opened) is unaffected; "the
 * lineup state applicable to that round remains authoritative" (Pass
 * 14.1 brief) means reconciliation repairs existing rows, never
 * fabricates the lineup a manager never actually set.
 */
export async function reconcileFantasyRound(admin: SupabaseClient<Database>, roundId: string): Promise<ReconcileRoundResult | null> {
  const { data: round } = await admin.from("fantasy_rounds").select("id, starts_at, ends_at, status").eq("id", roundId).maybeSingle();
  if (!round) return null;

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

  const wasCompletedRound = round.status === "completed";
  if (wasCompletedRound) {
    const { data: matchups } = await admin.from("matchups").select("id").eq("fantasy_round_id", roundId);
    for (const matchup of matchups ?? []) {
      const { data: scores } = await admin.from("matchup_scores").select("id, live_points, final_points").eq("matchup_id", matchup.id);
      for (const score of scores ?? []) {
        if (score.final_points !== score.live_points) {
          await admin.from("matchup_scores").update({ final_points: score.live_points }).eq("id", score.id);
        }
      }
    }
  }

  return { roundId, locksRepaired, wasCompletedRound };
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
