import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export interface ActivityEntry {
  id: string;
  type: string;
  fantasyTeamName: string | null;
  createdAt: string;
}

/**
 * The league's most recent auditable transactions (`draft_pick`,
 * `waiver_add`, `trade`, etc. — see `public.transactions`). `[]` until a
 * draft/waiver/trade engine actually writes one, which none do yet
 * (Pass 8+) — every league today truthfully has zero transactions.
 */
export async function getRecentActivity(leagueId: string, limit = 10): Promise<ActivityEntry[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("transactions")
    .select("id, type, fantasy_team_id, created_at")
    .eq("league_id", leagueId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data || data.length === 0) return [];

  const teamIds = Array.from(new Set(data.map((t) => t.fantasy_team_id).filter(Boolean))) as string[];
  const { data: teams } = teamIds.length
    ? await supabase.from("fantasy_teams").select("id, name").in("id", teamIds)
    : { data: [] as { id: string; name: string }[] };
  const nameById = new Map((teams ?? []).map((t) => [t.id, t.name]));

  return data.map((row) => ({
    id: row.id,
    type: row.type,
    fantasyTeamName: row.fantasy_team_id ? (nameById.get(row.fantasy_team_id) ?? null) : null,
    createdAt: row.created_at,
  }));
}
