import { notFound } from "next/navigation";
import { V2Heading, V2Surface } from "@/components/ui/v2";
import { TransitionLink } from "@/components/shell/transition-link";
import { LeagueMatchups } from "./league-matchups";
import { RoundNavigation } from "./round-navigation";
import { LeagueRecordsList } from "./league-records";
import { SeasonArchiveList } from "./season-archive-list";
import { TradeCenter } from "./trade-center";
import { MatchupStatus } from "@/components/football/matchup-status";
import { matchupResultState } from "@/domain/fantasy/matchup-result-state";
import { formatRoundWindow } from "@/lib/team-fixture";
import { eligibleByeTeams } from "@/lib/spectator-navigation";
import type { getLeagueDetail } from "@/data-access/leagues";
import type { getLeagueCompetitionSummary } from "@/data-access/matchups";
import type { getRecentActivity } from "@/data-access/transactions";
import type { getTeamTrades } from "@/data-access/trades";
import type { getUserTeamInLeague, getLeagueTeams } from "@/data-access/teams";
import type { listSeasons } from "@/data-access/seasons";

type CompetitionPromise = Promise<Awaited<ReturnType<typeof getLeagueCompetitionSummary>> | null>;
type TradePromise = Promise<{ myTeamId: string; otherTeams: Awaited<ReturnType<typeof getLeagueTeams>> } & Awaited<ReturnType<typeof getTeamTrades>> | null>;

export async function LeagueMatchweek({ competitionPromise, myTeamId, requestedRound }: { requestedRound?: string; competitionPromise: CompetitionPromise; myTeamId: string | null }) {
  const competition = await competitionPromise;
  const rounds = competition?.rounds ?? [];
  const currentId = competition?.currentRoundId ?? competition?.currentRoundMatchups[0]?.roundId ?? rounds.at(-1)?.id;
  const selected = rounds.find(r => r.id === (requestedRound ?? currentId));
  if (requestedRound && !selected) notFound();
  const matchups = selected ? (competition?.allRoundMatchups ?? []).filter(m => m.roundId === selected.id) : competition?.currentRoundMatchups ?? [];
  const byes = selected ? eligibleByeTeams(competition?.teams ?? [], matchups) : [];
  const date = (value: string) => new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value));
  return <V2Surface className="v2-focus" label="Matchweek">
    <div className="v2-week-identity">
      <div>
        <div className={`v2-week-context ${selected?.id === currentId ? "v2-current-context" : ""}`}><span className="v2-meta">{selected?.id === currentId ? "This week" : "League matchups"}</span>
          {selected && <MatchupStatus state={matchupResultState({ startsAt: selected.startsAt, endsAt: selected.endsAt, roundStatus: selected.status }, new Date())} />}
        </div>
        <h2 className="v2-week-title">{selected ? `Matchweek ${selected.number}` : "Matchweek"}</h2>
        {selected && <><p className="v2-secondary mt-2">{date(selected.startsAt)} — {date(selected.endsAt)}</p><p className="v2-meta mt-1">{formatRoundWindow(selected.startsAt, selected.endsAt)}</p></>}
      </div>
    </div>
    <div className="v2-week-controls">
      {selected && <RoundNavigation rounds={rounds} selectedId={selected.id} currentId={currentId} v2 />}
      {myTeamId && <TransitionLink href="/matchup" label="My Matchup" className="v2-link">My matchup →</TransitionLink>}
    </div>
    <LeagueMatchups variant="v2" matchups={matchups} myTeamId={myTeamId} emptyLabel="No matchups for this round" />
    {byes.map(team => <TransitionLink key={team.id} href={`/team/${team.id}?round=${selected!.id}`} label={team.name} className="v2-bye mt-3"><span className="min-w-0 text-sm font-medium [overflow-wrap:anywhere]">{team.name}</span><span className="v2-meta shrink-0">BYE</span></TransitionLink>)}
  </V2Surface>;
}

