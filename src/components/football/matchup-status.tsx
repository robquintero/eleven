import { MATCHUP_RESULT_LABEL, type MatchupResultState } from "@/domain/fantasy/matchup-result-state";
import { cn } from "@/lib/utils";

export function MatchupStatus({ state }: { state: MatchupResultState }) {
  return (
    <span className={cn("label-system inline-flex shrink-0 items-center gap-1.5 text-[10px]", state === "live" ? "text-live" : "text-foreground-tertiary")}
      title={state === "pending" ? "The week has ended. Finalizing result." : undefined}>
      {state === "live" && <span className="relative flex size-1.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-75" />
        <span className="relative inline-flex size-1.5 rounded-full bg-live" />
      </span>}
      {MATCHUP_RESULT_LABEL[state]}
    </span>
  );
}
