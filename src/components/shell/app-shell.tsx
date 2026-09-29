import type { ReactNode } from "react";
import { CommandPalette } from "@/components/command/command-palette";
import { DesktopNav } from "@/components/shell/desktop-nav";
import { MobileNav } from "@/components/shell/mobile-nav";
import { LeagueSwitcher } from "@/components/shell/league-switcher";
import { ProfileControl } from "@/components/shell/profile-control";
import { StatusBar } from "@/components/shell/status-bar";
import { Wordmark } from "@/components/shell/wordmark";
import { getUserLeagues } from "@/data-access/leagues";
import { getCurrentProfile } from "@/data-access/profiles";
import { currentUserTeam, leagues as mockLeagues } from "@/lib/mock/dashboard";

export async function AppShell({ children }: { children: ReactNode }) {
  const [profile, realLeagues] = await Promise.all([
    getCurrentProfile(),
    getUserLeagues(),
  ]);

  // Real leagues take over the switcher the moment the signed-in user has
  // at least one; otherwise it keeps showing the mock leagues exactly as
  // before — see docs/architecture.md-style "two data sources" note in
  // the Pass 6 report for why this fallback exists rather than an empty
  // switcher.
  const switcherLeagues =
    realLeagues.length > 0
      ? realLeagues.map((l) => ({ id: l.id, name: l.name, memberCount: l.memberCount }))
      : mockLeagues;

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
              <LeagueSwitcher
                leagues={switcherLeagues}
                initialLeagueId={switcherLeagues[0].id}
              />
            </div>
            <div className="flex items-center gap-3">
              <CommandPalette />
              <ProfileControl manager={currentUserTeam.manager} profile={profile} />
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
