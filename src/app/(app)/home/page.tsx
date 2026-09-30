import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { Greeting } from "@/components/dashboard/greeting";
import { LeagueStatusPanel } from "@/components/dashboard/league-status-panel";
import { MatchupCommand } from "@/components/dashboard/matchup-command";
import { OperationsRail } from "@/components/dashboard/operations-rail";
import { StartingXI } from "@/components/dashboard/starting-xi";
import { NoLeagueOnboarding } from "@/components/shell/no-league-onboarding";
import { ModuleHeader } from "@/components/ui/module-header";
import { getActiveLeagueId } from "@/data-access/active-league";
import { getDraftStatus } from "@/data-access/drafts";
import { getUserLeagues } from "@/data-access/leagues";
import { getCurrentMatchup, getStandings } from "@/data-access/matchups";
import { getCurrentProfile } from "@/data-access/profiles";
import { getUserSquad } from "@/data-access/roster";
import { getUserTeamInLeague } from "@/data-access/teams";
import { getRecentActivity } from "@/data-access/transactions";
import { deriveLeagueLifecycle } from "@/domain/fantasy/league-lifecycle";

export default async function HomePage() {
  const [profile, leagues] = await Promise.all([getCurrentProfile(), getUserLeagues()]);

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

  const [squad, matchup, standings, activity] = await Promise.all([
    team ? getUserSquad(league.id, team.id) : Promise.resolve({ formation: "—" as const, starters: [], bench: [] }),
    team ? getCurrentMatchup(league.id, team.id) : Promise.resolve(null),
    getStandings(league.id),
    getRecentActivity(league.id),
  ]);

  const startingXI = squad.starters.map((slot) => slot.player);

  return (
    <div className="flex flex-col gap-8">
      <Greeting
        managerName={profile?.displayName ?? "Manager"}
        teamName={team?.name ?? league.name}
        leagueName={league.name}
        // `Greeting`'s `round` prop expects a single "LOCKS <deadline>" —
        // that shape assumes one global weekly lineup deadline, which
        // Pass 10's real model doesn't have (locking is per-player, at
        // each player's own first eligible kickoff — docs/game-rules.md
        // "Player locking"). Passing a misleading single deadline here
        // would be worse than the truthful "no round" state; left as a
        // follow-up once Greeting's shape is revisited for the real
        // per-player lock model.
        round={null}
      />

      {lifecycle !== "ACTIVE" && lifecycle !== "COMPLETED" && (
        <LeagueStatusPanel
          leagueName={league.name}
          lifecycle={lifecycle}
          memberCount={league.memberCount}
          maxTeams={league.maxTeams}
          isCommissioner={league.role === "commissioner"}
          inviteCode={league.inviteCode}
        />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
        <div className="flex flex-col gap-6">
          <MatchupCommand matchup={matchup} hasLeague />
          <StartingXI players={startingXI} />
        </div>

        <OperationsRail starters={squad.starters} standings={standings} hasActiveRound={matchup !== null} />
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
