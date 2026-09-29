/**
 * Pure disambiguation for `clubs.code` (the `(competition_id, code)`
 * unique key — see supabase/migrations/20260929141127_football_foundation.sql).
 * Discovered live during the 2026/27 Big Five population: API-Football
 * genuinely reports the SAME `team.code` ("BAY") for both Bayern München
 * and Bayer Leverkusen — a real provider data collision, not a bug in
 * how Eleven reads it. A batch insert of both under the same code+
 * competition violates the unique constraint and fails the whole batch.
 *
 * This never invents a "real" disambiguated abbreviation (Eleven has no
 * authority to decide Bayern should be "FCB" instead of "BAY") — it
 * appends the club's own provider externalId, which is always unique,
 * to whichever club loses the collision. `clubs.short_name` (the
 * UI-facing value) is left untouched and keeps the provider's original,
 * possibly-shared code — the disambiguation only affects the internal
 * `code` column, which the UI never displays (see
 * src/data-access/players.ts's Club mapping).
 */
export function resolveUniqueClubCode(
  desiredCode: string,
  externalId: string,
  takenCodes: ReadonlySet<string>
): string {
  if (!takenCodes.has(desiredCode)) return desiredCode;
  return `${desiredCode}${externalId}`;
}
