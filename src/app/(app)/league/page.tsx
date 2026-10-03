import Link from "next/link";
import { TransitionLink } from "@/components/shell/transition-link";
import { Trophy } from "lucide-react";
import { setActiveLeagueAction } from "@/app/(app)/actions";
import { LeagueMatchups } from "@/components/league/league-matchups";
import { RoundWindow } from "@/components/football/round-window";
import { CreateLeagueForm, JoinLeagueForm } from "@/components/league/league-forms";
import { LeagueRecordsList } from "@/components/league/league-records";
import { SeasonPanel } from "@/components/league/season-panel";
import { StandingsTable } from "@/components/league/standings-table";
import { TradeCenter } from "@/components/league/trade-center";
import { Button } from "@/components/ui/button";
import { ModuleHeader } from "@/components/ui/module-header";
import { getActiveLeagueId } from "@/data-access/active-league";
import { getDraftStatus } from "@/data-access/drafts";
import { getLeagueDetail, getUserLeagues } from "@/data-access/leagues";
import { getLeagueCompetitionSummary, getStandings } from "@/data-access/matchups";
import { getCurrentProfile } from "@/data-access/profiles";
import { getSeasonSummary, listSeasons } from "@/data-access/seasons";
import { SeasonArchiveList } from "@/components/league/season-archive-list";
import { getTeamRosterPlayers, type RosterPlayerOption } from "@/data-access/roster";
import { getLeagueTeams, getUserTeamInLeague } from "@/data-access/teams";
import { getRecentActivity } from "@/data-access/transactions";
import { getTeamTrades } from "@/data-access/trades";
import {
  deriveLeagueLifecycle,
  LEAGUE_LIFECYCLE_LABEL,
} from "@/domain/fantasy/league-lifecycle";
import { leagueSeasonIdentityLabel, standingsEmptyContext } from "@/domain/fantasy/season";

