"use client";

import { useEffect, useState } from "react";
import { useMediaQuery } from "@base-ui/react/unstable-use-media-query";
import {
  PlayerInspectorContent,
  type LineupInspectorContext,
} from "@/components/players/player-inspector-content";
import { getPlayerRecentMatchesAction } from "@/app/(app)/players/actions";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { RecentMatchRow } from "@/data-access/players";
import type { Player } from "@/lib/types/fantasy";

export function PlayerInspector({
  player,
  index,
  variant,
  open,
  onOpenChange,
  lineupContext,
}: {
  player: Player | null;
  index?: number;
  variant: "inline" | "overlay";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lineupContext?: LineupInspectorContext;
}) {
  const isLgDesktop = useMediaQuery("(min-width: 1024px)", {
    defaultMatches: true,
    noSsr: true,
  });

  // Keyed by playerId rather than reset-then-fetch, so the effect only
  // ever calls setState from inside the resolved promise callback (never
  // synchronously in the effect body) — the loading state is *derived*
  // below by comparing this to the current player, not tracked separately.
  const [loadedMatches, setLoadedMatches] = useState<{ playerId: string; matches: RecentMatchRow[] } | null>(null);

  useEffect(() => {
    if (!player) return;
    let cancelled = false;
    const playerId = player.id;
    getPlayerRecentMatchesAction(playerId).then((matches) => {
      if (!cancelled) setLoadedMatches({ playerId, matches });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player?.id]);

  const recentMatches =
    loadedMatches && player && loadedMatches.playerId === player.id ? loadedMatches.matches : null;

  if (variant === "inline") {
    if (!player) return null;
    return (
      <aside className="h-fit pl-4">
        <PlayerInspectorContent
          key={player.id}
          player={player}
          index={index}
          recentMatches={recentMatches}
          lineupContext={lineupContext}
        />
      </aside>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={isLgDesktop ? "right" : "bottom"} className="overflow-y-auto">
        <SheetHeader className="sr-only">
          <SheetTitle>{player?.name ?? "Player"}</SheetTitle>
          <SheetDescription>Player inspector</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          {player && (
            <PlayerInspectorContent
              key={player.id}
              player={player}
              index={index}
              recentMatches={recentMatches}
              lineupContext={lineupContext}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
