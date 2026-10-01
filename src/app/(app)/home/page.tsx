import Link from "next/link";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { Greeting } from "@/components/dashboard/greeting";
import { LeagueStatusPanel } from "@/components/dashboard/league-status-panel";
import { MatchupCommand } from "@/components/dashboard/matchup-command";
import { OperationsRail } from "@/components/dashboard/operations-rail";
import { StartingXI } from "@/components/dashboard/starting-xi";
import { TradeDesk } from "@/components/dashboard/trade-desk";
import { NoLeagueOnboarding } from "@/components/shell/no-league-onboarding";
import { ModuleHeader } from "@/components/ui/module-header";
import { getActiveLeagueId } from "@/data-access/active-league";
import { getDraftStatus } from "@/data-access/drafts";
import { getUserLeagues } from "@/data-access/leagues";
import { getCurrentMatchup, getMatchupFixtureIntelligence, getStandings } from "@/data-access/matchups";
import { getCurrentProfile } from "@/data-access/profiles";
import { getTeamRosterPlayers, type RosterPlayerOption } from "@/data-access/roster";
import { getUserSquad } from "@/data-access/roster";
import { getLeagueTeams, getUserTeamInLeague, type Team } from "@/data-access/teams";
import { getRecentActivity } from "@/data-access/transactions";
import { getTeamTrades, type TradeView } from "@/data-access/trades";
import { deriveLeagueLifecycle } from "@/domain/fantasy/league-lifecycle";
import { rosterVacancies, type RosterCounts } from "@/domain/fantasy/roster-rules";
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

  const [squad, matchup, standings, activity, allTeams] = await Promise.all([
    team ? getUserSquad(league.id, team.id) : Promise.resolve({ formation: "—" as const, starters: [], bench: [] }),
    team ? getCurrentMatchup(league.id, team.id) : Promise.resolve(null),
    getStandings(league.id),
    getRecentActivity(league.id),
    team ? getLeagueTeams(league.id) : Promise.resolve<Team[]>([]),
  ]);

  const startingXI = squad.starters.map((slot) => slot.player);

  // Pass 11.5: roster-vacancy readout -- same shared `rosterVacancies`
  // definition the Team page uses, never a second copy of "what counts
  // as short."
  const positionCounts: RosterCounts = {};
  for (const slot of squad.starters) positionCounts[slot.player.position] = (positionCounts[slot.player.position] ?? 0) + 1;
  for (const player of squad.bench) positionCounts[player.position] = (positionCounts[player.position] ?? 0) + 1;
  const vacancies = rosterVacancies(positionCounts);

  // Trade entry point -- same composition pattern /league already uses
  // (getLeagueTeams -> per-team rosters -> getTeamTrades), reused as-is
  // so Home's TradeDesk needs no new trade data-access of its own.
  let tradeDeskProps: {
    myTeamId: string;
    myRoster: RosterPlayerOption[];
    otherTeams: Team[];
    rostersByTeamId: Record<string, RosterPlayerOption[]>;
    incoming: TradeView[];
    outgoing: TradeView[];
  } | null = null;

  if (team) {
    const otherTeams = allTeams.filter((t) => t.id !== team.id);
    const [myRoster, otherRosters, trades] = await Promise.all([
      getTeamRosterPlayers(league.id, team.id),
      Promise.all(otherTeams.map((t) => getTeamRosterPlayers(league.id, t.id))),
      getTeamTrades(league.id, team.id),
    ]);
    const rostersByTeamId = Object.fromEntries(otherTeams.map((t, i) => [t.id, otherRosters[i]]));
    tradeDeskProps = {
      myTeamId: team.id,
      myRoster,
      otherTeams,
      rostersByTeamId,
      incoming: trades.incoming,
      outgoing: trades.outgoing,
    };
  }

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

          {team && vacancies.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border border-accent/30 bg-accent/5 px-4 py-3">
              <div>
                <p className="label-system text-[11px] text-accent">ROSTER VACANCY</p>
                <p className="mt-0.5 text-xs text-foreground-secondary">
                  Short on {vacancies.map((v) => `${v.short} ${v.position}`).join(", ")}.
                </p>
              </div>
              <Link href="/players" className="label-system shrink-0 text-[11px] text-accent hover:underline">
                BROWSE MARKET →
              </Link>
            </div>
          )}

          <StartingXI players={startingXI} />
        </div>

        <div className="flex flex-col gap-6">
          <OperationsRail
            starters={squad.starters}
            standings={standings}
            hasActiveRound={matchup !== null}
            fixtureIntel={fixtureIntel}
          />

          {tradeDeskProps && (
            <div className="border border-border p-4">
              <p className="label-system text-[11px] text-foreground-tertiary">TRADE_DESK</p>
              <div className="mt-2.5">
                <TradeDesk
                  leagueId={league.id}
                  myTeamId={tradeDeskProps.myTeamId}
                  myRoster={tradeDeskProps.myRoster}
                  otherTeams={tradeDeskProps.otherTeams}
                  rostersByTeamId={tradeDeskProps.rostersByTeamId}
                  incoming={tradeDeskProps.incoming}
                  outgoing={tradeDeskProps.outgoing}
                />
              </div>
            </div>
          )}
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
