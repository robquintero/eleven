import { Suspense } from "react";
import { ModuleLoading } from "@/components/shell/workspace-loading";
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
import { getLeagueTeams, getUserTeamInLeague } from "@/data-access/teams";
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
  const standingsPromise = getStandings(league.id);
  const activityPromise = getRecentActivity(league.id);
  const teamsPromise = team ? getLeagueTeams(league.id) : Promise.resolve([]);
  const agentsPromise = getHotFreeAgents(league.id);
  const tradesPromise = team ? getTeamTrades(league.id, team.id) : Promise.resolve({ incoming: [], outgoing: [] });
  for (const read of [standingsPromise, activityPromise, teamsPromise, agentsPromise, tradesPromise]) void read.catch(() => {});
  const [{ matchup, matchupSquads, fixtureIntel, fallbackSquad }, activeRoster] = await Promise.all([
    matchupPromise,
    team ? getTeamRosterPlayers(league.id, team.id) : Promise.resolve([]),
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
          <Suspense fallback={<ModuleLoading title="OPERATIONS" rows={4} />}>
            <HomeOperations standingsPromise={standingsPromise} starters={mySquad.starters} matchup={matchup} fixtureIntel={fixtureIntel} teamId={team?.id ?? null} />
          </Suspense>
          {team && <Suspense fallback={<ModuleLoading title="TRADE_DESK" rows={2} />}>
            <HomeTrades leagueId={league.id} teamId={team.id} teamsPromise={teamsPromise} tradesPromise={tradesPromise} />
          </Suspense>}
          <Suspense fallback={<ModuleLoading title="FORM_INTELLIGENCE" rows={3} />}>
            <HomeForm agentsPromise={agentsPromise} leagueId={league.id} canTransact={Boolean(team)} />
          </Suspense>
        </div>
      </div>

      <Suspense fallback={<ModuleLoading title="OPERATIONS_FEED" rows={3} />}>
        <HomeActivity activityPromise={activityPromise} />
      </Suspense>
    </div>
  );
}

async function HomeOperations({ standingsPromise, starters, matchup, fixtureIntel, teamId }: {
  standingsPromise: ReturnType<typeof getStandings>;
  starters: import("@/lib/types/fantasy").LineupSlot[];
  matchup: Awaited<ReturnType<typeof getCurrentMatchup>>;
  fixtureIntel: Awaited<ReturnType<typeof getMatchupFixtureIntelligence>> | null;
  teamId: string | null;
}) {
  const standings = await standingsPromise;
  return <OperationsRail starters={starters} standings={standings}
    hasActiveRound={matchup !== null && matchup.roundStatus !== "completed"} fixtureIntel={fixtureIntel} myTeamId={teamId} />;
}

async function HomeTrades({ leagueId, teamId, teamsPromise, tradesPromise }: {
  leagueId: string; teamId: string; teamsPromise: ReturnType<typeof getLeagueTeams>; tradesPromise: ReturnType<typeof getTeamTrades>;
}) {
  const [allTeams, trades] = await Promise.all([teamsPromise, tradesPromise]);
  return (
  <div className="border border-border p-4">
    <p className="label-system text-[11px] text-foreground-tertiary">TRADE_DESK</p>
    <div className="mt-2.5">
      <TradeDesk
        leagueId={leagueId}
        myTeamId={teamId}
        otherTeams={allTeams.filter(team => team.id !== teamId)}
        incoming={trades.incoming}
        outgoing={trades.outgoing}
      />
    </div>
  </div>
  );
}

async function HomeForm({ agentsPromise, leagueId, canTransact }: {
  agentsPromise: ReturnType<typeof getHotFreeAgents>; leagueId: string; canTransact: boolean;
}) {
  return <FormIntelligence agents={await agentsPromise} leagueId={leagueId} canTransact={canTransact} />;
}

async function HomeActivity({ activityPromise }: { activityPromise: ReturnType<typeof getRecentActivity> }) {
  const activity = await activityPromise;
  return <section><ModuleHeader title="OPERATIONS_FEED" meta={activity.length} />
    <div className="mt-1"><ActivityFeed items={activity} /></div>
  </section>;
}
