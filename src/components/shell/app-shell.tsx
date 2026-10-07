import { matchupResultState } from "@/domain/fantasy/matchup-result-state";
import { getCurrentCatalogScoringVersion } from "@/lib/scoring/catalog-version";
import { Suspense, type ReactNode } from "react";
import { AppFrame } from "@/components/shell/app-frame";
import { GameRulesDialog } from "@/components/shell/game-rules-dialog";
import { StatusBar, type StatusBarData } from "@/components/shell/status-bar";
import { getActiveLeagueId } from "@/data-access/active-league";
import { getUserLeagues } from "@/data-access/leagues";
import { getCurrentMatchup, getMatchupStatusStarters } from "@/data-access/matchups";
import { getCurrentProfile } from "@/data-access/profiles";
import { getUserTeamInLeague } from "@/data-access/teams";
import { nextLock, starterBuckets } from "@/lib/team-fixture";

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
    resultState: matchupResultState({ status: matchup.status, roundStatus: matchup.roundStatus, startsAt: matchup.roundStartsAt, endsAt: matchup.roundEndsAt }, new Date()),
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

  return <AppFrame profile={profile} leagues={leagues} activeLeagueId={activeLeagueId}
    rules={leagues.length > 0 ? <Suspense fallback={null}><RoundRules /></Suspense> : null}
    status={<Suspense fallback={<div role="status" className="v2-status-bar">Loading matchweek…</div>}><RoundStatus statusPromise={statusPromise} /></Suspense>}>
    {children}
  </AppFrame>;
}

async function RoundStatus({ statusPromise }: { statusPromise: ReturnType<typeof loadStatusBarData> }) {
  return <StatusBar data={await statusPromise} />;
}
async function RoundRules() {
  return <GameRulesDialog version={await getCurrentCatalogScoringVersion()} />;
}
