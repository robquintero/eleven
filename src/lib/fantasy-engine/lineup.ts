import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeLockInstant, isLocked } from "../../domain/fantasy/lineup-lock.ts";
import { isStarterCompositionValid } from "../../domain/fantasy/constants.ts";
import { chooseAutomaticStartingXi } from "../../domain/fantasy/auto-lineup.ts";
import { getKickoffsByPlayer } from "./player-fixture-participation.ts";
import type { PlayerPosition } from "../../domain/football/types.ts";
import type { RoundWindow } from "../../domain/fantasy/round-calendar.ts";
import type { Database } from "../supabase/database.types.ts";

/**
 * Creates this round's `lineup_slots` for every active roster entry on a
 * team, the moment the round opens (`openNextRound` calls this once per
 * team). Carries forward the PREVIOUS round's starter/bench placement as
 * the new default when one exists (a manager who does nothing keeps last
 * week's lineup, the common real-product convention). For a team's VERY
 * FIRST round (no previous round at all — the moment its draft just
 * completed), `chooseAutomaticStartingXi()` picks a deterministic, valid
 * initial XI instead of benching everyone (Pass 10.5) — a real manager
 * can then rearrange it normally through `updateLineup()`. A roster
 * entry acquired AFTER a team's first round (no prior slot of its own,
 * even though earlier rounds exist) still starts benched, unchanged.
 * `locked_at` is computed and stored immediately — fully deterministic
 * from the round's fixture window, no separate "locking tick" required
 * (see docs/game-rules.md "Player locking").
 */
export async function createRoundLineupSlots(
  admin: SupabaseClient<Database>,
  fantasyTeamId: string,
  newRoundId: string,
  window: RoundWindow,
  previousRoundId: string | null
): Promise<void> {
  const { data: rosterEntries } = await admin
    .from("roster_entries")
    .select("id, player_id, players(club_id, position)")
    .eq("fantasy_team_id", fantasyTeamId)
    .eq("status", "active");

  if (!rosterEntries || rosterEntries.length === 0) return;

  let previousSlotByRosterEntry = new Map<string, { starter: boolean; slot: string }>();
  if (previousRoundId) {
    const { data: previousSlots } = await admin
      .from("lineup_slots")
      .select("roster_entry_id, starter, slot")
      .eq("fantasy_round_id", previousRoundId)
      .in(
        "roster_entry_id",
        rosterEntries.map((r) => r.id)
      );
    previousSlotByRosterEntry = new Map((previousSlots ?? []).map((s) => [s.roster_entry_id, s]));
  }

  let autoInitialStarterIds: Set<string> | null = null;
  if (!previousRoundId) {
    const rosterForAutoLineup = rosterEntries
      .map((entry) => ({
        rosterEntryId: entry.id,
        position: (entry.players as { position: string } | null)?.position as PlayerPosition | undefined,
      }))
      .filter((entry): entry is { rosterEntryId: string; position: PlayerPosition } => Boolean(entry.position));
    const { starters } = chooseAutomaticStartingXi(rosterForAutoLineup);
    autoInitialStarterIds = new Set(starters.map((s) => s.rosterEntryId));
  }

  // Pass 14: every eligible kickoff for this roster's players, club OR
  // national team (see player-fixture-participation.ts) -- a player
  // whose only fixture this round is international used to never lock
  // at all under the old club-id-only query, and one with both a club
  // and an earlier international fixture would lock at the wrong (later,
  // club-only) instant.
  const kickoffsByPlayerId = await getKickoffsByPlayer(
    admin,
    rosterEntries.map((r) => r.player_id),
    window
  );

  const rows = rosterEntries.map((entry) => {
    const player = entry.players as { club_id: string; position: string } | null;
    const previous = previousSlotByRosterEntry.get(entry.id);
    const starter = previousRoundId ? (previous?.starter ?? false) : (autoInitialStarterIds?.has(entry.id) ?? false);
    const slot = starter ? (player?.position ?? "BENCH") : "BENCH";
    const kickoffs = kickoffsByPlayerId.get(entry.player_id) ?? [];
    const lockedAt = computeLockInstant(kickoffs);

    return {
      roster_entry_id: entry.id,
      fantasy_round_id: newRoundId,
      slot,
      starter,
      locked_at: lockedAt ? lockedAt.toISOString() : null,
    };
  });

  const { error } = await admin.from("lineup_slots").upsert(rows, { onConflict: "roster_entry_id,fantasy_round_id" });
  // Pass 10.5C.3: this used to be fire-and-forget -- if the write ever
  // failed for any reason, `openNextRound`'s per-team loop (rounds.ts)
  // would silently move on as if this team's lineup had been initialized,
  // leaving it permanently all-bench with no error anywhere to react to.
  // Throwing surfaces it to the loop's caller instead, where
  // `ensureFirstRoundOpened`'s per-team completeness check can detect and
  // retry it later rather than treating "a round row exists" as proof
  // every team's slots were actually created.
  if (error) throw new Error(`Failed to create lineup_slots for team's roster entries: ${error.message}`);
}

