import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeLockInstant } from "../../domain/fantasy/lineup-lock.ts";
import { chooseAutomaticStartingXi, planPartialLineupProvisioning } from "../../domain/fantasy/auto-lineup.ts";
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
    .select("id, player_id, players(club_id, canonical_position)")
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
        position: (entry.players as { canonical_position: string } | null)?.canonical_position as PlayerPosition | undefined,
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
    const player = entry.players as { club_id: string; canonical_position: string } | null;
    const previous = previousSlotByRosterEntry.get(entry.id);
    const starter = previousRoundId ? (previous?.starter ?? false) : (autoInitialStarterIds?.has(entry.id) ?? false);
    const slot = starter ? (player?.canonical_position ?? "BENCH") : "BENCH";
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

export type ProvisionResult =
  | { status: "already_complete" }
  | { status: "provisioned"; createdCount: number }
  | { status: "exception"; reason: string };

/**
 * Autonomous stabilization pass, Phase C: the general-purpose repair for
 * a team's CURRENT round whose `lineup_slots` are missing for SOME or
 * ALL of its active roster entries — the gap `createRoundLineupSlots`
 * itself cannot safely close on a retry (it always recomputes the WHOLE
 * team via `chooseAutomaticStartingXi` and upserts every row, which would
 * silently overwrite a slot a manager already set deliberately) and the
 * old `repairIncompleteRoundOne` could not either (it only ever touched
 * a team with literally ZERO existing slots, skipping any team with even
 * one — which was the actual bug: a team with 1 real slot and 15 missing
 * ones stayed 15-short forever, see docs/audits/ and the handoff doc for
 * the concrete "5 Men of Class" incident this fixes).
 *
 * Every EXISTING slot (whatever it is — a manager's deliberate choice, or
 * a prior partial auto-init attempt) is preserved byte-for-byte; this
 * function only ever INSERTs rows for roster entries that have NO slot
 * at all for this round, and only once it has verified a complete, valid
 * formation is actually reachable from what's missing. Never upserts,
 * never touches an existing row.
 *
 * Because Eleven's formation is a fixed point (min === max per position,
 * see `FORMATION_RULES`), "how many more of each position are needed" is
 * fully determined by what's already a starter — there is no "fill extra
 * capacity" ambiguity the way `chooseAutomaticStartingXi` has to handle
 * for a from-scratch roster.
 */
export async function provisionMissingLineupSlots(
  admin: SupabaseClient<Database>,
  fantasyTeamId: string,
  roundId: string,
  window: RoundWindow
): Promise<ProvisionResult> {
  const { data: rosterEntries, error: rosterError } = await admin
    .from("roster_entries")
    .select("id, player_id, players(club_id, canonical_position)")
    .eq("fantasy_team_id", fantasyTeamId)
    .eq("status", "active");
  if (rosterError) return { status: "exception", reason: `Could not load roster: ${rosterError.message}` };
  if (!rosterEntries || rosterEntries.length === 0) return { status: "already_complete" };

  const { data: existingSlots, error: slotsError } = await admin
    .from("lineup_slots")
    .select("roster_entry_id, starter")
    .eq("fantasy_round_id", roundId)
    .in("roster_entry_id", rosterEntries.map((r) => r.id));
  if (slotsError) return { status: "exception", reason: `Could not load existing lineup_slots: ${slotsError.message}` };

  const existingByEntry = new Map((existingSlots ?? []).map((s) => [s.roster_entry_id, s]));
  const missingEntries = rosterEntries.filter((r) => !existingByEntry.has(r.id));
  if (missingEntries.length === 0) return { status: "already_complete" };

  const existingStarterPositions: PlayerPosition[] = [];
  for (const entry of rosterEntries) {
    const existing = existingByEntry.get(entry.id);
    if (!existing?.starter) continue;
    const position = (entry.players as { canonical_position: string } | null)?.canonical_position as PlayerPosition | undefined;
    if (position) existingStarterPositions.push(position);
  }

  const missingRosterPlayers = missingEntries
    .map((entry) => ({
      rosterEntryId: entry.id,
      position: (entry.players as { canonical_position: string } | null)?.canonical_position as PlayerPosition | undefined,
    }))
    .filter((entry): entry is { rosterEntryId: string; position: PlayerPosition } => Boolean(entry.position));

  const plan = planPartialLineupProvisioning(missingRosterPlayers, existingStarterPositions);
  if (!plan.ok) return { status: "exception", reason: plan.reason };
  const newStarterIds = plan.newStarterIds;

  const kickoffsByPlayerId = await getKickoffsByPlayer(admin, missingEntries.map((r) => r.player_id), window);

  const rows = missingEntries.map((entry) => {
    const player = entry.players as { club_id: string; canonical_position: string } | null;
    const starter = newStarterIds.has(entry.id);
    const slot = starter ? (player?.canonical_position ?? "BENCH") : "BENCH";
    const kickoffs = kickoffsByPlayerId.get(entry.player_id) ?? [];
    const lockedAt = computeLockInstant(kickoffs);
    return {
      roster_entry_id: entry.id,
      fantasy_round_id: roundId,
      slot,
      starter,
      locked_at: lockedAt ? lockedAt.toISOString() : null,
    };
  });

  // Insert-only (never upsert) -- an existing row for any of these
  // roster entries would mean a race inserted it between the read above
  // and here; `on conflict do nothing` makes that safely idempotent
  // rather than erroring the whole batch or overwriting that row.
  const { error: insertError } = await admin.from("lineup_slots").upsert(rows, { onConflict: "roster_entry_id,fantasy_round_id", ignoreDuplicates: true });
  if (insertError) return { status: "exception", reason: `Write failed: ${insertError.message}` };

  return { status: "provisioned", createdCount: rows.length };
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
 * written (never a partially-applied lineup). Trusted service-role
 * simulations use explicit `now`; managers use the authoritative DB clock.
 */
export async function updateLineup(
  admin: SupabaseClient<Database>,
  fantasyTeamId: string,
  roundId: string,
  changes: LineupChangeRequest[],
  now: Date
): Promise<LineupUpdateResult> {
  // One RPC = one database transaction. Validation and all writes execute
  // against locked server state, including when called by a direct client.
  try {
    const { error } = await admin.rpc("update_team_lineup", {
      p_fantasy_team_id: fantasyTeamId,
      p_round_id: roundId,
      p_changes: changes.map((change) => ({
        roster_entry_id: change.rosterEntryId,
        starter: change.starter,
        position: change.position ?? null,
      })),
      p_now: now.toISOString(),
    });
    if (!error) return { ok: true };
    const code = error.message as LineupUpdateErrorCode;
    return { ok: false, error: Object.hasOwn(LINEUP_ERROR_KIND, code) ? code : "WRITE_FAILED" };
  } catch {
    return { ok: false, error: "WRITE_FAILED" };
  }
}
