import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { Greeting } from "@/components/dashboard/greeting";
import { MatchupCommand } from "@/components/dashboard/matchup-command";
import { OperationsRail } from "@/components/dashboard/operations-rail";
import { StartingXI } from "@/components/dashboard/starting-xi";
import { ModuleHeader } from "@/components/ui/module-header";
import {
  activity,
  currentLeague,
  currentMatchup,
  currentRound,
  currentUserTeam,
  opponentLineupBuckets,
  standings,
} from "@/lib/mock/dashboard";
import { roundFixtures } from "@/lib/mock/fixtures";
import { squad } from "@/lib/mock/team";

export default function Home() {
  const startingXI = squad.starters.map((slot) => slot.player);

  return (
    <div className="flex flex-col gap-8">
      <Greeting
        managerName={currentUserTeam.manager.displayName}
        teamName={currentUserTeam.name}
        league={currentLeague}
        round={currentRound}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
        <div className="flex flex-col gap-6">
          <MatchupCommand
            matchup={currentMatchup}
            starters={squad.starters}
            opponentBuckets={opponentLineupBuckets}
          />
          <StartingXI players={startingXI} />
        </div>

        <OperationsRail
          starters={squad.starters}
          fixtures={roundFixtures}
          standings={standings}
          highlightTeamId={currentUserTeam.id}
        />
      </div>

      <section>
        <ModuleHeader title="OPERATIONS_FEED" meta={activity.length} />
        <div className="mt-1">
          <ActivityFeed items={activity} />
        </div>
      </section>
    </div>
  );
}
