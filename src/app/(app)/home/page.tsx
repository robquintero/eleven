import { TransitionLink } from "@/components/shell/transition-link";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
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
import { getUserLeagues } from "@/data-access/leagues";
import { getCurrentMatchup, getMatchupFixtureIntelligence, getMatchupSquads, getStandings, getTeamIdsByPlayerIds } from "@/data-access/matchups";
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
  const now = new Date();
  const fixtureIntel = matchup ? await getMatchupFixtureIntelligence(matchup, now) : null;

  // Pass 14.5: fetched whenever a matchup exists, never gated on
  // `matchup.status !== "scheduled"` -- `matchups.status` only reflects
  // whether a fixture is CURRENTLY live right now and reverts to
  // "scheduled" the instant nothing is (see data-access/matchups.ts's own
  // `roundStatus` doc comment), so that gate was hiding real, already-
  // locked/already-final starter data exactly in the case most worth
  // showing (e.g. The Room's Round 1, where several starters' fixtures
  // have already kicked off or finished while no fixture happens to be
  // live AT THIS SECOND). Pure stored-data reads, no provider cost either way.
  const matchupSquads = matchup ? await getMatchupSquads(matchup) : null;
  const mySquad = matchup && matchupSquads ? (matchup.isUserHome ? matchupSquads.home : matchupSquads.away) : squad;

  // Pass 14: each starter's full team-id set (club + any national teams)
  // so "N OF YOUR XI INVOLVED" correctly counts a starter whose next
  // fixture is international, not just a club match.
  const teamIdsByPlayerId = await getTeamIdsByPlayerIds(mySquad.starters.map((slot) => slot.player.id));

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
