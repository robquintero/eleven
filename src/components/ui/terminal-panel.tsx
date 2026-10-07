import type { ReactNode } from "react";
import { uiLabel } from "@/lib/ui-label";
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
  stickyHeader = false,
}: {
  header?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Pass 11.5: opt-in only (default false, unchanged for every other caller) -- when a panel is rendered inside its own scrollable container (the Player Inspector overlay), this keeps the header row pinned to the top of that scroll area as the body scrolls beneath it, instead of scrolling away with the rest of the content. */
  stickyHeader?: boolean;
}) {
  return (
    <div className={cn("v2-panel border border-border bg-surface-elevated", className)}>
      {header && (
        <div
          className={cn(
            "v2-panel-header flex items-center justify-between border-b border-border bg-surface-elevated px-3 py-2",
            stickyHeader && "sticky top-0 z-10"
          )}
        >
          <span className="v2-module-label label-system text-[11px] text-foreground-secondary">
            {typeof header === "string" ? uiLabel(header) : header}
          </span>
          {meta && (
            <span className="label-system flex items-center gap-2 text-[11px] text-foreground-tertiary">
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
