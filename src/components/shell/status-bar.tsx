import type { MatchupResultState } from "@/domain/fantasy/matchup-result-state";
import { formatKickoff } from "@/lib/team-fixture";

export interface StatusBarData {
  scoringRuleVersion?: import("@/domain/fantasy/scoring").ScoringRuleVersion;
  roundNumber: number;
  resultState: MatchupResultState;
  roundStatus: "upcoming" | "in_progress" | "completed";
  liveCount: number;
  lockedCount: number;
  remainingCount: number;
  nextLockKickoff: string | null;
}

/** Same authoritative round/lineup data, presented as a quiet desktop summary. */
export function StatusBar({ data }: { data: StatusBarData | null }) {
  if (!data) return <div className="v2-status-bar"><span>No active matchweek</span><span>No fixture data</span><span className="ml-auto">Next lock not scheduled</span></div>;
  return <div className="v2-status-bar">
    <div className="v2-status-summary"><strong>Matchweek {data.roundNumber}</strong>
      <span>{data.liveCount} live · {data.lockedCount} locked · {data.remainingCount} remaining</span>
    </div>
    <span className="ml-auto">{data.nextLockKickoff ? <>Next lock <span className="v2-number">{formatKickoff(data.nextLockKickoff)}</span></> : "No remaining locks"}</span>
  </div>;
}
