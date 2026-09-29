import type { ReactNode } from "react";
import { CommandPalette } from "@/components/command/command-palette";
import { DesktopNav } from "@/components/shell/desktop-nav";
import { MobileNav } from "@/components/shell/mobile-nav";
import { LeagueSwitcher } from "@/components/shell/league-switcher";
import { ProfileControl } from "@/components/shell/profile-control";
import { StatusBar } from "@/components/shell/status-bar";
import { Wordmark } from "@/components/shell/wordmark";
import { getActiveLeagueId } from "@/data-access/active-league";
import { getUserLeagues } from "@/data-access/leagues";
import { getCurrentProfile } from "@/data-access/profiles";

/**
 * The authenticated workstation chrome. Every value here is real: the
 * league switcher lists only the caller's actual memberships (`[]` renders
 * a "no league" affordance instead of a switcher), and the profile control
 * always reflects the real signed-in profile — `(app)/layout.tsx` already
 * guarantees a session exists before this ever renders. See
 * docs/product-state.md "Runtime mock prohibition."
 */
export async function AppShell({ children }: { children: ReactNode }) {
  const [profile, leagues] = await Promise.all([getCurrentProfile(), getUserLeagues()]);
  const activeLeagueId = await getActiveLeagueId(leagues);

  return (
    <div className="mx-auto min-h-dvh max-w-[1920px] lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:gap-8 lg:border-r lg:border-border lg:px-5 lg:py-7">
        <Wordmark />
        <div className="border-t border-border" />
        <DesktopNav />
      </aside>

      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl">
          <div className="flex items-center justify-between px-4 py-3.5 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <div className="lg:hidden">
                <Wordmark />
              </div>
              <LeagueSwitcher leagues={leagues} activeLeagueId={activeLeagueId} />
            </div>
            <div className="flex items-center gap-3">
              <CommandPalette />
              <ProfileControl profile={profile} />
            </div>
          </div>
          <StatusBar />
        </header>

        <main className="flex-1 px-4 pt-6 pb-28 sm:px-6 lg:px-8 lg:pb-12">
          {children}
        </main>
      </div>

      <MobileNav />
    </div>
  );
}
