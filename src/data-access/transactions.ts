import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export interface ActivityEntry {
  id: string;
  type: string;
  summary: string;
  createdAt: string;
}

const TRANSACTION_TYPE_LABEL: Record<string, string> = {
  draft_pick: "DRAFTED",
  free_agent_add: "SIGNED",
  drop: "DROPPED",
  trade: "TRADE",
};

/**
 * The league's most recent auditable transactions (`draft_pick`,
 * `free_agent_add`, `drop`, `trade`, etc. — see `public.transactions`).
 * Pass 11's market/trade RPCs stamp `metadata.playerId` (add/drop) or
 * `metadata.proposingTeamId`/`receivingTeamId` (trade), so this resolves
 * those into real names rather than surfacing the raw transaction type.
 */
export async function getRecentActivity(leagueId: string, limit = 10): Promise<ActivityEntry[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("transactions")
    .select("id, type, fantasy_team_id, metadata, created_at")
    .eq("league_id", leagueId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data || data.length === 0) return [];

  const teamIds = new Set<string>();
  const playerIds = new Set<string>();
  for (const row of data) {
    if (row.fantasy_team_id) teamIds.add(row.fantasy_team_id);
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    if (typeof metadata.playerId === "string") playerIds.add(metadata.playerId);
    if (typeof metadata.proposingTeamId === "string") teamIds.add(metadata.proposingTeamId);
    if (typeof metadata.receivingTeamId === "string") teamIds.add(metadata.receivingTeamId);
  }

  const [{ data: teams }, { data: players }] = await Promise.all([
    teamIds.size
      ? supabase.from("fantasy_teams").select("id, name").in("id", Array.from(teamIds))
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    playerIds.size
      ? supabase.from("players").select("id, name").in("id", Array.from(playerIds))
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const teamNameById = new Map((teams ?? []).map((t) => [t.id, t.name]));
  const playerNameById = new Map((players ?? []).map((p) => [p.id, p.name]));

  return data.map((row) => {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const teamName = row.fantasy_team_id ? (teamNameById.get(row.fantasy_team_id) ?? "A team") : "Commissioner";

    // Pass 13: natural casing on team/player names -- these are human-
    // register content (§2) and render in sans/prose type, never
    // `.label-system`. Only the fallback's trailing transaction-type code
    // stays uppercase, same "Name · CODE" pattern as club · league (§10).
    let summary: string;
    if (row.type === "free_agent_add" && typeof metadata.playerId === "string") {
      const playerName = playerNameById.get(metadata.playerId) ?? "a player";
      summary = `${teamName} added ${playerName}`;
    } else if (row.type === "drop" && typeof metadata.playerId === "string") {
      const playerName = playerNameById.get(metadata.playerId) ?? "a player";
      summary = `${teamName} dropped ${playerName}`;
    } else if (
      row.type === "trade" &&
      typeof metadata.proposingTeamId === "string" &&
      typeof metadata.receivingTeamId === "string"
    ) {
      const proposing = teamNameById.get(metadata.proposingTeamId) ?? "A team";
      const receiving = teamNameById.get(metadata.receivingTeamId) ?? "a team";
      summary = `Trade completed: ${proposing} ↔ ${receiving}`;
    } else {
      summary = `${teamName} · ${TRANSACTION_TYPE_LABEL[row.type] ?? row.type.toUpperCase()}`;
    }

    return {
      id: row.id,
      type: row.type,
      summary,
      createdAt: row.created_at,
    };
  });
}
