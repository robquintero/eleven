"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { updateLineup } from "@/lib/fantasy-engine/lineup";
import { ensureFirstRoundOpened } from "@/lib/fantasy-engine/rounds";
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
 * Promotes one or more bench players into empty starting-XI slots in a
 * single all-or-nothing write (Pass 10.5C) — the manual "select an empty
 * pitch slot, pick an eligible bench player" recovery path, for whenever
 * a team has fewer than 11 starters (most notably the all-bench
 * regression this pass also fixes at its root, but this exists as a
 * general safety net regardless of how the shortfall arose). Pure
 * promotions only (no demotions) -- reuses `updateLineup()` exactly like
 * `swapLineupAction`/`changeFormationAction` above, so the SAME
 * "exactly 11, valid formation, no locked slot touched" validation is
 * still authoritative: this can only ever succeed if `fills` brings the
 * team to a complete, legal starting XI. The client is expected to queue
 * fills locally and only call this once that's true (see
 * `team-workspace.tsx`) -- calling it earlier just returns
 * INVALID_FORMATION, never partially applies anything.
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

  const result = await updateLineup(admin, fantasyTeamId, round.id, changes, new Date());
  if (!result.ok) {
    const copy: Record<string, string> = {
      ROUND_NOT_FOUND: "No fantasy round is open yet.",
      SLOT_LOCKED: "That player's match has already started — their lineup slot is locked.",
      INVALID_FORMATION: "That doesn't add up to a complete, legal starting XI yet.",
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
