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
  myTeamId,
}: {
  starters: LineupSlot[];
  standings: StandingsRow[];
  hasActiveRound: boolean;
  fixtureIntel: MatchupFixtureIntelligence | null;
  /** Pass 12D: Club Briefing's "league rank/record" -- highlights the manager's own row, and surfaces it even when they sit outside the top 6 shown. `null` when the caller has no team in this league. */
  myTeamId?: string | null;
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
          (() => {
            const topRows = standings.slice(0, 6).map((row, index) => ({ row, rank: index + 1 }));
            const myIndex = myTeamId ? standings.findIndex((r) => r.fantasyTeamId === myTeamId) : -1;
            const myRowShown = myIndex !== -1 && myIndex < 6;
            const rows = myRowShown || myIndex === -1 ? topRows : [...topRows, { row: standings[myIndex], rank: myIndex + 1 }];

            return (
              <div className="divide-y divide-border">
                {rows.map(({ row, rank }) => {
                  const isMe = row.fantasyTeamId === myTeamId;
                  return (
                    <div key={row.fantasyTeamId} className="flex items-center gap-2.5 py-2 pl-1.5">
                      <span className="label-system w-4 shrink-0 text-xs font-medium text-foreground-tertiary">
                        {rank}
                      </span>
                      <p className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                        {row.teamName}
                        {isMe && <span className="label-system ml-1.5 text-[9px] text-accent">YOU</span>}
                      </p>
                      <span className="label-system shrink-0 text-xs text-foreground-tertiary">
                        {row.wins}W-{row.draws}D-{row.losses}L
                      </span>
                      <span className="label-system shrink-0 text-xs font-semibold text-foreground">
                        {row.leaguePoints}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })()
        )}
      </RailModule>
    </div>
  );
}
