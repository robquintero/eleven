"use client";

import type { RefObject } from "react";
import { Search, X } from "lucide-react";
import {
  availabilityOptions,
  clubOptions,
  isFiltersActive,
  leagueOptions,
  ownershipOptions,
  positionOptions,
  sortOptions,
  type PlayerFilters,
} from "@/lib/players-filters";
import { cn } from "@/lib/utils";

function FilterCell<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="flex shrink-0 items-center gap-1.5 px-2.5 py-1.5">
      <span className="label-system text-[10px] text-foreground-tertiary">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="label-system bg-transparent text-[11px] text-foreground-secondary outline-none"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-surface-elevated">
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function PlayerDatabaseToolbar({
  filters,
  onChange,
  onReset,
  resultCount,
  totalCount,
  searchInputRef,
}: {
  filters: PlayerFilters;
  onChange: (patch: Partial<PlayerFilters>) => void;
  onReset: () => void;
  resultCount: number;
  totalCount: number;
  searchInputRef: RefObject<HTMLInputElement | null>;
}) {
  const active = isFiltersActive(filters);

  return (
    <div className="border-b border-border pb-4">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-foreground-tertiary"
          strokeWidth={2}
        />
        <input
          ref={searchInputRef}
          type="text"
          value={filters.query}
          onChange={(e) => onChange({ query: e.target.value })}
          placeholder="Search player or club…"
          className={cn(
            "h-9 w-full rounded-control border border-border bg-surface pr-9 pl-9 text-sm text-foreground outline-none placeholder:text-foreground-tertiary",
            "focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40"
          )}
        />
        {filters.query ? (
          <button
            type="button"
            onClick={() => onChange({ query: "" })}
            className="absolute top-1/2 right-2.5 -translate-y-1/2 text-foreground-tertiary hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="size-3.5" strokeWidth={2} />
          </button>
        ) : (
          <span className="label-system pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[10px] text-foreground-tertiary">
            /
          </span>
        )}
      </div>

      {/* Control strip — one bordered instrument, adjacent controls share a
          border; scrolls horizontally rather than wrapping so it never
          breaks into a second, disconnected row. */}
      <div className="mt-3 flex divide-x divide-border overflow-x-auto border border-border">
        <FilterCell
          label="POS"
          value={filters.position}
          options={positionOptions}
          onChange={(v) => onChange({ position: v })}
        />
        <FilterCell
          label="LGE"
          value={filters.league}
          options={leagueOptions}
          onChange={(v) => onChange({ league: v })}
        />
        <FilterCell
          label="CLUB"
          value={filters.club}
          options={clubOptions}
          onChange={(v) => onChange({ club: v })}
        />
        <FilterCell
          label="STATUS"
          value={filters.availability}
          options={availabilityOptions}
          onChange={(v) => onChange({ availability: v })}
        />
        <FilterCell
          label="OWN"
          value={filters.ownership}
          options={ownershipOptions}
          onChange={(v) => onChange({ ownership: v })}
        />
        <FilterCell
          label="SORT"
          value={filters.sort}
          options={sortOptions}
          onChange={(v) => onChange({ sort: v })}
        />
      </div>

      <div className="mt-2.5 flex items-center gap-4">
        {active && (
          <button
            type="button"
            onClick={onReset}
            className="label-system text-[11px] text-accent hover:underline"
          >
            Reset
          </button>
        )}

        <span className="label-system ml-auto text-[11px] text-foreground-tertiary">
          {resultCount === totalCount ? (
            <>{totalCount} players</>
          ) : (
            <>
              {resultCount} / {totalCount} players
            </>
          )}
        </span>
      </div>
    </div>
  );
}
