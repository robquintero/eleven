"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getUserLeagues } from "@/data-access/leagues";
import { ACTIVE_LEAGUE_COOKIE } from "@/data-access/active-league";

/**
 * Sets the caller's active league — the one every league-scoped surface
 * (Home, Team, Matchup, League) reads from on the next render. Re-validates
 * membership server-side before writing the cookie rather than trusting the
 * submitted id outright, so a forged/stale league id can't silently become
 * "active."
 */
export async function setActiveLeagueAction(formData: FormData): Promise<void> {
  const leagueId = String(formData.get("leagueId") ?? "");
  if (!leagueId) return;

  const leagues = await getUserLeagues();
  if (!leagues.some((league) => league.id === leagueId)) return;

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_LEAGUE_COOKIE, leagueId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
}
