import { OperationalRow } from "@/components/football/operational-row";
import { starterBuckets } from "@/lib/team-fixture";
import type { LineupSlot } from "@/lib/types/fantasy";

/**
 * Pass 14.6: canonical LIVE/LOCKED/REMAINING vocabulary (see
 * team-fixture.ts's own doc comment) -- was "ACTIVE n / 11", which read
 * as "n of 11 are currently selectable/active," not "n are currently
 * live." Same exclusive three-way split `MatchupPlayerCounts` and the
 * global status bar use: LOCKED = `locked + final` (immovable, whether or
 * not the real fixture has finished), REMAINING = `upcoming`.
 */
export function RoundIntelligence({
  starters,
  hasActiveRound,
}: {
  starters: LineupSlot[];
  hasActiveRound: boolean;
}) {
  if (!hasActiveRound) {
    return <p className="text-xs text-foreground-secondary">No active matchweek</p>;
  }

  const buckets = starterBuckets(starters);

  return (
    <div>
      <OperationalRow label="Live" value={buckets.live} />
      <OperationalRow label="Locked" value={buckets.locked + buckets.final} />
      <OperationalRow label="Remaining" value={buckets.upcoming} />
    </div>
  );
}
