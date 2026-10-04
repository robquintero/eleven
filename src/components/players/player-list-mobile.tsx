"use client";

import { AvailabilityStatus } from "@/components/players/availability-status";
import { MarketAction } from "@/components/players/market-action";
import { leagueLabels } from "@/lib/leagues";
import type { Player } from "@/lib/types/fantasy";
import { cn } from "@/lib/utils";

export function PlayerListMobile({
  players,
  selectedId,
  onSelect,
  onAdd,
  onDrop,
  pendingPlayerId,
}: {
  players: Player[];
  selectedId: string | null;
  onSelect: (player: Player) => void;
  onAdd?: (player: Player) => void;
  onDrop?: (player: Player) => void;
  pendingPlayerId?: string | null;
}) {
  return (
    <div className="divide-y divide-border">
      {players.map((player) => {
        const isSelected = player.id === selectedId;
        const isUnavailable =
          player.availability === "injured" ||
          player.availability === "suspended" ||
          player.availability === "doubtful";

        return (
          <div
            key={player.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(player)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(player);
              }
            }}
            className={cn(
              "flex w-full cursor-pointer items-center gap-3 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset",
              isSelected ? "bg-accent/10" : "hover:bg-surface"
            )}
          >
            <span className="label-system flex w-9 shrink-0 items-center justify-center rounded-md bg-muted py-1 text-[11px] font-semibold text-foreground-secondary">
              {player.position}
            </span>

            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
                {player.name}
                {isUnavailable && (
                  <AvailabilityStatus
                    availability={player.availability}
                    className="text-[9px]"
                  />
                )}
              </p>
              <p className="label-system truncate text-[11px] text-foreground-tertiary">
                {player.club.shortName} · {leagueLabels[player.club.league]}
              </p>
            </div>

            <div className="shrink-0 text-right">
              <p className="label-system text-sm font-semibold text-foreground">
                {player.totalPoints ?? "—"}{" "}
                <span className="text-[10px] font-normal text-foreground-tertiary">PTS</span>
              </p>
              <MarketAction player={player} onAdd={onAdd} onDrop={onDrop} pending={pendingPlayerId === player.id} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
