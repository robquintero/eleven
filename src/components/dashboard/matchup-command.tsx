import { matchupResultState } from "@/domain/fantasy/matchup-result-state";
import { MatchupStatus } from "@/components/football/matchup-status";
import type { ReactNode } from "react";
import { TeamName } from "@/components/ui/team-name";
import type { CurrentMatchup, MatchupFixtureIntelligence } from "@/data-access/matchups";
import { countStartersInFixture, formatKickoff, pad2, resolveMatchupSides } from "@/lib/team-fixture";
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
  teamIdsByPlayerId,
  scheduledDetails,
}: {
  scheduledDetails?: ReactNode;
  matchup: CurrentMatchup | null;
  hasLeague: boolean;
  /** Explicit clock (never read internally via `Date.now()` — see this codebase's clock-injection convention, e.g. `determineFixtureSyncCadence`) — the caller passes `new Date()`. */
  now: Date;
  /** Pass 13 (§4): real fixture context for the pre-match "anticipation" state below — `null` only when the caller has no matchup at all to compute it for. */
  fixtureIntel?: MatchupFixtureIntelligence | null;
  /** The caller's own starting XI, used only to compute "N OF YOUR XI INVOLVED" against `fixtureIntel.nextFixture` — never shown as a lineup here. */
  starters?: LineupSlot[];
  /** Pass 14: each starter's full team-id set (club + any national teams, from `getTeamIdsByPlayer`) — without this, `countStartersInFixture` falls back to club-only comparison, which undercounts starters whose next fixture is international. */
  teamIdsByPlayerId?: Map<string, string[]>;
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

  const resultState = matchupResultState({ status: matchup.status, roundStatus: matchup.roundStatus,
    startsAt: matchup.roundStartsAt, endsAt: matchup.roundEndsAt }, now);
  const isLive = resultState === "live";
  // Pass 14.5: whether the ROUND has started, not whether a fixture is
  // CURRENTLY live right now -- `matchup.status` reverts to "scheduled"
  // the instant nothing is live (see data-access/matchups.ts's
  // `roundStatus` doc comment), which previously showed the pre-kickoff
  // "VS" anticipation layout even after real, already-locked/already-
  // scored performances existed (e.g. The Room's Round 1, where several
  // starters had already played while nothing happened to be live at
  // read time).
  const isScheduled = resultState === "upcoming";
  const homeScore = matchup.homeFinalPoints ?? matchup.homeLivePoints;
  const awayScore = matchup.awayFinalPoints ?? matchup.awayLivePoints;
  const total = homeScore + awayScore || 1;
  // Pass 14.8: the logged-in user's team is ALWAYS presented on the left
  // throughout the Matchup page (matching MatchupLineups/MatchupPlayerCounts,
  // which already do this) -- home/away is purely a database/scheduling
  // fact, never a display-order one. Display-only: `matchup.homeTeamName`/
  // `homeScore` etc. stay exactly what the database says; only WHICH SIDE
  // of the screen they render on is normalized here.
  const { leftTeamName, rightTeamName, leftScore, rightScore } = resolveMatchupSides({
    isUserHome: matchup.isUserHome,
    homeTeamName: matchup.homeTeamName,
    awayTeamName: matchup.awayTeamName,
    homeScore,
    awayScore,
  });
  const leftShare = (leftScore / total) * 100;

  // Pass 12D: truthful freshness, never implied by the "LIVE" label alone
  // — if the automated sync hasn't actually run recently (e.g. the
  // production cron isn't active yet), this surfaces that honestly
  // instead of silently showing a stale score as if it were current.
  const updatedMinutesAgo = matchup.scoresUpdatedAt
    ? Math.max(0, Math.round((now.getTime() - new Date(matchup.scoresUpdatedAt).getTime()) / 60_000))
    : null;
  const isStale = isLive && updatedMinutesAgo !== null && updatedMinutesAgo > 15;

  return (
    <div className="@container border border-border bg-surface-elevated">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border px-4 py-2.5">
        <span className="label-system text-[11px] text-foreground-secondary">
          MATCHUP_COMMAND
        </span>
        <span className="label-system flex items-center gap-1.5 text-[10px] text-foreground-tertiary">
          <MatchupStatus state={resultState} />
          · MATCHDAY {pad2(matchup.roundNumber)}
        </span>
      </div>

      <div className="p-4 @min-[32rem]:p-6">
        {/* Equal identity columns no longer compete with the central score.
            Container sizing also works in Home's narrower desktop column. */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-x-3 gap-y-2">
          <TeamName name={leftTeamName} className="block self-start text-sm font-semibold leading-snug text-foreground @min-[32rem]:text-base" />
          <TeamName name={rightTeamName} className="col-start-3 block self-start text-right text-sm font-semibold leading-snug text-foreground @min-[32rem]:text-base" />
          <span className="label-system col-span-3 text-[10px] text-accent">YOUR TEAM</span>
          <p className="min-w-0 text-[clamp(1.5rem,9cqi,3.75rem)] leading-none font-semibold tracking-tight tabular-nums text-foreground">
            {isScheduled ? "—" : leftScore}
          </p>
          <span className="label-system self-center text-sm text-foreground-tertiary">{isScheduled ? "VS" : "–"}</span>
          <p className="min-w-0 text-right text-[clamp(1.5rem,9cqi,3.75rem)] leading-none font-semibold tracking-tight tabular-nums text-foreground">
            {isScheduled ? "—" : rightScore}
          </p>
        </div>

        {isScheduled ? (
          <div className="mt-4 flex flex-col items-center gap-1 border-t border-border pt-4 text-center sm:mt-6">
            {scheduledDetails ?? <MatchupAnticipation fixtureIntel={fixtureIntel} starters={starters} teamIdsByPlayerId={teamIdsByPlayerId} />}
          </div>
        ) : (
          <>
            <div className="relative mt-4 h-1.5 overflow-hidden border border-border bg-muted sm:mt-6">
              <div className="h-full bg-accent transition-all" style={{ width: `${leftShare}%` }} />
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

/** Secondary fixture intelligence can stream without holding back the score/teams/XI. */
export function MatchupAnticipation({ fixtureIntel, starters, teamIdsByPlayerId }: {
  fixtureIntel?: MatchupFixtureIntelligence | null;
  starters?: LineupSlot[];
  teamIdsByPlayerId?: Map<string, string[]>;
}) {
  const nextFixture = fixtureIntel?.nextFixture ?? null;
  const involvedCount = starters ? countStartersInFixture(starters, nextFixture, teamIdsByPlayerId) : 0;
  return <>
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
  </>;
}
