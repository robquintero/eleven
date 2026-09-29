import "server-only";
import { cookies } from "next/headers";
import type { LeagueSummary } from "@/data-access/leagues";
import { resolveActiveLeagueId } from "@/lib/active-league-selection";

export { resolveActiveLeagueId } from "@/lib/active-league-selection";

export const ACTIVE_LEAGUE_COOKIE = "eleven_active_league";

/**
 * Resolves which of the caller's real leagues is "active" right now —
 * never a fabricated/default league. Reads the persisted cookie (set by
 * `setActiveLeagueAction`) and delegates the actual selection logic to the
 * pure, unit-tested `resolveActiveLeagueId` — this wrapper's only job is
 * the cookie I/O, which can't run outside a request context.
 */
export async function getActiveLeagueId(leagues: LeagueSummary[]): Promise<string | null> {
  const cookieStore = await cookies();
  const requested = cookieStore.get(ACTIVE_LEAGUE_COOKIE)?.value ?? null;
  return resolveActiveLeagueId(leagues, requested);
}