export default async function LeaguePage() {
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
          Creating and joining real leagues requires an Eleven account. The
          Dashboard, Team, and Players screens stay available without one.
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

  const [activeDetail, draftStatus, standings, activity, myTeam, competition, season, pastSeasons] = activeLeagueId
    ? await Promise.all([
        getLeagueDetail(activeLeagueId),
        getDraftStatus(activeLeagueId),
        getStandings(activeLeagueId),
        getRecentActivity(activeLeagueId),
        getUserTeamInLeague(activeLeagueId),
        getLeagueCompetitionSummary(activeLeagueId),
        getSeasonSummary(activeLeagueId),
        listSeasons(activeLeagueId),
      ])
    : [null, null, [], [], null, null, null, []];

  let tradeCenterProps: {
    myTeamId: string;
    myRoster: RosterPlayerOption[];
    otherTeams: Awaited<ReturnType<typeof getLeagueTeams>>;
    rostersByTeamId: Record<string, RosterPlayerOption[]>;
    incoming: Awaited<ReturnType<typeof getTeamTrades>>["incoming"];
    outgoing: Awaited<ReturnType<typeof getTeamTrades>>["outgoing"];
  } | null = null;

  if (activeLeagueId && myTeam) {
    const allTeams = await getLeagueTeams(activeLeagueId);
    const otherTeams = allTeams.filter((t) => t.id !== myTeam.id);
    const [myRoster, otherRosters, trades] = await Promise.all([
      getTeamRosterPlayers(activeLeagueId, myTeam.id),
      Promise.all(otherTeams.map((t) => getTeamRosterPlayers(activeLeagueId, t.id))),
      getTeamTrades(activeLeagueId, myTeam.id),
    ]);
    const rostersByTeamId = Object.fromEntries(otherTeams.map((t, i) => [t.id, otherRosters[i]]));
    tradeCenterProps = {
      myTeamId: myTeam.id,
      myRoster,
      otherTeams,
      rostersByTeamId,
      incoming: trades.incoming,
      outgoing: trades.outgoing,
    };
  }

  const lifecycle = activeDetail
    ? deriveLeagueLifecycle({
        leagueStatus: activeDetail.status,
        memberCount: activeDetail.memberCount,
        maxTeams: activeDetail.maxTeams,
        draftStatus,
        seasonStatus: season?.status ?? null,
      })
    : null;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          League hub
        </h1>
        <p className="mt-1.5 text-sm text-foreground-secondary">
          Signed in as {profile.displayName}.
        </p>
      </div>

      <section>
        <ModuleHeader title="YOUR_LEAGUES" meta={leagues.length} />
        {leagues.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1.5 py-10 text-center">
            <p className="label-system text-sm text-foreground-secondary">
              NO ACTIVE LEAGUES
            </p>
            <p className="max-w-xs text-xs text-foreground-tertiary">
              Create a league to become its commissioner, or join one with an
              invite code below.
            </p>
          </div>
        ) : (
          <div className="mt-1 divide-y divide-border border border-border">
            {leagues.map((league) => (
              <div
                key={league.id}
                className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {league.name}
                    {league.id === activeLeagueId && (
                      <span className="label-system ml-2 text-[10px] text-accent">ACTIVE</span>
                    )}
                  </p>
                  <p className="label-system mt-0.5 text-[11px] text-foreground-tertiary">
                    {league.memberCount} / {league.maxTeams} MANAGERS · {league.role.toUpperCase()}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {league.role === "commissioner" && (
                    <span className="label-system text-[11px] text-foreground-tertiary">
                      INVITE {league.inviteCode}
                    </span>
                  )}
                  {league.id !== activeLeagueId && <SetActiveLeagueButton leagueId={league.id} />}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {activeDetail && lifecycle && (
        <section>
          {/* Pass 13: league identity as a light header strip, not a box --
              "your league is permanent, your seasons aren't" (DESIGN.md
              §23/brief §6). The season's own read-only state (SEASON N /
              ROUND X of Y / status) lives here as one line; SeasonPanel
              below only ever renders when there's a genuine action or
              milestone (pre-season format choice, a just-completed
              season's champion). */}
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
            <div>
              <p className="text-xl font-semibold tracking-tight text-foreground">{activeDetail.name}</p>
              <p className="label-system mt-1 text-[11px] text-foreground-tertiary">
                {leagueSeasonIdentityLabel(season)}
              </p>
            </div>
            <span className="label-system text-[11px] text-accent">{LEAGUE_LIFECYCLE_LABEL[lifecycle]}</span>
          </div>

          {season?.currentRoundNumber !== null && season?.currentRoundNumber !== undefined && season.currentRoundStartsAt && season.currentRoundEndsAt && season.currentRoundStatus && (
            <RoundWindow
              className="mt-2"
              round={{
                number: season.currentRoundNumber,
                startsAt: season.currentRoundStartsAt,
                endsAt: season.currentRoundEndsAt,
                status: season.currentRoundStatus,
              }}
            />
          )}

          <SeasonPanel season={season} leagueId={activeLeagueId!} isCommissioner={activeDetail.role === "commissioner"} />

          {/* Standings is the page's one focal/hero surface (DESIGN.md §21
              "Focus surface") -- a professional football table is the thing
              a manager actually comes to this page to look at, so it's the
              only module promoted to an elevated surface. Everything else
              below is Module-level (bordered) or bare Workspace-level,
              never competing with it for attention. */}
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr] lg:items-start">
            <div className="flex flex-col gap-6">
              <div className="border border-border bg-surface-elevated">
                <div className="border-b border-border px-4 py-2.5">
                  <span className="label-system text-[11px] text-foreground-secondary">STANDINGS</span>
                </div>
                <StandingsTable
                  standings={standings}
                  myTeamId={myTeam?.id ?? null}
                  emptyContext={standingsEmptyContext(
                    season && { status: season.status, currentRoundNumber: season.currentRoundNumber }
                  )}
                />
              </div>

              {/* Current round + recent results merged into one module
                  (was two identically-weighted boxes) -- they're the same
                  kind of information (a round's results), just at
                  different points in time. */}
              <div className="border border-border">
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
                  <span className="label-system text-[11px] text-foreground-secondary">MATCHUPS</span>
                  {myTeam && (
                    <TransitionLink
                      href="/matchup"
                      label="My Matchup"
                      className="label-system text-[10px] text-accent hover:underline"
                    >
                      MY MATCHUP ↗
                    </TransitionLink>
                  )}
                </div>
                <div>
                  <p className="label-system px-4 pt-3 text-[10px] text-foreground-tertiary">THIS ROUND</p>
                  <LeagueMatchups
                    matchups={competition?.currentRoundMatchups ?? []}
                    myTeamId={myTeam?.id ?? null}
                    emptyLabel="NO MATCHUPS SCHEDULED YET"
                  />
                </div>
                <div className="border-t border-border">
                  <p className="label-system px-4 pt-3 text-[10px] text-foreground-tertiary">RECENT RESULTS</p>
                  <LeagueMatchups
                    matchups={competition?.recentResults ?? []}
                    myTeamId={myTeam?.id ?? null}
                    emptyLabel="NO RESULTS YET"
                  />
                </div>
              </div>

              {/* Bare workspace region, no border -- a handful of stat
                  lines doesn't need its own frame (DESIGN.md §5). */}
              <div>
                <ModuleHeader title="LEAGUE_RECORDS" />
                <LeagueRecordsList
                  records={
                    competition?.records ?? {
                      highestScore: null,
                      lowestScore: null,
                      largestMargin: null,
                      closestMatchup: null,
                      mostPointsFor: null,
                      mostPointsAgainst: null,
                    }
                  }
                />
              </div>
            </div>

            <div className="flex flex-col gap-6">
              <div className="border border-border">
                <div className="border-b border-border px-4 py-2.5">
                  <span className="label-system text-[11px] text-foreground-secondary">
                    MEMBERS
                  </span>
                </div>
                <div className="divide-y divide-border">
                  {activeDetail.members.map((member) => (
                    <div
                      key={member.userId}
                      className="flex items-center justify-between gap-3 px-4 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {member.teamName ?? member.displayName}
                        </p>
                        <p className="label-system mt-0.5 text-[11px] text-foreground-tertiary">
                          {member.displayName} · {member.role.toUpperCase()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {pastSeasons.length > 1 && (
                <div className="border border-border">
                  <div className="border-b border-border px-4 py-2.5">
                    <span className="label-system text-[11px] text-foreground-secondary">SEASON_ARCHIVE</span>
                  </div>
                  <SeasonArchiveList seasons={pastSeasons} />
                </div>
              )}

              {/* Draft status + transactions merged into one OPERATIONS
                  module (was two separate boxes) -- both are small,
                  secondary operational readouts, not primary content. */}
              <div className="border border-border">
                <div className="border-b border-border px-4 py-2.5">
                  <span className="label-system text-[11px] text-foreground-secondary">OPERATIONS</span>
                </div>
                <div className="px-4 py-3">
                  <p className="label-system text-[10px] text-foreground-tertiary">DRAFT</p>
                  <p className="mt-0.5 text-sm font-medium text-foreground">
                    {draftStatus === "in_progress"
                      ? "In progress"
                      : draftStatus === "completed"
                        ? "Completed"
                        : "Not yet available"}
                  </p>
                  {draftStatus && (
                    <TransitionLink
                      href="/draft"
                      label="Draft"
                      className="label-system mt-1.5 inline-block text-[11px] text-accent hover:underline"
                    >
                      OPEN DRAFT ROOM ↗
                    </TransitionLink>
                  )}
                </div>
                <div className="border-t border-border px-4 py-3">
                  <p className="label-system text-[10px] text-foreground-tertiary">TRANSACTIONS</p>
                  {activity.length === 0 ? (
                    <p className="mt-1 text-sm text-foreground-secondary">NO TRANSACTIONS YET</p>
                  ) : (
                    <div className="mt-2 divide-y divide-border">
                      {activity.map((entry) => (
                        <p key={entry.id} className="py-1.5 text-sm text-foreground-secondary">
                          {entry.summary}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {tradeCenterProps && (
                <TradeCenter
                  leagueId={activeLeagueId!}
                  myTeamId={tradeCenterProps.myTeamId}
                  myRoster={tradeCenterProps.myRoster}
                  otherTeams={tradeCenterProps.otherTeams}
                  rostersByTeamId={tradeCenterProps.rostersByTeamId}
                  incoming={tradeCenterProps.incoming}
                  outgoing={tradeCenterProps.outgoing}
                />
              )}
            </div>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CreateLeagueForm />
        <JoinLeagueForm />
      </div>
    </div>
  );
}

function SetActiveLeagueButton({ leagueId }: { leagueId: string }) {
  return (
    <form action={setActiveLeagueAction}>
      <input type="hidden" name="leagueId" value={leagueId} />
      <button type="submit" className="label-system text-[11px] text-accent hover:underline">
        SET ACTIVE
      </button>
    </form>
  );
}
