"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { updateLineup } from "@/lib/fantasy-engine/lineup";
import { isLocked } from "@/domain/fantasy/lineup-lock";
import {
  canRosterSupplyFormation,
  computeFormationChange,
  type FormationName,
  type FormationRosterPlayer,
} from "@/domain/fantasy/formations";
import type { RosterCounts } from "@/domain/fantasy/roster-rules";
import type { PlayerPosition } from "@/lib/types/fantasy";

export type LineupActionState = { error?: string } | undefined;

/**
 * Swaps one starter for one bench player, matching the existing
 * `swapPlayers` view-model semantics (src/lib/selectors/lineup.ts) but
 * actually persisted. Uses the service-role client for the write itself
 * (no `authenticated` INSERT/UPDATE policy exists on `lineup_slots` — see
 * supabase/migrations/20260929141143_rls.sql's own stated convention:
 * privileged writes go through trusted server code, not client RLS), but
 * FIRST independently verifies via the caller's own real session that
 * they actually own `fantasyTeamId` in `leagueId` — never trusts the
 * client's claim. `updateLineup()` itself re-validates lock state and
 * formation validity all-or-nothing.
 */
export async function swapLineupAction(
  leagueId: string,
  fantasyTeamId: string,
  starterPlayerIdOut: string,
  benchPlayerIdIn: string
): Promise<LineupActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to do that." };

  const { data: team } = await supabase
    .from("fantasy_teams")
    .select("id")
    .eq("id", fantasyTeamId)
    .eq("league_id", leagueId)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!team) return { error: "You don't own this team." };

  if (!isSupabaseAdminConfigured()) return { error: "Lineup editing isn't configured." };
  const admin = createAdminClient();

  const { data: round } = await admin
    .from("fantasy_rounds")
    .select("id")
    .eq("league_id", leagueId)
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!round) return { error: "No fantasy round is open yet." };

  const { data: rosterEntries } = await admin
    .from("roster_entries")
    .select("id, player_id, players(position)")
    .eq("fantasy_team_id", fantasyTeamId)
    .eq("status", "active")
    .in("player_id", [starterPlayerIdOut, benchPlayerIdIn]);

  const outEntry = rosterEntries?.find((r) => r.player_id === starterPlayerIdOut);
  const inEntry = rosterEntries?.find((r) => r.player_id === benchPlayerIdIn);
  if (!outEntry || !inEntry) return { error: "Player not found on this roster." };

  const inPosition = (inEntry.players as { position: string } | null)?.position;
  if (!inPosition) return { error: "Player not found on this roster." };

  const result = await updateLineup(
    admin,
    fantasyTeamId,
    round.id,
    [
      { rosterEntryId: outEntry.id, starter: false },
      { rosterEntryId: inEntry.id, starter: true, position: inPosition as "GK" | "DEF" | "MID" | "FWD" },
    ],
    new Date()
  );

  if (!result.ok) {
    const copy: Record<string, string> = {
      ROUND_NOT_FOUND: "No fantasy round is open yet.",
      SLOT_LOCKED: "That player's match has already started — their lineup slot is locked.",
      INVALID_FORMATION: "That swap would leave an invalid formation.",
      ROSTER_ENTRY_NOT_ON_TEAM: "Player not found on this roster.",
    };
    return { error: copy[result.error] ?? "Couldn't update your lineup." };
  }

  revalidatePath("/team");
  return undefined;
}

/**
 * Server-authoritative formation change (Pass 10.5B) — never client-only
 * visual state. Re-derives the roster's real position counts and current
 * starter/lock state fresh from the database (never trusts anything the
 * client claims about its own roster), computes the deterministic diff via
 * `computeFormationChange` (see its own doc comment: preserves existing
 * starters where possible, promotes from bench, demotes surplus, never
 * touches a locked player), then persists it through the SAME
 * `updateLineup()` all-or-nothing primitive `swapLineupAction` above uses
 * — no new write path, no new lock-checking logic.
 */
export async function changeFormationAction(
  leagueId: string,
  fantasyTeamId: string,
  formation: FormationName
): Promise<LineupActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to do that." };

  const { data: team } = await supabase
    .from("fantasy_teams")
    .select("id")
    .eq("id", fantasyTeamId)
    .eq("league_id", leagueId)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!team) return { error: "You don't own this team." };

  if (!isSupabaseAdminConfigured()) return { error: "Lineup editing isn't configured." };
  const admin = createAdminClient();

  const { data: round } = await admin
    .from("fantasy_rounds")
    .select("id")
    .eq("league_id", leagueId)
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!round) return { error: "No fantasy round is open yet." };

  const { data: rosterEntries } = await admin
    .from("roster_entries")
    .select("id, players(name, position)")
    .eq("fantasy_team_id", fantasyTeamId)
    .eq("status", "active");
  if (!rosterEntries || rosterEntries.length === 0) return { error: "No roster found." };

  const { data: slots } = await admin
    .from("lineup_slots")
    .select("roster_entry_id, starter, locked_at")
    .eq("fantasy_round_id", round.id)
    .in(
      "roster_entry_id",
      rosterEntries.map((r) => r.id)
    );
  const slotByRosterEntryId = new Map((slots ?? []).map((s) => [s.roster_entry_id, s]));
  const now = new Date();

  // Stable (name-sorted) order within each position, matching
  // computeFormationChange's own documented determinism requirement.
  const sorted = [...rosterEntries].sort((a, b) => {
    const nameA = (a.players as { name: string } | null)?.name ?? "";
    const nameB = (b.players as { name: string } | null)?.name ?? "";
    return nameA.localeCompare(nameB);
  });

  const rosterForFormation: FormationRosterPlayer[] = sorted.map((entry) => {
    const player = entry.players as { position: string } | null;
    const slot = slotByRosterEntryId.get(entry.id);
    return {
      rosterEntryId: entry.id,
      position: player?.position as PlayerPosition,
      isStarter: slot?.starter ?? false,
      locked: isLocked(slot?.locked_at ? new Date(slot.locked_at) : null, now),
    };
  });

  const rosterCounts: RosterCounts = {};
  for (const p of rosterForFormation) rosterCounts[p.position] = (rosterCounts[p.position] ?? 0) + 1;
  if (!canRosterSupplyFormation(rosterCounts, formation)) {
    return { error: "Your current roster can't supply that formation." };
  }

  const changeResult = computeFormationChange(rosterForFormation, formation);
  if (!changeResult.ok) {
    return {
      error:
        changeResult.error === "LOCKED_PLAYER_CONFLICT"
          ? "A locked player's match has already started — that formation can't be applied right now."
          : "Your current roster can't supply that formation.",
    };
  }
  if (changeResult.changes.length === 0) {
    return undefined;
  }

  const result = await updateLineup(admin, fantasyTeamId, round.id, changeResult.changes, now);
  if (!result.ok) {
    const copy: Record<string, string> = {
      ROUND_NOT_FOUND: "No fantasy round is open yet.",
      SLOT_LOCKED: "That player's match has already started — their lineup slot is locked.",
      INVALID_FORMATION: "That formation isn't valid for your roster.",
      ROSTER_ENTRY_NOT_ON_TEAM: "Player not found on this roster.",
    };
    return { error: copy[result.error] ?? "Couldn't change formation." };
  }

  revalidatePath("/team");
  return undefined;
}
