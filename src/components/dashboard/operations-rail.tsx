import Link from "next/link";
import { OperationalRow } from "@/components/football/operational-row";
import { RailModule } from "@/components/ui/rail-module";
import type { MatchupFixtureIntelligence, StandingsRow } from "@/data-access/matchups";
import { formatKickoff, pad2, starterBuckets } from "@/lib/team-fixture";
import type { LineupSlot } from "@/lib/types/fantasy";

/**
 * Dashboard's secondary operations rail. LEAGUE_TABLE renders a truthful
 * empty state until real matchups have been played. ROUND_INTELLIGENCE/
 * LIVE_FIXTURES/NEXT_LOCK are wired to `fixtureIntel` (Pass 10.5B,
 * `getMatchupFixtureIntelligence`) whenever a real current matchup exists
 * — `null` (no open round/matchup) is the only case that falls back to the
 * honest "no active round" states below; "nothing is live right now" is a
 * distinct, equally real state from "no fixture data exists at all," and
 * is never collapsed into the other.
 */
export function OperationsRail({
  starters,
  standings,
  hasActiveRound,
  fixtureIntel,
}: {
  starters: LineupSlot[];
  standings: StandingsRow[];
  hasActiveRound: boolean;
  fixtureIntel: MatchupFixtureIntelligence | null;
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

      <RailModule header="LIVE_FIXTURES" meta={fixtureIntel ? pad2(fixtureIntel.liveFixtureCount) : "00"}>
        {!hasActiveRound ? (
          <p className="text-xs text-foreground-tertiary">NO ACTIVE ROUND</p>
        ) : !fixtureIntel?.hasAnyFixtureData ? (
          <p className="text-xs text-foreground-tertiary">NO FIXTURE DATA</p>
        ) : fixtureIntel.liveFixtureCount > 0 ? (
          <OperationalRow label="LIVE NOW" value={`${fixtureIntel.liveFixtureCount}`} />
        ) : fixtureIntel.nextFixture ? (
          <OperationalRow
            label="NEXT"
            value={`${fixtureIntel.nextFixture.homeClubShortName} v ${fixtureIntel.nextFixture.awayClubShortName} · ${formatKickoff(fixtureIntel.nextFixture.kickoffAt)}`}
          />
        ) : (
          <p className="text-xs text-foreground-tertiary">NONE SCHEDULED THIS ROUND</p>
        )}
      </RailModule>

      <RailModule header="NEXT_LOCK">
        {!hasActiveRound ? (
          <p className="text-xs text-foreground-tertiary">NOT SCHEDULED</p>
        ) : !fixtureIntel?.hasAnyFixtureData ? (
          <p className="text-xs text-foreground-tertiary">NO FIXTURE DATA</p>
        ) : fixtureIntel.nextFixture ? (
          <OperationalRow
            label={formatKickoff(fixtureIntel.nextFixture.kickoffAt)}
            value={`${fixtureIntel.nextFixture.homeClubShortName} v ${fixtureIntel.nextFixture.awayClubShortName}`}
          />
        ) : (
          <p className="text-xs text-foreground-tertiary">NONE SCHEDULED THIS ROUND</p>
        )}
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