export interface LineupChangeRequest {
  rosterEntryId: string;
  starter: boolean;
  /** Playing slot when `starter` is true (their real position); ignored (always stored as "BENCH") when `starter` is false. */
  position?: PlayerPosition;
}

export type LineupUpdateErrorCode = "ROUND_NOT_FOUND" | "SLOT_LOCKED" | "INVALID_FORMATION" | "ROSTER_ENTRY_NOT_ON_TEAM" | "WRITE_FAILED";

export type LineupUpdateResult = { ok: true } | { ok: false; error: LineupUpdateErrorCode };

/**
 * Pass 14.7 Phase 5: classifies each possible lineup-update failure as
 * either an expected GAME-RULE outcome -- never red/error styling, the
 * engine is working correctly -- or a genuine unexpected ERROR (a real
 * infra/data-sync failure). `ROUND_NOT_FOUND` (no round open yet),
 * `SLOT_LOCKED` (the brief's own named example), and `INVALID_FORMATION`
 * (a roster/formation constraint) are all states a manager can genuinely
 * reach through normal use. `ROSTER_ENTRY_NOT_ON_TEAM` (stale client state
 * referencing a player no longer on this roster) and `WRITE_FAILED` (a
 * real database write failure) are not game rules being enforced -- they
 * mean something actually went wrong. The one stable source of truth for
 * this classification -- callers (team/actions.ts) read it instead of
 * re-deriving "is this message a rule or an error" from free text.
 */
export const LINEUP_ERROR_KIND: Record<LineupUpdateErrorCode, "rule" | "error"> = {
  ROUND_NOT_FOUND: "rule",
  SLOT_LOCKED: "rule",
  INVALID_FORMATION: "rule",
  ROSTER_ENTRY_NOT_ON_TEAM: "error",
  WRITE_FAILED: "error",
};

/**
 * Applies a batch of starter/bench changes to one team's lineup for one
 * round — all-or-nothing: if any changed slot is already locked, or the
 * resulting starter set wouldn't be a valid formation, NOTHING is
 * written (never a partially-applied lineup). `now` is always explicit
 * (docs/game-rules.md "Clock injection").
 */
export async function updateLineup(
  admin: SupabaseClient<Database>,
  fantasyTeamId: string,
  roundId: string,
  changes: LineupChangeRequest[],
  now: Date
): Promise<LineupUpdateResult> {
  const { data: allSlots } = await admin
    .from("lineup_slots")
    .select("id, roster_entry_id, starter, slot, locked_at, roster_entries!inner(fantasy_team_id, player_id, players(position))")
    .eq("fantasy_round_id", roundId)
    .eq("roster_entries.fantasy_team_id", fantasyTeamId);

  if (!allSlots || allSlots.length === 0) {
    return { ok: false, error: "ROUND_NOT_FOUND" };
  }

  const slotByRosterEntryId = new Map(allSlots.map((s) => [s.roster_entry_id, s]));

  for (const change of changes) {
    const existing = slotByRosterEntryId.get(change.rosterEntryId);
    if (!existing) {
      return { ok: false, error: "ROSTER_ENTRY_NOT_ON_TEAM" };
    }
    if (isLocked(existing.locked_at ? new Date(existing.locked_at) : null, now)) {
      return { ok: false, error: "SLOT_LOCKED" };
    }
  }

  const changeByRosterEntryId = new Map(changes.map((c) => [c.rosterEntryId, c]));
  const resultingCounts: Partial<Record<PlayerPosition, number>> = {};
  for (const slot of allSlots) {
    const change = changeByRosterEntryId.get(slot.roster_entry_id);
    const starter = change ? change.starter : slot.starter;
    if (!starter) continue;
    const position = (change?.position ?? (slot.roster_entries as { players: { position: string } | null }).players?.position) as PlayerPosition | undefined;
    if (!position) continue;
    resultingCounts[position] = (resultingCounts[position] ?? 0) + 1;
  }

  if (!isStarterCompositionValid(resultingCounts)) {
    return { ok: false, error: "INVALID_FORMATION" };
  }

  for (const change of changes) {
    const existing = slotByRosterEntryId.get(change.rosterEntryId)!;
    const player = (existing.roster_entries as { players: { position: string } | null }).players;
    const slot = change.starter ? (change.position ?? player?.position ?? "BENCH") : "BENCH";
    const { error } = await admin
      .from("lineup_slots")
      .update({ starter: change.starter, slot })
      .eq("id", existing.id);
    // Pass 10.5C.5: this used to be fire-and-forget. A missing base-table
    // GRANT (not just the RLS policy -- Postgres requires both) made every
    // authenticated-client write silently fail with "permission denied"
    // while this function kept returning { ok: true } regardless, which is
    // exactly how a starter/bench swap could appear to succeed in the UI
    // (no error shown, loading state clears) while nothing was ever
    // persisted. Surfacing the error here means that class of failure can
    // never be silent again, whatever its cause.
    if (error) return { ok: false, error: "WRITE_FAILED" };
  }

  return { ok: true };
}
