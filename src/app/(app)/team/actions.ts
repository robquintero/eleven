"use server";

// Manager swaps/fills use createClient() and update_team_lineup, whose
// SECURITY DEFINER boundary validates membership, current ownership,
// latest round, locks and formation. Managers have no direct lineup DML.
// ensureFirstRoundOpenedAction still uses the privileged admin client: opening a
// round initializes EVERY team's slots, a trusted lifecycle operation.
//
// Pass 10.5C.5: Eleven V1 is 4-4-2 only -- `changeFormationAction` was
// removed along with the rest of the formation-selection feature (see
// src/domain/fantasy/constants.ts's `FORMATION_RULES`, now fixed to
// exactly 1 GK / 4 DEF / 4 MID / 2 FWD).

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { LINEUP_ERROR_KIND, updateLineup } from "@/lib/fantasy-engine/lineup";
import { ensureFirstRoundOpened } from "@/lib/fantasy-engine/rounds";
import type { PlayerPosition } from "@/lib/types/fantasy";

/**
 * Pass 14.7 Phase 5: `kind` is set from `LINEUP_ERROR_KIND` (a stable code
 * classification, never inferred from the message text) wherever the
 * failure traces back to a real `LineupUpdateErrorCode` — the few
 * earlier-stage checks below that short-circuit before even calling
 * `updateLineup` (auth/ownership/stale-roster-reference) are classified
 * the same way those same codes would be (`ROUND_NOT_FOUND`/
 * `ROSTER_ENTRY_NOT_ON_TEAM`-equivalent), kept inline since they're not
 * routed through `updateLineup` itself.
 */
export type LineupActionState = { error: string; kind: "rule" | "error" } | undefined;

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
 * request client throughout — no service-role client involved. The
 * atomic `update_team_lineup` RPC independently checks team ownership
 * and league membership, then validates locks and formation against
 * locked database state before writing the entire batch.
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
  if (!user) return { error: "Sign in to do that.", kind: "error" };

  const { data: team } = await supabase
    .from("fantasy_teams")
    .select("id")
    .eq("id", fantasyTeamId)
    .eq("league_id", leagueId)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!team) return { error: "You don't own this team.", kind: "error" };

  const [{ data: round }, { data: rosterEntries }] = await Promise.all([
    supabase
    .from("fantasy_rounds")
    .select("id")
    .eq("league_id", leagueId)
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle(),
    supabase
    .from("roster_entries")
    .select("id, player_id, players(position)")
    .eq("fantasy_team_id", fantasyTeamId)
    .eq("status", "active")
    .in("player_id", [starterPlayerIdOut, benchPlayerIdIn]),
  ]);
  if (!round) return { error: "No fantasy round is open yet.", kind: LINEUP_ERROR_KIND.ROUND_NOT_FOUND };

  const outEntry = rosterEntries?.find((r) => r.player_id === starterPlayerIdOut);
  const inEntry = rosterEntries?.find((r) => r.player_id === benchPlayerIdIn);
  if (!outEntry || !inEntry) return { error: "Player not found on this roster.", kind: LINEUP_ERROR_KIND.ROSTER_ENTRY_NOT_ON_TEAM };

  const inPosition = (inEntry.players as { position: string } | null)?.position;
  if (!inPosition) return { error: "Player not found on this roster.", kind: LINEUP_ERROR_KIND.ROSTER_ENTRY_NOT_ON_TEAM };

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
    return { error: copy[result.error] ?? "Couldn't update your lineup.", kind: LINEUP_ERROR_KIND[result.error] ?? "error" };
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
 * independently authorized RPC path as `swapLineupAction` above —
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
  if (!user) return { error: "Sign in to do that.", kind: "error" };

  const { data: team } = await supabase
    .from("fantasy_teams")
    .select("id")
    .eq("id", fantasyTeamId)
    .eq("league_id", leagueId)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!team) return { error: "You don't own this team.", kind: "error" };

  const { data: round } = await supabase
    .from("fantasy_rounds")
    .select("id")
    .eq("league_id", leagueId)
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!round) return { error: "No fantasy round is open yet.", kind: LINEUP_ERROR_KIND.ROUND_NOT_FOUND };

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
    if (!entry) return { error: "Player not found on this roster.", kind: LINEUP_ERROR_KIND.ROSTER_ENTRY_NOT_ON_TEAM };
    const actualPosition = (entry.players as { position: string } | null)?.position;
    if (actualPosition !== fill.position) return { error: "That player doesn't play that position.", kind: LINEUP_ERROR_KIND.INVALID_FORMATION };
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
    return { error: copy[result.error] ?? "Couldn't update your lineup.", kind: LINEUP_ERROR_KIND[result.error] ?? "error" };
  }

  revalidatePath("/team");
  return undefined;
}
