import type { ReactNode } from "react";
import { uiLabel } from "@/lib/ui-label";
import { cn } from "@/lib/utils";

/**
 * One module inside a persistent operations rail — a compact header row
 * (system register, uppercase, optional right-aligned meta) plus padded
 * content. Meant to be stacked with siblings inside a single
 * `divide-y divide-border border border-border` container so the rail
 * reads as one continuous instrument, not several floating cards.
 */
export function RailModule({
  header,
  meta,
  children,
  className,
}: {
  header: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("px-4 py-3.5", className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="v2-module-label label-system text-[11px] text-foreground-secondary">
          {typeof header === "string" ? uiLabel(header) : header}
        </span>
        {meta && (
          <span className="label-system text-[11px] text-foreground-tertiary">
            {meta}
          </span>
        )}
      </div>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}
