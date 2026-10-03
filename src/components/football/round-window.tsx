import { formatRoundWindow, pad2 } from "@/lib/team-fixture";
import { cn } from "@/lib/utils";

export interface RoundWindowInfo {
  number: number;
  startsAt: string;
  endsAt: string;
  status: "upcoming" | "in_progress" | "completed";
}

const STATUS_LABEL: Record<RoundWindowInfo["status"], string> = {
  upcoming: "UPCOMING",
  in_progress: "LIVE",
  completed: "COMPLETED",
};

const STATUS_TONE: Record<RoundWindowInfo["status"], string> = {
  upcoming: "text-foreground-tertiary",
  in_progress: "text-live",
  completed: "text-foreground-tertiary",
};

/**
 * Pass 14.5 §Phase 3: the one coherent "what fantasy week am I playing?"
 * readout, reused across Home / Matchup / Team / League rather than each
 * page inventing its own matchday string (prior art: `greeting.tsx`,
 * `matchup-command.tsx`, and `team-workspace.tsx` each formatted a
 * slightly different one). Always rendered from the round's own stored
 * `starts_at`/`ends_at` — never inferred from today's date.
 */
export function RoundWindow({ round, className }: { round: RoundWindowInfo | null; className?: string }) {
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
      <span className={cn("label-system text-[10px]", STATUS_TONE[round.status])}>
        {round.status === "in_progress" && (
          <span className="relative mr-1 inline-flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-live" />
          </span>
        )}
        {STATUS_LABEL[round.status]}
      </span>
    </div>
  );
}
