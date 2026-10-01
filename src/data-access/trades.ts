import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { PlayerPosition } from "@/lib/types/fantasy";

export interface TradeAssetView {
  playerId: string;
  playerName: string;
  position: PlayerPosition;
}

export interface TradeView {
  id: string;
  proposingTeamId: string;
  proposingTeamName: string;
  receivingTeamId: string;
  receivingTeamName: string;
  offeredPlayers: TradeAssetView[];
  requestedPlayers: TradeAssetView[];
  createdAt: string;
}

interface TradeAssetRow {
  trade_id: string;
  from_team_id: string;
  player_id: string;
  players: { id: string; name: string; position: string } | null;
}

/**
 * This team's PENDING trades only, split into incoming (this team is
 * `receiving_team_id`, can ACCEPT/REJECT) and outgoing (this team
 * proposed it, can CANCEL) — accepted/rejected/cancelled trades are
 * already visible via the league activity feed (`getRecentActivity`),
 * never re-derived here.
 */
export async function getTeamTrades(
  leagueId: string,
  fantasyTeamId: string
): Promise<{ incoming: TradeView[]; outgoing: TradeView[] }> {
  const empty = { incoming: [] as TradeView[], outgoing: [] as TradeView[] };
  if (!isSupabaseConfigured()) return empty;

  const supabase = await createClient();

  const { data: trades, error } = await supabase
    .from("trades")
    .select("id, proposing_team_id, receiving_team_id, created_at")
    .eq("league_id", leagueId)
    .eq("status", "pending")
    .or(`proposing_team_id.eq.${fantasyTeamId},receiving_team_id.eq.${fantasyTeamId}`)
    .order("created_at", { ascending: false });

  if (error || !trades || trades.length === 0) return empty;

  const tradeIds = trades.map((t) => t.id);
  const teamIds = Array.from(new Set(trades.flatMap((t) => [t.proposing_team_id, t.receiving_team_id])));

  const [{ data: assets }, { data: teams }] = await Promise.all([
    supabase
      .from("trade_assets")
      .select("trade_id, from_team_id, player_id, players(id, name, position)")
      .in("trade_id", tradeIds),
    supabase.from("fantasy_teams").select("id, name").in("id", teamIds),
  ]);

  const teamNameById = new Map((teams ?? []).map((t) => [t.id, t.name]));
  const assetsByTradeId = new Map<string, TradeAssetRow[]>();
  for (const asset of (assets ?? []) as TradeAssetRow[]) {
    const list = assetsByTradeId.get(asset.trade_id) ?? [];
    list.push(asset);
    assetsByTradeId.set(asset.trade_id, list);
  }

  const incoming: TradeView[] = [];
  const outgoing: TradeView[] = [];

  for (const trade of trades) {
    const tradeAssets = assetsByTradeId.get(trade.id) ?? [];
    const offeredPlayers: TradeAssetView[] = [];
    const requestedPlayers: TradeAssetView[] = [];

    for (const asset of tradeAssets) {
      if (!asset.players) continue;
      const view: TradeAssetView = {
        playerId: asset.players.id,
        playerName: asset.players.name,
        position: asset.players.position as PlayerPosition,
      };
      if (asset.from_team_id === trade.proposing_team_id) offeredPlayers.push(view);
      else requestedPlayers.push(view);
    }

    const view: TradeView = {
      id: trade.id,
      proposingTeamId: trade.proposing_team_id,
      proposingTeamName: teamNameById.get(trade.proposing_team_id) ?? "Unknown team",
      receivingTeamId: trade.receiving_team_id,
      receivingTeamName: teamNameById.get(trade.receiving_team_id) ?? "Unknown team",
      offeredPlayers,
      requestedPlayers,
      createdAt: trade.created_at,
    };

    if (trade.receiving_team_id === fantasyTeamId) incoming.push(view);
    else outgoing.push(view);
  }

  return { incoming, outgoing };
}
