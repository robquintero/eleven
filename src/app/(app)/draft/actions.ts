"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { ensureFirstRoundOpened } from "@/lib/fantasy-engine/rounds";
import { toDraftActionError } from "@/lib/errors/draft-action-error";
import { DRAFT_ACTION_ERROR_COPY } from "@/lib/errors/draft-action-error-copy";
import { getPlayerDatabase, type PlayerDatabasePage } from "@/data-access/players";
import type { PlayerPosition } from "@/lib/types/fantasy";

export type DraftActionState = { error?: string } | undefined;

/**
 * Both pick-submitting actions here call SECURITY DEFINER RPCs
 * (supabase/migrations/20260930024807_draft_engine.sql) via the normal
 * RLS-respecting request client for the pick itself — no admin client
 * needed there; each RPC resolves `auth.uid()` and re-validates
 * authorization itself, the client never gets to claim whose turn it is
 * or that a player is free.
 *
 * `maybeOpenFirstRound` (Pass 10.5) is the one place this file needs the
 * ADMIN client: the moment a draft completes, Eleven opens the league's
 * first fantasy round immediately (rather than leaving every roster
 * bench-only until some later manual/scheduled trigger) so a manager's
 * automatically-initialized starting XI (see
 * `src/lib/fantasy-engine/lineup.ts`'s `createRoundLineupSlots`) is
 * visible right away. `openNextRound`/`fantasy_rounds`/`lineup_slots`
 * writes have no `authenticated` INSERT/UPDATE policy by design — same
 * "trusted server code only" convention as `src/app/(app)/team/actions.ts`'s
 * existing exemption for this same privileged-write reason, which this
 * file now joins.
 */
async function maybeOpenFirstRound(draftId: string): Promise<void> {
  if (!isSupabaseAdminConfigured()) return;
  const admin = createAdminClient();

  const { data: draft } = await admin.from("drafts").select("league_id").eq("id", draftId).maybeSingle();
  if (!draft) return;

  // Best-effort from here (Pass 10.5C): `ensureFirstRoundOpened` itself
  // never throws -- it logs and returns. This used to be the ONLY attempt
  // at opening round 1, with no way to recover if it silently failed; the
  // exact same check now also runs from the Team page's own read path, so
  // a transient failure here self-heals the next time anyone looks at
  // their squad instead of leaving it permanently bench-only.
  await ensureFirstRoundOpened(admin, draft.league_id);
}

export async function startDraftAction(leagueId: string): Promise<DraftActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("start_draft", { p_league_id: leagueId });
  if (error) {
    const code = toDraftActionError(error.message).code;
    return { error: DRAFT_ACTION_ERROR_COPY[code] };
  }
  revalidatePath("/draft");
  revalidatePath("/league");
  revalidatePath("/home");
  return undefined;
}

export async function submitDraftPickAction(draftId: string, playerId: string): Promise<DraftActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("make_draft_pick", { p_draft_id: draftId, p_player_id: playerId });
  if (error) {
    const code = toDraftActionError(error.message).code;
    return { error: DRAFT_ACTION_ERROR_COPY[code] };
  }
  await maybeOpenFirstRound(draftId);
  revalidatePath("/draft");
  revalidatePath("/team");
  return undefined;
}

/**
 * Powers the Draft workspace's live player search — real, server-side
 * filtered/paginated players in this specific league (never a full fetch
 * filtered in the browser, same convention as the Players workspace).
 *
 * Pass 10.5C: deliberately does NOT filter by `ownership: "free"` anymore
 * -- a drafted player must stay visible on the board (for draft
 * context/history) rather than silently vanishing from whatever page the
 * manager was looking at, so `activeLeagueId` alone is passed, which
 * annotates every returned player's real `ownership` ("mine"/"owned"/
 * "free") without excluding any of them. `draft-workspace.tsx` renders
 * anything not "free" as dimmed/crossed-out and non-interactive -- the
 * `make_draft_pick` RPC's own `league_player_ownership` check remains the
 * actual authority either way, this is purely presentational.
 */
export async function getAvailablePlayersAction(
  leagueId: string,
  query: string,
  position?: PlayerPosition
): Promise<PlayerDatabasePage> {
  return getPlayerDatabase({ activeLeagueId: leagueId, query, position, pageSize: 30 });
}

/**
 * Safe to call speculatively whenever the client believes the pick timer
 * has expired — the RPC's own persisted-deadline check is authoritative
 * and simply no-ops (TIMER_NOT_EXPIRED) if it's wrong. Never a client-side
 * countdown deciding to advance the draft on its own.
 */
export async function resolveExpiredPickAction(draftId: string): Promise<DraftActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_expired_pick", { p_draft_id: draftId });
  if (error && error.message !== "TIMER_NOT_EXPIRED") {
    const code = toDraftActionError(error.message).code;
    return { error: DRAFT_ACTION_ERROR_COPY[code] };
  }
  if (!error) {
    await maybeOpenFirstRound(draftId);
    revalidatePath("/draft");
    revalidatePath("/team");
  }
  return undefined;
}
