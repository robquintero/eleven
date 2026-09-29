import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export interface Membership {
  leagueId: string;
  role: "manager" | "commissioner";
  joinedAt: string;
}

/** The signed-in user's own league memberships. `[]` if signed out, unconfigured, or a member of nothing. */
export async function getUserMemberships(): Promise<Membership[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];

  const { data, error } = await supabase
    .from("league_memberships")
    .select("league_id, role, joined_at")
    .eq("user_id", userData.user.id)
    .order("joined_at", { ascending: true });

  if (error || !data) return [];

  return data.map((row) => ({
    leagueId: row.league_id,
    role: row.role,
    joinedAt: row.joined_at,
  }));
}