export async function LeagueRecords({ competitionPromise }: { competitionPromise: CompetitionPromise }) {
  const competition = await competitionPromise;
  return <V2Surface><V2Heading title="League records" description="The season's official benchmarks." /><LeagueRecordsList records={competition?.records ?? {
    highestScore: null, lowestScore: null, largestMargin: null, closestMatchup: null, mostPointsFor: null, mostPointsAgainst: null,
  }} /></V2Surface>;
}
export async function LeagueResults({ competitionPromise, myTeamId }: { competitionPromise: CompetitionPromise; myTeamId: string | null }) {
  const competition = await competitionPromise;
  return <V2Surface><V2Heading title="Recent results" description="Closed matchweeks, including results still finalizing." />
    <div className="px-4 pb-4 sm:px-5 sm:pb-5"><LeagueMatchups variant="v2" compact matchups={competition?.recentResults ?? []} myTeamId={myTeamId} emptyLabel="No results yet" /></div>
  </V2Surface>;
}
export async function LeagueArchive({ archivePromise }: { archivePromise: ReturnType<typeof listSeasons> }) {
  const pastSeasons = await archivePromise;
  return pastSeasons.length > 1 ? <V2Surface className="v2-support"><V2Heading title="Season archive" /><SeasonArchiveList seasons={pastSeasons} /></V2Surface> : null;
}
export async function LeagueTransactions({ activityPromise }: { activityPromise: ReturnType<typeof getRecentActivity> }) {
  const activity = await activityPromise;
  return <V2Surface className="v2-support"><V2Heading title="League activity" meta={<span className="v2-meta">Latest {activity.length || "transactions"}</span>} />
    <div className="px-5 pb-5">{activity.length ? activity.map(entry => <div key={entry.id} className="v2-activity-row"><span className="v2-activity-dot" aria-hidden="true" /><div className="min-w-0">
      <p className="text-[14px] leading-relaxed [overflow-wrap:anywhere]">{entry.summary}</p><time className="v2-meta v2-number mt-1 block" dateTime={entry.createdAt}>{new Intl.DateTimeFormat("en", { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit", timeZone:"UTC" }).format(new Date(entry.createdAt))} UTC</time>
    </div></div>) : <p className="v2-secondary">No transactions yet. Draft picks and roster moves will appear here.</p>}</div>
  </V2Surface>;
}
export async function LeagueTrades({ leagueId, tradePromise }: { leagueId: string; tradePromise: TradePromise }) {
  const props = await tradePromise;
  return props ? <TradeCenter leagueId={leagueId} {...props} v2 /> : null;
}
export async function LeagueManagers({ league, myTeam, tradePromise }: { league: Awaited<ReturnType<typeof getLeagueDetail>>; myTeam: Awaited<ReturnType<typeof getUserTeamInLeague>>; tradePromise: TradePromise }) {
  const props = await tradePromise;
  const teams = [...(myTeam ? [myTeam] : []), ...(props?.otherTeams ?? [])];
  return <V2Surface className="v2-support"><V2Heading title="Managers" meta={<span className="v2-meta">{league?.memberCount ?? 0} competing</span>} />
    <div className="px-5 pb-4">{league?.members.map(member => {
      const team = teams.find(t => t.ownerUserId === member.userId);
      return <div key={member.userId} className="v2-manager"><span className="v2-avatar" aria-hidden="true">{member.displayName.slice(0,2).toUpperCase()}</span><div className="min-w-0 flex-1">
        {team ? <TransitionLink href={team.id === myTeam?.id ? "/team" : `/team/${team.id}`} label={team.name} className="block text-sm font-medium hover:underline [overflow-wrap:anywhere]">{team.name}</TransitionLink> : <p className="text-sm font-medium [overflow-wrap:anywhere]">{member.teamName ?? member.displayName}</p>}
        <p className="v2-meta mt-0.5 [overflow-wrap:anywhere]">{member.displayName}{member.role === "commissioner" ? " · Commissioner" : ""}</p>
      </div></div>;
    })}</div>
  </V2Surface>;
}
