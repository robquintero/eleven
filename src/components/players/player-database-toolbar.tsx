"use client";

import type { RefObject } from "react";
import { Search, X } from "lucide-react";
import { SelectTrigger } from "@/components/ui/select-trigger";
import {
  availabilityOptions,
  isFiltersActive,
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
    <label className="core-filter-cell">
      <span className="label-system text-[10px] text-foreground-tertiary">{label}</span>
      <SelectTrigger value={value} options={options} onChange={onChange} ariaLabel={label} />
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
  competitionOptions,
  showOwnershipFilter,
}: {
  filters: PlayerFilters;
  onChange: (patch: Partial<PlayerFilters>) => void;
  onReset: () => void;
  resultCount: number;
  totalCount: number;
  searchInputRef: RefObject<HTMLInputElement | null>;
  clubOptions: { value: string; label: string }[];
  competitionOptions: { value: string; label: string }[];
  showOwnershipFilter: boolean;
}) {
  const active = isFiltersActive(filters);

  return (
    <div className="core-discovery">
      {/* Search stays visible while the secondary filter strip scrolls. */}
      <div className="core-discovery-controls">
        <div className="flex flex-col gap-3">
          <div className="core-search relative flex min-w-0 items-center">
            <Search
              className="pointer-events-none absolute left-2.5 size-3.5 text-foreground-tertiary"
              strokeWidth={2}
            />
            <input
              ref={searchInputRef}
              aria-label="Search player or club"
              type="text"
              value={filters.query}
              onChange={(e) => onChange({ query: e.target.value })}
              placeholder="Search player or club…"
              className="h-11 w-full bg-transparent pr-9 pl-8 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60 placeholder:text-foreground-tertiary sm:text-sm"
            />
            {filters.query ? (
              <button
                type="button"
                onClick={() => onChange({ query: "" })}
                className="absolute right-0 flex size-11 items-center justify-center text-foreground-tertiary outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent hover:text-foreground"
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
          <div className="core-filter-grid">
            <FilterCell
              label="Position"
              value={filters.position}
              options={positionOptions}
              onChange={(v) => onChange({ position: v })}
            />
            <FilterCell
              label="Competition"
              value={filters.competitionId}
              options={competitionOptions}
              onChange={(v) => onChange({ competitionId: v })}
            />
            <FilterCell
              label="Club"
              value={filters.clubId}
              options={clubOptions}
              onChange={(v) => onChange({ clubId: v })}
            />
            <FilterCell
              label="Availability"
              value={filters.availability}
              options={availabilityOptions}
              onChange={(v) => onChange({ availability: v })}
            />
            {showOwnershipFilter && (
              <FilterCell
                label="Ownership"
                value={filters.ownership}
                options={ownershipOptions}
                onChange={(v) => onChange({ ownership: v })}
              />
            )}
            <FilterCell
              label="Sort"
              value={filters.sort}
              options={sortOptions}
              onChange={(v) => onChange({ sort: v })}
            />
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-4">
        {active && (
          <button
            type="button"
            onClick={onReset}
            className="label-system min-h-11 px-1 text-[11px] text-accent outline-none focus-visible:ring-2 focus-visible:ring-accent hover:underline"
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
