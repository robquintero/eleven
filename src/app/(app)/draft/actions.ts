"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { openNextRound } from "@/lib/fantasy-engine/rounds";
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

  const { data: draft } = await admin.from("drafts").select("league_id, status").eq("id", draftId).maybeSingle();
  if (!draft || draft.status !== "completed") return;

  const { data: existingRound } = await admin
    .from("fantasy_rounds")
    .select("id")
    .eq("league_id", draft.league_id)
    .limit(1)
    .maybeSingle();
  if (existingRound) return;

  try {
    await openNextRound(admin, draft.league_id, new Date());
  } catch {
    // Never fail the pick/draft-completion response over this -- opening
    // round 1 is a best-effort follow-up, not part of the pick's own
    // success/failure. A commissioner can still be unblocked later (e.g.
    // once eligible fixture data exists) without needing to redo anything
    // here.
  }
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
 * filtered/paginated free-agent players in this specific league (never a
 * full fetch filtered in the browser, same convention as the Players
 * workspace). `ownership: "free"` + `activeLeagueId` together are exactly
 * "unowned in this league" — the same real `league_player_ownership`
 * check the draft's own `make_draft_pick` RPC enforces server-side.
 */
export async function getAvailablePlayersAction(
  leagueId: string,
  query: string,
  position?: PlayerPosition
): Promise<PlayerDatabasePage> {
  return getPlayerDatabase({ activeLeagueId: leagueId, ownership: "free", query, position, pageSize: 30 });
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
