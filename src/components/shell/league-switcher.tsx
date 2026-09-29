"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, ChevronDown, Trophy } from "lucide-react";
import { setActiveLeagueAction } from "@/app/(app)/actions";
import type { LeagueSummary } from "@/data-access/leagues";
import { cn } from "@/lib/utils";

/**
 * Real memberships only — `leagues` is whatever `getUserLeagues()` actually
 * returned for the signed-in user, never a hardcoded/mock list. Zero
 * leagues renders a "no league" affordance instead of a switcher; one
 * league renders a static (non-interactive) label instead of a dropdown
 * with a single, unswitchable option.
 */
export function LeagueSwitcher({
  leagues,
  activeLeagueId,
}: {
  leagues: LeagueSummary[];
  activeLeagueId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  if (leagues.length === 0) {
    return (
      <Link
        href="/league"
        className="flex items-center gap-2 rounded-control border border-border bg-surface px-2.5 py-1.5 text-sm font-medium text-foreground-secondary transition-colors hover:bg-surface-elevated"
      >
        <Trophy className="size-3.5 text-foreground-tertiary" strokeWidth={2} />
        <span className="label-system text-[11px]">NO ACTIVE LEAGUE</span>
      </Link>
    );
  }

  const active = leagues.find((league) => league.id === activeLeagueId) ?? leagues[0];

  if (leagues.length === 1) {
    return (
      <span className="flex items-center gap-2 rounded-control border border-border bg-surface px-2.5 py-1.5 text-sm font-medium text-foreground">
        <Trophy className="size-3.5 text-foreground-tertiary" strokeWidth={2} />
        <span className="max-w-[9rem] truncate sm:max-w-[14rem]">{active.name}</span>
      </span>
    );
  }

  function selectLeague(leagueId: string) {
    setOpen(false);
    const formData = new FormData();
    formData.set("leagueId", leagueId);
    startTransition(() => {
      setActiveLeagueAction(formData);
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={pending}
        className="flex items-center gap-2 rounded-control border border-border bg-surface px-2.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-elevated disabled:opacity-60"
      >
        <Trophy className="size-3.5 text-foreground-tertiary" strokeWidth={2} />
        <span className="label-system hidden text-[10px] text-foreground-tertiary sm:inline">
          League /
        </span>
        <span className="max-w-[9rem] truncate sm:max-w-[14rem]">{active.name}</span>
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
              const isSelected = league.id === active.id;
              return (
                <button
                  key={league.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => selectLeague(league.id)}
                  className="flex w-full items-center justify-between gap-2 border-b border-border px-3 py-2 text-left text-sm transition-colors last:border-b-0 hover:bg-surface"
                >
                  <span className="flex flex-col">
                    <span className="font-medium text-foreground">{league.name}</span>
                    <span className="label-system text-[10px] text-foreground-tertiary">
                      {league.memberCount} / {league.maxTeams} managers
                    </span>
                  </span>
                  {isSelected && <Check className="size-4 shrink-0 text-accent" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
