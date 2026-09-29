import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { Greeting } from "@/components/dashboard/greeting";
import { MatchupHero } from "@/components/dashboard/matchup-hero";
import { RoundStatus } from "@/components/dashboard/round-status";
import { StandingsPreview } from "@/components/dashboard/standings-preview";
import { StartingXI } from "@/components/dashboard/starting-xi";
import { FixturesList } from "@/components/football/fixtures-list";
import {
  activity,
  currentLeague,
  currentMatchup,
  currentRound,
  currentUserTeam,
  standings,
  startingXI,
} from "@/lib/mock/dashboard";
import { roundFixtures } from "@/lib/mock/fixtures";
import { squad } from "@/lib/mock/team";

export default function Home() {
  const liveFixtures = roundFixtures.filter(
    (f) => f.state === "live" || f.state === "ht"
  );

  return (
    <div className="flex flex-col gap-10 sm:gap-12">
      <Greeting
        managerName={currentUserTeam.manager.displayName}
        teamName={currentUserTeam.name}
        league={currentLeague}
        round={currentRound}
      />

      <MatchupHero matchup={currentMatchup} />

      <section className="order-3 lg:order-2">
        <div className="grid grid-cols-1 gap-8 border-t border-border pt-8 lg:grid-cols-2 lg:gap-12">
          <RoundStatus
            starters={squad.starters}
            matchup={currentMatchup}
            fixtures={roundFixtures}
          />
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              Live fixtures
            </h2>
            <div className="mt-2">
              {liveFixtures.length > 0 ? (
                <FixturesList fixtures={liveFixtures} />
              ) : (
                <p className="mt-1 text-sm text-foreground-tertiary">
                  No fixtures in play right now.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="order-2 lg:order-3">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.3fr_1fr] lg:gap-12">
          <StartingXI players={startingXI} />

          <div className="space-y-10">
            <StandingsPreview
              entries={standings.slice(0, 6)}
              highlightTeamId={currentUserTeam.id}
            />
            <ActivityFeed items={activity} />
          </div>
        </div>
      </div>
    </div>
  );
}
