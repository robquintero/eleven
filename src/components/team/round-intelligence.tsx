import { OperationalRow } from "@/components/football/operational-row";
import { starterBuckets } from "@/lib/team-fixture";
import type { LineupSlot, Matchup } from "@/lib/types/fantasy";

export function RoundIntelligence({
  starters,
  matchup,
}: {
  starters: LineupSlot[];
  matchup: Matchup;
}) {
  const buckets = starterBuckets(starters);

  return (
    <div>
      <OperationalRow label="PTS" value={matchup.homeScore} />
      <OperationalRow label="PROJECTED" value={matchup.homeProjected} />
      <OperationalRow label="ACTIVE" value={`${buckets.live} / ${starters.length}`} />
      <OperationalRow label="REMAINING" value={buckets.upcoming} />
      <OperationalRow label="LOCKED" value={buckets.locked + buckets.final} />
    </div>
  );
}
