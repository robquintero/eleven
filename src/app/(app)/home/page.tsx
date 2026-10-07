import { Suspense } from "react";
import "@/components/dashboard/home-v2.css";
import { V2Loading } from "@/components/ui/v2";
import { HomeIdentity, HomeMatchup, HomeFixtureCard, HomeLeaguePosition, HomeSection } from "@/components/dashboard/home-overview";
import type { Metadata } from "next";
import { TransitionLink } from "@/components/shell/transition-link";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { FormIntelligence } from "@/components/dashboard/form-intelligence";
import { LeagueStatusPanel } from "@/components/dashboard/league-status-panel";
import { StartingXI } from "@/components/dashboard/starting-xi";
import { TradeDesk } from "@/components/dashboard/trade-desk";
import { NoLeagueOnboarding } from "@/components/shell/no-league-onboarding";
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

export const metadata: Metadata = { title: "Home" };

export default async function HomePage() {
  const [, leagues] = await Promise.all([getCurrentProfile(), getUserLeagues()]);

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
  return (
    <div className="home-v2">
      <HomeIdentity teamName={team?.name ?? league.name} leagueName={league.name} matchup={matchup} />
      <HomeMatchup matchup={matchup} now={now} squads={matchupSquads} topPerformer={topPerformer} />

      {lifecycle !== "ACTIVE" && lifecycle !== "COMPLETED" && (
        <LeagueStatusPanel leagueName={league.name} lifecycle={lifecycle} memberCount={league.memberCount}
          maxTeams={league.maxTeams} isCommissioner={league.role === "commissioner"} inviteCode={league.inviteCode} />
      )}

      <div className="home-intelligence">
        <HomeFixtureCard fixtureIntel={fixtureIntel} starters={mySquad.starters} teamIdsByPlayerId={teamIdsByPlayerId}
          hasActiveRound={matchup !== null && matchup.roundStatus !== "completed"} />
        <Suspense fallback={<V2Loading title="League position" rows={3} />}>
          <HomeOperations standingsPromise={standingsPromise} teamId={team?.id ?? null} />
        </Suspense>
      </div>

      {team && vacancies.length > 0 && <section className="home-attention" aria-label="Roster vacancy">
        <div><h2>Your squad has room to fill</h2><p className="home-secondary mt-1">Short on {vacancies.map(v => `${v.short} ${v.position}`).join(", ")}.</p></div>
        <TransitionLink href="/players" label="Players" className="v2-link">Browse players →</TransitionLink>
      </section>}

      <div className="home-support-grid">
        <div className="home-stack">
          <StartingXI players={mySquad.starters.map(slot => slot.player)} />
          <Suspense fallback={<V2Loading title="Recent activity" rows={3} />}>
            <HomeActivity activityPromise={activityPromise} />
          </Suspense>
        </div>
        <div className="home-stack">
          {team && <Suspense fallback={<V2Loading title="Trades" rows={2} />}>
            <HomeTrades leagueId={league.id} teamId={team.id} teamsPromise={teamsPromise} tradesPromise={tradesPromise} />
          </Suspense>}
          <Suspense fallback={<V2Loading title="Free agents in form" rows={3} />}>
            <HomeForm agentsPromise={agentsPromise} leagueId={league.id} canTransact={Boolean(team)} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

async function HomeOperations({ standingsPromise, teamId }: {
  standingsPromise: ReturnType<typeof getStandings>; teamId: string | null;
}) {
  return <HomeLeaguePosition standings={await standingsPromise} myTeamId={teamId} />;
}

async function HomeTrades({ leagueId, teamId, teamsPromise, tradesPromise }: {
  leagueId: string; teamId: string; teamsPromise: ReturnType<typeof getLeagueTeams>; tradesPromise: ReturnType<typeof getTeamTrades>;
}) {
  const [allTeams, trades] = await Promise.all([teamsPromise, tradesPromise]);
  return <HomeSection title="Trades" description="Your league's transfer conversations.">
    <TradeDesk leagueId={leagueId} myTeamId={teamId} otherTeams={allTeams.filter(team => team.id !== teamId)}
      incoming={trades.incoming} outgoing={trades.outgoing} />
  </HomeSection>;
}

async function HomeForm({ agentsPromise, leagueId, canTransact }: {
  agentsPromise: ReturnType<typeof getHotFreeAgents>; leagueId: string; canTransact: boolean;
}) {
  return <FormIntelligence agents={await agentsPromise} leagueId={leagueId} canTransact={canTransact} />;
}

async function HomeActivity({ activityPromise }: { activityPromise: ReturnType<typeof getRecentActivity> }) {
  const activity = await activityPromise;
  return <HomeSection title="Recent activity" description={activity.length > 0 ? `${activity.length} recent league events` : undefined} action={<TransitionLink href="/league" label="League" className="v2-link">Open league →</TransitionLink>}>
    <ActivityFeed items={activity} />
  </HomeSection>;
}
