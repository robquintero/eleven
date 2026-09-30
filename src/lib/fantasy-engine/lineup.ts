import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeLockInstant, isLocked } from "../../domain/fantasy/lineup-lock.ts";
import { isStarterCompositionValid } from "../../domain/fantasy/constants.ts";
import type { PlayerPosition } from "../../domain/football/types.ts";
import type { RoundWindow } from "../../domain/fantasy/round-calendar.ts";
import type { Database } from "../supabase/database.types.ts";

/**
 * Creates this round's `lineup_slots` for every active roster entry on a
 * team, the moment the round opens (`openNextRound` calls this once per
 * team). Carries forward the PREVIOUS round's starter/bench placement as
 * the new default when one exists (a manager who does nothing keeps last
 * week's lineup, the common real-product convention) — otherwise every
 * player starts benched (round 1, or a roster entry acquired since the
 * last round). `locked_at` is computed and stored immediately — fully
 * deterministic from the round's fixture window, no separate "locking
 * tick" required (see docs/game-rules.md "Player locking").
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

  const clubIds = Array.from(new Set(rosterEntries.map((r) => (r.players as { club_id: string } | null)?.club_id).filter((id): id is string => Boolean(id))));
  const { data: clubFixtures } = await admin
    .from("fixtures")
    .select("home_club_id, away_club_id, kickoff_at")
    .gte("kickoff_at", window.startsAt.toISOString())
    .lt("kickoff_at", window.endsAt.toISOString())
    .or(`home_club_id.in.(${clubIds.join(",")}),away_club_id.in.(${clubIds.join(",")})`);

  const kickoffsByClubId = new Map<string, Date[]>();
  for (const fixture of clubFixtures ?? []) {
    for (const clubId of [fixture.home_club_id, fixture.away_club_id]) {
      if (!clubIds.includes(clubId)) continue;
      const list = kickoffsByClubId.get(clubId) ?? [];
      list.push(new Date(fixture.kickoff_at));
      kickoffsByClubId.set(clubId, list);
    }
  }

  const rows = rosterEntries.map((entry) => {
    const player = entry.players as { club_id: string; position: string } | null;
    const previous = previousSlotByRosterEntry.get(entry.id);
    const starter = previous?.starter ?? false;
    const slot = starter ? (player?.position ?? "BENCH") : "BENCH";
    const kickoffs = player ? (kickoffsByClubId.get(player.club_id) ?? []) : [];
    const lockedAt = computeLockInstant(kickoffs);

    return {
      roster_entry_id: entry.id,
      fantasy_round_id: newRoundId,
      slot,
      starter,
      locked_at: lockedAt ? lockedAt.toISOString() : null,
    };
  });

  await admin.from("lineup_slots").upsert(rows, { onConflict: "roster_entry_id,fantasy_round_id" });
}

export interface LineupChangeRequest {
  rosterEntryId: string;
  starter: boolean;
  /** Playing slot when `starter` is true (their real position); ignored (always stored as "BENCH") when `starter` is false. */
  position?: PlayerPosition;
}

export type LineupUpdateResult =
  | { ok: true }
  | { ok: false; error: "ROUND_NOT_FOUND" | "SLOT_LOCKED" | "INVALID_FORMATION" | "ROSTER_ENTRY_NOT_ON_TEAM" };

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
    await admin
      .from("lineup_slots")
      .update({ starter: change.starter, slot })
      .eq("id", existing.id);
  }

  return { ok: true };
}
