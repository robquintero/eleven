import type { PlayerPosition } from "@/lib/types/fantasy";
import { cn } from "@/lib/utils";

/** Positions identify roles; semantic color remains available for status and selection. */
export function PositionBadge({ position, compact = false, className }: {
  position: PlayerPosition;
  compact?: boolean;
  className?: string;
}) {
  return <span title={position} aria-label={position} className={cn(
    "label-system inline-flex shrink-0 items-center justify-center rounded-control bg-muted text-[10px] font-semibold text-foreground-secondary",
    compact ? "w-3 py-0.5" : "w-9 py-1",
    className,
  )}>{compact ? { GK: "G", DEF: "D", MID: "M", FWD: "F" }[position] : position}</span>;
}
