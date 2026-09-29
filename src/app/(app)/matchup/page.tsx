import { Swords } from "lucide-react";
import { ComingSoon } from "@/components/shell/coming-soon";
import { NoLeagueOnboarding } from "@/components/shell/no-league-onboarding";
import { MatchupCommand } from "@/components/dashboard/matchup-command";
import { getActiveLeagueId } from "@/data-access/active-league";
import { getDraftStatus } from "@/data-access/drafts";
import { getUserLeagues } from "@/data-access/leagues";
import { getCurrentMatchup } from "@/data-access/matchups";
import { getUserTeamInLeague } from "@/data-access/teams";
import { deriveLeagueLifecycle } from "@/domain/fantasy/league-lifecycle";

export default async function MatchupPage() {
  const leagues = await getUserLeagues();
  if (leagues.length === 0) {
    return <NoLeagueOnboarding />;
  }

  const activeLeagueId = await getActiveLeagueId(leagues);
  const league = leagues.find((l) => l.id === activeLeagueId) ?? leagues[0];
  const [team, draftStatus] = await Promise.all([
    getUserTeamInLeague(league.id),
    getDraftStatus(league.id),
  ]);

  const lifecycle = deriveLeagueLifecycle({
    leagueStatus: league.status,
    memberCount: league.memberCount,
    maxTeams: league.maxTeams,
    draftStatus,
  });

  if (lifecycle === "WAITING_FOR_MANAGERS" || lifecycle === "READY_FOR_DRAFT") {
    return (
      <ComingSoon
        icon={Swords}
        title="Awaiting league draft"
        description="Matchups are scheduled once your league's draft is complete. No draft engine is available yet."
      />
    );
  }

  const matchup = team ? await getCurrentMatchup(league.id, team.id) : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Matchup
        </h1>
        <p className="mt-1.5 text-sm text-foreground-secondary">{league.name}</p>
      </div>
      <MatchupCommand matchup={matchup} hasLeague />
    </div>
  );
}
