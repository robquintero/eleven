import { matchupResultState } from "@/domain/fantasy/matchup-result-state";
import { MatchupStatus } from "./matchup-status";
import { formatRoundWindow, pad2 } from "@/lib/team-fixture";
import { cn } from "@/lib/utils";

export interface RoundWindowInfo {
  number: number;
  startsAt: string;
  endsAt: string;
  status: "upcoming" | "in_progress" | "completed";
}

/**
 * Pass 14.5 §Phase 3: the one coherent "what fantasy week am I playing?"
 * readout, reused across Home / Matchup / Team / League rather than each
 * page inventing its own matchday string (prior art: `greeting.tsx`,
 * `matchup-command.tsx`, and `team-workspace.tsx` each formatted a
 * slightly different one). Always rendered from the round's own stored
 * `starts_at`/`ends_at` — never inferred from today's date.
 */
export function RoundWindow({ round, className, now = new Date() }: { round: RoundWindowInfo | null; className?: string; now?: Date }) {
  if (!round) {
    return (
      <span className={cn("label-system text-[10px] text-foreground-tertiary", className)}>
        SEASON NOT STARTED
      </span>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-0.5", className)}>
      <span className="label-system text-[10px] font-semibold text-foreground-secondary">
        MATCHDAY {pad2(round.number)}
      </span>
      <span className="label-system text-[10px] text-foreground-tertiary">
        {formatRoundWindow(round.startsAt, round.endsAt)}
      </span>
      <MatchupStatus state={matchupResultState({ startsAt: round.startsAt, endsAt: round.endsAt, roundStatus: round.status }, now)} />
    </div>
  );
}
