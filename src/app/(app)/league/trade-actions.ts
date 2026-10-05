"use server";

import { getLeagueRosterPlayersByTeam } from "@/data-access/roster";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { toTradeActionError } from "@/lib/errors/trade-action-error";
import { TRADE_ACTION_ERROR_COPY, TRADE_ACTION_ERROR_KIND } from "@/lib/errors/trade-action-error-copy";

export type TradeActionState = { error: string; kind: "rule" | "error" } | undefined;

/**
 * Pass 11: trade proposal/acceptance are ordinary authenticated manager
 * operations with real multi-row atomicity and ownership-race
 * requirements (an accepted trade must re-validate everything from
 * scratch and transfer every asset atomically) — SECURITY DEFINER RPCs
 * (supabase/migrations/20261001000000_free_market_and_trades.sql) called
 * through the normal RLS-respecting request client, exactly like
 * make_draft_pick/drop_player/sign_player. No admin/service-role client
 * involved anywhere in this file.
 */
export async function proposeTradeAction(
  leagueId: string,
  receivingTeamId: string,
  offeredPlayerIds: string[],
  requestedPlayerIds: string[]
): Promise<TradeActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("propose_trade", {
    p_league_id: leagueId,
    p_receiving_team_id: receivingTeamId,
    p_offered_player_ids: offeredPlayerIds,
    p_requested_player_ids: requestedPlayerIds,
  });
  if (error) {
    const code = toTradeActionError(error.message).code;
    return { error: TRADE_ACTION_ERROR_COPY[code], kind: TRADE_ACTION_ERROR_KIND[code] };
  }
  revalidatePath("/league");
  return undefined;
}

export async function acceptTradeAction(tradeId: string): Promise<TradeActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_trade", { p_trade_id: tradeId });
  if (error) {
    const code = toTradeActionError(error.message).code;
    return { error: TRADE_ACTION_ERROR_COPY[code], kind: TRADE_ACTION_ERROR_KIND[code] };
  }
  revalidatePath("/league");
  revalidatePath("/team");
  revalidatePath("/players");
  return undefined;
}

export async function rejectTradeAction(tradeId: string): Promise<TradeActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_trade", { p_trade_id: tradeId });
  if (error) {
    const code = toTradeActionError(error.message).code;
    return { error: TRADE_ACTION_ERROR_COPY[code], kind: TRADE_ACTION_ERROR_KIND[code] };
  }
  revalidatePath("/league");
  return undefined;
}

export async function cancelTradeAction(tradeId: string): Promise<TradeActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_trade", { p_trade_id: tradeId });
  if (error) {
    const code = toTradeActionError(error.message).code;
    return { error: TRADE_ACTION_ERROR_COPY[code], kind: TRADE_ACTION_ERROR_KIND[code] };
  }
  revalidatePath("/league");
  return undefined;
}

export async function getTradeRostersAction(leagueId: string) {
  return getLeagueRosterPlayersByTeam(leagueId);
}
