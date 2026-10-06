/** Canonical spectator targets use UUIDs, never names or transient selections. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
export function teamViewHref(teamId: string, roundId?: string): string {
  return `/team/${teamId}${roundId ? `?round=${roundId}` : ""}`;
}

export function eligibleByeTeams<T extends { id: string }>(teams: T[], matches: { homeTeamId: string; awayTeamId: string }[]): T[] {
  // The scheduler represents a bye by absence, never a synthetic matchup.
  // Incomplete/no scheduling is not proof of a bye.
  if (teams.length < 3 || teams.length % 2 === 0 || matches.length !== Math.floor(teams.length / 2)) return [];
  const playing = new Set(matches.flatMap(m => [m.homeTeamId, m.awayTeamId]));
  const complete = playing.size === teams.length - 1 && [...playing].every(id => teams.some(t => t.id === id));
  return complete ? teams.filter(t => !playing.has(t.id)) : [];
}
