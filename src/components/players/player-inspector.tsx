"use client";

import { useMediaQuery } from "@base-ui/react/unstable-use-media-query";
import { PlayerInspectorContent } from "@/components/players/player-inspector-content";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Player } from "@/lib/types/fantasy";

export function PlayerInspector({
  player,
  index,
  variant,
  open,
  onOpenChange,
}: {
  player: Player | null;
  index?: number;
  variant: "inline" | "overlay";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isLgDesktop = useMediaQuery("(min-width: 1024px)", {
    defaultMatches: true,
    noSsr: true,
  });

  if (variant === "inline") {
    if (!player) return null;
    return (
      <aside className="h-fit pl-4">
        <PlayerInspectorContent key={player.id} player={player} index={index} />
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
            <PlayerInspectorContent key={player.id} player={player} index={index} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
