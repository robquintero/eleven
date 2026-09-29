"use client";

import type { RefObject } from "react";
import { Search, X } from "lucide-react";
import {
  availabilityOptions,
  isFiltersActive,
  leagueOptions,
  ownershipOptions,
  positionOptions,
  sortOptions,
  type PlayerFilters,
} from "@/lib/players-filters";

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
  clubOptions,
}: {
  filters: PlayerFilters;
  onChange: (patch: Partial<PlayerFilters>) => void;
  onReset: () => void;
  resultCount: number;
  totalCount: number;
  searchInputRef: RefObject<HTMLInputElement | null>;
  clubOptions: { value: string; label: string }[];
}) {
  const active = isFiltersActive(filters);

  return (
    <div className="border-b border-border pb-3">
      {/* One professional instrumentation strip — search and filters share
          a single border/divide-x row instead of a rounded search box
          sitting above a separate filter strip. */}
      <div className="flex items-stretch divide-x divide-border overflow-x-auto border border-border">
        <div className="relative flex min-w-55 flex-1 items-center">
          <Search
            className="pointer-events-none absolute left-2.5 size-3.5 text-foreground-tertiary"
            strokeWidth={2}
          />
          <input
            ref={searchInputRef}
            type="text"
            value={filters.query}
            onChange={(e) => onChange({ query: e.target.value })}
            placeholder="Search player or club…"
            className="h-9 w-full bg-transparent pr-9 pl-8 text-sm text-foreground outline-none placeholder:text-foreground-tertiary"
          />
          {filters.query ? (
            <button
              type="button"
              onClick={() => onChange({ query: "" })}
              className="absolute right-2.5 text-foreground-tertiary hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-3.5" strokeWidth={2} />
            </button>
          ) : (
            <span className="label-system pointer-events-none absolute right-3 text-[10px] text-foreground-tertiary">
              /
            </span>
          )}
        </div>
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

      <div className="mt-2 flex items-center gap-4">
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
