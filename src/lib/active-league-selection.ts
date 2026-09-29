import type { LeagueSummary } from "@/data-access/leagues";

/**
 * Pure selection logic behind `getActiveLeagueId` — split out (same
 * reasoning as `src/lib/errors/league-action-error.ts`) so it's testable
 * with plain `node --test`, since the cookie I/O around it can't run
 * outside a request context.
 *
 * `requestedId` (the caller's `eleven_active_league` cookie, if any) wins
 * when it names a league the caller is actually a member of; otherwise
 * this falls back to the first membership — never a fabricated default —
 * which handles both "no cookie yet" and "stale cookie from a league the
 * caller has since left." `null` when the caller has no real leagues at
 * all.
 */
export function resolveActiveLeagueId(
  leagues: LeagueSummary[],
  requestedId: string | null
): string | null {
  if (leagues.length === 0) return null;

  if (requestedId && leagues.some((league) => league.id === requestedId)) {
    return requestedId;
  }

  return leagues[0].id;
}
