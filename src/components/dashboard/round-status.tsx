import { OperationalRow } from "@/components/football/operational-row";
import { starterBuckets } from "@/lib/team-fixture";
import type { LineupSlot, Matchup, RoundFixture } from "@/lib/types/fantasy";

export function RoundStatus({
  starters,
  matchup,
  fixtures,
}: {
  starters: LineupSlot[];
  matchup: Matchup;
  fixtures: RoundFixture[];
}) {
  const buckets = starterBuckets(starters);
  const complete = fixtures.filter((f) => f.state === "final").length;

  return (
    <section>
      <h2 className="text-sm font-semibold tracking-tight text-foreground">
        Round status
      </h2>
      <div className="mt-2 divide-y divide-border">
        <OperationalRow
          label="MATCHES"
          value={`${complete} / ${fixtures.length}`}
          secondary="complete"
        />
        <OperationalRow
          label="PLAYERS"
          value={`${buckets.live} live · ${buckets.locked} locked · ${buckets.upcoming} upcoming`}
        />
        <OperationalRow
          label="MY SCORE"
          value={matchup.homeScore}
          secondary={`Proj ${matchup.homeProjected}`}
        />
        <OperationalRow
          label="OPPONENT"
          value={matchup.awayScore}
          secondary={`Proj ${matchup.awayProjected}`}
        />
      </div>
    </section>
  );
}
