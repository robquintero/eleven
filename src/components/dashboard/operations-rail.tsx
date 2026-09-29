import Link from "next/link";
import { Countdown } from "@/components/football/countdown";
import { FixturesList } from "@/components/football/fixtures-list";
import { OperationalRow } from "@/components/football/operational-row";
import { TeamCrest } from "@/components/dashboard/team-crest";
import { RailModule } from "@/components/ui/rail-module";
import { fixtureOpponentLabel, formatKickoff, nextLock, pad2, starterBuckets } from "@/lib/team-fixture";
import type { LineupSlot, RoundFixture, StandingsEntry } from "@/lib/types/fantasy";
import { cn } from "@/lib/utils";

/**
 * Dashboard's secondary operations rail — a persistent, bordered column of
 * compact modules (round intelligence, live fixtures, next lock, league
 * table) standing next to the primary MatchupCommand/StartingXI surface.
 * One continuous instrument, not four floating cards.
 */
export function OperationsRail({
  starters,
  fixtures,
  standings,
  highlightTeamId,
}: {
  starters: LineupSlot[];
  fixtures: RoundFixture[];
  standings: StandingsEntry[];
  highlightTeamId?: string;
}) {
  const buckets = starterBuckets(starters);
  const complete = fixtures.filter((f) => f.state === "final").length;
  const liveFixtures = fixtures.filter((f) => f.state === "live" || f.state === "ht");
  const lock = nextLock(starters);

  return (
    <div className="flex flex-col divide-y divide-border border border-border">
      <RailModule header="ROUND_INTELLIGENCE">
        <OperationalRow
          label="FIXTURES"
          value={`${complete} / ${fixtures.length}`}
          secondary="complete"
        />
        <OperationalRow
          label="PLAYERS"
          value={`${buckets.live} live / ${buckets.locked + buckets.final} locked / ${buckets.upcoming} remaining`}
        />
      </RailModule>

      <RailModule header="LIVE_FIXTURES" meta={pad2(liveFixtures.length)}>
        {liveFixtures.length > 0 ? (
          <FixturesList fixtures={liveFixtures} />
        ) : (
          <p className="text-xs text-foreground-tertiary">No fixtures in play right now.</p>
        )}
      </RailModule>

      <RailModule header="NEXT_LOCK">
        {lock?.player.fixture ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {lock.player.name}
              </p>
              <p className="label-system truncate text-[11px] text-foreground-tertiary">
                {lock.player.club.shortName} {fixtureOpponentLabel(lock.player)} ·{" "}
                {formatKickoff(lock.player.fixture.kickoff)}
              </p>
            </div>
            <Countdown
              target={lock.player.fixture.kickoff}
              className="label-system shrink-0 text-sm font-semibold text-accent"
            />
          </div>
        ) : (
          <p className="text-xs text-foreground-tertiary">
            All starters are locked in for this matchday.
          </p>
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
        <div className="divide-y divide-border">
          {standings.slice(0, 6).map(({ rank, team }) => (
            <div
              key={team.id}
              className={cn(
                "flex items-center gap-2.5 border-l-2 border-l-transparent py-2 pl-1.5",
                team.id === highlightTeamId && "border-l-accent bg-accent/5"
              )}
            >
              <span className="label-system w-4 shrink-0 text-xs font-medium text-foreground-tertiary">
                {rank}
              </span>
              <TeamCrest team={team} size="sm" />
              <p className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                {team.name}
              </p>
              <span className="label-system shrink-0 text-xs font-semibold text-foreground">
                {team.pointsFor}
              </span>
            </div>
          ))}
        </div>
      </RailModule>
    </div>
  );
}
