import { getCurrentCatalogScoringVersion } from "@/lib/scoring/catalog-version";
import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { CommandPalette } from "@/components/command/command-palette";
import { CommandTransitionOverlay } from "@/components/shell/command-transition-overlay";
import { DesktopNav } from "@/components/shell/desktop-nav";
import { MobileNav } from "@/components/shell/mobile-nav";
import { NavigationTransitionProvider } from "@/components/shell/navigation-transition";
import { GameRulesDialog } from "@/components/shell/game-rules-dialog";
import { LeagueSwitcher } from "@/components/shell/league-switcher";
import { ProfileControl } from "@/components/shell/profile-control";
import { StatusBar, type StatusBarData } from "@/components/shell/status-bar";
import { Wordmark } from "@/components/shell/wordmark";
import { getActiveLeagueId } from "@/data-access/active-league";
import { getUserLeagues } from "@/data-access/leagues";
import { getCurrentMatchup, getMatchupStatusStarters } from "@/data-access/matchups";
import { getCurrentProfile } from "@/data-access/profiles";
import { getUserTeamInLeague } from "@/data-access/teams";
import { nextLock, starterBuckets } from "@/lib/team-fixture";
import { ATTRIBUTION_LINE, PRODUCT_STATUS, SITE_NAME } from "@/lib/site-config";

/**
 * Pass 14.5: the real round-state summary behind the global `StatusBar` --
 * same authoritative sources the Home dashboard uses (`getCurrentMatchup`,
 * shared matchup lineup/fixture derivation, `starterBuckets`, `nextLock`), never a second,
 * divergent derivation. `null` whenever the active league genuinely has no
 * team/round yet.
 */
async function loadStatusBarData(activeLeagueId: string | null): Promise<StatusBarData | null> {
  if (!activeLeagueId) return null;
  const team = await getUserTeamInLeague(activeLeagueId);
  if (!team) return null;
  const matchup = await getCurrentMatchup(activeLeagueId, team.id);
  if (!matchup) return null;

  const starters = await getMatchupStatusStarters(matchup);
  const buckets = starterBuckets(starters);
  const next = nextLock(starters);

  return {
    scoringRuleVersion: matchup.scoringRuleVersion,
    roundNumber: matchup.roundNumber,
    roundStatus: matchup.roundStatus,
    liveCount: buckets.live,
    lockedCount: buckets.locked + buckets.final,
    remainingCount: buckets.upcoming,
    nextLockKickoff: next?.player.fixture?.kickoff ?? null,
  };
}

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
  const statusPromise = loadStatusBarData(activeLeagueId);
  void statusPromise.catch(() => {});

  return (
    <NavigationTransitionProvider>
      <div className="mx-auto min-h-dvh max-w-[1920px] lg:grid lg:grid-cols-[240px_1fr]">
        <aside className="hidden lg:sticky lg:top-0 lg:z-30 lg:flex lg:h-dvh lg:flex-col lg:gap-8 lg:border-r lg:border-border lg:px-5 lg:py-7">
          <Wordmark authenticated />
          <div className="border-t border-border" />
          <DesktopNav />

          {/* Pass 10C: understated, permanent attribution -- one place, not
              repeated per component (see docs/LEGAL-COMPLIANCE.md). */}
          <div className="mt-auto flex flex-col gap-1.5 border-t border-border pt-4">
            <span className="label-system text-[9px] text-foreground-tertiary">
              {SITE_NAME.toUpperCase()} · {PRODUCT_STATUS.toUpperCase()}
            </span>
            <Link
              href="/about"
              className="text-[10px] text-foreground-tertiary transition-colors hover:text-foreground-secondary"
            >
              {ATTRIBUTION_LINE}
            </Link>
          </div>
        </aside>

        <div className="flex min-h-dvh min-w-0 flex-col">
          <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-2 px-3 py-2.5 sm:py-3.5 sm:px-6 lg:px-8">
              <div className="flex min-w-0 items-center gap-1 sm:gap-3">
                <div className="shrink-0 lg:hidden">
                  <Wordmark authenticated />
                </div>
                <LeagueSwitcher leagues={leagues} activeLeagueId={activeLeagueId} />
                {leagues.length > 0 && <Suspense fallback={null}><RoundRules /></Suspense>}
              </div>
              <div className="flex shrink-0 items-center gap-1 sm:gap-3">
                <CommandPalette />
                <ProfileControl profile={profile} />
              </div>
            </div>
            <Suspense fallback={<div role="status" className="label-system hidden border-t border-border px-4 lg:block py-2 text-[10px] text-foreground-tertiary">LOADING ROUND STATUS</div>}><RoundStatus statusPromise={statusPromise} /></Suspense>
          </header>

          <main id="main-content" className="min-w-0 flex-1 px-3 pt-6 pb-28 sm:px-6 lg:px-8 lg:pb-12">
            {children}
          </main>
        </div>

        <CommandTransitionOverlay />

        <MobileNav />
      </div>
    </NavigationTransitionProvider>
  );
}

async function RoundStatus({ statusPromise }: { statusPromise: ReturnType<typeof loadStatusBarData> }) {
  return <StatusBar data={await statusPromise} />;
}
async function RoundRules() {
  return <GameRulesDialog version={await getCurrentCatalogScoringVersion()} />;
}
