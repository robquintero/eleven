import type { CurrentMatchup, MatchupFixtureIntelligence } from "@/data-access/matchups";
import { countStartersInFixture, formatKickoff, pad2 } from "@/lib/team-fixture";
import type { LineupSlot } from "@/lib/types/fantasy";

/**
 * Dashboard's primary work surface. `matchup` is `null` only when the
 * league genuinely has no open fantasy round right now (pre-season, a bye,
 * between seasons) — a truthful "not scheduled" state, never an invented
 * opponent/score.
 */
export function MatchupCommand({
  matchup,
  hasLeague,
  now,
  fixtureIntel,
  starters,
}: {
  matchup: CurrentMatchup | null;
  hasLeague: boolean;
  /** Explicit clock (never read internally via `Date.now()` — see this codebase's clock-injection convention, e.g. `determineFixtureSyncCadence`) — the caller passes `new Date()`. */
  now: Date;
  /** Pass 13 (§4): real fixture context for the pre-match "anticipation" state below — `null` only when the caller has no matchup at all to compute it for. */
  fixtureIntel?: MatchupFixtureIntelligence | null;
  /** The caller's own starting XI, used only to compute "N OF YOUR XI INVOLVED" against `fixtureIntel.nextFixture` — never shown as a lineup here. */
  starters?: LineupSlot[];
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
  const isScheduled = matchup.status === "scheduled";
  const homeScore = matchup.homeFinalPoints ?? matchup.homeLivePoints;
  const awayScore = matchup.awayFinalPoints ?? matchup.awayLivePoints;
  const total = homeScore + awayScore || 1;
  const homeShare = (homeScore / total) * 100;

  // Pass 13 (§4): before anything has kicked off, a "0 – 0" score + empty
  // progress bar is dead UI -- real telemetry (the next actual fixture
  // involving either roster, and how many of the caller's own starters it
  // affects) replaces it whenever that data genuinely exists.
  const nextFixture = fixtureIntel?.nextFixture ?? null;
  const involvedCount = starters ? countStartersInFixture(starters, nextFixture) : 0;

  // Pass 12D: truthful freshness, never implied by the "LIVE" label alone
  // — if the automated sync hasn't actually run recently (e.g. the
  // production cron isn't active yet), this surfaces that honestly
  // instead of silently showing a stale score as if it were current.
  const updatedMinutesAgo = matchup.scoresUpdatedAt
    ? Math.max(0, Math.round((now.getTime() - new Date(matchup.scoresUpdatedAt).getTime()) / 60_000))
    : null;
  const isStale = isLive && updatedMinutesAgo !== null && updatedMinutesAgo > 15;

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
            {isScheduled ? (
              <p className="label-system text-xl text-foreground-tertiary sm:text-2xl">VS</p>
            ) : (
              <>
                <p className="text-5xl font-semibold tracking-tight tabular-nums text-foreground sm:text-6xl">
                  {homeScore}
                </p>
                <span className="text-lg font-medium text-foreground-tertiary sm:text-xl">–</span>
                <p className="text-5xl font-semibold tracking-tight tabular-nums text-foreground sm:text-6xl">
                  {awayScore}
                </p>
              </>
            )}
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

        {isScheduled ? (
          <div className="mt-6 flex flex-col items-center gap-1 border-t border-border pt-4 text-center">
            {nextFixture ? (
              <>
                <p className="label-system text-[10px] text-foreground-tertiary">NEXT KICKOFF</p>
                <p className="text-sm font-semibold text-foreground">
                  {nextFixture.homeClubShortName} – {nextFixture.awayClubShortName}
                </p>
                <p className="label-system text-[11px] text-foreground-secondary">
                  {formatKickoff(nextFixture.kickoffAt)}
                </p>
                {involvedCount > 0 && (
                  <p className="label-system mt-1 text-[10px] text-accent">
                    {involvedCount} OF YOUR XI INVOLVED
                  </p>
                )}
              </>
            ) : (
              <p className="label-system text-[11px] text-foreground-tertiary">KICKOFF NOT YET SCHEDULED</p>
            )}
          </div>
        ) : (
          <>
            <div className="relative mt-6 h-1.5 overflow-hidden border border-border bg-muted">
              <div className="h-full bg-accent transition-all" style={{ width: `${homeShare}%` }} />
            </div>

            {isLive && (
              <p className="label-system mt-2 text-center text-[10px] text-foreground-tertiary">
                {updatedMinutesAgo === null
                  ? "AWAITING FIRST SYNC"
                  : isStale
                    ? `SYNC STALE · LAST UPDATED ${updatedMinutesAgo}M AGO`
                    : updatedMinutesAgo === 0
                      ? "UPDATED JUST NOW"
                      : `UPDATED ${updatedMinutesAgo}M AGO`}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
