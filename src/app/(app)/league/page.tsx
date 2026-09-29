import Link from "next/link";
import { Trophy } from "lucide-react";
import { CreateLeagueForm, JoinLeagueForm } from "@/components/league/league-forms";
import { Button } from "@/components/ui/button";
import { ModuleHeader } from "@/components/ui/module-header";
import { getUserLeagues } from "@/data-access/leagues";
import { getCurrentProfile } from "@/data-access/profiles";

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
                  </p>
                  <p className="label-system mt-0.5 text-[11px] text-foreground-tertiary">
                    {league.memberCount} MANAGERS · {league.role.toUpperCase()}
                  </p>
                </div>
                {league.role === "commissioner" && (
                  <span className="label-system shrink-0 text-[11px] text-foreground-tertiary">
                    INVITE {league.inviteCode}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CreateLeagueForm />
        <JoinLeagueForm />
      </div>
    </div>
  );
}
