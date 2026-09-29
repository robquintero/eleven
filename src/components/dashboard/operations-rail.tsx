import Link from "next/link";
import { OperationalRow } from "@/components/football/operational-row";
import { RailModule } from "@/components/ui/rail-module";
import type { StandingsRow } from "@/data-access/matchups";
import { starterBuckets } from "@/lib/team-fixture";
import type { LineupSlot } from "@/lib/types/fantasy";

/**
 * Dashboard's secondary operations rail. Every module here renders a
 * truthful empty state until the systems behind it exist — round
 * scheduling, live fixture ingestion, and the scoring engine are all
 * Pass 8+, so `fixtures`/`standings` are `[]` for every league today.
 */
export function OperationsRail({
  starters,
  standings,
  hasActiveRound,
}: {
  starters: LineupSlot[];
  standings: StandingsRow[];
  hasActiveRound: boolean;
}) {
  const buckets = starterBuckets(starters);

  return (
    <div className="flex flex-col divide-y divide-border border border-border">
      <RailModule header="ROUND_INTELLIGENCE">
        {hasActiveRound ? (
          <>
            <OperationalRow
              label="PLAYERS"
              value={`${buckets.live} live / ${buckets.locked + buckets.final} locked / ${buckets.upcoming} remaining`}
            />
          </>
        ) : (
          <p className="text-xs text-foreground-tertiary">NO ACTIVE ROUND</p>
        )}
      </RailModule>

      <RailModule header="LIVE_FIXTURES" meta="00">
        <p className="text-xs text-foreground-tertiary">NO FIXTURE DATA</p>
      </RailModule>

      <RailModule header="NEXT_LOCK">
        <p className="text-xs text-foreground-tertiary">NOT SCHEDULED</p>
      </RailModule>

      <RailModule
        header="LEAGUE_TABLE"
        meta={
          <Link href="/league" className="hover:text-foreground-secondary">
            FULL TABLE ↗
          </Link>
        }
      >
        {standings.length === 0 ? (
          <p className="text-xs text-foreground-tertiary">NO RESULTS YET</p>
        ) : (
          <div className="divide-y divide-border">
            {standings.slice(0, 6).map((row, index) => (
              <div key={row.fantasyTeamId} className="flex items-center gap-2.5 py-2 pl-1.5">
                <span className="label-system w-4 shrink-0 text-xs font-medium text-foreground-tertiary">
                  {index + 1}
                </span>
                <p className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                  {row.teamName}
                </p>
                <span className="label-system shrink-0 text-xs font-semibold text-foreground">
                  {row.pointsFor}
                </span>
              </div>
            ))}
          </div>
        )}
      </RailModule>
    </div>
  );
}
