import Link from "next/link";
import { LogOut, UserRound } from "lucide-react";
import { DisplayNameForm } from "@/components/account/display-name-form";
import { ModuleHeader } from "@/components/ui/module-header";
import { signOut } from "@/data-access/auth";
import { getAccountIdentity } from "@/data-access/account";
import { getUserLeagues } from "@/data-access/leagues";

/**
 * Pass 12E: a modest authenticated Account/Settings surface — identity,
 * display name, sign out, the leagues this account belongs to, and a
 * product status line. Deliberately not a preferences system: no
 * notifications, no theming, no broader settings than this.
 */
export default async function AccountPage() {
  const identity = await getAccountIdentity();

  if (!identity) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-muted text-foreground-secondary">
          <UserRound className="size-5" strokeWidth={1.75} />
        </span>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground">Sign in to view your account</h1>
        <div className="mt-5">
          <Link href="/login" className="label-system text-[11px] text-accent hover:underline">
            SIGN IN →
          </Link>
        </div>
      </div>
    );
  }

  const leagues = await getUserLeagues();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Account</h1>
        <p className="mt-1.5 text-sm text-foreground-secondary">{identity.email ?? "No email on file"}</p>
      </div>

      <section>
        <ModuleHeader title="IDENTITY" />
        <div className="mt-3 border border-border p-4">
          <DisplayNameForm currentName={identity.displayName} />
        </div>
      </section>

      <section>
        <ModuleHeader title="YOUR_LEAGUES" meta={leagues.length} />
        {leagues.length === 0 ? (
          <p className="mt-3 text-sm text-foreground-secondary">You haven&apos;t joined or created a league yet.</p>
        ) : (
          <div className="mt-3 divide-y divide-border border border-border">
            {leagues.map((league) => (
              <div key={league.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{league.name}</p>
                  <p className="label-system mt-0.5 text-[11px] text-foreground-tertiary">
                    {league.memberCount} / {league.maxTeams} MANAGERS · {league.role.toUpperCase()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <ModuleHeader title="PRODUCT" />
        <div className="mt-3 border border-border p-4">
          <p className="text-sm text-foreground">Eleven</p>
          <p className="label-system mt-0.5 text-[11px] text-foreground-tertiary">LIVE BETA · v0.1.0</p>
        </div>
      </section>

      <section>
        <form action={signOut}>
          <button
            type="submit"
            className="label-system flex items-center gap-2 border border-border px-4 py-2.5 text-xs text-foreground-secondary transition-colors hover:border-destructive/40 hover:text-destructive"
          >
            <LogOut className="size-3.5" strokeWidth={2} />
            Sign out
          </button>
        </form>
      </section>
    </div>
  );
}
