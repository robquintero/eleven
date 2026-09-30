"use client";

import { AvailabilityStatus } from "@/components/players/availability-status";
import { OwnershipStatus } from "@/components/players/ownership-status";
import { leagueLabels } from "@/lib/leagues";
import type { Player } from "@/lib/types/fantasy";
import { cn } from "@/lib/utils";

export function PlayerListMobile({
  players,
  selectedId,
  onSelect,
}: {
  players: Player[];
  selectedId: string | null;
  onSelect: (player: Player) => void;
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
          <button
            key={player.id}
            type="button"
            onClick={() => onSelect(player)}
            className={cn(
              "flex w-full items-center gap-3 py-3 text-left transition-colors",
              isSelected && "bg-accent/10"
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
              <OwnershipStatus player={player} className="text-[10px]" />
            </div>
          </button>
        );
      })}
    </div>
  );
}
