"use client";

import { useState } from "react";
import { Check, ChevronDown, Trophy } from "lucide-react";
import type { FantasyLeague } from "@/lib/types/fantasy";
import { cn } from "@/lib/utils";

export function LeagueSwitcher({
  leagues,
  initialLeagueId,
}: {
  leagues: FantasyLeague[];
  initialLeagueId: string;
}) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(initialLeagueId);
  const selected =
    leagues.find((league) => league.id === selectedId) ?? leagues[0];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex items-center gap-2 rounded-control border border-border bg-surface px-2.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-elevated"
      >
        <Trophy className="size-3.5 text-foreground-tertiary" strokeWidth={2} />
        <span className="label-system hidden text-[10px] text-foreground-tertiary sm:inline">
          League /
        </span>
        <span className="max-w-[9rem] truncate sm:max-w-[14rem]">
          {selected.name}
        </span>
        <ChevronDown
          className={cn(
            "size-3.5 text-foreground-tertiary transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close league switcher"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="listbox"
            className="absolute top-full left-0 z-50 mt-1 w-64 border border-border bg-surface-elevated shadow-lg shadow-black/30"
          >
            {leagues.map((league) => {
              const isSelected = league.id === selected.id;
              return (
                <button
                  key={league.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    setSelectedId(league.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-2 border-b border-border px-3 py-2 text-left text-sm transition-colors last:border-b-0 hover:bg-surface"
                >
                  <span className="flex flex-col">
                    <span className="font-medium text-foreground">
                      {league.name}
                    </span>
                    <span className="label-system text-[10px] text-foreground-tertiary">
                      {league.memberCount} managers
                    </span>
                  </span>
                  {isSelected && (
                    <Check className="size-4 shrink-0 text-accent" />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
