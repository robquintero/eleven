"use client";

import { ArrowDown } from "lucide-react";
import { AvailabilityStatus } from "@/components/players/availability-status";
import { OwnershipStatus } from "@/components/players/ownership-status";
import { leagueCode } from "@/lib/leagues";
import type { SortKey } from "@/lib/players-filters";
import { playerFixtureCode } from "@/lib/team-fixture";
import type { Player } from "@/lib/types/fantasy";
import { cn } from "@/lib/utils";

const rowGrid =
  "grid grid-cols-[2rem_1fr_2.75rem_3rem_5rem_3.5rem_6.5rem] items-center gap-3 lg:grid-cols-[2rem_1fr_2.75rem_3rem_2.5rem_5rem_3.5rem_3.5rem_6.5rem]";

function HeaderCell({
  label,
  sortKey,
  activeSort,
  onSort,
  className,
}: {
  label: string;
  sortKey?: SortKey;
  activeSort: SortKey;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  if (!sortKey) {
    return (
      <span className={cn("label-system text-[10px] text-foreground-tertiary", className)}>
        {label}
      </span>
    );
  }

  const isActive = activeSort === sortKey;

  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn(
        "label-system flex items-center gap-1 text-[10px] transition-colors",
        isActive ? "text-foreground" : "text-foreground-tertiary hover:text-foreground-secondary",
        className
      )}
    >
      {label}
      {isActive && <ArrowDown className="size-2.5" strokeWidth={2.5} />}
    </button>
  );
}

export function PlayerTable({
  players,
  selectedId,
  highlightedId,
  sort,
  onSort,
  onSelect,
}: {
  players: Player[];
  selectedId: string | null;
  highlightedId: string | null;
  sort: SortKey;
  onSort: (key: SortKey) => void;
  onSelect: (player: Player) => void;
}) {
  return (
    <div className="w-full border border-border">
      <div
        className={cn(
          rowGrid,
          "sticky top-0 z-10 border-b border-l-2 border-border border-l-transparent bg-surface py-2 pr-2 pl-3"
        )}
      >
        <span />
        <HeaderCell label="PLAYER" sortKey="name" activeSort={sort} onSort={onSort} />
        <HeaderCell label="POS" activeSort={sort} onSort={onSort} />
        <HeaderCell label="CLUB" activeSort={sort} onSort={onSort} />
        <HeaderCell
          label="LGE"
          activeSort={sort}
          onSort={onSort}
          className="hidden lg:flex"
        />
        <HeaderCell label="NEXT" sortKey="kickoff" activeSort={sort} onSort={onSort} />
        <HeaderCell label="PTS" sortKey="points" activeSort={sort} onSort={onSort} />
        <HeaderCell
          label="FORM"
          sortKey="form"
          activeSort={sort}
          onSort={onSort}
          className="hidden lg:flex"
        />
        <HeaderCell label="STATUS" activeSort={sort} onSort={onSort} className="justify-self-end" />
      </div>

      <div className="divide-y divide-border">
        {players.map((player, index) => {
          const isSelected = player.id === selectedId;
          const isHighlighted = !isSelected && player.id === highlightedId;
          const isUnavailable =
            player.availability === "injured" ||
            player.availability === "suspended" ||
            player.availability === "doubtful";

          return (
            <button
              key={player.id}
              type="button"
              id={`player-row-${player.id}`}
              onClick={() => onSelect(player)}
              className={cn(
                rowGrid,
                "w-full border-l-2 border-l-transparent py-2.5 pr-2 pl-3 text-left transition-colors",
                isSelected && "border-l-accent bg-accent/10",
                isHighlighted && "ring-1 ring-inset ring-accent/50",
                !isSelected && !isHighlighted && "hover:bg-surface"
              )}
            >
              <span className="label-system text-[11px] text-foreground-tertiary">
                {String(index + 1).padStart(3, "0")}
              </span>

              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-sm font-medium text-foreground">
                  {player.name}
                </span>
                {isUnavailable && (
                  <AvailabilityStatus
                    availability={player.availability}
                    className="text-[9px]"
                  />
                )}
              </span>

              <span className="label-system text-[11px] text-foreground-tertiary">
                {player.position}
              </span>

              <span className="label-system truncate text-[11px] text-foreground-secondary">
                {player.club.shortName}
              </span>

              <span className="label-system hidden text-[11px] text-foreground-tertiary lg:block">
                {leagueCode[player.club.league]}
              </span>

              <span className="label-system truncate text-[11px] text-foreground-tertiary">
                {playerFixtureCode(player)}
              </span>

              <span className="label-system text-sm font-semibold text-foreground">
                {player.totalPoints ?? player.fantasyPoints}
              </span>

              <span className="label-system hidden text-[11px] text-foreground-tertiary lg:block">
                {(player.averagePoints ?? player.fantasyPoints).toFixed(1)}
              </span>

              <OwnershipStatus player={player} className="justify-self-end text-[11px]" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
