"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Info, Lock } from "lucide-react";
import { FormSparkline } from "@/components/football/form-sparkline";
import { AvailabilityStatus } from "@/components/players/availability-status";
import { OwnershipStatus } from "@/components/players/ownership-status";
import { Button } from "@/components/ui/button";
import { TerminalPanel, TerminalPanelSection } from "@/components/ui/terminal-panel";
import { getRecentFormAverage } from "@/lib/selectors/player";
import { availabilityLabel, formatKickoff } from "@/lib/team-fixture";
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
  lineupContext,
}: {
  player: Player;
  index?: number;
  lineupContext?: LineupInspectorContext;
}) {
  const router = useRouter();
  const [showNote, setShowNote] = useState(false);

  const ownership = player.ownership ?? "free";
  const stats = player.seasonStats;
  const last5 = getRecentFormAverage(player);
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
        <div className="mt-2 flex items-center gap-2">
          <span className="label-system text-[11px] text-foreground-tertiary">STATUS:</span>
          <OwnershipStatus player={player} />
          {player.availability && player.availability !== "available" && (
            <AvailabilityStatus availability={player.availability} />
          )}
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
          <div className="mt-1 flex items-center justify-between">
            <span className="label-system text-xs text-foreground-tertiary">
              {player.fixture.isHome ? "HOME" : "AWAY"} ·{" "}
              {formatKickoff(player.fixture.kickoff)}
            </span>
            <FixtureStateBadge player={player} />
          </div>
        </TerminalPanelSection>
      )}

      <TerminalPanelSection>
        <p className="label-system text-[11px] text-foreground-tertiary">Fantasy</p>
        <div className="mt-1">
          <StatRow label="TOTAL" value={player.totalPoints ?? player.fantasyPoints} />
          <StatRow
            label="AVG"
            value={(player.averagePoints ?? player.fantasyPoints).toFixed(1)}
          />
          {last5 !== null && <StatRow label="LAST 5" value={last5.toFixed(1)} />}
        </div>
      </TerminalPanelSection>

      {player.recentForm && player.recentForm.length > 0 && (
        <TerminalPanelSection>
          <p className="label-system text-[11px] text-foreground-tertiary">Recent_form</p>
          <div className="mt-3">
            <FormSparkline values={player.recentForm} />
          </div>
        </TerminalPanelSection>
      )}

      {stats && (
        <TerminalPanelSection>
          <p className="label-system text-[11px] text-foreground-tertiary">Season</p>
          <div className="mt-1">
            <StatRow label="APP" value={stats.appearances} />
            <StatRow label="MIN" value={stats.minutes} />
            <StatRow label="G" value={stats.goals} />
            <StatRow label="A" value={stats.assists} />
            {stats.cleanSheets !== undefined && (
              <StatRow label="CS" value={stats.cleanSheets} />
            )}
            {stats.saves !== undefined && <StatRow label="SAVES" value={stats.saves} />}
          </div>
        </TerminalPanelSection>
      )}

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
          <Button
            className="w-full rounded-control"
            onClick={() => router.push("/team")}
          >
            View in squad
          </Button>
        ) : (
          <>
            <Button
              className="w-full rounded-control"
              onClick={() => setShowNote(true)}
            >
              {actionCopy[ownership]?.label}
            </Button>
            {showNote && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-foreground-tertiary">
                <Info className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
                {actionCopy[ownership]?.note}
              </p>
            )}
          </>
        )}
      </TerminalPanelSection>
    </TerminalPanel>
  );
}
