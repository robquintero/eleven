import type { CurrentMatchup } from "@/data-access/matchups";
import { pad2 } from "@/lib/team-fixture";

/**
 * Dashboard's primary work surface. `matchup` is `null` whenever the
 * league has no scheduled round/matchup yet — true for every league today,
 * since round scheduling and the draft engine aren't built (Pass 8+). That
 * renders a truthful "not scheduled" state instead of an invented
 * opponent/score, per docs/product-state.md.
 */
export function MatchupCommand({
  matchup,
  hasLeague,
}: {
  matchup: CurrentMatchup | null;
  hasLeague: boolean;
}) {
  if (!matchup) {
    return (
      <div className="border border-border bg-surface-elevated">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="label-system text-[11px] text-foreground-secondary">
            MATCHUP_COMMAND
          </span>
          <span className="label-system text-[10px] text-foreground-tertiary">
            NOT SCHEDULED
          </span>
        </div>
        <div className="flex flex-col items-center gap-2 p-8 text-center">
          <p className="text-lg font-semibold tracking-tight text-foreground">TBD vs TBD</p>
          <p className="max-w-xs text-sm text-foreground-secondary">
            {hasLeague
              ? "No matchup has been scheduled for this league yet."
              : "Join or create a league to be scheduled into a matchup."}
          </p>
        </div>
      </div>
    );
  }

  const isLive = matchup.status === "live";
  const homeScore = matchup.homeFinalPoints ?? matchup.homeLivePoints;
  const awayScore = matchup.awayFinalPoints ?? matchup.awayLivePoints;
  const total = homeScore + awayScore || 1;
  const homeShare = (homeScore / total) * 100;

  return (
    <div className="border border-border bg-surface-elevated">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="label-system text-[11px] text-foreground-secondary">
          MATCHUP_COMMAND
        </span>
        <span className="label-system flex items-center gap-1.5 text-[10px] text-foreground-tertiary">
          {isLive ? (
            <>
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-live" />
              </span>
              <span className="font-semibold text-live">LIVE</span>
            </>
          ) : (
            matchup.status.toUpperCase()
          )}
          · MATCHDAY {pad2(matchup.roundNumber)}
        </span>
      </div>

      <div className="p-5 sm:p-6">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between sm:gap-4">
          <div className="min-w-0 text-left">
            <p className="truncate text-[15px] font-semibold text-foreground sm:text-base">
              {matchup.homeTeamName}
            </p>
            {matchup.isUserHome && (
              <p className="label-system text-[10px] text-accent">YOUR TEAM</p>
            )}
          </div>

          <div className="flex items-center gap-3 sm:gap-5">
            <p className="text-5xl font-semibold tracking-tight tabular-nums text-foreground sm:text-6xl">
              {homeScore}
            </p>
            <span className="text-lg font-medium text-foreground-tertiary sm:text-xl">–</span>
            <p className="text-5xl font-semibold tracking-tight tabular-nums text-foreground sm:text-6xl">
              {awayScore}
            </p>
          </div>

          <div className="min-w-0 text-right">
            <p className="truncate text-[15px] font-semibold text-foreground sm:text-base">
              {matchup.awayTeamName}
            </p>
            {!matchup.isUserHome && (
              <p className="label-system text-[10px] text-accent">YOUR TEAM</p>
            )}
          </div>
        </div>

        <div className="relative mt-6 h-1.5 overflow-hidden border border-border bg-muted">
          <div className="h-full bg-accent transition-all" style={{ width: `${homeShare}%` }} />
        </div>
      </div>
    </div>
  );
}
