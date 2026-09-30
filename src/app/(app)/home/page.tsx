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
import { getCurrentMatchup, getMatchupFixtureIntelligence, getStandings } from "@/data-access/matchups";
import { getCurrentProfile } from "@/data-access/profiles";
import { getUserSquad } from "@/data-access/roster";
import { getUserTeamInLeague } from "@/data-access/teams";
import { getRecentActivity } from "@/data-access/transactions";
import { deriveLeagueLifecycle } from "@/domain/fantasy/league-lifecycle";
import type { FantasyRound } from "@/lib/types/fantasy";

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

  // Pass 10.5B: Home must not contradict what Pass 10.5A already proved
  // live (round 1 opens automatically on draft completion, a real H2H
  // matchup exists, both XIs exist) — `round` here reflects the SAME real
  // matchup, not a hardcoded "no round" state. `deadline` is the next
  // applicable lock instant (see getMatchupFixtureIntelligence), never a
  // single global deadline Eleven's real per-player-lock model doesn't
  // have — `Greeting` itself only renders the "LOCKS ..." segment when
  // this is non-null.
  const fixtureIntel = matchup ? await getMatchupFixtureIntelligence(matchup, new Date()) : null;
  const round: FantasyRound | null = matchup
    ? {
        number: matchup.roundNumber,
        label: `Matchday ${matchup.roundNumber}`,
        deadline: fixtureIntel?.nextFixture?.kickoffAt ?? null,
        status: matchup.status === "final" ? "completed" : matchup.status === "live" ? "in-progress" : "upcoming",
      }
    : null;

  return (
    <div className="flex flex-col gap-8">
      <Greeting
        managerName={profile?.displayName ?? "Manager"}
        teamName={team?.name ?? league.name}
        leagueName={league.name}
        round={round}
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

        <OperationsRail
          starters={squad.starters}
          standings={standings}
          hasActiveRound={matchup !== null}
          fixtureIntel={fixtureIntel}
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
