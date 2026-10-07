import type { ReactNode } from "react";
import Link from "next/link";
import type { Profile } from "@/data-access/profiles";
import type { LeagueSummary } from "@/data-access/leagues";
import { CommandPalette } from "@/components/command/command-palette";
import { CommandTransitionOverlay } from "./command-transition-overlay";
import { DesktopNav } from "./desktop-nav";
import { MobileNav } from "./mobile-nav";
import { NavigationTransitionProvider } from "./navigation-transition";
import { LeagueSwitcher } from "./league-switcher";
import { ProfileControl } from "./profile-control";
import { Wordmark } from "./wordmark";
import { ATTRIBUTION_LINE, PRODUCT_STATUS, SITE_NAME } from "@/lib/site-config";

/** Pure frame. AppShell retains all data reads and existing streamed slots. */
export function AppFrame({ children, profile, leagues, activeLeagueId, rules, status }: {
  children: ReactNode; profile: Profile | null; leagues: LeagueSummary[];
  activeLeagueId: string | null; rules: ReactNode; status: ReactNode;
}) {
  return <NavigationTransitionProvider>
    <div className="eleven-v2 app-v2 min-h-dvh max-w-[1920px] lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="v2-sidebar hidden lg:sticky lg:top-0 lg:z-30 lg:flex lg:h-dvh lg:flex-col">
        <Wordmark authenticated />
        <DesktopNav />
        <div className="mt-auto flex flex-col gap-2 border-t border-border pt-4">
          <span className="v2-meta">{SITE_NAME} · {PRODUCT_STATUS}</span>
          <Link href="/about" className="text-[11px] leading-relaxed text-foreground-tertiary transition-colors hover:text-foreground-secondary">{ATTRIBUTION_LINE}</Link>
        </div>
      </aside>
      <div className="flex min-h-dvh min-w-0 flex-col">
        <header className="v2-shell-header sticky top-0 z-30">
          <div className="v2-shell-toolbar">
            <div className="v2-shell-identity">
              <div className="shrink-0 lg:hidden"><Wordmark authenticated /></div>
              <LeagueSwitcher leagues={leagues} activeLeagueId={activeLeagueId} />
              {rules}
            </div>
            <div className="v2-shell-actions"><CommandPalette /><ProfileControl profile={profile} /></div>
          </div>
          {status}
        </header>
        <main id="main-content" className="v2-shell-content min-w-0 flex-1">{children}</main>
      </div>
      <CommandTransitionOverlay /><MobileNav />
    </div>
  </NavigationTransitionProvider>;
}
