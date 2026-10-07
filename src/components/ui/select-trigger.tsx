"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Pass 13 (DESIGN.md §23/§17): the one control to reach for anywhere
 * Eleven needs a single-choice dropdown. A bare native `<select>` is kept
 * underneath — zero-JS-cost accessibility, native keyboard behavior, no
 * custom listbox to build or maintain — but `appearance-none` strips the
 * browser's own chrome so every platform renders the same square,
 * `.label-system` chevron-trigger instead of a generic OS dropdown.
 *
 * Borderless by default: the one shipped usage (the Players filter bar)
 * already sits inside its own `divide-x divide-border border` instrument
 * strip, and a border around each individual cell's control would be the
 * "double border" §20 explicitly rules out for cells inside a strip. Pass
 * `className` to add a border/background for a standalone usage outside
 * that context.
 */
export function SelectTrigger<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <span className="relative inline-flex shrink-0 items-center">
      <select
        data-slot="select-trigger"
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        aria-label={ariaLabel}
        className={cn(
          "label-system appearance-none rounded-control bg-transparent min-h-9 sm:min-h-6 py-0.5 pr-4 pl-0.5 text-[11px] text-foreground-secondary outline-none focus-visible:ring-1 focus-visible:ring-accent/50",
          className
        )}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-surface-elevated">
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-0 size-3 text-foreground-tertiary"
        strokeWidth={2}
        aria-hidden="true"
      />
    </span>
  );
}
