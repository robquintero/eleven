"use client";

import { Lock } from "lucide-react";
import { useMediaQuery } from "@base-ui/react/unstable-use-media-query";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { FormSparkline } from "@/components/football/form-sparkline";
import { leagueLabels } from "@/lib/leagues";
import { availabilityLabel, formatKickoff, fixtureOpponentLabel } from "@/lib/team-fixture";
import type { Player } from "@/lib/types/fantasy";
import { cn } from "@/lib/utils";

function FixtureStatus({ player }: { player: Player }) {
  const fixture = player.fixture;
  if (!fixture) return null;

  if (fixture.state === "live") {
    return (
      <span className="label-system flex items-center gap-1.5 text-sm font-semibold text-live">
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
      <span className="label-system flex items-center gap-1.5 text-sm text-foreground-tertiary">
        <Lock className="size-3.5" strokeWidth={2} />
        LOCKED
      </span>
    );
  }

  if (fixture.state === "final") {
    return <span className="label-system text-sm text-foreground-tertiary">FT</span>;
  }

  return <span className="label-system text-sm text-foreground-tertiary">UPCOMING</span>;
}

const flagCopy: Record<string, string> = {
  injured: "Not fit to start this matchday.",
  suspended: "Serving a suspension — unavailable to select.",
  doubtful: "Fitness test pending ahead of kickoff.",
};

export function PlayerDetailSheet({
  player,
  open,
  onOpenChange,
  isStarter,
  canSwap,
  onMoveToBench,
  onMoveToStarting,
}: {
  player: Player | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isStarter: boolean;
  canSwap: boolean;
  onMoveToBench: () => void;
  onMoveToStarting: () => void;
}) {
  const isDesktop = useMediaQuery("(min-width: 1024px)", {
    defaultMatches: true,
    noSsr: true,
  });

  if (!player) return null;

  const isFlagged =
    player.availability === "injured" || player.availability === "suspended";
  const isDoubtful = player.availability === "doubtful";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={isDesktop ? "right" : "bottom"}>
        <SheetHeader>
          <div className="flex items-baseline gap-2.5">
            {player.number !== undefined && (
              <span className="label-system text-sm font-semibold text-foreground-tertiary">
                {String(player.number).padStart(2, "0")}
              </span>
            )}
            <SheetTitle>{player.name}</SheetTitle>
          </div>
          <SheetDescription className="label-system text-xs">
            {player.club.shortName} · {player.position} ·{" "}
            {leagueLabels[player.club.league]}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-4">
          {(isFlagged || isDoubtful) && (
            <p className="flex items-start gap-2 text-sm text-foreground-secondary">
              <span
                className={cn(
                  "label-system mt-0.5 shrink-0 text-xs font-semibold",
                  isFlagged ? "text-destructive" : "text-warning"
                )}
              >
                {availabilityLabel[player.availability!]}
              </span>
              {flagCopy[player.availability!]}
            </p>
          )}

          <div className="flex items-end justify-between border-b border-border pb-4">
            <div>
              <p className="label-system text-xs text-foreground-tertiary">
                Fantasy points
              </p>
              <p className="mt-1 font-mono text-3xl font-semibold tabular-nums tracking-tight text-foreground">
                {player.fantasyPoints}
              </p>
            </div>
            <div className="text-right">
              <p className="label-system text-xs text-foreground-tertiary">
                {player.fixture ? fixtureOpponentLabel(player) : "No fixture"}
              </p>
              <div className="mt-1 flex items-center justify-end gap-2">
                {player.fixture && (
                  <span className="label-system text-xs text-foreground-tertiary">
                    {formatKickoff(player.fixture.kickoff)}
                  </span>
                )}
                <FixtureStatus player={player} />
              </div>
            </div>
          </div>

          {player.recentForm && player.recentForm.length > 0 && (
            <div>
              <p className="label-system text-xs text-foreground-tertiary">
                Recent form
              </p>
              <div className="mt-3">
                <FormSparkline values={player.recentForm} />
              </div>
            </div>
          )}
        </div>

        <SheetFooter>
          {isStarter ? (
            <Button
              variant="secondary"
              disabled={!canSwap}
              onClick={onMoveToBench}
            >
              Move to bench
            </Button>
          ) : (
            <Button
              variant="secondary"
              disabled={!canSwap}
              onClick={onMoveToStarting}
            >
              Move to starting XI
            </Button>
          )}
          <Button variant="outline" disabled>
            View player
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
