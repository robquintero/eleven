import "./v2.css";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { V2Loading } from "@/components/ui/v2";
import { LeagueOverview } from "@/components/league/league-overview";
import { LeagueMatchweek, LeagueRecords, LeagueResults, LeagueTransactions, LeagueTrades, LeagueManagers, LeagueArchive } from "@/components/league/league-sections";
import { canDeleteLeague } from "@/lib/league-deletion";
import { getActiveLeagueId } from "@/data-access/active-league";
import { getDraftStatus } from "@/data-access/drafts";
import { getLeagueDetail, getUserLeagues } from "@/data-access/leagues";
import { getLeagueCompetitionSummary, getStandings } from "@/data-access/matchups";
import { getCurrentProfile } from "@/data-access/profiles";
import { getSeasonSummary, listSeasons } from "@/data-access/seasons";
import { getLeagueTeams, getUserTeamInLeague } from "@/data-access/teams";
import { getRecentActivity } from "@/data-access/transactions";
import { getTeamTrades } from "@/data-access/trades";
import { deriveLeagueLifecycle, LEAGUE_LIFECYCLE_LABEL } from "@/domain/fantasy/league-lifecycle";

export const metadata: Metadata = { title: "League" };

export default async function LeaguePage({ searchParams }: { searchParams?: Promise<{ round?: string | string[] }> } = {}) {
  const requestedRound = (await searchParams)?.round;
  if (Array.isArray(requestedRound)) notFound();
  const profile = await getCurrentProfile();

  if (!profile) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-muted text-foreground-secondary">
          <Trophy className="size-5" strokeWidth={1.75} />
        </span>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground">
          Sign in to manage leagues
        </h1>
        <p className="mt-1.5 max-w-sm text-sm text-foreground-secondary">
          Sign in to create a league or join your friends.
        </p>
        <div className="mt-5 flex items-center gap-3">
          <Button nativeButton={false} render={<Link href="/login" />}>
            Sign in
          </Button>
          <Button
            nativeButton={false}
            variant="outline"
            render={<Link href="/signup" />}
          >
            Create account
          </Button>
        </div>
      </div>
    );
  }

  const leagues = await getUserLeagues();
  const activeLeagueId = await getActiveLeagueId(leagues);

  const myTeamPromise = activeLeagueId ? getUserTeamInLeague(activeLeagueId) : Promise.resolve(null);
  const competitionPromise = activeLeagueId ? getLeagueCompetitionSummary(activeLeagueId, requestedRound) : Promise.resolve(null);
  const activityPromise = activeLeagueId ? getRecentActivity(activeLeagueId) : Promise.resolve([]);
  const archivePromise = activeLeagueId ? listSeasons(activeLeagueId) : Promise.resolve([]);
  const tradePromise = myTeamPromise.then(async team => {
    if (!activeLeagueId || !team) return null;
    const [allTeams, trades] = await Promise.all([getLeagueTeams(activeLeagueId), getTeamTrades(activeLeagueId, team.id)]);
    return { myTeamId: team.id, otherTeams: allTeams.filter(other => other.id !== team.id), ...trades };
  });
  // Attach rejection handlers immediately without swallowing errors when streamed.
  for (const read of [competitionPromise, activityPromise, archivePromise, tradePromise]) void read.catch(() => {});
  const [activeDetail, draftStatus, standings, myTeam, season] = activeLeagueId
    ? await Promise.all([getLeagueDetail(activeLeagueId), getDraftStatus(activeLeagueId), getStandings(activeLeagueId), myTeamPromise, getSeasonSummary(activeLeagueId)])
    : [null, null, [], null, null];

  const lifecycle = activeDetail
    ? deriveLeagueLifecycle({
        leagueStatus: activeDetail.status,
        memberCount: activeDetail.memberCount,
        maxTeams: activeDetail.maxTeams,
        draftStatus,
        seasonStatus: season?.status ?? null,
      })
    : null;

  return <LeagueOverview
    league={activeDetail} season={season} lifecycleLabel={lifecycle ? LEAGUE_LIFECYCLE_LABEL[lifecycle] : null}
    draftStatus={draftStatus} standings={standings} myTeamId={myTeam?.id ?? null}
    allowDelete={Boolean(activeDetail && canDeleteLeague(activeDetail.role, activeDetail.createdByUserId, profile.id))}
    matchweek={<Suspense fallback={<V2Loading title="Matchweek" rows={3} />}><LeagueMatchweek competitionPromise={competitionPromise} myTeamId={myTeam?.id ?? null} requestedRound={requestedRound} /></Suspense>}
    records={<Suspense fallback={<V2Loading title="League records" />}><LeagueRecords competitionPromise={competitionPromise} /></Suspense>}
    results={<Suspense fallback={null}><LeagueResults competitionPromise={competitionPromise} myTeamId={myTeam?.id ?? null} /></Suspense>}
    activity={<Suspense fallback={<V2Loading title="League activity" rows={3} />}><LeagueTransactions activityPromise={activityPromise} /></Suspense>}
    trades={myTeam ? <Suspense fallback={<V2Loading title="Trades" />}><LeagueTrades leagueId={activeLeagueId!} tradePromise={tradePromise} /></Suspense> : null}
    managers={<Suspense fallback={<V2Loading title="Managers" rows={3} />}><LeagueManagers league={activeDetail} myTeam={myTeam} tradePromise={tradePromise} /></Suspense>}
    archive={<Suspense fallback={null}><LeagueArchive archivePromise={archivePromise} /></Suspense>}
  />;
}
