"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { toDraftActionError } from "@/lib/errors/draft-action-error";
import { DRAFT_ACTION_ERROR_COPY } from "@/lib/errors/draft-action-error-copy";
import { getPlayerDatabase, type PlayerDatabasePage } from "@/data-access/players";

export type DraftActionState = { error?: string } | undefined;

/**
 * Both actions here call SECURITY DEFINER RPCs
 * (supabase/migrations/20260930024807_draft_engine.sql) via the normal
 * RLS-respecting request client — no admin client needed. Each RPC
 * resolves `auth.uid()` and re-validates authorization itself; the client
 * never gets to claim whose turn it is or that a player is free.
 */

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
  revalidatePath("/draft");
  return undefined;
}

/**
 * Powers the Draft workspace's live player search — real, server-side
 * filtered/paginated free-agent players in this specific league (never a
 * full fetch filtered in the browser, same convention as the Players
 * workspace). `ownership: "free"` + `activeLeagueId` together are exactly
 * "unowned in this league" — the same real `league_player_ownership`
 * check the draft's own `make_draft_pick` RPC enforces server-side.
 */
export async function getAvailablePlayersAction(leagueId: string, query: string): Promise<PlayerDatabasePage> {
  return getPlayerDatabase({ activeLeagueId: leagueId, ownership: "free", query, pageSize: 30 });
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
  if (!error) revalidatePath("/draft");
  return undefined;
}
