import { MatchupPageView } from "@/components/matchup/matchup-page-view";
import type { Metadata } from "next";
import { Swords } from "lucide-react";
import { ComingSoon } from "@/components/shell/coming-soon";
import { NoLeagueOnboarding } from "@/components/shell/no-league-onboarding";
import { getActiveLeagueId } from "@/data-access/active-league";
import { getDraftStatus } from "@/data-access/drafts";
import { getUserLeagues } from "@/data-access/leagues";
import { getCurrentMatchup } from "@/data-access/matchups";
import { getUserTeamInLeague } from "@/data-access/teams";
import { deriveLeagueLifecycle } from "@/domain/fantasy/league-lifecycle";

export const metadata: Metadata = { title: "Matchup" };

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
        description="Matchups are scheduled once your league's draft is complete."
      />
    );
  }

  const matchup = team ? await getCurrentMatchup(league.id, team.id) : null;
  return <MatchupPageView league={league} matchup={matchup} />;
}
