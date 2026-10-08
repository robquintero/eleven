import { TransitionLink } from "@/components/shell/transition-link";
import { PRE_DRAFT_ACQUISITION_COPY, type PlayerAcquisitionState } from "@/domain/fantasy/player-acquisition";

export function PlayerAcquisitionNotice({ state }: { state: PlayerAcquisitionState }) {
  if (state === "allowed" || state === "unavailable") return null;
  return <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-foreground-secondary">
    <p>{state === "draft_pending" ? PRE_DRAFT_ACQUISITION_COPY : "Player acquisitions are unavailable for this league."}</p>
    {state === "draft_pending" && <TransitionLink href="/draft" label="Draft" className="v2-link">Go to draft →</TransitionLink>}
  </div>;
}
