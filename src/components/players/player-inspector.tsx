"use client";

import { useEffect, useState } from "react";
import { useMediaQuery } from "@base-ui/react/unstable-use-media-query";
import {
  PlayerInspectorContent,
  type LineupInspectorContext,
} from "@/components/players/player-inspector-content";
import { getPlayerRecentMatchesAction, getPlayerScoreBreakdownAction } from "@/app/(app)/players/actions";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { PlayerScoreBreakdown, RecentMatchRow } from "@/data-access/players";
import type { Player } from "@/lib/types/fantasy";

export function PlayerInspector({
  player,
  index,
  variant,
  open,
  onOpenChange,
  lineupContext,
  onRequestDrop,
}: {
  player: Player | null;
  index?: number;
  variant: "inline" | "overlay";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lineupContext?: LineupInspectorContext;
  onRequestDrop?: () => void;
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
  const [loadedBreakdown, setLoadedBreakdown] = useState<{ playerId: string; breakdown: PlayerScoreBreakdown | null } | null>(null);

  useEffect(() => {
    if (!player) return;
    let cancelled = false;
    const playerId = player.id;
    getPlayerRecentMatchesAction(playerId).then((matches) => {
      if (!cancelled) setLoadedMatches({ playerId, matches });
    });
    getPlayerScoreBreakdownAction(playerId).then((breakdown) => {
      if (!cancelled) setLoadedBreakdown({ playerId, breakdown });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player?.id]);

  const recentMatches =
    loadedMatches && player && loadedMatches.playerId === player.id ? loadedMatches.matches : null;
  // `undefined` = not yet fetched for this player (distinct from a
  // resolved-but-null "no scored match yet" result) — mirrors
  // `recentMatches`'s own loading-vs-empty distinction above.
  const scoreBreakdown =
    loadedBreakdown && player && loadedBreakdown.playerId === player.id ? loadedBreakdown.breakdown : undefined;

  if (variant === "inline") {
    if (!player) return null;
    return (
      <aside className="h-fit pl-4">
        <PlayerInspectorContent
          key={player.id}
          player={player}
          index={index}
          recentMatches={recentMatches}
          scoreBreakdown={scoreBreakdown}
          lineupContext={lineupContext}
          onRequestDrop={onRequestDrop}
        />
      </aside>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* Pass 11.5: SheetContent itself is now a fixed-height (dvh-capped)
          flex column (see sheet.tsx's own comment) -- the sr-only header
          stays outside the scroll region (negligible height either way),
          and `min-h-0` on the scrollable body is required for a flex
          child to actually shrink and scroll rather than growing past its
          container. This is the "stable header, scrollable body" split
          the late-loading recent-match history needs: PlayerInspectorContent's
          own PLAYER_RECORD header becomes `sticky top-0` WITHIN this
          scroll region (via `stickyHeader`), so it — and the close button
          now rendered inside it — stay reachable no matter how much the
          body grows underneath. */}
      <SheetContent side={isLgDesktop ? "right" : "bottom"} showCloseButton={false}>
        <SheetHeader className="sr-only">
          <SheetTitle>{player?.name ?? "Player"}</SheetTitle>
          <SheetDescription>Player inspector</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
          {player && (
            <PlayerInspectorContent
              key={player.id}
              player={player}
              index={index}
              recentMatches={recentMatches}
              scoreBreakdown={scoreBreakdown}
              lineupContext={lineupContext}
              onRequestDrop={onRequestDrop}
              onClose={() => onOpenChange(false)}
              stickyHeader
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
