import type { ReactNode } from "react";
import { uiLabel } from "@/lib/ui-label";
import { cn } from "@/lib/utils";

/**
 * Compact system-register header for a standalone workspace module — the
 * "STARTING_XI" / "OPERATIONS_FEED" style label used throughout the desktop
 * recomposition. For a module nested inside a `divide-y` rail, use
 * `RailModule` instead (no border-b of its own — the rail's divider covers
 * that job).
 */
export function ModuleHeader({
  title,
  meta,
  className,
}: {
  title: string;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b border-border pb-2",
        className
      )}
    >
      <span className="v2-module-label label-system text-[11px] text-foreground-secondary">
        {typeof title === "string" ? uiLabel(title) : title}
      </span>
      {meta && (
        <span className="label-system text-[11px] text-foreground-tertiary">
          {meta}
        </span>
      )}
    </div>
  );
}
