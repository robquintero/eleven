import { OperationalRow } from "@/components/football/operational-row";
import { starterBuckets } from "@/lib/team-fixture";
import type { LineupSlot } from "@/lib/types/fantasy";

/** `hasActiveRound` is false for every league today — no round scheduler exists yet (Pass 8+). */
export function RoundIntelligence({
  starters,
  hasActiveRound,
}: {
  starters: LineupSlot[];
  hasActiveRound: boolean;
}) {
  if (!hasActiveRound) {
    return <p className="text-xs text-foreground-tertiary">NO ACTIVE ROUND</p>;
  }

  const buckets = starterBuckets(starters);

  return (
    <div>
      <OperationalRow label="ACTIVE" value={`${buckets.live} / ${starters.length}`} />
      <OperationalRow label="REMAINING" value={buckets.upcoming} />
      <OperationalRow label="LOCKED" value={buckets.locked + buckets.final} />
    </div>
  );
}
