import { Swords } from "lucide-react";
import { ComingSoon } from "@/components/shell/coming-soon";
import { NoLeagueOnboarding } from "@/components/shell/no-league-onboarding";
import { MatchupCommand } from "@/components/dashboard/matchup-command";
import { MatchupLineups } from "@/components/matchup/matchup-lineups";
import { MatchupPlayerCounts } from "@/components/matchup/matchup-player-counts";
import { getActiveLeagueId } from "@/data-access/active-league";
import { getDraftStatus } from "@/data-access/drafts";
import { getUserLeagues } from "@/data-access/leagues";
import { getCurrentMatchup, getMatchupFixtureIntelligence, getMatchupSquads } from "@/data-access/matchups";
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
        description="Matchups are scheduled once your league's draft is complete."
      />
    );
  }

  const matchup = team ? await getCurrentMatchup(league.id, team.id) : null;
  const squads = matchup ? await getMatchupSquads(matchup) : null;
  const now = new Date();
  const fixtureIntel = matchup ? await getMatchupFixtureIntelligence(matchup, now) : null;
  const myStarters = squads ? (matchup!.isUserHome ? squads.home.starters : squads.away.starters) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Matchup
        </h1>
        <p className="mt-1.5 text-sm text-foreground-secondary">{league.name}</p>
      </div>

      {/* Pass 13 (§5): tighter rhythm (gap-3, not the page's own gap-6)
          between the score module and the XI below it -- proximity is the
          cheapest, safest way to read "these belong to one matchday
          surface" without merging independently-rendered borders between
          sibling components (DESIGN.md §5's hierarchy order puts
          whitespace ahead of borders for exactly this reason). */}
      <div className="flex flex-col gap-3">
        <MatchupCommand matchup={matchup} hasLeague now={now} fixtureIntel={fixtureIntel} starters={myStarters} />

        {matchup && squads && (
          <>
            <MatchupPlayerCounts
              myTeamName={matchup.isUserHome ? matchup.homeTeamName : matchup.awayTeamName}
              opponentTeamName={matchup.isUserHome ? matchup.awayTeamName : matchup.homeTeamName}
              mySquad={matchup.isUserHome ? squads.home : squads.away}
              opponentSquad={matchup.isUserHome ? squads.away : squads.home}
            />

            <MatchupLineups
              homeTeamName={matchup.homeTeamName}
              awayTeamName={matchup.awayTeamName}
              isUserHome={matchup.isUserHome}
              homeSquad={squads.home}
              awaySquad={squads.away}
            />
          </>
        )}
      </div>
    </div>
  );
}
