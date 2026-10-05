"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPlayerIdentityMatches, getPlayerRecentMatches, getPlayerLatestScoreBreakdown, type RecentMatchRow, type PlayerScoreBreakdown } from "@/data-access/players";
import { toMarketActionError } from "@/lib/errors/market-action-error";
import { MARKET_ACTION_ERROR_COPY, MARKET_ACTION_ERROR_KIND } from "@/lib/errors/market-action-error-copy";
import { shouldSearchPlayers } from "@/lib/search/player-search";

export type MarketActionState = { error: string; kind: "rule" | "error" } | undefined;

export interface PlayerSearchResult {
  id: string;
  name: string;
  position: string;
  clubShortName: string;
}

/**
 * Pass 12F: powers the command palette's Players group — the exact same
 * accent-insensitive `getPlayerDatabase` search the Players workspace
 * itself uses (never a second search implementation), trimmed to a small
 * page and the handful of fields a compact result row needs. Not
 * league-scoped (no ownership annotation) — this is a global "find this
 * player" lookup, not a market action.
 */
export async function searchPlayersAction(query: string): Promise<PlayerSearchResult[]> {
  if (!shouldSearchPlayers(query)) return [];

  return getPlayerIdentityMatches(query);
}

/** Thin server-action wrapper so the client-side Player Inspector can fetch one player's real recent matches on demand, without ever calling Supabase directly. */
export async function getPlayerRecentMatchesAction(playerId: string): Promise<RecentMatchRow[]> {
  return getPlayerRecentMatches(playerId);
}

/** Pass 12C: thin server-action wrapper for the Player Inspector's Scoring Breakdown panel. `null` means this player has no current-version scored performance yet. */
export async function getPlayerScoreBreakdownAction(playerId: string): Promise<PlayerScoreBreakdown | null> {
  return getPlayerLatestScoreBreakdown(playerId);
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
    return { error: MARKET_ACTION_ERROR_COPY[code], kind: MARKET_ACTION_ERROR_KIND[code] };
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
    return { error: MARKET_ACTION_ERROR_COPY[code], kind: MARKET_ACTION_ERROR_KIND[code] };
  }
  revalidatePath("/players");
  revalidatePath("/team");
  revalidatePath("/league");
  return undefined;
}
