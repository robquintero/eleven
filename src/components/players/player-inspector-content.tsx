"use client";

import "@/components/ui/core-v2.css";

import { PositionBadge } from "@/components/players/position-badge";
import { PlayerAcquisitionNotice } from "@/components/players/player-acquisition-notice";
import type { PlayerAcquisitionState } from "@/domain/fantasy/player-acquisition";

import { useState, type ReactNode } from "react";
import { TransitionLink } from "@/components/shell/transition-link";
import { Info, Lock, X } from "lucide-react";
import { FormSparkline } from "@/components/football/form-sparkline";
import { AvailabilityStatus } from "@/components/players/availability-status";
import { OwnershipStatus } from "@/components/players/ownership-status";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { ScoringBreakdown } from "@/components/players/scoring-breakdown";
import { Button } from "@/components/ui/button";
import { TerminalPanel, TerminalPanelSection } from "@/components/ui/terminal-panel";
import type { PlayerScoreBreakdown, RecentMatchRow } from "@/data-access/players";
import { getUsageTrend } from "@/lib/selectors/usage-trend";
import { getFormWindows } from "@/lib/selectors/form-tracker";
import { availabilityLabel, formatKickoff, formatKickoffTime, isPlayerLocked } from "@/lib/team-fixture";
import type { Player, PlayerOwnership } from "@/lib/types/fantasy";
import { cn } from "@/lib/utils";

const actionCopy: Partial<Record<PlayerOwnership, { label: string; note: string }>> = {
  free: { label: "Add player", note: "Roster moves unlock once league drafting is live." },
  owned: { label: "Propose trade", note: "Trades unlock once league operations are live." },
  waivers: {
    label: "Claim player",
    note: "Waiver claims unlock once league operations are live.",
  },
};

const flagCopy: Partial<Record<NonNullable<Player["availability"]>, string>> = {
  injured: "Not fit to start this matchday.",
  suspended: "Serving a suspension — unavailable to select.",
  doubtful: "Fitness test pending ahead of kickoff.",
};

/** Lineup-editing actions for a player already on the user's own squad —
 * takes over the record's one action slot from the ownership-based copy
 * above when the inspector is opened from the Team screen. */
export interface LineupInspectorContext {
  isStarter: boolean;
  canSwap: boolean;
  onMoveToBench: () => void;
  onMoveToStarting: () => void;
}

function FixtureStateBadge({ player }: { player: Player }) {
  const fixture = player.fixture;
  if (!fixture) return null;

  if (fixture.state === "live") {
    return (
      <span className="label-system flex items-center gap-1.5 text-xs font-semibold text-live">
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-75" />
          <span className="relative inline-flex size-1.5 rounded-full bg-live" />
        </span>
        Live
      </span>
    );
  }
  if (fixture.state === "locked") {
    return (
      <span className="label-system flex items-center gap-1.5 text-xs text-foreground-tertiary">
        <Lock className="size-3" strokeWidth={2} />
        Locked
      </span>
    );
  }
  if (fixture.state === "final") {
    return <span className="label-system text-xs text-foreground-tertiary">FT</span>;
  }
  return <span className="label-system text-xs text-foreground-tertiary">Upcoming</span>;
}

function StatRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="core-stat-row">
      <dt className="core-stat-label">{label}</dt>
      <dd className="core-stat-value">{value}</dd>
    </div>
  );
}

