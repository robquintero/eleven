"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { updateLineup } from "@/lib/fantasy-engine/lineup";

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
