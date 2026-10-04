import { cn } from "@/lib/utils";

/**
 * Compact bar visualization of recent fantasy scores — the one sparkline
 * pattern in the app. Pass 14.7: size is now configurable (defaults
 * unchanged from the original hardcoded values, so the existing
 * player-inspector-content.tsx caller is pixel-identical) so the SAME
 * component can also render small enough for a dense rail module (Home's
 * Form/Market Intelligence) instead of a second, parallel sparkline
 * implementation.
 */
export function FormSparkline({
  values,
  barHeightClass = "h-12",
  barWidthClass = "w-4",
  gapClass = "gap-3",
  showLabels = true,
}: {
  values: number[];
  barHeightClass?: string;
  barWidthClass?: string;
  gapClass?: string;
  showLabels?: boolean;
}) {
  if (values.length === 0) return null;
  const max = Math.max(...values, 1);

  return (
    <div className={cn("flex items-end", gapClass)}>
      {values.map((points, index) => (
        <div key={index} className="flex flex-col items-center gap-1.5">
          <div className={cn("flex items-end bg-muted", barHeightClass, barWidthClass)}>
            <div
              className="w-full bg-foreground/50"
              style={{ height: `${Math.max((points / max) * 100, 8)}%` }}
            />
          </div>
          {showLabels && (
            <span className="font-mono text-[11px] tabular-nums text-foreground-tertiary">
              {points}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
