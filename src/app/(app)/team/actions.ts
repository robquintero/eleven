"use server";

// Pass 10.5C.2A: swapLineupAction/fillEmptySlotsAction below write through
// the request-scoped, RLS-respecting `createClient()` -- see each
// function's own doc comment and
// supabase/migrations/20260930050000_lineup_slots_owner_write_policy.sql
// (and 20260930060000_grant_lineup_slots_update.sql's own comment on the
// base GRANT that policy also needed). Only `ensureFirstRoundOpenedAction`
// below still needs the privileged admin client: opening a round writes
// EVERY team's `lineup_slots` in the league at once (see
// `createRoundLineupSlots`), not just the caller's own team, so no single
// manager's row-ownership -- and no per-row RLS update policy -- could
// ever cover it.
//
// Pass 10.5C.5: Eleven V1 is 4-4-2 only -- `changeFormationAction` was
// removed along with the rest of the formation-selection feature (see
// src/domain/fantasy/constants.ts's `FORMATION_RULES`, now fixed to
// exactly 1 GK / 4 DEF / 4 MID / 2 FWD).

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { updateLineup } from "@/lib/fantasy-engine/lineup";
import { ensureFirstRoundOpened } from "@/lib/fantasy-engine/rounds";
import type { PlayerPosition } from "@/lib/types/fantasy";

export type LineupActionState = { error?: string } | undefined;

/**
 * Self-healing safety net (Pass 10.5C), called from the Team page's own
 * Server Component render before it reads the squad -- fixes the
 * "all 16 players stuck on the bench" regression where a completed
 * draft's round-1-with-auto-XI never got created because the ONLY
 * attempt (a best-effort side effect of the pick that completed the
 * draft, in `src/app/(app)/draft/actions.ts`) silently failed and nothing
 * ever retried it. `ensureFirstRoundOpened` itself is a cheap no-op in
 * the overwhelmingly common case (a round already exists, or the draft
 * isn't complete yet) -- see its own doc comment
 * (`src/lib/fantasy-engine/rounds.ts`). No caller-supplied data is
 * trusted for the write itself; this only ever acts on what's already
 * true in the database for `leagueId`.
 */
export async function ensureFirstRoundOpenedAction(leagueId: string): Promise<void> {
  if (!isSupabaseAdminConfigured()) return;
  const admin = createAdminClient();
  await ensureFirstRoundOpened(admin, leagueId);
}

/**
 * Swaps one starter for one bench player, matching the existing
 * `swapPlayers` view-model semantics (src/lib/selectors/lineup.ts) but
 * actually persisted. This is an ordinary authenticated manager operation
 * on their OWN team, so it writes through the request-scoped,
 * RLS-respecting client throughout — no service-role client involved.
 * `lineup_slots` has a real ownership-scoped UPDATE policy for this (see
 * supabase/migrations/20260930050000_lineup_slots_owner_write_policy.sql,
 * mirroring `fantasy_teams`'s own "owners can update their own team"
 * policy), so the database itself enforces "a manager can only touch
 * their own team's lineup" as a second line of defense behind the
 * explicit ownership check below. `updateLineup()` itself re-validates
 * lock state and formation validity all-or-nothing.
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

  const { data: round } = await supabase
    .from("fantasy_rounds")
    .select("id")
    .eq("league_id", leagueId)
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!round) return { error: "No fantasy round is open yet." };

  const { data: rosterEntries } = await supabase
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
    supabase,
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
      WRITE_FAILED: "Couldn't save your lineup — please try again.",
    };
    return { error: copy[result.error] ?? "Couldn't update your lineup." };
  }

  revalidatePath("/team");
  return undefined;
}

/**
 * Promotes one or more bench players into empty starting-XI slots in a
 * single all-or-nothing write (Pass 10.5C) — the manual "select an empty
 * pitch slot, pick an eligible bench player" recovery path, for whenever
 * a team has fewer than 11 starters (most notably the all-bench
 * regression this pass also fixes at its root, but this exists as a
 * general safety net regardless of how the shortfall arose). Pure
 * promotions only (no demotions) -- reuses `updateLineup()` exactly like
 * `swapLineupAction` above, so the SAME
 * "exactly 11, valid formation, no locked slot touched" validation is
 * still authoritative: this can only ever succeed if `fills` brings the
 * team to a complete, legal starting XI. The client is expected to queue
 * fills locally and only call this once that's true (see
 * `team-workspace.tsx`) -- calling it earlier just returns
 * INVALID_FORMATION, never partially applies anything. Same authenticated,
 * RLS-respecting write path as `swapLineupAction` above (Pass 10.5C.2A) —
 * no service-role client involved.
 */
export async function fillEmptySlotsAction(
  leagueId: string,
  fantasyTeamId: string,
  fills: { playerId: string; position: PlayerPosition }[]
): Promise<LineupActionState> {
  if (fills.length === 0) return undefined;

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

  const { data: round } = await supabase
    .from("fantasy_rounds")
    .select("id")
    .eq("league_id", leagueId)
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!round) return { error: "No fantasy round is open yet." };

  const { data: rosterEntries } = await supabase
    .from("roster_entries")
    .select("id, player_id, players(position)")
    .eq("fantasy_team_id", fantasyTeamId)
    .eq("status", "active")
    .in(
      "player_id",
      fills.map((f) => f.playerId)
    );

  const entryByPlayerId = new Map((rosterEntries ?? []).map((r) => [r.player_id, r]));
  const changes = [];
  for (const fill of fills) {
    const entry = entryByPlayerId.get(fill.playerId);
    if (!entry) return { error: "Player not found on this roster." };
    const actualPosition = (entry.players as { position: string } | null)?.position;
    if (actualPosition !== fill.position) return { error: "That player doesn't play that position." };
    changes.push({ rosterEntryId: entry.id, starter: true, position: fill.position });
  }

  const result = await updateLineup(supabase, fantasyTeamId, round.id, changes, new Date());
  if (!result.ok) {
    const copy: Record<string, string> = {
      ROUND_NOT_FOUND: "No fantasy round is open yet.",
      SLOT_LOCKED: "That player's match has already started — their lineup slot is locked.",
      INVALID_FORMATION: "That doesn't add up to a complete, legal starting XI yet.",
      ROSTER_ENTRY_NOT_ON_TEAM: "Player not found on this roster.",
      WRITE_FAILED: "Couldn't save your lineup — please try again.",
    };
    return { error: copy[result.error] ?? "Couldn't update your lineup." };
  }

  revalidatePath("/team");
  return undefined;
}
