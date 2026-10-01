"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPlayerRecentMatches, type RecentMatchRow } from "@/data-access/players";
import { toMarketActionError } from "@/lib/errors/market-action-error";
import { MARKET_ACTION_ERROR_COPY } from "@/lib/errors/market-action-error-copy";

export type MarketActionState = { error?: string } | undefined;

/** Thin server-action wrapper so the client-side Player Inspector can fetch one player's real recent matches on demand, without ever calling Supabase directly. */
export async function getPlayerRecentMatchesAction(playerId: string): Promise<RecentMatchRow[]> {
  return getPlayerRecentMatches(playerId);
}

/**
 * Pass 11: drop/sign are ordinary authenticated manager operations (like
 * a draft pick, not like a lineup swap) — both resolve `auth.uid()`
 * internally and need real multi-row atomicity + a genuine ownership
 * race guard, so they're SECURITY DEFINER RPCs
 * (supabase/migrations/20261001000000_free_market_and_trades.sql) called
 * through the normal RLS-respecting request client, exactly like
 * make_draft_pick — no admin/service-role client involved anywhere in
 * this file.
 */
export async function dropPlayerAction(leagueId: string, playerId: string): Promise<MarketActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("drop_player", { p_league_id: leagueId, p_player_id: playerId });
  if (error) {
    const code = toMarketActionError(error.message).code;
    return { error: MARKET_ACTION_ERROR_COPY[code] };
  }
  revalidatePath("/players");
  revalidatePath("/team");
  revalidatePath("/league");
  return undefined;
}

export async function signPlayerAction(leagueId: string, playerId: string): Promise<MarketActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("sign_player", { p_league_id: leagueId, p_player_id: playerId });
  if (error) {
    const code = toMarketActionError(error.message).code;
    return { error: MARKET_ACTION_ERROR_COPY[code] };
  }
  revalidatePath("/players");
  revalidatePath("/team");
  revalidatePath("/league");
  return undefined;
}
