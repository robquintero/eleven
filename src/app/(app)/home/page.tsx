import type { Metadata } from "next";
import { TransitionLink } from "@/components/shell/transition-link";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { FormIntelligence } from "@/components/dashboard/form-intelligence";
import { Greeting } from "@/components/dashboard/greeting";
import { LeagueStatusPanel } from "@/components/dashboard/league-status-panel";
import { MatchupCommand } from "@/components/dashboard/matchup-command";
import { OperationsRail } from "@/components/dashboard/operations-rail";
import { StartingXI } from "@/components/dashboard/starting-xi";
import { TradeDesk } from "@/components/dashboard/trade-desk";
import { MatchupPlayerCounts } from "@/components/matchup/matchup-player-counts";
import { RoundWindow } from "@/components/football/round-window";
import { NoLeagueOnboarding } from "@/components/shell/no-league-onboarding";
import { ModuleHeader } from "@/components/ui/module-header";
import { getActiveLeagueId } from "@/data-access/active-league";
import { getDraftStatus } from "@/data-access/drafts";
import { getHotFreeAgents } from "@/data-access/intelligence";
import { getUserLeagues } from "@/data-access/leagues";
import { getCurrentMatchup, getMatchupFixtureIntelligence, getMatchupSquads, getStandings } from "@/data-access/matchups";
import { getCurrentProfile } from "@/data-access/profiles";
import { getTeamRosterPlayers } from "@/data-access/roster";
import { getUserSquad } from "@/data-access/roster";
import { getLeagueTeams, getUserTeamInLeague, type Team } from "@/data-access/teams";
import { getRecentActivity } from "@/data-access/transactions";
import { getTeamTrades } from "@/data-access/trades";
import { deriveLeagueLifecycle } from "@/domain/fantasy/league-lifecycle";
import { rosterVacancies, type RosterCounts } from "@/domain/fantasy/roster-rules";
import type { FantasyRound } from "@/lib/types/fantasy";

