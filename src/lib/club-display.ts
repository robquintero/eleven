/**
 * Club naming rules — see docs/football-data-system.md "Club naming /
 * search UX." Three deliberately distinct concepts, never conflated:
 *
 *   club.id         canonical Eleven identity (provider-mapping backed)
 *   club.name        full human-readable name — the primary label
 *                     wherever a user searches/filters/selects/browses
 *   club.shortName   compact operational abbreviation — fine for dense
 *                     workstation surfaces (tables, fixture strips), but
 *                     NEVER the sole identifying label in a filter/search
 *                     UI: the provider can (and does — Bayern München and
 *                     Bayer Leverkusen both report "BAY") supply the same
 *                     abbreviation for two different real clubs.
 *
 * Provider club codes are never canonical identity; `club.id` always is.
 */

export interface ClubIdentity {
  name: string;
  shortName: string;
}

/** "Bayern München · BAY" — the label for any search/filter/select/browse surface. Stays unambiguous even when `shortName` collides with another club's, because `name` never does. */
export function clubDisplayLabel(club: ClubIdentity): string {
  return `${club.name} · ${club.shortName}`;
}

/** Case-insensitive substring match against EITHER the full name or the abbreviation — "Manchester City", "Man", and "MCI" all match Manchester City. */
export function matchesClubQuery(club: ClubIdentity, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return club.name.toLowerCase().includes(q) || club.shortName.toLowerCase().includes(q);
}
