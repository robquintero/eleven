/** Presentation only. Database finality alone grants official results;
 * the persisted UTC window distinguishes an active week from pending history. */
export type MatchupResultState = "upcoming" | "active" | "live" | "pending" | "final";
export function matchupResultState(input: {
  status?: "scheduled" | "live" | "final";
  roundStatus?: "upcoming" | "in_progress" | "completed";
  startsAt: string;
  endsAt: string;
}, now: Date): MatchupResultState {
  if (input.status === "final" || input.roundStatus === "completed") return "final";
  if (now.getTime() >= new Date(input.endsAt).getTime()) return "pending";
  if (input.status === "live") return "live";
  if (input.roundStatus === "upcoming") return "upcoming";
  return now.getTime() >= new Date(input.startsAt).getTime() ? "active" : "upcoming";
}
export const MATCHUP_RESULT_LABEL: Record<MatchupResultState, string> = {
  upcoming: "UPCOMING", active: "ACTIVE", live: "LIVE", pending: "PENDING", final: "FINAL",
};