export const metadata: Metadata = { title: "Home" };

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

  const now = new Date();
  // Matchup-dependent reads start as soon as the matchup arrives, without
  // waiting for standings, activity or market intelligence.
  const matchupPromise = (async () => {
    const matchup = team ? await getCurrentMatchup(league.id, team.id) : null;
    const [matchupSquads, fixtureIntel, fallbackSquad] = await Promise.all([
      matchup ? getMatchupSquads(matchup) : Promise.resolve(null),
      matchup ? getMatchupFixtureIntelligence(matchup, now) : Promise.resolve(null),
      !matchup && team ? getUserSquad(league.id, team.id) : Promise.resolve(null),
    ]);
    return { matchup, matchupSquads, fixtureIntel, fallbackSquad };
  })();
  const [{ matchup, matchupSquads, fixtureIntel, fallbackSquad }, standings, activity, allTeams, hotFreeAgents, activeRoster, trades] = await Promise.all([
    matchupPromise,
    getStandings(league.id),
    getRecentActivity(league.id),
    team ? getLeagueTeams(league.id) : Promise.resolve<Team[]>([]),
    getHotFreeAgents(league.id),
    team ? getTeamRosterPlayers(league.id, team.id) : Promise.resolve([]),
    team ? getTeamTrades(league.id, team.id) : Promise.resolve({ incoming: [], outgoing: [] }),
  ]);
  // Vacancy counts describe CURRENT ownership; matchup lineups can retain
  // locked historical players after a trade. Do not count those as roster.
  const positionCounts: RosterCounts = {};
  for (const player of activeRoster) positionCounts[player.position] = (positionCounts[player.position] ?? 0) + 1;
  const vacancies = rosterVacancies(positionCounts);
  const mySquad = matchup && matchupSquads
    ? (matchup.isUserHome ? matchupSquads.home : matchupSquads.away)
    : fallbackSquad ?? { formation: "—", starters: [], bench: [] };
  const teamIdsByPlayerId = matchupSquads?.teamIdsByPlayerId;
  const tradeDeskProps = team ? {
    myTeamId: team.id,
    otherTeams: allTeams.filter((t) => t.id !== team.id),
    ...trades,
  } : null;

  const topPerformer = matchupSquads
    ? [...matchupSquads.home.starters, ...matchupSquads.away.starters]
        .map((s) => s.player)
        .reduce<{ name: string; club: string; points: number } | null>((best, player) => {
          if (!best || player.fantasyPoints > best.points) {
            return { name: player.name, club: player.club.shortName, points: player.fantasyPoints };
          }
          return best;
        }, null)
    : null;
  // Pass 14.5: reads the round's own authoritative `roundStatus`
  // (fantasy_rounds.status), never the transient `matchup.status` --
  // see data-access/matchups.ts's `CurrentMatchup.roundStatus` comment.
  const round: FantasyRound | null = matchup
    ? {
        number: matchup.roundNumber,
        label: `Matchday ${matchup.roundNumber}`,
        deadline: fixtureIntel?.nextFixture?.kickoffAt ?? null,
        status:
          matchup.roundStatus === "completed" ? "completed" : matchup.roundStatus === "in_progress" ? "in-progress" : "upcoming",
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

      {matchup && (
        <RoundWindow
          round={{ number: matchup.roundNumber, startsAt: matchup.roundStartsAt, endsAt: matchup.roundEndsAt, status: matchup.roundStatus }}
        />
      )}

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
          <MatchupCommand matchup={matchup} hasLeague now={now} fixtureIntel={fixtureIntel} starters={mySquad.starters} teamIdsByPlayerId={teamIdsByPlayerId} />

          {matchup && matchupSquads && matchup.roundStatus !== "upcoming" && (
            <MatchupPlayerCounts
              myTeamName={matchup.isUserHome ? matchup.homeTeamName : matchup.awayTeamName}
              opponentTeamName={matchup.isUserHome ? matchup.awayTeamName : matchup.homeTeamName}
              mySquad={matchup.isUserHome ? matchupSquads.home : matchupSquads.away}
              opponentSquad={matchup.isUserHome ? matchupSquads.away : matchupSquads.home}
            />
          )}

          {topPerformer && topPerformer.points > 0 && (
            <p className="label-system text-center text-[11px] text-foreground-tertiary">
              TOP PERFORMANCE · {topPerformer.name} ({topPerformer.club}) · {topPerformer.points.toFixed(1)} PTS
            </p>
          )}

          {team && vacancies.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border border-accent/30 bg-accent/5 px-4 py-3">
              <div>
                <p className="label-system text-[11px] text-accent">ROSTER VACANCY</p>
                <p className="mt-0.5 text-xs text-foreground-secondary">
                  Short on {vacancies.map((v) => `${v.short} ${v.position}`).join(", ")}.
                </p>
              </div>
              <TransitionLink href="/players" label="Players" className="label-system shrink-0 text-[11px] text-accent hover:underline">
                BROWSE MARKET →
              </TransitionLink>
            </div>
          )}

          <StartingXI players={mySquad.starters.map((slot) => slot.player)} />
        </div>

        <div className="flex flex-col gap-6">
          <OperationsRail
            starters={mySquad.starters}
            standings={standings}
            hasActiveRound={matchup !== null && matchup.roundStatus !== "completed"}
            fixtureIntel={fixtureIntel}
            myTeamId={team?.id ?? null}
          />

          {tradeDeskProps && (
            <div className="border border-border p-4">
              <p className="label-system text-[11px] text-foreground-tertiary">TRADE_DESK</p>
              <div className="mt-2.5">
                <TradeDesk
                  leagueId={league.id}
                  myTeamId={tradeDeskProps.myTeamId}
                  otherTeams={tradeDeskProps.otherTeams}
                  incoming={tradeDeskProps.incoming}
                  outgoing={tradeDeskProps.outgoing}
                />
              </div>
            </div>
          )}

          <FormIntelligence agents={hotFreeAgents} leagueId={league.id} canTransact={Boolean(team)} />
        </div>
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
