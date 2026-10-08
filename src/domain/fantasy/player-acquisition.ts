/** Mirrors the authoritative RPC guard. UI guidance only; SQL enforces writes.
 * Latest draft includes redrafts; keep-roster seasons retain the completed draft.
 */
export type PlayerAcquisitionState = "allowed" | "draft_pending" | "league_closed" | "unavailable";

export function playerAcquisitionState(leagueStatus: string | null | undefined, draftStatus: string | null | undefined): PlayerAcquisitionState {
  if (!leagueStatus) return "unavailable";
  if (leagueStatus !== "draft" && leagueStatus !== "active") return "league_closed";
  if (draftStatus !== "completed") return "draft_pending";
  // deriveLeagueLifecycle treats a completed draft as ACTIVE even when
  // the legacy league column still says draft. Closed leagues stay closed.
  return "allowed";
}

export const PRE_DRAFT_ACQUISITION_COPY = "Players become available after your league's draft.";