export function PlayerInspectorContent({
  player,
  index,
  recentMatches,
  scoreBreakdown,
  lineupContext,
  onRequestDrop,
  onClose,
  stickyHeader = false,
  acquisitionState = "unavailable",
}: {
  player: Player;
  acquisitionState?: PlayerAcquisitionState;
  index?: number;
  /** `null` while loading, `[]` for Not enough match data, real rows otherwise — see src/data-access/players.ts. */
  recentMatches?: RecentMatchRow[] | null;
  /** `undefined`/`null` while loading or if this player has no current-version scored match yet — see getPlayerLatestScoreBreakdown. */
  scoreBreakdown?: PlayerScoreBreakdown | null;
  lineupContext?: LineupInspectorContext;
  /** Pass 11.5: present only from the Team page, for the caller's own roster player — opens the same drop confirmation Team/Players already share (see team-workspace.tsx). Pass 14.6: proactively disabled here when `player.fixture` shows the player is already locked for the current round (real data when opened from the Team page's own squad; `drop_player` itself is the actual authoritative enforcement either way — see its own migration). */
  onRequestDrop?: () => void;
  /** Pass 11.5: present only for the overlay (Sheet) variant — renders a close control integrated into this component's own "PLAYER_RECORD" header row (via TerminalPanel's `meta` slot) rather than a separate button floating at the viewport edge. Omitted entirely for the `inline` variant, which has no overlay to close. */
  onClose?: () => void;
  /** Pass 11.5: forwarded to TerminalPanel — true only when this is rendered inside the overlay's own scrollable body, so the header (and the close button inside it) stay reachable no matter how far the body scrolls. */
  stickyHeader?: boolean;
}) {
  const [showNote, setShowNote] = useState(false);

  const ownership = player.ownership;
  const stats = player.seasonStats;
  const usageTrend = recentMatches ? getUsageTrend(recentMatches) : undefined;
  const formWindows = recentMatches ? getFormWindows(recentMatches) : undefined;
  const isFlagged = player.availability === "injured" || player.availability === "suspended";
  const isDoubtful = player.availability === "doubtful";

  return (
    <TerminalPanel
      header="Player profile"
      className="core-v2 core-inspector"
      stickyHeader={stickyHeader}
      meta={
        index !== undefined || onClose ? (
          <>
            {index !== undefined && `Result ${index + 1}`}
            {onClose && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onClose}
                aria-label="Close player record"
                className="-m-1 size-11"
              >
                <X className="size-4" strokeWidth={2} />
              </Button>
            )}
          </>
        ) : undefined
      }
    >
      <TerminalPanelSection>
        <div className="flex items-center gap-3">
          <PlayerAvatar name={player.name} nationality={player.nationality} size="lg" />
          <div className="min-w-0">
            <p className="label-system text-xs text-foreground-tertiary">
              {player.club.shortName} / <PositionBadge position={player.position} />
              {player.number !== undefined ? ` / #${String(player.number).padStart(2, "0")}` : ""}
            </p>
            <h2 className="mt-1.5 text-xl [overflow-wrap:anywhere] font-semibold tracking-tight text-foreground">
              {player.name}
            </h2>
          </div>
        </div>
        <div className="mt-2.5">
          {ownership && (
            <div className="flex items-baseline justify-between py-0.5">
              <span className="label-system text-[11px] text-foreground-tertiary">Ownership</span>
              <OwnershipStatus player={player} />
            </div>
          )}
          <div className="flex items-baseline justify-between py-0.5">
            <span className="label-system text-[11px] text-foreground-tertiary">Availability</span>
            <AvailabilityStatus availability={player.availability ?? "available"} />
          </div>
        </div>
        {(isFlagged || isDoubtful) && player.availability && (
          <p className="mt-2 flex items-start gap-2 text-xs text-foreground-secondary">
            <span
              className={cn(
                "label-system mt-0.5 shrink-0 font-semibold",
                isFlagged ? "text-destructive" : "text-warning"
              )}
            >
              {availabilityLabel[player.availability]}
            </span>
            {flagCopy[player.availability]}
          </p>
        )}
      </TerminalPanelSection>

      {player.fixture && (
        <TerminalPanelSection>
          <h3 className="core-inspector-section-title">Next</h3>
          <p className="mt-1.5 text-sm font-medium text-foreground">
            {player.fixture.homeLabel} — {player.fixture.awayLabel}
          </p>
          <p className="label-system mt-1 text-xs text-foreground-tertiary">
            {formatKickoff(player.fixture.kickoff)}
          </p>
          <div className="mt-1 flex items-center justify-between">
            <span className="label-system text-xs text-foreground-tertiary">
              {player.fixture.isHome ? "Home" : "Away"}
            </span>
            <FixtureStateBadge player={player} />
          </div>
        </TerminalPanelSection>
      )}

      <TerminalPanelSection className="core-inspector-season">
        <h3 className="core-inspector-section-title">Season performance</h3>
        <div className="core-inspector-score"><div><span className="core-kicker">Fantasy points</span><p>{player.totalPoints ?? "—"}</p></div><div><span className="core-kicker">Per appearance</span><strong>{player.averagePoints ?? "—"}</strong></div></div>
        <dl className="core-stat-grid">
          <StatRow label="Appearances" value={stats ? stats.appearances : "—"} />
          <StatRow label="Starts" value={stats ? stats.starts : "—"} />
          <StatRow label="Minutes" value={stats ? stats.minutes : "—"} />
          <StatRow label="Goals" value={stats ? stats.goals : "—"} />
          <StatRow label="Assists" value={stats ? stats.assists : "—"} />
          {stats?.cleanSheets !== undefined && <StatRow label="Clean sheets" value={stats.cleanSheets} />}
          {stats?.saves !== undefined && <StatRow label="Saves" value={stats.saves} />}
        </dl>
      </TerminalPanelSection>

      <TerminalPanelSection>
        <h3 className="core-inspector-section-title">Recent form</h3>
        {recentMatches === undefined || recentMatches === null ? (
          <p className="mt-2 text-xs text-foreground-tertiary">Loading…</p>
        ) : !formWindows || (formWindows.last3 === null && formWindows.last5 === null && formWindows.last10 === null) ? (
          <p className="mt-2 text-xs text-foreground-tertiary">Not enough match data</p>
        ) : (
          <dl className="mt-1">
            <StatRow label="Last 3" value={formWindows.last3 ?? "Unavailable"} />
            <StatRow label="Last 5" value={formWindows.last5 ?? "Unavailable"} />
            <StatRow label="Last 10" value={formWindows.last10 ?? "Unavailable"} />
          </dl>
        )}
      </TerminalPanelSection>

      <TerminalPanelSection>
        <h3 className="core-inspector-section-title">Match history & usage</h3>
        {recentMatches === undefined || recentMatches === null ? (
          <p className="mt-2 text-xs text-foreground-tertiary">Loading…</p>
        ) : !usageTrend ? (
          <p className="mt-2 text-xs text-foreground-tertiary">Not enough match data</p>
        ) : (
          <>
            <dl className="mt-1">
              <StatRow label="Average minutes" value={usageTrend.averageMinutes} />
              <StatRow label="Start rate" value={`${Math.round(usageTrend.startRate * 100)}%`} />
            </dl>
            <div className="mt-3">
              <FormSparkline values={usageTrend.minutesByMatch} />
            </div>
            <div className="mt-3 divide-y divide-border">
              {recentMatches.map((match) => (
                <div key={match.fixtureId} className="flex items-center justify-between py-1.5">
                  <span className="label-system text-[11px] text-foreground-tertiary">
                    {match.isHome ? "vs" : "@"} {match.opponent} ·{" "}
                    {formatKickoffTime(match.kickoffAt)}
                  </span>
                  <span className="label-system flex items-center gap-2 text-[11px] text-foreground-secondary">
                    <span>
                      {match.minutes}&apos; {match.started ? "" : "(SUB)"}
                    </span>
                    <span className="font-semibold text-foreground">
                      {match.fantasyPoints ?? "—"}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </TerminalPanelSection>

      <TerminalPanelSection>
        <h3 className="core-inspector-section-title">Latest score breakdown</h3>
        <div className="mt-2">
          {scoreBreakdown === undefined ? (
            <p className="text-xs text-foreground-tertiary">Loading…</p>
          ) : (
            <ScoringBreakdown breakdown={scoreBreakdown} />
          )}
        </div>
      </TerminalPanelSection>

      <TerminalPanelSection>
        {lineupContext ? (
          <Button
            className="w-full rounded-control"
            disabled={!lineupContext.canSwap}
            onClick={
              lineupContext.isStarter
                ? lineupContext.onMoveToBench
                : lineupContext.onMoveToStarting
            }
          >
            {lineupContext.isStarter ? "Move to bench" : "Move to starting XI"}
          </Button>
        ) : ownership === "mine" ? (
          // Truthful owned/status state for a player already on the
          // caller's OWN team (Pass 10.5B) -- never the "join a league"
          // CTA (which previously showed here too, since this component
          // couldn't tell "mine" apart from "no league context at all"),
          // and never a fake trade/claim action either, since neither
          // exists yet. Real lineup moves belong to the Team page's own
          // edit-lineup flow (lineupContext above), not this slot.
          <div className="rounded-control border border-border px-3 py-2.5 text-center">
            <p className="label-system text-xs font-semibold text-accent">On your roster</p>
            <p className="mt-1 text-xs text-foreground-tertiary">
              Manage starters from the Team page.
            </p>
            {onRequestDrop && (
              <>
                <Button
                  className="mt-2.5 w-full rounded-control"
                  variant="destructive"
                  disabled={isPlayerLocked(player)}
                  onClick={onRequestDrop}
                >
                  Drop player
                </Button>
                {isPlayerLocked(player) && (
                  <p className="mt-1.5 flex items-start gap-1.5 text-left text-xs text-foreground-tertiary">
                    <Lock className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
                    Locked for the current matchday — can&apos;t be dropped until the round ends.
                  </p>
                )}
              </>
            )}
          </div>
        ) : ownership && acquisitionState !== "allowed" ? (
          <PlayerAcquisitionNotice state={acquisitionState} />
        ) : ownership === "owned" ? (
          <>
            <Button className="w-full rounded-control" onClick={() => setShowNote(true)}>
              {actionCopy.owned?.label}
            </Button>
            {showNote && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-foreground-tertiary">
                <Info className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
                {actionCopy.owned?.note}
              </p>
            )}
          </>
        ) : ownership === "free" ? (
          <>
            <Button className="w-full rounded-control" onClick={() => setShowNote(true)}>
              {actionCopy.free?.label}
            </Button>
            {showNote && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-foreground-tertiary">
                <Info className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
                {actionCopy.free?.note}
              </p>
            )}
          </>
        ) : ownership === "waivers" ? (
          <>
            <Button className="w-full rounded-control" onClick={() => setShowNote(true)}>
              {actionCopy.waivers?.label}
            </Button>
            {showNote && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-foreground-tertiary">
                <Info className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
                {actionCopy.waivers?.note}
              </p>
            )}
          </>
        ) : (
          // `ownership` is `undefined` here (never "mine"/"owned"/"free"/
          // "waivers", all handled above) -- the caller genuinely has no
          // active league context, e.g. no league joined at all.
          <Button
            className="w-full rounded-control"
            variant="outline"
            nativeButton={false}
            render={<TransitionLink href="/league" label="League" />}
          >
            Join a league to see roster actions
          </Button>
        )}
      </TerminalPanelSection>
    </TerminalPanel>
  );
}
