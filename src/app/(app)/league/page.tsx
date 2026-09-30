import Link from "next/link";
import { Trophy } from "lucide-react";
import { setActiveLeagueAction } from "@/app/(app)/actions";
import { CreateLeagueForm, JoinLeagueForm } from "@/components/league/league-forms";
import { Button } from "@/components/ui/button";
import { ModuleHeader } from "@/components/ui/module-header";
import { getActiveLeagueId } from "@/data-access/active-league";
import { getDraftStatus } from "@/data-access/drafts";
import { getLeagueDetail, getUserLeagues } from "@/data-access/leagues";
import { getStandings } from "@/data-access/matchups";
import { getCurrentProfile } from "@/data-access/profiles";
import { getRecentActivity } from "@/data-access/transactions";
import {
  deriveLeagueLifecycle,
  LEAGUE_LIFECYCLE_LABEL,
} from "@/domain/fantasy/league-lifecycle";

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

  const [activeDetail, draftStatus, standings, activity] = activeLeagueId
    ? await Promise.all([
        getLeagueDetail(activeLeagueId),
        getDraftStatus(activeLeagueId),
        getStandings(activeLeagueId),
        getRecentActivity(activeLeagueId),
      ])
    : [null, null, [], []];

  const lifecycle = activeDetail
    ? deriveLeagueLifecycle({
        leagueStatus: activeDetail.status,
        memberCount: activeDetail.memberCount,
        maxTeams: activeDetail.maxTeams,
        draftStatus,
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
          <ModuleHeader title="LEAGUE_STATUS" meta={LEAGUE_LIFECYCLE_LABEL[lifecycle]} />
          <div className="mt-3 grid grid-cols-1 gap-6 lg:grid-cols-2">
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

            <div className="flex flex-col gap-6">
              <div className="border border-border p-4">
                <p className="label-system text-[11px] text-foreground-tertiary">DRAFT</p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {draftStatus === "in_progress"
                    ? "In progress"
                    : draftStatus === "completed"
                      ? "Completed"
                      : "Not yet available"}
                </p>
                {draftStatus && (
                  <Link href="/draft" className="label-system mt-1.5 inline-block text-[11px] text-accent hover:underline">
                    OPEN DRAFT ROOM ↗
                  </Link>
                )}
              </div>

              <div className="border border-border p-4">
                <p className="label-system text-[11px] text-foreground-tertiary">STANDINGS</p>
                {standings.length === 0 ? (
                  <p className="mt-1 text-sm text-foreground-secondary">NO RESULTS YET</p>
                ) : (
                  <div className="mt-2 divide-y divide-border">
                    {standings.map((row, index) => (
                      <div key={row.fantasyTeamId} className="flex items-center gap-3 py-1.5">
                        <span className="label-system w-4 text-xs text-foreground-tertiary">
                          {index + 1}
                        </span>
                        <span className="flex-1 text-sm text-foreground">{row.teamName}</span>
                        <span className="label-system text-xs tabular-nums text-foreground-tertiary">
                          {row.wins}-{row.losses}-{row.draws} · {row.pointsFor.toFixed(1)} PF
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border border-border p-4">
                <p className="label-system text-[11px] text-foreground-tertiary">TRANSACTIONS</p>
                {activity.length === 0 ? (
                  <p className="mt-1 text-sm text-foreground-secondary">NO TRANSACTIONS YET</p>
                ) : (
                  <div className="mt-2 divide-y divide-border">
                    {activity.map((entry) => (
                      <p key={entry.id} className="py-1.5 text-sm text-foreground-secondary">
                        {entry.fantasyTeamName ?? "Commissioner"} · {entry.type}
                      </p>
                    ))}
                  </div>
                )}
              </div>
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
