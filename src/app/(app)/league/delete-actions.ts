"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ACTIVE_LEAGUE_COOKIE, getActiveLeagueId } from "@/data-access/active-league";
import { getUserLeagues } from "@/data-access/leagues";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { leagueDeletionError, validLeagueDeleteConfirmation } from "@/lib/league-deletion";

export async function deleteLeagueAction(leagueId: string, confirmation: string): Promise<{ error: string } | { success: true }> {
  if (!validLeagueDeleteConfirmation(confirmation)) return { error: "Type DELETE exactly to confirm." };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(leagueId)) return { error: "Invalid league target." };
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in before deleting a league." };
  const activeId = await getActiveLeagueId(await getUserLeagues());
  if (activeId !== leagueId) return { error: "Your selected league changed. Reload and confirm the selected league again." };
  // Request-scoped user JWT only. The RPC rechecks the immutable target, owner
  // and commissioner membership under database locks; no admin/service client.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_fantasy_league", { p_league_id: leagueId, p_confirmation: confirmation });
  if (error || data !== leagueId) return { error: leagueDeletionError(error?.message) };
  (await cookies()).delete(ACTIVE_LEAGUE_COOKIE);
  // Same context invalidation as switching leagues. The client then navigates
  // home, resolving remaining real memberships or existing no-league UI.
  revalidatePath("/", "layout");
  return { success: true };
}
