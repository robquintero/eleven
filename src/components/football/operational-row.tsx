import type { ReactNode } from "react";

/** Label/value row for compact terminal-style readouts (Round Status, Round Intelligence). */
export function OperationalRow({
  label,
  value,
  secondary,
}: {
  label: string;
  value: ReactNode;
  secondary?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="label-system text-[11px] text-foreground-tertiary">{label}</span>
      <span className="flex items-baseline gap-2">
        <span className="label-system text-sm font-semibold text-foreground">{value}</span>
        {secondary && (
          <span className="label-system text-[10px] text-foreground-tertiary">{secondary}</span>
        )}
      </span>
    </div>
  );
}
