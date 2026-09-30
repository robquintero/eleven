"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Info, Lock } from "lucide-react";
import { FormSparkline } from "@/components/football/form-sparkline";
import { AvailabilityStatus } from "@/components/players/availability-status";
import { OwnershipStatus } from "@/components/players/ownership-status";
import { Button } from "@/components/ui/button";
import { TerminalPanel, TerminalPanelSection } from "@/components/ui/terminal-panel";
import type { RecentMatchRow } from "@/data-access/players";
import { getUsageTrend } from "@/lib/selectors/usage-trend";
import { getFormWindows } from "@/lib/selectors/form-tracker";
import { availabilityLabel, formatKickoff, formatKickoffTime } from "@/lib/team-fixture";
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
        LIVE
      </span>
    );
  }
  if (fixture.state === "locked") {
    return (
      <span className="label-system flex items-center gap-1.5 text-xs text-foreground-tertiary">
        <Lock className="size-3" strokeWidth={2} />
        LOCKED
      </span>
    );
  }
  if (fixture.state === "final") {
    return <span className="label-system text-xs text-foreground-tertiary">FT</span>;
  }
  return <span className="label-system text-xs text-foreground-tertiary">UPCOMING</span>;
}

function StatRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between py-1">
      <span className="label-system text-[11px] text-foreground-tertiary">{label}</span>
      <span className="label-system text-sm font-semibold text-foreground">{value}</span>
    </div>
  );
}

export function PlayerInspectorContent({
  player,
  index,
  recentMatches,
  lineupContext,
}: {
  player: Player;
  index?: number;
  /** `null` while loading, `[]` for INSUFFICIENT MATCH DATA, real rows otherwise — see src/data-access/players.ts. */
  recentMatches?: RecentMatchRow[] | null;
  lineupContext?: LineupInspectorContext;
}) {
  const router = useRouter();
  const [showNote, setShowNote] = useState(false);

  const ownership = player.ownership;
  const stats = player.seasonStats;
  const usageTrend = recentMatches ? getUsageTrend(recentMatches) : undefined;
  const formWindows = recentMatches ? getFormWindows(recentMatches) : undefined;
  const isFlagged = player.availability === "injured" || player.availability === "suspended";
  const isDoubtful = player.availability === "doubtful";

  return (
    <TerminalPanel
      header="PLAYER_RECORD"
      meta={index !== undefined ? String(index + 1).padStart(3, "0") : undefined}
    >
      <TerminalPanelSection>
        <p className="label-system text-xs text-foreground-tertiary">
          {player.club.shortName} / {player.position}
          {player.number !== undefined ? ` / #${String(player.number).padStart(2, "0")}` : ""}
        </p>
        <h2 className="mt-1.5 text-xl font-semibold tracking-tight text-foreground">
          {player.name}
        </h2>
        <div className="mt-2.5">
          {ownership && (
            <div className="flex items-baseline justify-between py-0.5">
              <span className="label-system text-[11px] text-foreground-tertiary">OWNERSHIP</span>
              <OwnershipStatus player={player} />
            </div>
          )}
          <div className="flex items-baseline justify-between py-0.5">
            <span className="label-system text-[11px] text-foreground-tertiary">STATUS</span>
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
          <p className="label-system text-[11px] text-foreground-tertiary">Next</p>
          <p className="mt-1.5 text-sm font-medium text-foreground">
            {player.fixture.isHome
              ? `${player.club.shortName} — ${player.fixture.opponent}`
              : `${player.fixture.opponent} — ${player.club.shortName}`}
          </p>
          <p className="label-system mt-1 text-xs text-foreground-tertiary">
            {formatKickoff(player.fixture.kickoff)}
          </p>
          <div className="mt-1 flex items-center justify-between">
            <span className="label-system text-xs text-foreground-tertiary">
              {player.fixture.isHome ? "HOME" : "AWAY"}
            </span>
            <FixtureStateBadge player={player} />
          </div>
        </TerminalPanelSection>
      )}

      <TerminalPanelSection>
        <p className="label-system text-[11px] text-foreground-tertiary">Season</p>
        <div className="mt-1">
          <StatRow label="PTS" value={player.totalPoints ?? "—"} />
          <StatRow label="PTS/APP" value={player.averagePoints ?? "—"} />
          <StatRow label="APP" value={stats ? stats.appearances : "—"} />
          <StatRow label="STARTS" value={stats ? stats.starts : "—"} />
          <StatRow label="MIN" value={stats ? stats.minutes : "—"} />
          <StatRow label="G" value={stats ? stats.goals : "—"} />
          <StatRow label="A" value={stats ? stats.assists : "—"} />
          {stats?.cleanSheets !== undefined && <StatRow label="CS" value={stats.cleanSheets} />}
          {stats?.saves !== undefined && <StatRow label="SAVES" value={stats.saves} />}
        </div>
      </TerminalPanelSection>

      <TerminalPanelSection>
        <p className="label-system text-[11px] text-foreground-tertiary">Form_tracker</p>
        {recentMatches === undefined || recentMatches === null ? (
          <p className="mt-2 text-xs text-foreground-tertiary">Loading…</p>
        ) : !formWindows || (formWindows.last3 === null && formWindows.last5 === null && formWindows.last10 === null) ? (
          <p className="mt-2 text-xs text-foreground-tertiary">INSUFFICIENT MATCH DATA</p>
        ) : (
          <div className="mt-1">
            <StatRow label="LAST 3" value={formWindows.last3 ?? "INSUFFICIENT"} />
            <StatRow label="LAST 5" value={formWindows.last5 ?? "INSUFFICIENT"} />
            <StatRow label="LAST 10" value={formWindows.last10 ?? "INSUFFICIENT"} />
          </div>
        )}
      </TerminalPanelSection>

      <TerminalPanelSection>
        <p className="label-system text-[11px] text-foreground-tertiary">Recent_usage</p>
        {recentMatches === undefined || recentMatches === null ? (
          <p className="mt-2 text-xs text-foreground-tertiary">Loading…</p>
        ) : !usageTrend ? (
          <p className="mt-2 text-xs text-foreground-tertiary">INSUFFICIENT MATCH DATA</p>
        ) : (
          <>
            <div className="mt-1">
              <StatRow label="AVG MIN" value={usageTrend.averageMinutes} />
              <StatRow label="START RATE" value={`${Math.round(usageTrend.startRate * 100)}%`} />
            </div>
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
            <p className="label-system text-xs font-semibold text-accent">ON YOUR ROSTER</p>
            <p className="mt-1 text-xs text-foreground-tertiary">
              Manage starters and formation from the Team page.
            </p>
          </div>
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
            onClick={() => router.push("/league")}
          >
            Join a league to see roster actions
          </Button>
        )}
      </TerminalPanelSection>
    </TerminalPanel>
  );
}
