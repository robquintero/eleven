import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A bordered instrument pane — the terminal-geometry alternative to a
 * floating rounded card. Square by default (see DESIGN.md §20); reach for
 * this instead of a one-off `rounded-2xl border` container.
 */
export function TerminalPanel({
  header,
  meta,
  children,
  className,
}: {
  header?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border border-border bg-surface-elevated", className)}>
      {header && (
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="label-system text-[11px] text-foreground-secondary">
            {header}
          </span>
          {meta && (
            <span className="label-system text-[11px] text-foreground-tertiary">
              {meta}
            </span>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

/** One bordered section inside a `TerminalPanel` — hard separator, compact padding. */
export function TerminalPanelSection({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border-b border-border px-3 py-3 last:border-b-0", className)}>
      {children}
    </div>
  );
}
