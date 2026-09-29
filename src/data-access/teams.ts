import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export interface Team {
  id: string;
  leagueId: string;
  ownerUserId: string;
  name: string;
  abbreviation: string;
}

/** Every fantasy team in a league. RLS restricts this to leagues the caller is a member of. */
export async function getLeagueTeams(leagueId: string): Promise<Team[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fantasy_teams")
    .select("id, league_id, owner_user_id, name, abbreviation")
    .eq("league_id", leagueId)
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    leagueId: row.league_id,
    ownerUserId: row.owner_user_id,
    name: row.name,
    abbreviation: row.abbreviation,
  }));
}

/** The signed-in user's own team within one league, or `null` if they don't have one. */
export async function getUserTeamInLeague(leagueId: string): Promise<Team | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data, error } = await supabase
    .from("fantasy_teams")
    .select("id, league_id, owner_user_id, name, abbreviation")
    .eq("league_id", leagueId)
    .eq("owner_user_id", userData.user.id)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    leagueId: data.league_id,
    ownerUserId: data.owner_user_id,
    name: data.name,
    abbreviation: data.abbreviation,
  };
}
