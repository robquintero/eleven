/** Shared UI/server confirmation rules; database repeats the authorization. */
export function canDeleteLeague(role: string, ownerId: string, userId: string): boolean {
  return role === "commissioner" && ownerId === userId;
}
export function validLeagueDeleteConfirmation(value: unknown): value is "DELETE" {
  return value === "DELETE";
}
export function leagueDeletionError(message?: string): string {
  if (message?.includes("DELETE_LEAGUE_FORBIDDEN")) return "Only this league’s commissioner can delete it.";
  if (message?.includes("DELETE_LEAGUE_NOT_FOUND")) return "This league no longer exists. Reload to update your leagues.";
  if (message?.includes("DELETE_LEAGUE_BUSY")) return "The league is busy. Nothing was deleted; please try again.";
  if (message?.includes("DELETE_LEAGUE_CROSS_LEAGUE_REFERENCE")) return "Deletion was blocked by an inconsistent league reference. Nothing was deleted; contact support.";
  return "The deletion could not be confirmed. Reload to check the league before trying again.";
}
