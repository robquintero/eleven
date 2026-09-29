"use server";

import { getPlayerRecentMatches, type RecentMatchRow } from "@/data-access/players";

/** Thin server-action wrapper so the client-side Player Inspector can fetch one player's real recent matches on demand, without ever calling Supabase directly. */
export async function getPlayerRecentMatchesAction(playerId: string): Promise<RecentMatchRow[]> {
  return getPlayerRecentMatches(playerId);
}
