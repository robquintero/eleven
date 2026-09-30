import { Swords } from "lucide-react";
import { ComingSoon } from "@/components/shell/coming-soon";
import { NoLeagueOnboarding } from "@/components/shell/no-league-onboarding";
import { StartDraftButton } from "@/components/draft/start-draft-button";
import { DraftPageClient } from "@/components/draft/draft-page-client";
import { getActiveLeagueId } from "@/data-access/active-league";
import { getDraftStatus, getDraftState } from "@/data-access/drafts";
import { getUserLeagues } from "@/data-access/leagues";
import { getUserTeamInLeague } from "@/data-access/teams";
import { deriveLeagueLifecycle } from "@/domain/fantasy/league-lifecycle";

export default async function DraftPage() {
  const leagues = await getUserLeagues();
  if (leagues.length === 0) {
    return <NoLeagueOnboarding />;
  }

  const activeLeagueId = await getActiveLeagueId(leagues);
  const league = leagues.find((l) => l.id === activeLeagueId) ?? leagues[0];
  const [team, draftStatus] = await Promise.all([getUserTeamInLeague(league.id), getDraftStatus(league.id)]);

  const lifecycle = deriveLeagueLifecycle({
    leagueStatus: league.status,
    memberCount: league.memberCount,
    maxTeams: league.maxTeams,
    draftStatus,
  });

  if (lifecycle === "WAITING_FOR_MANAGERS") {
    return (
      <ComingSoon
        icon={Swords}
        title="Waiting for managers"
        description={`This league needs ${league.maxTeams} managers before the draft can begin. Invite more managers from the League screen.`}
      />
    );
  }

  if (lifecycle === "READY_FOR_DRAFT") {
    return (
      <ComingSoon
        icon={Swords}
        title="Ready for draft"
        description={
          league.role === "commissioner"
            ? "Your league is full. Start the draft to begin building rosters."
            : "Your league is full. Waiting for the commissioner to start the draft."
        }
      >
        {league.role === "commissioner" && <StartDraftButton leagueId={league.id} />}
      </ComingSoon>
    );
  }

  const draft = await getDraftState(league.id);
  if (!draft) {
    return (
      <ComingSoon icon={Swords} title="Draft not available" description="This league doesn't have a draft yet." />
    );
  }

  return <DraftPageClient leagueId={league.id} draft={draft} hasTeam={Boolean(team)} />;
}
